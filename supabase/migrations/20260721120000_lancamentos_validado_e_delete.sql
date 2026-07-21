-- ============================================================================
-- Migration: lancamentos_financeiros.validado_pelo_usuario + policy de DELETE
--
-- Contexto (pedido de JP, 2026-07-21): o fluxo de "Novo Lançamento" passou a
-- capturar um documento (nota/boleto/recibo) ANTES do formulário — o arquivo
-- é salvo no bucket e um rascunho de lançamento é criado imediatamente (pra
-- nunca perder o documento capturado, mesmo que o usuário feche a tela sem
-- confirmar), a IA lê e pré-preenche os campos, e só quando o usuário
-- confirma (ou edita e salva) o lançamento passa a ser considerado validado.
-- Se o usuário abandonar o fluxo, o rascunho continua no banco com os dados
-- da IA, identificado como não validado — daí a coluna nova.
--
-- Aditiva sobre 20260720150000_fase3_financeiro_declaracoes_prazos.sql —
-- NÃO edita a migration original (regra do projeto), só adiciona.
--
-- DECISÕES DESTA MIGRATION:
--
-- 1. `validado_pelo_usuario boolean not null default true` — DEFAULT TRUE:
--    todo lançamento já existente (e todo lançamento criado pelo fluxo
--    manual, "Preencher manualmente") foi digitado/confirmado explicitamente
--    pelo usuário num formulário, então já nasce validado. Só o fluxo novo de
--    rascunho por IA insere `false` explicitamente. Qualquer UPDATE feito
--    através do formulário (`useAtualizarLancamento`) grava `true`
--    incondicionalmente — a própria ação de salvar o formulário É a
--    confirmação, editada ou não.
--
-- 2. Nenhuma policy nova de INSERT/UPDATE precisa mudar — a coluna é só mais
--    um campo dentro do mesmo shape já coberto pelas policies existentes
--    (`lancamentos_financeiros_insert_vinculada`/`_update_vinculada`,
--    papel <> financeiro).
--
-- 3. **REVERSÃO DELIBERADA da decisão 6 da migration anterior** ("SEM policy
--    de DELETE... correção é via UPDATE"): pedido explícito de JP nesta
--    tarefa — um lançamento pode ter sido validado por engano ou com erro
--    (inclusive um rascunho de IA mal lido) e precisa poder ser excluído, não
--    só corrigido. A justificativa original (não invalidar silenciosamente um
--    período já exportado pra contabilidade externa) continua sendo um risco
--    real, mas agora é aceito conscientemente em troca da correção de
--    engano — mitigado por exigir confirmação explícita na UI (dupla
--    confirmação, mesmo padrão já usado em "Encerrar Lote") e por manter o
--    princípio de nunca apagar o arquivo do bucket junto (o documento fiscal
--    em si permanece, mesmo que a linha que apontava pra ele seja excluída —
--    seguindo o mesmo espírito de "documento fiscal não é apagável" já usado
--    para os buckets). Mesmo escopo de quem pode: admin/membro (não
--    financeiro, mesma fronteira de sempre).
-- ============================================================================

alter table public.lancamentos_financeiros
  add column validado_pelo_usuario boolean not null default true;

comment on column public.lancamentos_financeiros.validado_pelo_usuario is
  'FALSE apenas para rascunhos criados pelo fluxo de captura de documento por '
  'IA (2026-07-21) enquanto o usuário ainda não confirmou/editou-e-salvou o '
  'formulário pré-preenchido — permite ao rascunho existir no banco (com o '
  'documento já anexado) mesmo que o usuário abandone a tela sem confirmar. '
  'TRUE por padrão para todo o resto (lançamentos manuais e qualquer UPDATE '
  'feito via formulário, que sempre regrava este campo como true — a própria '
  'ação de salvar é a confirmação).';

create policy lancamentos_financeiros_delete_vinculada
  on public.lancamentos_financeiros
  for delete
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

comment on table public.lancamentos_financeiros is
  'Receitas/despesas gerais da fazenda (insumos, medicamentos, combustível, '
  'mão de obra, manutenção, impostos etc. — spec seção 3.2), fora das '
  'compras/vendas de animais já cobertas por `transacoes`. `categoria` é '
  'texto livre, sem CHECK/tabela de configuração. `transacao_animal_id` '
  '(nullable) permite vincular a uma transação de animal já registrada, '
  'evitando dupla contagem na visão consolidada de fluxo de caixa. '
  '`validado_pelo_usuario` (2026-07-21) marca rascunhos criados pelo fluxo '
  'de captura de documento por IA ainda não confirmados pelo usuário. '
  'DELETE permitido para admin/membro desde 2026-07-21 (reversão deliberada '
  'da decisão original "sem DELETE" — pedido de JP, ver migration '
  '20260721120000) — correção de engano/erro de validação; o documento '
  'fiscal anexado no bucket NÃO é apagado junto, só a linha.';
