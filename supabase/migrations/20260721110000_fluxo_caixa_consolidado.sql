-- ============================================================================
-- Migration: view fluxo_caixa_consolidado — Módulo Financeiro (item 18),
--            spec seção 5.2: "Visão consolidada de fluxo de caixa: receitas
--            (vendas de animais + outras receitas) × despesas (compras de
--            animais + insumos/despesas gerais), por período".
--
-- UNION ALL de duas fontes:
--   1. transacoes (só compra/venda de animais, com valor_nota preenchido —
--      spec seção 5.2 já previa esse valor opcional na tela de Entradas e
--      Saídas, item 15). Nascimento/Óbito/Consumo/Pastoreio não têm
--      contrapartida financeira direta (não são compra/venda), ficam de
--      fora deliberadamente.
--   2. lancamentos_financeiros — EXCETO os que já têm
--      `transacao_animal_id` preenchido. Esse filtro é exatamente o que o
--      comentário original da coluna (migration do item 13) já previa:
--      "evitando dupla contagem na visão consolidada" — um lançamento
--      vinculado a uma transação de animal representa o MESMO dinheiro já
--      contado pela linha de `transacoes`, não deve somar de novo aqui.
--
-- security_invoker = true (padrão de toda view do projeto) — a RLS das
-- tabelas de origem já cobre a fronteira de `financeiro` corretamente:
-- `transacoes` permite SELECT a financeiro (spec 5.4, "Saldo de Animais"/
-- fluxo de caixa são acessíveis); `lancamentos_financeiros` também permite
-- SELECT a financeiro (Fase 3, item 13). Sem tabela nova, sem RPC nova —
-- diferente de obter_saldo_rebanho() (que precisa de uma "espinha" fixa de
-- agrupamento etário/sexo), aqui uma view simples já basta porque não há
-- dimensão fixa a preencher com zero quando não há movimento.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- Referência: especificacao-sistema.md, seção 5.2, "Módulo: Financeiro".
-- ============================================================================

create or replace view public.fluxo_caixa_consolidado
with (security_invoker = true)
as
select
  t.fazenda_id,
  t.id                as origem_id,
  'transacao_animal'::text as origem,
  t.data_operacao     as data,
  case when t.tipo_operacao = 'venda' then 'receita' else 'despesa' end as tipo,
  case when t.tipo_operacao = 'venda' then 'Venda de Animais' else 'Compra de Animais' end as categoria,
  t.outra_parte       as descricao,
  t.valor_nota        as valor
from public.transacoes t
where t.tipo_operacao in ('compra', 'venda')
  and t.valor_nota is not null

union all

select
  lf.fazenda_id,
  lf.id               as origem_id,
  'lancamento_financeiro'::text as origem,
  lf.data_lancamento  as data,
  lf.tipo,
  lf.categoria,
  lf.descricao,
  lf.valor
from public.lancamentos_financeiros lf
where lf.transacao_animal_id is null;

comment on view public.fluxo_caixa_consolidado is
  'Visão consolidada de fluxo de caixa (spec seção 5.2, Módulo Financeiro) — '
  'UNION de transacoes (só compra/venda de animais com valor_nota '
  'preenchido) e lancamentos_financeiros (excluindo os vinculados a uma '
  'transacao_animal_id, para não contar o mesmo dinheiro duas vezes — ver '
  'comentário original da coluna, migration do item 13). '
  '`origem`/`origem_id` permitem ao frontend linkar de volta para o '
  'registro de detalhe correto (transação ou lançamento). '
  'security_invoker=true — RLS das tabelas de origem já cobre a fronteira '
  'de financeiro corretamente, sem necessidade de policy própria.';
