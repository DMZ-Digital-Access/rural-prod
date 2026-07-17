-- ============================================================================
-- pgTAP: RLS default-deny de INSERT direto do client em usuarios, fazendas,
-- usuarios_fazendas e convites.
--
-- Cobre a garantia central do ADR-0001 (seção CONSEQUÊNCIAS) e do ADR-0002
-- (D2): nenhuma das 4 tabelas de autorização tem policy de INSERT para
-- authenticated/anon. Toda escrita passa por handle_new_user()/
-- aceitar_convite()/promover_papel()/criar_convite()/cancelar_convite(),
-- todas SECURITY DEFINER. Recomendado explicitamente pelo cyber_chief nos
-- dois gates de segurança (ver
-- .agents/memory/log/2026-07-16-cyber_chief-review-fase1.md e
-- ...-review-adr0002.md).
--
-- Estratégia: cria 2 usuários via insert direto em auth.users (dispara
-- handle_new_user(), que já é o caminho legítimo de escrita), depois assume
-- a sessão de um deles (set local role authenticated + request.jwt.claims)
-- e tenta inserir DIRETO nas 4 tabelas, sempre com FKs válidas para garantir
-- que a falha é por RLS (42501), não por violação de FK/constraint.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_user_a, 'admin.a.001@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda A - 001', 'nome', 'Admin A'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_user_b, 'admin.b.001@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda B - 001', 'nome', 'Admin B'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('user_a', v_user_a), ('user_b', v_user_b);
end;
$$;

-- fazenda_a / fazenda_b foram criadas pelo próprio handle_new_user() —
-- capturamos os ids para montar tentativas de insert com FK válida.
insert into t_ids
select 'fazenda_a', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'user_a');

insert into t_ids
select 'fazenda_b', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'user_b');

-- Tabela temporária é dona do role postgres/session atual; depois de
-- `set local role authenticated` abaixo, precisamos de GRANT explícito para
-- continuar lendo os ids nas subqueries dos throws_ok().
grant select on t_ids to authenticated;

-- Assume a sessão do usuário A (authenticated, com JWT válido) para o
-- restante do teste — é essa sessão que vai tentar os inserts diretos.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'user_a'),
    'email', 'admin.a.001@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- 1. usuarios — insert direto deve falhar (42501 = insufficient_privilege,
--    código padrão de violação de RLS no Postgres).
select throws_ok(
  $$ insert into public.usuarios (id, nome, email)
     values (gen_random_uuid(), 'Hacker', 'hacker@evil.com') $$,
  '42501',
  null,
  'insert direto em usuarios falha (RLS default-deny, sem policy de INSERT)'
);

-- 2. fazendas — insert direto deve falhar, mesmo com usuario_id válido
--    (o próprio usuário autenticado) e nome válido.
select throws_ok(
  format(
    $$ insert into public.fazendas (usuario_id, nome) values (%L, 'Fazenda Hackeada') $$,
    (select v from t_ids where k = 'user_a')
  ),
  '42501',
  null,
  'insert direto em fazendas falha (RLS default-deny, sem policy de INSERT)'
);

-- 3. usuarios_fazendas — insert direto deve falhar, mesmo vinculando o
--    próprio usuário a uma fazenda que não é a dele (fazenda_b), com um
--    papel plausível. FK e CHECK de papel são válidos — só a RLS bloqueia.
select throws_ok(
  format(
    $$ insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
       values (%L, %L, 'admin') $$,
    (select v from t_ids where k = 'user_a'),
    (select v from t_ids where k = 'fazenda_b')
  ),
  '42501',
  null,
  'insert direto em usuarios_fazendas falha (RLS default-deny, sem policy de INSERT) — tentativa de auto-vincular a fazenda de outro usuário'
);

-- 4. convites — insert direto deve falhar, mesmo com todas as FKs válidas
--    (fazenda_a é do próprio usuário A, convidado_por = ele mesmo) —
--    convites só pode ser escrito via criar_convite()/aceitar_convite()/
--    cancelar_convite()/handle_new_user().
select throws_ok(
  format(
    $$ insert into public.convites (fazenda_id, convidado_email, papel_oferecido, convidado_por)
       values (%L, 'vitima@teste.local', 'admin', %L) $$,
    (select v from t_ids where k = 'fazenda_a'),
    (select v from t_ids where k = 'user_a')
  ),
  '42501',
  null,
  'insert direto em convites falha (RLS default-deny, sem policy de INSERT)'
);

select * from finish();

rollback;
