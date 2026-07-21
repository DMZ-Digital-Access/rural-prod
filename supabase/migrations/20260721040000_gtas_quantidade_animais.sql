-- ============================================================================
-- Migration: gtas.quantidade_animais — pedido de JP durante a construção do
--            Módulo de GTAs (Fase 4, item 17): "identificar quantos animais
--            estão incluídos nesse documento" no cadastro/edição de GTA.
--
-- NULLABLE, não NOT NULL: já existe 1 linha real em produção
-- (`AC-871811`, fazenda de teste) criada antes deste campo existir. Mesma
-- decisão já usada em ADR-0006 (animais.data_nascimento/peso_inicial_kg) —
-- nullable no banco para não quebrar histórico, exigido pelo formulário do
-- frontend em toda criação/edição nova (zod, não CHECK) daqui pra frente.
-- CHECK garante só que, quando preenchido, é positivo (mesmo padrão de
-- transacoes.quantidade_animais/peso_total_kg).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- Referência: Módulo de GTAs (Fase 4, item 17), pedido de JP no meio da
--             tarefa (fora da spec original, seção 3.2 não previa este
--             campo em `gtas`).
-- ============================================================================

alter table public.gtas
  add column quantidade_animais integer
  constraint gtas_quantidade_animais_positiva
  check (quantidade_animais is null or quantidade_animais > 0);

comment on column public.gtas.quantidade_animais is
  'Número de animais incluídos neste documento de GTA (pedido de JP, '
  '2026-07-21, fora da spec original). Nullable — já existe histórico sem '
  'este campo; o formulário do frontend passa a exigir em toda criação/'
  'edição nova, mas o banco não força retroativamente.';
