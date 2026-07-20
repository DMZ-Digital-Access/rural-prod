-- ============================================================================
-- Migration: ADR-0005 — expansão de tipo_operacao (nascimento/obito/consumo),
--            rastreamento independente de GTA/Nota/Contranota, peso_total_kg,
--            e saldo com "Não classificado" (transacoes_detalhe sem faixa
--            etária)
--
-- Reabre (de forma aditiva, sem editar) as migrations já GATEADAS
-- 20260720133000_fase3_gtas_transacoes.sql (item 11) e
-- 20260720200000_fase3_saldo_rebanho.sql (item 12) — nenhuma delas é
-- reescrita, esta migration evolui os mesmos objetos via ALTER/CREATE OR
-- REPLACE, mesma prática já usada em 20260720190000_fix_ovino_agrupamento_
-- etario.sql (nunca editar uma migration já aplicada ao remoto).
--
-- Decisões completas e justificativas: .agents/memory/adr/ADR-0005-
-- expansao-transacoes-doc-tracking.md (D1-D7). Este cabeçalho só resume o
-- que muda no SQL, sem repetir o raciocínio completo do ADR.
--
-- 1. D1 — tipo_operacao ganha nascimento/obito/consumo (7 valores totais).
-- 2. D2 — aplicar_status_animal_apos_vinculo() (ADR-0004) estendida: obito→
--    morte, consumo→baixa. Nascimento fica FORA do mecanismo de
--    transacoes_animais (mesmo tratamento agregado-só que compra já tem).
-- 3. D3 — arquivo_nota_path/arquivo_nota_mime_type e
--    arquivo_contranota_path/arquivo_contranota_mime_type novos em
--    transacoes (nullable, mesmo padrão de gtas.arquivo_path). tem_contranota
--    (boolean) é removida — redundante com arquivo_contranota_path is null.
--    GTA não muda (status_gta_transacao já cobre presente/pendente).
-- 4. D4 — peso_total_kg novo em transacoes (nullable, opcional).
-- 5. D5 — transacoes_detalhe.agrupamento_etario_id vira NULLABLE (sexo sem
--    faixa etária). saldo_rebanho_movimentos passa a resolver especie_id
--    direto de transacoes.especie_id (não mais via JOIN em
--    agrupamentos_etarios, que agora pode não existir para a linha).
--    obter_saldo_rebanho() ganha uma seção "Não classificado" (união, não
--    faz parte da espinha fixa — só aparece quando há movimento real sem
--    faixa etária).
-- 6. D6/D7 — sem mudança de schema (outra_parte e o cadastro mínimo já
--    eram nullable/obrigatórios exatamente como o ADR pede).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================


-- ============================================================================
-- 1. tipo_operacao — expande o domínio em transacoes e em
--    transacoes_animais.tipo_operacao_transacao (mesma cópia denormalizada
--    do ADR-0004 D1, precisa aceitar os mesmos valores).
-- ============================================================================

alter table public.transacoes
  drop constraint transacoes_tipo_operacao_check;

alter table public.transacoes
  add constraint transacoes_tipo_operacao_check
  check (tipo_operacao in (
    'compra', 'venda', 'entrada_pastoreio', 'saida_pastoreio',
    'nascimento', 'obito', 'consumo'
  ));

alter table public.transacoes_animais
  drop constraint transacoes_animais_tipo_operacao_check;

alter table public.transacoes_animais
  add constraint transacoes_animais_tipo_operacao_check
  check (tipo_operacao_transacao in (
    'compra', 'venda', 'entrada_pastoreio', 'saida_pastoreio',
    'nascimento', 'obito', 'consumo'
  ));

comment on column public.transacoes.tipo_operacao is
  'ADR-0005 D1: 7 valores (compra/venda/entrada_pastoreio/saida_pastoreio '
  'originais do item 11 + nascimento/obito/consumo, aditivos). Pastoreio '
  'continua existindo como conceito próprio — não foi substituído.';


-- ============================================================================
-- 2. Extensão do mecanismo automático de status (ADR-0004 D2) — obito→morte,
--    consumo→baixa. Nascimento NÃO entra neste CASE (ADR-0005 D2): segue
--    tratado como compra/entrada_pastoreio, sem side-effect em
--    transacoes_animais (a tabela nem deve receber linha para nascimento,
--    já que o animal ainda não existe individualmente).
-- ============================================================================

