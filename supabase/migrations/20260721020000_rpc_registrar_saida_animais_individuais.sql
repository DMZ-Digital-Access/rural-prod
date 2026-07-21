-- ============================================================================
-- Migration: RPC registrar_saida_animais_individuais() — Venda/Óbito/Consumo
--            vinculados a animais já existentes (ADR-0004/0005/0006)
--
-- Contexto: ADR-0004 desenhou transacoes_animais para vincular uma transação
-- a animais individuais já cadastrados; ADR-0005 estendeu o mecanismo de
-- atualização de status para obito→morte/consumo→baixa; ADR-0006 confirmou
-- que Venda/Óbito/Consumo agem sobre animais JÁ EXISTENTES (diferente de
-- Compra/Nascimento/Entrada de Pastoreio, que criam animais pendentes). O
-- que faltava era a função que o frontend chama para, de fato, vincular os
-- animais selecionados numa única operação atômica.
--
-- Mecanismo:
-- 1. Cria a transacao (mesmo padrão de registrar_entrada_saida_lote).
-- 2. Insere uma linha em transacoes_animais por animal selecionado — os
--    triggers já existentes (preparar_vinculo_transacao_animal,
--    aplicar_status_animal_apos_vinculo) cuidam de validar cross-fazenda,
--    denormalizar tipo_operacao_transacao e atualizar animais.status
--    automaticamente. Nenhuma lógica nova precisa ser escrita aqui para
--    isso — só o INSERT.
-- 3. Insere transacoes_detalhe agrupando os animais por (agrupamento_etario
--    REAL calculado pela idade na data da operação, sexo) — mais preciso
--    que o "Não classificado" da tela de entrada agregada, porque aqui a
--    data_nascimento de cada animal já é conhecida. Quando a idade de um
--    animal não cai em nenhuma faixa cadastrada (ex.: hiato de Suíno
--    151-179 dias, já documentado na migration do item 10), a linha cai em
--    agrupamento_etario_id = NULL (mesmo fallback "Não classificado").
--
-- Só aceita venda/obito/consumo — saida_pastoreio continua agregada (não
-- vincula a animal individual, mesmo padrão de compra/entrada_pastoreio já
-- estabelecido).
--
-- Validação: rejeita explicitamente qualquer animal_id ainda pendente de
-- individualização (data_nascimento NULL) — vender/matar/consumir um
-- animal sem identidade básica (idade/peso) não faz sentido de produto;
-- o usuário precisa completar a individualização primeiro (tela de editar
-- animal, ADR-0006).
--
-- SECURITY INVOKER (padrão, sem elevação) — mesmo princípio de
-- registrar_entrada_saida_lote(): admin/membro já tem INSERT direto em
-- transacoes/transacoes_detalhe/transacoes_animais via RLS existente.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

create or replace function public.registrar_saida_animais_individuais(
  p_fazenda_id    uuid,
  p_tipo_operacao text,
  p_especie_id    uuid,
  p_outra_parte   text,
  p_data_operacao date,
  p_animal_ids    uuid[],
  p_valor_nota    numeric default null,
  p_peso_total_kg numeric default null
)
returns public.transacoes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transacao public.transacoes;
  v_qtd       integer;
begin
  if p_tipo_operacao not in ('venda', 'obito', 'consumo') then
    raise exception 'tipo_operacao inválido para esta operação — use venda, obito ou consumo';
  end if;

  v_qtd := coalesce(array_length(p_animal_ids, 1), 0);
  if v_qtd <= 0 then
    raise exception 'selecione ao menos um animal';
  end if;

  if exists (
    select 1
      from public.animais
     where id = any(p_animal_ids)
       and data_nascimento is null
  ) then
    raise exception 'todos os animais selecionados precisam estar individualizados (com data de nascimento) antes de participarem desta operação';
  end if;

  insert into public.transacoes (
    fazenda_id, tipo_operacao, especie_id, outra_parte, data_operacao,
    quantidade_animais, valor_nota, peso_total_kg
  ) values (
    p_fazenda_id, p_tipo_operacao, p_especie_id, p_outra_parte, p_data_operacao,
    v_qtd, p_valor_nota, p_peso_total_kg
  )
  returning * into v_transacao;

  insert into public.transacoes_animais (transacao_id, animal_id)
  select v_transacao.id, unnest(p_animal_ids);

  insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
  select v_transacao.id, ag.id, a.sexo, count(*)
    from public.animais a
    left join lateral (
      select ae.id
        from public.agrupamentos_etarios ae
       where ae.especie_id = p_especie_id
         and (
           case ae.unidade_idade
             when 'dias' then (p_data_operacao - a.data_nascimento)
             when 'semanas' then (p_data_operacao - a.data_nascimento) / 7
             when 'meses' then (
               date_part('year', age(p_data_operacao, a.data_nascimento)) * 12
               + date_part('month', age(p_data_operacao, a.data_nascimento))
             )::integer
             else null
           end
         ) between ae.idade_min and coalesce(ae.idade_max, 2147483647)
       limit 1
    ) ag on true
   where a.id = any(p_animal_ids)
   group by ag.id, a.sexo;

  return v_transacao;
end;
$$;

comment on function public.registrar_saida_animais_individuais(uuid, text, uuid, text, date, uuid[], numeric, numeric) is
  'ADR-0004/0005/0006: vincula transacao (venda/obito/consumo) a animais já '
  'existentes via transacoes_animais — os triggers já existentes cuidam da '
  'validação cross-fazenda e da atualização automática de animais.status. '
  'transacoes_detalhe é populada com o agrupamento etário REAL de cada '
  'animal (calculado pela idade na data da operação), mais preciso que o '
  '"Não classificado" da entrada agregada. Rejeita animais ainda pendentes '
  'de individualização (data_nascimento NULL).';
