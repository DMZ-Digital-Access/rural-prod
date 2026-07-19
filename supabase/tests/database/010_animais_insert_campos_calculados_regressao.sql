-- ============================================================================
-- pgTAP: REGRESSÃO do achado nº2 do gate cyber_chief na Fase 2
-- (.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md) —
-- inicializar_peso_atual_animal() só protegia peso_atual_kg/gmd_medio_kg/
-- ultima_pesagem_data contra UPDATE direto; um INSERT em animais podia
-- fabricar os 3 campos calculados sem nenhuma pesagem real ter ocorrido.
--
-- Cenário: usuário autenticado (vinculado à própria fazenda, papel admin)
-- faz um INSERT em animais enviando explicitamente peso_atual_kg = 999,
-- gmd_medio_kg = 5.5, ultima_pesagem_data = '2020-01-01' — valores que só
-- deveriam existir depois de uma pesagem real via registrar_pesagem(). O
-- INSERT deve ter sucesso (não é um erro de permissão), mas o trigger
-- inicializar_peso_atual_animal() (BEFORE INSERT) deve SOBRESCREVER
-- incondicionalmente os 3 campos, ignorando o que o client enviou:
-- peso_atual_kg = peso_inicial_kg, gmd_medio_kg = NULL,
-- ultima_pesagem_data = NULL.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin, 'admin.010@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Falsificacao - 010', 'nome', 'Admin Falsificacao'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('admin', v_admin);
end;
$$;

insert into t_ids
select 'fazenda', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin');

grant select, insert on t_ids to authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin'),
    'email', 'admin.010@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  format(
    $$ insert into public.animais (
         fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg,
         peso_atual_kg, gmd_medio_kg, ultima_pesagem_data
       )
       values (
         %L, 'FAKE-010', current_date - interval '400 days', 'macho', 100.000,
         999.000, 5.5000, '2020-01-01'
       ) $$,
    (select v from t_ids where k = 'fazenda')
  ),
  'INSERT com campos calculados preenchidos manualmente NÃO lança erro (não é uma checagem de permissão, é sobrescrita silenciosa)'
);

insert into t_ids
select 'animal_fake', id
  from public.animais
 where fazenda_id = (select v from t_ids where k = 'fazenda')
   and identificacao = 'FAKE-010';

select is(
  (select peso_atual_kg from public.animais where id = (select v from t_ids where k = 'animal_fake')),
  100.000::numeric(8,3),
  'REGRESSÃO achado nº2 (cyber_chief/Fase 2): peso_atual_kg nasce = peso_inicial_kg (100), ignorando o 999 enviado pelo client'
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_fake')),
  null::numeric(8,4),
  'REGRESSÃO achado nº2: gmd_medio_kg nasce NULL, ignorando o 5.5 enviado pelo client'
);

select is(
  (select ultima_pesagem_data from public.animais where id = (select v from t_ids where k = 'animal_fake')),
  null::date,
  'REGRESSÃO achado nº2: ultima_pesagem_data nasce NULL, ignorando 2020-01-01 enviado pelo client'
);

select * from finish();

rollback;