create or replace function public.aplicar_status_animal_apos_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  case new.tipo_operacao_transacao
    when 'venda' then
      update public.animais set status = 'venda' where id = new.animal_id;
    when 'obito' then
      update public.animais set status = 'morte' where id = new.animal_id;
    when 'consumo' then
      update public.animais set status = 'baixa' where id = new.animal_id;
    else
      -- compra/entrada_pastoreio/saida_pastoreio/nascimento: vínculo
      -- gravado sem efeito colateral em animais.status (ADR-0004 D2,
      -- estendido por ADR-0005 D2 para os 3 tipos novos).
      null;
  end case;

  return new;
end;
$$;

comment on function public.aplicar_status_animal_apos_vinculo() is
  'ADR-0004 D2, estendido por ADR-0005 D2: venda→venda, obito→morte, '
  'consumo→baixa (mesmo domínio de animais.status desde a Fase 2, nenhuma '
  'coluna nova). Demais tipos (incluindo nascimento) sem efeito colateral — '
  'nascimento fica deliberadamente fora deste mecanismo (ver ADR-0005 D2): '
  'o animal ainda não existe como registro individual no momento da '
  'transação, mesmo tratamento agregado-só que compra já tinha.';


-- ============================================================================
-- 3. Rastreamento independente de documentos (ADR-0005 D3) + peso_total_kg
--    (D4). GTA não muda — status_gta_transacao já cobre presente/pendente.
-- ============================================================================

alter table public.transacoes
  add column arquivo_nota_path text,
  add column arquivo_nota_mime_type text,
  add column arquivo_contranota_path text,
  add column arquivo_contranota_mime_type text,
  add column peso_total_kg numeric(12,3)
    constraint transacoes_peso_total_nao_negativo
    check (peso_total_kg is null or peso_total_kg >= 0);

alter table public.transacoes
  drop column tem_contranota;

comment on column public.transacoes.arquivo_nota_path is
  'ADR-0005 D3. Caminho no bucket de Storage do arquivo da nota (item 14, '
  'ainda não implementado — coluna nasce sempre null até lá). "Nota '
  'pendente" = arquivo_nota_path is null. numero_nota (texto) é mantido '
  'como metadado complementar, independente do upload do arquivo.';

comment on column public.transacoes.arquivo_contranota_path is
  'ADR-0005 D3. Substitui a antiga coluna tem_contranota (boolean, '
  'removida) — "Contranota pendente" = arquivo_contranota_path is null, '
  'mesma pergunta respondida com mais informação (link do arquivo quando '
  'presente).';

comment on column public.transacoes.peso_total_kg is
  'ADR-0005 D4. Peso total opcional da operação (tela "Entradas e Saídas '
  'de Animais de Lote") — sem relação com peso_atual_kg individual do '
  'Eixo 1.';


-- ============================================================================
-- 4. transacoes_detalhe.agrupamento_etario_id vira NULLABLE (ADR-0005 D5) —
--    permite lançar sexo sem faixa etária na tela de Entradas/Saídas de
--    Lote. A FK composta de agrupamentos_etarios (item 10) já usa MATCH
--    SIMPLE — nenhuma mudança lá, um NULL aqui simplesmente não referencia
--    nada, mesmo comportamento já usado em agrupamentos_etarios.
--    subtipo_especie_id desde o item 10.
-- ============================================================================

alter table public.transacoes_detalhe
  alter column agrupamento_etario_id drop not null;

comment on column public.transacoes_detalhe.agrupamento_etario_id is
  'ADR-0005 D5: NULLABLE (era NOT NULL no item 11) — permite registrar '
  'sexo sem faixa etária conhecida ainda (tela "Entradas e Saídas de '
  'Animais de Lote", que só pede sexo, não faixa). saldo_rebanho_movimentos '
  '/obter_saldo_rebanho() tratam NULL como uma faixa sintética "Não '
  'classificado" (não persistida em agrupamentos_etarios — ver ADR-0005 D5 '
  'para o motivo de não poluir o catálogo regulatório).';


-- ============================================================================
-- 5. saldo_rebanho_movimentos — reescrita para resolver especie_id direto
--    de transacoes.especie_id (não mais via JOIN em agrupamentos_etarios,
--    que agora pode ser NULL para a linha) + sinal expandido para os 3
--    tipos novos (nascimento=entrada, obito/consumo=saída).
-- ============================================================================

create or replace view public.saldo_rebanho_movimentos
with (security_invoker = true)
as
select
  t.fazenda_id,
  t.especie_id,
  td.agrupamento_etario_id,
  td.sexo,
  t.data_operacao,
  case
    when t.tipo_operacao in ('compra', 'entrada_pastoreio', 'nascimento')
      then td.quantidade
    else -td.quantidade
  end as quantidade_sinalizada,
  case
    when t.status_gta_transacao = 'pendente' then 'pendente'
    else 'registrada'
  end as bucket
