-- ============================================================================
-- pgTAP: vazamento entre fazendas (decisões 5 e 7 do cabeçalho da migration
-- da Fase 2, confirmadas sem achado pelo cyber_chief) — um usuário da
-- fazenda A não consegue ver/editar animais/lotes da fazenda B, nem
-- associar um animal da fazenda A a um lote da fazenda B (ou vice-versa)
-- via validar_lote_mesma_fazenda().
--
-- Cenário: duas fazendas independentes (A e B, cada uma com seu próprio
-- admin via signup normal), cada uma com um lote e um animal próprios.
--   1. Admin B não enxerga (SELECT vazio) o animal/lote da fazenda A.
--   2. Admin B não consegue criar um animal diretamente sob fazenda_id=A
--      (RLS de INSERT).
--   3. Admin A não consegue mover seu próprio animal para um lote da
--      fazenda B (validar_lote_mesma_fazenda() rejeita).
--   4. O lote_id do animal de A continua o de A depois da tentativa
--      bloqueada (sem efeito colateral parcial).
--   5. Mesma checagem na direção oposta (admin B tentando lote de A).
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(6);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin_a, 'admin.a.011@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda A - 011', 'nome', 'Admin A'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin_b, 'admin.b.011@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda B - 011', 'nome', 'Admin B'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('admin_a', v_admin_a), ('admin_b', v_admin_b);
end;
$$;

insert into t_ids
select 'fazenda_a', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin_a');

insert into t_ids
select 'fazenda_b', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin_b');

grant select, insert on t_ids to authenticated;

-- ------------------------------------------------------------------------
-- Admin A cria lote + animal na fazenda A.
-- ------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_a'),
    'email', 'admin.a.011@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

with ins as (
  insert into public.lotes (fazenda_id, nome)
  values ((select v from t_ids where k = 'fazenda_a'), 'Lote A - 011')
  returning id
)
insert into t_ids select 'lote_a', id from ins;

with ins as (
  insert into public.animais (fazenda_id, lote_id, identificacao, data_nascimento, sexo, peso_inicial_kg)
  values (
    (select v from t_ids where k = 'fazenda_a'),
    (select v from t_ids where k = 'lote_a'),
    'ANIMAL-A-011', current_date - interval '2 years', 'macho', 300.000
  )
  returning id
)
insert into t_ids select 'animal_a', id from ins;

-- ------------------------------------------------------------------------
-- Admin B cria lote + animal (sem lote_id ainda) na fazenda B.
-- ------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_b'),
    'email', 'admin.b.011@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

with ins as (
  insert into public.lotes (fazenda_id, nome)
  values ((select v from t_ids where k = 'fazenda_b'), 'Lote B - 011')
  returning id
)
insert into t_ids select 'lote_b', id from ins;

with ins as (
  insert into public.animais (fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg)
  values (
    (select v from t_ids where k = 'fazenda_b'),
    'ANIMAL-B-011', current_date - interval '2 years', 'femea', 250.000
  )
  returning id
)
insert into t_ids select 'animal_b', id from ins;

-- 1. Admin B não enxerga o animal da fazenda A (SELECT vazio, RLS filtra).
select is(
  (select count(*)::int from public.animais where id = (select v from t_ids where k = 'animal_a')),
  0,
  'Admin B: SELECT no animal da fazenda A retorna vazio (RLS escopada por fazenda)'
);

-- 1b (mesma checagem para lotes).
select is(
  (select count(*)::int from public.lotes where id = (select v from t_ids where k = 'lote_a')),
  0,
  'Admin B: SELECT no lote da fazenda A retorna vazio (RLS escopada por fazenda)'
);

-- 2. Admin B não consegue criar um animal diretamente sob fazenda_id=A.
select throws_ok(
  format(
    $$ insert into public.animais (fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg)
       values (%L, 'INTRUSO-011', current_date - 365, 'macho', 100) $$,
    (select v from t_ids where k = 'fazenda_a')
  ),
  '42501',
  null,
  'Admin B: INSERT de animal com fazenda_id=A falha (RLS default-deny — B não está vinculado à fazenda A)'
);

-- ------------------------------------------------------------------------
-- 3. Admin A tenta mover seu próprio animal para um lote da fazenda B —
--    validar_lote_mesma_fazenda() deve rejeitar (vazamento entre fazendas
--    via poluição de lotes_com_estatisticas de terceiros).
-- ------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_a'),
    'email', 'admin.a.011@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$ update public.animais set lote_id = %L where id = %L $$,
    (select v from t_ids where k = 'lote_b'),
    (select v from t_ids where k = 'animal_a')
  ),
  'P0001',
  'lote_id inválido ou não pertence à mesma fazenda do animal',
  'Admin A: associar animal_a a lote_b (outra fazenda) é rejeitado por validar_lote_mesma_fazenda()'
);

-- 4. Confirma que lote_id do animal A continua o de A (sem efeito parcial).
select is(
  (select lote_id from public.animais where id = (select v from t_ids where k = 'animal_a')),
  (select v from t_ids where k = 'lote_a'),
  'animal_a.lote_id continua apontando para lote_a depois da tentativa bloqueada'
);

-- ------------------------------------------------------------------------
-- 5. Mesma checagem na direção oposta: admin B tenta associar animal_b a
--    lote_a (fazenda A).
-- ------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin_b'),
    'email', 'admin.b.011@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$ update public.animais set lote_id = %L where id = %L $$,
    (select v from t_ids where k = 'lote_a'),
    (select v from t_ids where k = 'animal_b')
  ),
  'P0001',
  'lote_id inválido ou não pertence à mesma fazenda do animal',
  'Admin B: associar animal_b a lote_a (outra fazenda) também é rejeitado — checagem simétrica'
);

select * from finish();

rollback;
