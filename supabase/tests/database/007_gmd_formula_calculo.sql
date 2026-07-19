-- ============================================================================
-- pgTAP: fórmula de GMD de atualizar_animal_apos_pesagem() (Fase 2, spec
-- seção 9 item 2) — GMD = (peso_atual - peso_inicial) / dias_totais, onde
-- dias_totais usa animais.created_at (não data_nascimento).
--
-- Este é o teste mais importante da rodada de QA da Fase 2: a fórmula
-- errada do protótipo (média simples acumulada das variações entre
-- pesagens sucessivas) é o débito técnico que motivou a fase inteira
-- (especificacao-sistema.md seção 9, item 2). Ver
-- supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql,
-- seção 5.1 e cabeçalho, decisão 3.
--
-- Estratégia para simular "N dias desde o registro do animal" sem esperar
-- dias reais: `animais.created_at` é sobrescritível no INSERT (nenhuma
-- guarda de imutabilidade cobre INSERT, só UPDATE — prevent_fazenda_id_change()
-- só dispara em BEFORE UPDATE), então inserimos o animal já com
-- `created_at` no passado, como o próprio usuário autenticado (via RLS
-- normal, não bypass de superuser) — é dado de teste, não elevação de
-- privilégio.
--
-- CASO 1 (feliz): uma pesagem, GMD = round((peso-peso_inicial)/dias, 4) —
--   comparado contra a MESMA fórmula calculada em SQL a partir dos valores
--   conhecidos do fixture, não um número decorado à mão.
-- CASO 2 (regressão do bug do protótipo): 3 pesagens em sequência, com
--   variações não-uniformes entre elas (inclusive uma queda de peso no
--   meio) — se o bug de "média simples acumulada das variações sucessivas"
--   tivesse voltado, o GMD depois de cada pesagem dependeria da pesagem
--   anterior. A fórmula correta ignora completamente pesagens anteriores:
--   depende só do peso_inicial do animal e da pesagem MAIS RECENTE.
-- CASO 3: pesagem no mesmo dia do registro do animal (dias_totais = 0) →
--   gmd_medio_kg deve ser NULL, sem erro.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(9);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin, 'admin.007@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda GMD - 007', 'nome', 'Admin GMD'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('admin', v_admin);
end;
$$;

insert into t_ids
select 'fazenda', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin');

-- INSERT também é necessário (não só SELECT, diferente da convenção dos
-- arquivos anteriores) porque, neste arquivo, os ids dos animais são
-- capturados em t_ids DEPOIS de assumir a sessão authenticated (a criação
-- do animal em si precisa passar pela RLS normal do usuário, não por
-- bypass de superuser).
grant select, insert on t_ids to authenticated;

-- Assume a sessão do admin para o restante do arquivo — todas as escritas
-- (INSERT de animal, registrar_pesagem) passam pela RLS/RPC normal, não por
-- bypass de superuser.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'admin'),
    'email', 'admin.007@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- ----------------------------------------------------------------------
-- CASO 1: caso feliz — animal registrado 17 dias atrás, peso_inicial_kg =
-- 220.500, uma pesagem hoje com peso_kg = 255.750.
-- ----------------------------------------------------------------------
with ins as (
  insert into public.animais (
    fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg, created_at
  )
  values (
    (select v from t_ids where k = 'fazenda'),
    'CASO1-007', current_date - interval '3 years', 'macho', 220.500,
    now() - interval '17 days'
  )
  returning id
)
insert into t_ids select 'animal_caso1', id from ins;

select public.registrar_pesagem(
  (select v from t_ids where k = 'animal_caso1'),
  current_date,
  255.750
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_caso1')),
  round((255.750::numeric - 220.500::numeric) / 17, 4),
  'Caso feliz: gmd_medio_kg = round((peso_atual - peso_inicial) / dias_totais, 4), dias_totais = 17'
);

select is(
  (select peso_atual_kg from public.animais where id = (select v from t_ids where k = 'animal_caso1')),
  255.750::numeric(8,3),
  'Caso feliz: peso_atual_kg atualizado para o peso da pesagem mais recente'
);

select is(
  (select ultima_pesagem_data from public.animais where id = (select v from t_ids where k = 'animal_caso1')),
  current_date,
  'Caso feliz: ultima_pesagem_data = data_evento da pesagem registrada'
);