from public.transacoes_detalhe td
join public.transacoes t on t.id = td.transacao_id;

comment on view public.saldo_rebanho_movimentos is
  'ADR-0005: especie_id resolvido direto de transacoes.especie_id (não mais '
  'via agrupamentos_etarios — td.agrupamento_etario_id pode ser NULL desde '
  'ADR-0005 D5). Sinal: + compra/entrada_pastoreio/nascimento, - venda/'
  'saida_pastoreio/obito/consumo. Classificação registrada/pendente '
  'inalterada (transacoes.status_gta_transacao, ver migration do item 12 '
  'para a justificativa de segurança de não depender de gtas). '
  'security_invoker=true mantido.';


-- ============================================================================
-- 6. obter_saldo_rebanho() — mesma espinha fixa (agrupamentos reais) do
--    item 12, com uma seção adicional "Não classificado" (só aparece com
--    movimento real, não faz parte da espinha sempre-presente).
-- ============================================================================

create or replace function public.obter_saldo_rebanho(
  p_data_referencia date default current_date
)
returns table (
  fazenda_id            uuid,
  especie_id            uuid,
  especie_nome          text,
  agrupamento_etario_id uuid,
  agrupamento_label     text,
  sexo                  text,
  qtd_registrada        bigint,
  qtd_pendente          bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fazendas_do_usuario as (
    select fazenda_id
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
  ),
  espinha as (
    select
      fu.fazenda_id,
      e.id   as especie_id,
      e.nome as especie_nome,
      ae.id    as agrupamento_etario_id,
      ae.label as agrupamento_label,
      sx.sexo
    from fazendas_do_usuario fu
    cross join public.especies e
    join public.agrupamentos_etarios ae on ae.especie_id = e.id
    cross join (values ('macho'), ('femea')) as sx(sexo)
  ),
  classificados as (
    select
      espinha.fazenda_id,
      espinha.especie_id,
      espinha.especie_nome,
      espinha.agrupamento_etario_id,
      espinha.agrupamento_label,
      espinha.sexo,
      coalesce(
        sum(m.quantidade_sinalizada) filter (where m.bucket = 'registrada'),
        0
      )::bigint as qtd_registrada,
      coalesce(
        sum(m.quantidade_sinalizada) filter (where m.bucket = 'pendente'),
        0
      )::bigint as qtd_pendente
    from espinha
    left join public.saldo_rebanho_movimentos m
      on m.fazenda_id = espinha.fazenda_id
     and m.especie_id = espinha.especie_id
     and m.agrupamento_etario_id = espinha.agrupamento_etario_id
     and m.sexo = espinha.sexo
     and m.data_operacao <= p_data_referencia
    group by
      espinha.fazenda_id, espinha.especie_id, espinha.especie_nome,
      espinha.agrupamento_etario_id, espinha.agrupamento_label, espinha.sexo
  ),
  nao_classificados as (
    select
      m.fazenda_id,
      m.especie_id,
      e.nome as especie_nome,
      null::uuid as agrupamento_etario_id,
      'Não classificado'::text as agrupamento_label,
      m.sexo,
      coalesce(
        sum(m.quantidade_sinalizada) filter (where m.bucket = 'registrada'),
        0
      )::bigint as qtd_registrada,
      coalesce(
        sum(m.quantidade_sinalizada) filter (where m.bucket = 'pendente'),
        0
      )::bigint as qtd_pendente
    from public.saldo_rebanho_movimentos m
    join public.especies e on e.id = m.especie_id
    where m.agrupamento_etario_id is null
      and m.fazenda_id in (select fazenda_id from fazendas_do_usuario)
      and m.data_operacao <= p_data_referencia
    group by m.fazenda_id, m.especie_id, e.nome, m.sexo
  )
  select * from classificados
  union all
  select * from nao_classificados
  order by fazenda_id, especie_nome, agrupamento_label, sexo;
$$;

comment on function public.obter_saldo_rebanho(date) is
  'ADR-0005: seção "Não classificado" adicionada via UNION ALL — só '
  'aparece quando há movimento real com agrupamento_etario_id NULL (sexo '
  'sem faixa etária, tela "Entradas e Saídas de Animais de Lote"), não faz '
  'parte da espinha fixa (evita poluir toda espécie com uma linha 0/0 '
  'sempre presente). Resto do comportamento idêntico ao item 12 (espinha '
  'completa para as faixas regulatórias reais, mesma fonte de RLS via '
  'usuarios_fazendas).';
