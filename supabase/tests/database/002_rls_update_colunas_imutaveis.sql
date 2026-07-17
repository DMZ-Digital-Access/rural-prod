-- ============================================================================
-- pgTAP: colunas imutáveis de usuarios/fazendas continuam bloqueadas mesmo
-- para o DONO da própria linha (via UPDATE direto do client).
--
-- Cobre o achado nº 2 e nº 3 do gate do cyber_chief na Fase 1
-- (.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md): a policy de
-- UPDATE (usuarios_update_own / fazendas_update_vinculada) não restringe
-- coluna nenhuma via RLS sozinha — a garantia real vem dos triggers
-- `prevent_usuarios_identity_change()` / `prevent_fazendas_identity_change()`
-- (BEFORE UPDATE), porque `WITH CHECK` de RLS não tem acesso ao valor OLD da
-- linha. Testamos as duas camadas juntas: o dono TEM permissão de RLS para
-- fazer UPDATE na própria linha, mas o trigger ainda assim rejeita colunas
-- sensíveis. Também confirmamos que `nome` (única coluna com caso de uso
-- real) continua editável — para não mascarar um over-blocking acidental.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(6);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_x uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_user_a, 'admin.a.002@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda A - 002', 'nome', 'Admin A'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Segundo usuário só para termos um uuid "de outro usuário" válido para
  -- tentativas de forjar usuarios.id / fazendas.usuario_id.
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_user_x, 'outro.x.002@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda X - 002'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('user_a', v_user_a), ('user_x', v_user_x);
end;
$$;

insert into t_ids
select 'fazenda_a', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'user_a');

grant select on t_ids to authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'user_a'),
    'email', 'admin.a.002@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- ---------------------------------------------------------------------
-- usuarios: id/email/created_at imutáveis; nome livre.
-- ---------------------------------------------------------------------

select throws_ok(
  format(
    $$ update public.usuarios set email = 'forjado@evil.com' where id = %L $$,
    (select v from t_ids where k = 'user_a')
  ),
  'P0001',
  'usuarios.email não pode ser alterado pelo client — é espelho de auth.users.email',
  'update de usuarios.email pelo próprio dono falha (trigger de imutabilidade)'
);

select throws_ok(
  format(
    $$ update public.usuarios set id = %L where id = %L $$,
    (select v from t_ids where k = 'user_x'),
    (select v from t_ids where k = 'user_a')
  ),
  'P0001',
  'usuarios.id não pode ser alterado',
  'update de usuarios.id pelo próprio dono falha (trigger de imutabilidade)'
);

select lives_ok(
  format(
    $$ update public.usuarios set nome = 'Admin A Renomeado' where id = %L $$,
    (select v from t_ids where k = 'user_a')
  ),
  'update de usuarios.nome pelo próprio dono funciona normalmente (única coluna editável)'
);

-- ---------------------------------------------------------------------
-- fazendas: id/usuario_id/created_at imutáveis; nome livre.
-- ---------------------------------------------------------------------

select throws_ok(
  format(
    $$ update public.fazendas set usuario_id = %L where id = %L $$,
    (select v from t_ids where k = 'user_x'),
    (select v from t_ids where k = 'fazenda_a')
  ),
  'P0001',
  'fazendas.usuario_id não pode ser alterado pelo client',
  'update de fazendas.usuario_id pelo dono/vinculado falha (trigger de imutabilidade)'
);

select throws_ok(
  format(
    $$ update public.fazendas set id = gen_random_uuid() where id = %L $$,
    (select v from t_ids where k = 'fazenda_a')
  ),
  'P0001',
  'fazendas.id não pode ser alterado',
  'update de fazendas.id pelo dono/vinculado falha (trigger de imutabilidade)'
);

select lives_ok(
  format(
    $$ update public.fazendas set nome = 'Fazenda A Renomeada' where id = %L $$,
    (select v from t_ids where k = 'fazenda_a')
  ),
  'update de fazendas.nome pelo dono/vinculado funciona normalmente (única coluna editável)'
);

select * from finish();

rollback;
