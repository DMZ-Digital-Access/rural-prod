# Log — Fase 4, Módulo Financeiro: lançamentos (item 18, passo 1/3) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** primeiro passo do Módulo Financeiro (item 18), seguindo o plano combinado com
  JP (1. listagem/CRUD manual, 2. classificação assistida por IA, 3. fluxo de caixa
  consolidado + exportação).

## O que foi feito

Duas rotas novas, substituindo o `PlaceholderPage` de `/app/rebanho/financeiro`:

- `/app/rebanho/financeiro` (`LancamentosListPage.tsx`) — listagem com resumo de receitas/
  despesas da página atual, filtros (tipo/categoria/pago/período), paginação (20/página),
  botão "Novo Lançamento" (escondido para papel `financeiro`, que só lê — RLS já bloqueia
  INSERT/UPDATE nesse papel desde a Fase 3, item 13).
- `/app/rebanho/financeiro/:id` (`LancamentoDetailPage.tsx`) — detalhe completo, transação de
  animal vinculada (se houver), formulário de edição inline (reaproveita o mesmo
  `LancamentoForm.tsx` da criação, mesmo padrão de `GtaForm`/`GtaDetailPage`).

**Pedido de JP no início da tarefa, incorporado:** campo **"Pago" (Sim/Não)** com **data do
pagamento** obrigatória quando Sim — fora da spec original (seção 3.2 só previa tipo/categoria/
descrição/data/valor/nota/contraparte). Migration nova
`20260721070000_lancamentos_financeiros_pago.sql` — `pago boolean not null default false` +
`data_pagamento date` nullable, com CHECK garantindo `data_pagamento` preenchida quando
`pago = true` (mesmo padrão de `gtas.status_liberacao`/`data_liberacao`, item 11).

Novos arquivos: `src/lib/types/financeiro.ts`, `src/lib/validations/financeiro.ts`,
`src/hooks/useLancamentosFinanceiros.ts`, `src/components/rebanho/TipoLancamentoBadge.tsx`,
`src/components/rebanho/StatusPagoBadge.tsx`, `src/pages/financeiro/LancamentoForm.tsx`,
`CriarLancamentoDialog.tsx`, `LancamentosListPage.tsx`, `LancamentoDetailPage.tsx`. Reaproveitou
`useTransacoesParaVincular` (já existia em `useGtas.ts`) para o vínculo opcional a uma transação
de animal já registrada.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos — build passou sem nenhum erro já na primeira
  tentativa (raro nesta sessão).
- Teste funcional real de ponta a ponta (Playwright, desktop 1440×900 + mobile 390×844,
  Supabase remoto, conta de teste real): cadastrou um lançamento de despesa real, abriu o
  detalhe, marcou como pago com data, **recarregou a página** e confirmou persistência real no
  banco (não só estado do form). Zero erros de console em nenhum viewport. Dado de teste
  removido ao final.

## Gate do `cyber_chief`

Não rodado (mesma pendência acumulada dos módulos anteriores desta fase — só frontend, a RLS
de `lancamentos_financeiros` já foi gateada na Fase 3, item 13).

## Próximos passos combinados com JP

Módulo Financeiro continua: 2) classificação assistida por IA (Edge Function + Anthropic API,
Claude Haiku 4.5 — ver especificacao-sistema.md seção 12, entrada "Planejado: classificação
assistida por IA"); 3) visão consolidada de fluxo de caixa + exportação CSV/Excel.
