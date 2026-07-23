-- ============================================================================
-- Migration: RPC atualizar_entrada_saida_lote — corrige inconsistência real
--            encontrada em produção (pedido de JP, 2026-07-22/23): o
--            formulário "Editar operação" (TransacaoDetailPage) deixava
--            editar `transacoes.quantidade_animais` direto (UPDATE simples,
--            useAtualizarTransacao) sem tocar `transacoes_detalhe` (sexo,
--            fonte de Saldo de Rebanho/obter_saldo_rebanho) — os dois números
--            divergiam silenciosamente. Confirmado com um caso real: uma
--            compra (Frigorífico Zimmer, 2026-07-20) criada com 20 cabeças
--            (13 macho + 7 fêmea, tudo consistente) foi editada horas depois
--            para "50" sem que transacoes_detalhe acompanhasse — Painel
--            Inteligente ("Cabeças entradas/saídas", soma de
--            quantidade_animais) passou a mostrar 125 no total do ano,
--            enquanto Saldo de Rebanho (soma de transacoes_detalhe) seguia
--            em 95, e nenhum dos dois bate com animais individualizados.
--
-- Decisão (resposta de JP): a quantidade de cabeças só deve ser considerada
-- "correta" a partir do valor que o usuário EXPLICITAMENTE confirma no
-- formulário — e esse valor precisa ficar atomicamente sincronizado com
-- transacoes_detalhe, mesma garantia que registrar_entrada_saida_lote (ADR-
-- 0005/0006) já dá na CRIAÇÃO. Esta RPC estende essa mesma garantia para a
-- EDIÇÃO.
--
-- Escopo deliberadamente limitado: transações já vinculadas a animais
-- individuais via `transacoes_animais` (Venda/Óbito/Consumo com seleção
-- individual, ADR-0004) NÃO têm a quantidade editável por aqui — a
-- quantidade real é derivada de QUAIS animais foram vinculados na criação,
-- não um número solto; a RPC recusa a edição de quantidade nesse caso
-- (frontend também esconde os campos, mas a garantia real é aqui, no
-- backend — mesmo princípio de "nunca confiar só no client" já usado em
-- toda RPC deste projeto). animais PENDENTES (ADR-0006, criados na entrada
-- de lote) não são reconciliados por esta RPC — não têm nenhum vínculo
-- rastreável de volta à transação de origem (só uma convenção de
-- nomenclatura por data+tipo), reconciliá-los com segurança exigiria uma
-- mudança de schema maior, fora do escopo deste achado pontual. Registrado
-- para decisão futura, não resolvido aqui.
--
-- SECURITY DEFINER (não invoker): a normalização de transacoes_detalhe
-- exige DELETE nessa tabela, e não existe policy de DELETE ali (por
-- desenho — ver comentário original da migration do item 11, seção 6) — a
-- mesma razão pela qual toda RPC de escrita "corretiva" deste projeto já é
-- SECURITY DEFINER com checagem imperativa de autorização no corpo (ADR-
-- 0002 D2), nunca delegada a uma policy declarativa.
--
-- Autor: RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

create or replace function public.atualizar_entrada_saida_lote(
  p_transacao_id         uuid,
  p_outra_parte          text,
  p_data_operacao        date,
  p_especie_id           uuid,
  p_quantidade_machos    integer default 0,
  p_quantidade_femeas    integer default 0,
  p_numero_nota          text default null,
  p_valor_nota           numeric default null,
  p_peso_total_kg        numeric default null,
  p_status_gta_transacao text default 'n_a',
  p_observacoes          text default null
)
returns public.transacoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id       uuid;
  v_autorizado       boolean;
  v_tem_vinculo      boolean;
  v_quantidade_total integer;
  v_transacao        public.transacoes;
begin
  select fazenda_id into v_fazenda_id
    from public.transacoes
   where id = p_transacao_id
   for update;

  if not found then
    raise exception 'Transação não encontrada.';
  end if;

  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = v_fazenda_id
       and papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Você não tem permissão para editar esta transação.';
  end if;

  select exists (
    select 1 from public.transacoes_animais where transacao_id = p_transacao_id
  ) into v_tem_vinculo;

  if v_tem_vinculo then
    -- Transação vinculada a animais individuais (Venda/Óbito/Consumo com
    -- seleção individual) — quantidade é derivada dos vínculos existentes,
    -- não editável aqui. Demais campos (nota, valor, peso, GTA,
    -- observações) seguem editáveis normalmente.
    update public.transacoes
       set outra_parte = p_outra_parte,
           data_operacao = p_data_operacao,
           especie_id = p_especie_id,
           numero_nota = nullif(trim(p_numero_nota), ''),
           valor_nota = p_valor_nota,
           peso_total_kg = p_peso_total_kg,
           status_gta_transacao = p_status_gta_transacao,
           observacoes = nullif(trim(p_observacoes), '')
     where id = p_transacao_id
    returning * into v_transacao;

    return v_transacao;
  end if;

  v_quantidade_total := coalesce(p_quantidade_machos, 0) + coalesce(p_quantidade_femeas, 0);

  if v_quantidade_total <= 0 then
    raise exception 'informe ao menos um animal (machos ou fêmeas)';
  end if;

  update public.transacoes
     set outra_parte = p_outra_parte,
         data_operacao = p_data_operacao,
         especie_id = p_especie_id,
         quantidade_animais = v_quantidade_total,
         numero_nota = nullif(trim(p_numero_nota), ''),
         valor_nota = p_valor_nota,
         peso_total_kg = p_peso_total_kg,
         status_gta_transacao = p_status_gta_transacao,
         observacoes = nullif(trim(p_observacoes), '')
   where id = p_transacao_id
  returning * into v_transacao;

  delete from public.transacoes_detalhe where transacao_id = p_transacao_id;

  if p_quantidade_machos > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (p_transacao_id, null, 'macho', p_quantidade_machos);
  end if;

  if p_quantidade_femeas > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (p_transacao_id, null, 'femea', p_quantidade_femeas);
  end if;

  return v_transacao;
end;
$$;

comment on function public.atualizar_entrada_saida_lote(
  uuid, text, date, uuid, integer, integer, text, numeric, numeric, text, text
) is
  'Edição de uma transação já lançada (Fase 4), mantendo quantidade_animais '
  'e transacoes_detalhe sempre sincronizados — mesma garantia atômica que '
  'registrar_entrada_saida_lote (ADR-0005/0006) já dá na criação. Achado '
  'real, 2026-07-22/23: UPDATE direto por useAtualizarTransacao deixava os '
  'dois divergirem silenciosamente. Quantidade não editável quando a '
  'transação já está vinculada a animais individuais via '
  'transacoes_animais (Venda/Óbito/Consumo com seleção individual) — nesse '
  'caso só os demais campos são atualizados. SECURITY DEFINER: normalizar '
  'transacoes_detalhe exige DELETE, sem policy própria por desenho (ver '
  'migration do item 11) — checagem de autorização imperativa no corpo, '
  'mesmo padrão de toda RPC corretiva do projeto (ADR-0002 D2).';

revoke all on function public.atualizar_entrada_saida_lote(
  uuid, text, date, uuid, integer, integer, text, numeric, numeric, text, text
) from public;

grant execute on function public.atualizar_entrada_saida_lote(
  uuid, text, date, uuid, integer, integer, text, numeric, numeric, text, text
) to authenticated;
