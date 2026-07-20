-- ============================================================================
-- Migration: ADR-0005 — RPC registrar_entrada_saida_lote()
--
-- Nota de implementação do próprio ADR-0005 (D5): a soma de
-- quantidade_machos/quantidade_femeas precisa bater com quantidade_animais
-- ANTES do commit, mas só é verdadeira depois que TODAS as linhas de
-- transacoes_detalhe de uma operação existem — um trigger por linha não
-- serve. Esta função insere transacao + linhas de detalhe (sexo, sem faixa
-- etária — ADR-0005 D5) numa única transação SQL, validando a soma
-- internamente antes de qualquer INSERT.
--
-- SECURITY INVOKER (não DEFINER): admin/membro já têm INSERT direto em
-- transacoes/transacoes_detalhe (RLS do item 11, sem trigger restritivo
-- bloqueando escrita normal, diferente de animais/Fase 2). Não há
-- privilégio a elevar — mesmo princípio de mínimo privilégio já usado em
-- ADR-0004 D2 (aplicar_status_animal_apos_vinculo) e no restante do
-- schema desta fase. A função só existe para dar atomicidade + validação
-- de soma num único round-trip, não para contornar RLS.
--
-- Restrita aos 5 tipos de operação da tela "Entradas e Saídas de Animais
-- de Lote" (compra/venda/nascimento/obito/consumo) — pastoreio
-- (entrada_pastoreio/saida_pastoreio) continua existindo como conceito
-- separado (ADR-0005 D1) mas não passa por este botão/RPC específico.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================

create or replace function public.registrar_entrada_saida_lote(
  p_fazenda_id        uuid,
  p_tipo_operacao     text,
  p_especie_id        uuid,
  p_outra_parte       text,
  p_data_operacao     date,
  p_quantidade_machos integer default 0,
  p_quantidade_femeas integer default 0,
  p_valor_nota        numeric default null,
  p_peso_total_kg     numeric default null
)
returns public.transacoes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quantidade_total integer;
  v_transacao        public.transacoes;
begin
  if p_tipo_operacao not in ('compra', 'venda', 'nascimento', 'obito', 'consumo') then
    raise exception 'tipo_operacao inválido para esta operação — use compra, venda, nascimento, obito ou consumo';
  end if;

  v_quantidade_total := coalesce(p_quantidade_machos, 0) + coalesce(p_quantidade_femeas, 0);

  if v_quantidade_total <= 0 then
    raise exception 'informe ao menos um animal (machos ou fêmeas)';
  end if;

  insert into public.transacoes (
    fazenda_id, tipo_operacao, especie_id, outra_parte, data_operacao,
    quantidade_animais, valor_nota, peso_total_kg
  ) values (
    p_fazenda_id, p_tipo_operacao, p_especie_id, p_outra_parte, p_data_operacao,
    v_quantidade_total, p_valor_nota, p_peso_total_kg
  )
  returning * into v_transacao;

  if p_quantidade_machos > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (v_transacao.id, null, 'macho', p_quantidade_machos);
  end if;

  if p_quantidade_femeas > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (v_transacao.id, null, 'femea', p_quantidade_femeas);
  end if;

  return v_transacao;
end;
$$;

comment on function public.registrar_entrada_saida_lote(uuid, text, uuid, text, date, integer, integer, numeric, numeric) is
  'ADR-0005: insere transacao + transacoes_detalhe (sexo, sem faixa etária) '
  'atomicamente, validando que quantidade_machos + quantidade_femeas > 0 '
  'antes do commit. SECURITY INVOKER — RLS de transacoes/transacoes_detalhe '
  '(admin/membro, item 11) já protege a escrita; a função só dá atomicidade '
  'e validação de soma num único round-trip. Restrita a '
  'compra/venda/nascimento/obito/consumo — pastoreio não passa por aqui.';
