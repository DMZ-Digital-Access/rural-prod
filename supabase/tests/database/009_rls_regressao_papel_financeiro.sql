-- ============================================================================
-- pgTAP: REGRESSÃO do achado nº1 do gate cyber_chief na Fase 2
-- (.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md) — papel
-- 'financeiro' tinha acesso total de manejo (SELECT/INSERT/UPDATE) a
-- lotes/animais/pesagens antes da correção, violando
-- especificacao-sistema.md seção 5.4 ("Sem acesso a: manejo individual de
-- animais/lotes/pesagens").
--
-- Cenário: um usuário com papel='financeiro' vinculado a uma fazenda (que
-- também tem um admin, um lote e um animal já cadastrados por ele) tenta:
--   1. SELECT lotes/animais/pesagens da fazenda -> deve retornar vazio
--      (RLS filtra as linhas, não lança erro).
--   2. INSERT em lotes/animais -> deve falhar (42501, RLS default-deny
--      pela ausência de papel<>'financeiro' na policy).
--   3. UPDATE em um lote existente -> não deve ter efeito nenhum (RLS
--      filtra a linha do UPDATE, 0 linhas afetadas).
--   4. registrar_pesagem() -> deve ser rejeitada com a mesma mensagem
--      genérica usada para "animal não encontrado" (achado nº3 do mesmo
--      gate).
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(7);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin     uuid := gen_random_uuid();
  v_contador  uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin, 'admin.009@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Financeiro - 009', 'nome', 'Admin Financeiro'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Contador: tem conta própria (fazenda própria, irrelevante para o
  -- teste) — o que importa é o VÍNCULO adicional dele, como 'financeiro',
  -- com a fazenda-alvo (inserido diretamente abaixo, como postgres/
  -- superuser, bypassando RLS de propósito — é só fixture de teste).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_contador, 'contador.009@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Propria Contador - 009', 'nome', 'Contador'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('admin', v_admin), ('contador', v_contador);
end;
$$;

insert into t_ids
select 'fazenda', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin');

insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
values (
  (select v from t_ids where k = 'contador'),
  (select v from t_ids where k = 'fazenda'),
  'financeiro'
);

grant select, insert on t_ids to authenticated;

-- Admin cadastra um lote e um animal (com uma pesagem real) na fazenda,
-- para o contador tentar acessar/editar depois.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin'),
    'email', 'admin.009@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

with ins as (
  insert into public.lotes (fazenda_id, nome)
  values ((select v from t_ids where k = 'fazenda'), 'Lote Original - 009')
  returning id
)
insert into t_ids select 'lote', id from ins;

with ins as (
  insert into public.animais (fazenda_id, lote_id, identificacao, data_nascimento, sexo, peso_inicial_kg)
  values (
    (select v from t_ids where k = 'fazenda'),
    (select v from t_ids where k = 'lote'),
    'FIN-009', current_date - interval '2 years', 'macho', 200.000
  )
  returning id
)
insert into t_ids select 'animal', id from ins;

select public.registrar_pesagem((select v from t_ids where k = 'animal'), current_date, 210.000);

-- ------------------------------------------------------------------------
-- Assume a sessão do contador (papel='financeiro' na fazenda-alvo).
-- ------------------------------------------------------------------------
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'contador'),
    'email', 'contador.009@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- 1. SELECT lotes/animais/pesagens da fazenda-alvo -> vazio.
select is(
  (select count(*)::int from public.lotes where id = (select v from t_ids where k = 'lote')),
  0,
  'financeiro: SELECT em lotes da fazenda-alvo retorna vazio (RLS exclui papel=financeiro)'
);

select is(
  (select count(*)::int from public.animais where id = (select v from t_ids where k = 'animal')),
  0,
  'financeiro: SELECT em animais da fazenda-alvo retorna vazio (RLS exclui papel=financeiro)'
);

select is(
  (select count(*)::int from public.pesagens where animal_id = (select v from t_ids where k = 'animal')),
  0,
  'financeiro: SELECT em pesagens da fazenda-alvo retorna vazio, mesmo já existindo uma pesagem real (RLS exclui papel=financeiro)'
);

-- 2. INSERT direto em lotes/animais -> falha (42501).
select throws_ok(
  format(
    $$ insert into public.lotes (fazenda_id, nome) values (%L, 'Lote Hackeado Financeiro') $$,
    (select v from t_ids where k = 'fazenda')
  ),
  '42501',
  null,
  'financeiro: INSERT direto em lotes falha (RLS default-deny para papel=financeiro)'
);

select throws_ok(
  format(
    $$ insert into public.animais (fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg)
       values (%L, 'HACK-009', current_date - 365, 'macho', 100) $$,
    (select v from t_ids where k = 'fazenda')
  ),
  '42501',
  null,
  'financeiro: INSERT direto em animais falha (RLS default-deny para papel=financeiro)'
);

-- 3. UPDATE em lote existente -> 0 linhas afetadas (RLS filtra a linha,
--    não lança exceção).
with upd as (
  update public.lotes
     set nome = 'Nome Alterado Por Financeiro'
   where id = (select v from t_ids where k = 'lote')
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'financeiro: UPDATE em lote da fazenda-alvo não afeta nenhuma linha (RLS filtra, não lança erro)'
);

-- 4. registrar_pesagem() -> rejeitada com a mensagem genérica unificada
--    (achado nº3 do mesmo gate).
select throws_ok(
  format(
    $$ select public.registrar_pesagem(%L::uuid, current_date, 999) $$,
    (select v from t_ids where k = 'animal')
  ),
  'P0001',
  'Animal não encontrado ou você não tem permissão para registrar pesagem nele',
  'financeiro: registrar_pesagem() rejeita a chamada, mesma mensagem genérica usada para animal_id inexistente'
);

select * from finish();

rollback;
