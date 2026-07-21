-- ============================================================================
-- Migration: lancamentos_financeiros.pago/data_pagamento — pedido de JP
--            durante a construção do Módulo Financeiro (Fase 4, item 18):
--            "nos lançamentos também devemos ter o identificador de Pago
--            (Sim/Não), e quando Sim, indicar a data do pagamento".
--
-- Mesmo padrão já usado em gtas.status_liberacao/data_liberacao (item 11):
-- `pago` boolean (default false, nunca nulo — todo lançamento tem um estado
-- de pagamento conhecido, diferente de status_liberacao que tem um terceiro
-- valor "pendente" textual) + `data_pagamento` nullable, obrigatória quando
-- `pago = true` via CHECK (mesma lógica de
-- `gtas_data_liberacao_consistente`).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- Referência: Módulo Financeiro (Fase 4, item 18), pedido de JP no início da
--             tarefa (fora da spec original, seção 3.2 não previa este
--             campo em `lancamentos_financeiros`).
-- ============================================================================

alter table public.lancamentos_financeiros
  add column pago boolean not null default false,
  add column data_pagamento date;

alter table public.lancamentos_financeiros
  add constraint lancamentos_financeiros_data_pagamento_consistente
  check (pago = false or data_pagamento is not null);

alter table public.lancamentos_financeiros
  add constraint lancamentos_financeiros_data_pagamento_nao_futura
  check (data_pagamento is null or data_pagamento <= current_date);

comment on column public.lancamentos_financeiros.pago is
  'Pedido de JP, 2026-07-21, fora da spec original — indica se o '
  'lançamento (receita ou despesa) já foi efetivamente pago/recebido. '
  'Default false (não confirma pagamento por omissão).';

comment on column public.lancamentos_financeiros.data_pagamento is
  'Obrigatória quando pago = true (constraint '
  'lancamentos_financeiros_data_pagamento_consistente, mesmo padrão de '
  'gtas.data_liberacao) — nula enquanto pago = false.';
