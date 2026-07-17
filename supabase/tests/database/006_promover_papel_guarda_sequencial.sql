-- ============================================================================
-- pgTAP: promover_papel() — guarda "a fazenda nunca fica sem admin" (caso
-- SEQUENCIAL, uma chamada de cada vez) + checagens de autorização básicas.
--
-- Cobre o achado nº 2 do gate cyber_chief no ADR-0002
-- (.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md) — a guarda
-- funciona corretamente no caso sequencial mesmo sem concorrência (o bug
-- original só se manifestava com DUAS chamadas verdadeiramente concorrentes,
-- ver arquivo de teste de concorrência real separado, executado via psql
-- fora do pgTAP porque pgTAP roda tudo em uma única transação/sessão).
--
-- IMPORTANTE (honestidade de cobertura, regra da própria Emma/QA): este
-- arquivo NÃO prova que a corrida TOCTOU está corrigida — só que a guarda
-- funciona quando as chamadas são sequenciais (o que já era verdade mesmo
-- ANTES da correção do cyber_chief, ver log do achado nº 2). O teste de
-- concorrência real está documentado separadamente no log desta tarefa.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(5);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin_unico uuid := gen_random_uuid();
  v_membro      uuid := gen_random_uuid();
  v_estranho    uuid := gen_random_uuid();
begin
  -- Fazenda com um único admin (o próprio criador, via signup normal).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin_unico, 'admin.unico.006@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Unica - 006', 'nome', 'Admin Unico'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Um segundo usuário, sem vínculo nenhum com a fazenda ainda — vai virar
  -- 'membro' dela via insert direto de fixture (não é o alvo do teste de
  -- criar_convite/aceitar_convite, só precisamos de um vínculo existente
  -- para promover_papel() ter o que promover).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_membro, 'membro.006@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Membro Propria - 006'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Um terceiro usuário, sem vínculo NENHUM com a fazenda-alvo — usado para
  -- testar a checagem de autorização (não-admin/não-vinculado chamando
  -- promover_papel).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_estranho, 'estranho.006@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Estranho - 006'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values
    ('admin_unico', v_admin_unico),
    ('membro', v_membro),
    ('estranho', v_estranho);
end;
$$;

insert into t_ids
select 'fazenda_unica', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin_unico');

-- Fixture: vincula o segundo usuário à fazenda como 'membro' (insert direto
-- como postgres/superuser — bypassa RLS de propósito, é só setup de teste,
-- não o que está sendo testado aqui).
insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
values (
  (select v from t_ids where k = 'membro'),
  (select v from t_ids where k = 'fazenda_unica'),
  'membro'
);

grant select on t_ids to authenticated;

-- ---------------------------------------------------------------------
-- Teste 1: usuário SEM vínculo com a fazenda tentando promover alguém —
-- checagem de autorização (não é admin da fazenda).
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'estranho'),
    'email', 'estranho.006@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$ select public.promover_papel(%L::uuid, %L::uuid, 'admin') $$,
    (select v from t_ids where k = 'fazenda_unica'),
    (select v from t_ids where k = 'membro')
  ),
  'P0001',
  'Apenas admins da fazenda podem promover/rebaixar papéis',
  'usuário sem vínculo com a fazenda não pode chamar promover_papel() (checagem de autorização)'
);

-- ---------------------------------------------------------------------
-- Teste 2 (O TESTE MAIS IMPORTANTE deste arquivo): o único admin da fazenda
-- tenta se auto-rebaixar para 'membro' — deve ser bloqueado pela guarda
-- "a fazenda nunca fica sem admin" (achado nº 2, caso sequencial).
-- ---------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_unico'),
    'email', 'admin.unico.006@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$ select public.promover_papel(%L::uuid, %L::uuid, 'membro') $$,
    (select v from t_ids where k = 'fazenda_unica'),
    (select v from t_ids where k = 'admin_unico')
  ),
  'P0001',
  'Operação bloqueada: a fazenda ficaria sem nenhum admin',
  'REGRESSÃO achado nº2 (cyber_chief/ADR-0002, caso sequencial): único admin não consegue se auto-rebaixar — fazenda nunca fica sem admin'
);

-- Confirma que o papel realmente não mudou (a exceção não deixou o UPDATE
-- aplicado parcialmente).
reset role;
select is(
  (select papel from public.usuarios_fazendas
    where usuario_id = (select v from t_ids where k = 'admin_unico')
      and fazenda_id = (select v from t_ids where k = 'fazenda_unica')),
  'admin',
  'papel do único admin continua admin depois da tentativa bloqueada'
);

-- ---------------------------------------------------------------------
-- Teste de controle: promover o 'membro' para 'admin' primeiro (agora 2
-- admins), depois confirmar que o admin original CONSEGUE se rebaixar,
-- porque sobra outro admin — prova que a guarda não é overly-restritiva
-- (só bloqueia quando realmente zeraria os admins).
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_unico'),
    'email', 'admin.unico.006@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  format(
    $$ select public.promover_papel(%L::uuid, %L::uuid, 'admin') $$,
    (select v from t_ids where k = 'fazenda_unica'),
    (select v from t_ids where k = 'membro')
  ),
  'admin promove membro para admin (agora 2 admins na fazenda)'
);

select lives_ok(
  format(
    $$ select public.promover_papel(%L::uuid, %L::uuid, 'membro') $$,
    (select v from t_ids where k = 'fazenda_unica'),
    (select v from t_ids where k = 'admin_unico')
  ),
  'com 2 admins, o admin original CONSEGUE se auto-rebaixar (guarda não bloqueia quando sobra outro admin)'
);

select * from finish();

rollback;
