-- ============================================================================
-- pgTAP: regra de correção de registrar_pesagem() (spec seção 4.1) — mudança
-- em até 2 dias da última pesagem vira UPDATE do MESMO registro; fora dessa
-- janela vira INSERT de um novo registro histórico. Ver
-- supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql,
-- seção 5.2.
--
-- Sequência (mesmo animal, registrado 60 dias atrás, peso_inicial = 100):
--   1. Primeira pesagem (sempre INSERT, não há pesagem anterior).
--   2. Segunda pesagem, 1 dia de distância da primeira (<=2) -> UPDATE do
--      MESMO registro (id igual, pesagens não ganha linha nova).
--   3. Terceira pesagem, 6 dias de distância da segunda (>2) -> INSERT de
--      um registro NOVO (id diferente, pesagens ganha uma linha).
--   4. Quarta pesagem, exatamente 2 dias de distância da terceira (<=2,
--      limite inclusivo) -> UPDATE do registro da terceira.
-- Em cada passo, confirma também que o GMD recalcula em cima do valor
-- CORRIGIDO (não do valor antigo pré-correção).
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(12);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin, 'admin.008@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Correcao - 008', 'nome', 'Admin Correcao'),
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
    'email', 'admin.008@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

with ins as (
  insert into public.animais (
    fazenda_id, identificacao, data_nascimento, sexo, peso_inicial_kg, created_at
  )
  values (
    (select v from t_ids where k = 'fazenda'),
    'CORR-008', current_date - interval '5 years', 'macho', 100.000,
    now() - interval '60 days'
  )
  returning id
)
insert into t_ids select 'animal', id from ins;

-- ----------------------------------------------------------------------
-- Passo 1: primeira pesagem do animal — sempre INSERT (não há registro
-- anterior para corrigir).
-- ----------------------------------------------------------------------
insert into t_ids
select 'pesagem1', public.registrar_pesagem(
  (select v from t_ids where k = 'animal'),
  current_date - 10,
  150.000
);

select is(
  (select count(*)::int from public.pesagens where animal_id = (select v from t_ids where k = 'animal')),
  1,
  'Passo 1: primeira pesagem cria exatamente 1 registro em pesagens'
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal')),
  round((150.000::numeric - 100.000::numeric) / 50, 4),
  'Passo 1: GMD = (150-100)/50 dias = 1.0000'
);

-- ----------------------------------------------------------------------
-- Passo 2: segunda pesagem, 1 dia de distância da primeira (|current_date-9
-- - (current_date-10)| = 1 <= 2) -> CORREÇÃO: UPDATE do mesmo registro.
-- ----------------------------------------------------------------------
insert into t_ids
select 'pesagem2', public.registrar_pesagem(
  (select v from t_ids where k = 'animal'),
  current_date - 9,
  155.000
);

select is(
  (select v from t_ids where k = 'pesagem2'),
  (select v from t_ids where k = 'pesagem1'),
  'Passo 2 (1 dia de distância): registrar_pesagem() retorna o MESMO id da pesagem 1 (correção = UPDATE, não novo registro)'
);

select is(
  (select count(*)::int from public.pesagens where animal_id = (select v from t_ids where k = 'animal')),
  1,
  'Passo 2: pesagens continua com exatamente 1 linha (correção não criou linha nova)'
);

select is(
  (select data_evento from public.pesagens where id = (select v from t_ids where k = 'pesagem1')),
  current_date - 9,
  'Passo 2: data_evento do registro existente foi corrigida para o novo valor'
);

select is(
  (select peso_kg from public.pesagens where id = (select v from t_ids where k = 'pesagem1')),
  155.000::numeric(8,3),
  'Passo 2: peso_kg do registro existente foi corrigido para o novo valor'
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal')),
  round((155.000::numeric - 100.000::numeric) / 51, 4),
  'Passo 2: GMD recalcula em cima do valor CORRIGIDO — (155-100)/51 dias = 1.0784, não mais baseado em 150kg/50 dias'
);

-- ----------------------------------------------------------------------
-- Passo 3: terceira pesagem, 6 dias de distância da segunda (|current_date-3
-- - (current_date-9)| = 6 > 2) -> fora da janela: INSERT de um registro
-- histórico NOVO.
-- ----------------------------------------------------------------------
insert into t_ids
select 'pesagem3', public.registrar_pesagem(
  (select v from t_ids where k = 'animal'),
  current_date - 3,
  180.000
);

select isnt(
  (select v from t_ids where k = 'pesagem3'),
  (select v from t_ids where k = 'pesagem1'),
  'Passo 3 (6 dias de distância): registrar_pesagem() retorna um id DIFERENTE (fora da janela de correção = novo histórico)'
);

select is(
  (select count(*)::int from public.pesagens where animal_id = (select v from t_ids where k = 'animal')),
  2,
  'Passo 3: pesagens agora tem 2 linhas (a original corrigida + o novo registro histórico)'
);

select is(
  (select gmd_medio_kg from public.animais where id = (select v from t_ids where k = 'animal')),
  round((180.000::numeric - 100.000::numeric) / 57, 4),
  'Passo 3: GMD baseado na pesagem mais recente — (180-100)/57 dias = 1.4035'
);

-- ----------------------------------------------------------------------
-- Passo 4: quarta pesagem, EXATAMENTE 2 dias de distância da terceira
-- (|current_date-1 - (current_date-3)| = 2 <= 2, limite inclusivo da regra
-- "abs(...) <= 2") -> CORREÇÃO: UPDATE do registro da pesagem 3.
-- ----------------------------------------------------------------------
insert into t_ids
select 'pesagem4', public.registrar_pesagem(
  (select v from t_ids where k = 'animal'),
  current_date - 1,
  190.000
);

select is(
  (select v from t_ids where k = 'pesagem4'),
  (select v from t_ids where k = 'pesagem3'),
  'Passo 4 (exatamente 2 dias, limite inclusivo): registrar_pesagem() retorna o MESMO id da pesagem 3 (correção, não novo registro)'
);

select is(
  (select count(*)::int from public.pesagens where animal_id = (select v from t_ids where k = 'animal')),
  2,
  'Passo 4: pesagens continua com exatamente 2 linhas (limite de 2 dias tratado como correção, não como novo histórico)'
);

select * from finish();

rollback;