-- ----------------------------------------------------------------------
-- CASO 2: REGRESSÃO do bug do protótipo — 3 pesagens em sequência com
-- variações não-uniformes (inclusive uma queda de peso). O GMD depois de
-- CADA pesagem deve refletir só (peso da pesagem MAIS RECENTE -
-- peso_inicial) / dias desde o registro do animal, ignorando por completo
-- as pesagens anteriores. Animal registrado 40 dias atrás, peso_inicial =
-- 300.000.
-- ----------------------------------------------------------------------
with ins as (
  insert into public.animais (
    fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg, created_at
  )
  values (
    (select v from t_ids where k = 'fazenda'),
    'CASO2-007', current_date - interval '4 years', 'femea', 300.000,
    now() - interval '40 days'
  )
  returning id
)
insert into t_ids select 'animal_caso2', id from ins;

-- Pesagem A: 10 dias após o registro do animal, peso salta para 400.000
-- (variação de +100kg em 10 dias — deliberadamente exagerada).
select public.registrar_pesagem(
  (select v from t_ids where k = 'animal_caso2'),
  current_date - 30,
  400.000
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_caso2')),
  round((400.000::numeric - 300.000::numeric) / 10, 4),
  'Múltiplas pesagens (1/3): GMD depois da pesagem A = (400-300)/10 = 10.0000, baseado só em peso_inicial e dias desde o registro'
);

-- Pesagem B: mais 10 dias depois (fora da janela de correção de 2 dias —
-- vira INSERT novo, não UPDATE de A), peso CAI para 350.000. Se o bug do
-- protótipo (média das variações sucessivas) tivesse voltado, o GMD aqui
-- carregaria a pesagem A (+100/10dias) misturada com esta (-50/10dias). A
-- fórmula correta ignora A completamente.
select public.registrar_pesagem(
  (select v from t_ids where k = 'animal_caso2'),
  current_date - 20,
  350.000
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_caso2')),
  round((350.000::numeric - 300.000::numeric) / 20, 4),
  'Múltiplas pesagens (2/3): GMD depois da pesagem B = (350-300)/20 = 2.5000 — NÃO é média com a variação da pesagem A (prova que o bug do protótipo não voltou)'
);

-- Pesagem C (mais recente): mais 20 dias depois, peso = 380.000.
select public.registrar_pesagem(
  (select v from t_ids where k = 'animal_caso2'),
  current_date,
  380.000
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_caso2')),
  round((380.000::numeric - 300.000::numeric) / 40, 4),
  'Múltiplas pesagens (3/3): GMD final = (380-300)/40 = 2.0000, calculado só a partir da pesagem MAIS RECENTE e do total de dias desde o registro do animal'
);

-- ----------------------------------------------------------------------
-- CASO 3: dias_totais = 0 (pesagem no mesmo dia do registro do animal) →
-- gmd_medio_kg deve ser NULL, sem erro (proteção contra divisão por zero,
-- decisão 3 do cabeçalho da migration).
-- ----------------------------------------------------------------------
with ins as (
  insert into public.animais (
    fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg
  )
  values (
    (select v from t_ids where k = 'fazenda'),
    'CASO3-007', current_date - interval '2 years', 'macho', 250.000
  )
  returning id
)
insert into t_ids select 'animal_caso3', id from ins;

select lives_ok(
  format(
    $$ select public.registrar_pesagem(%L::uuid, current_date, 252.000) $$,
    (select v from t_ids where k = 'animal_caso3')
  ),
  'dias_totais = 0: registrar_pesagem() no mesmo dia do registro do animal NÃO lança exceção'
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal_caso3')),
  null::numeric(8,4),
  'dias_totais = 0: gmd_medio_kg vira NULL, não erro nem 0 (0 afirmaria "ganho confirmado zero", diferente de "dados insuficientes")'
);

select is(
  (select peso_atual_kg from public.animais where id = (select v from t_ids where k = 'animal_caso3')),
  252.000::numeric(8,3),
  'dias_totais = 0: peso_atual_kg ainda é atualizado normalmente, só o GMD fica NULL'
);

select * from finish();

rollback;
