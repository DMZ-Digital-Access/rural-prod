# Log — Security review: policy de DELETE em lotes — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança de
  `supabase/migrations/20260720240000_lotes_delete_policy.sql`, entregue pela `db_sage` a
  pedido de JP (opção real de "Excluir" lote na UI, ao lado de "Arquivar").
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push`.

## Contexto

A Fase 2 deliberadamente não criou policy de DELETE em `lotes` (decisão de modelagem:
arquivamento via flag, não exclusão física). Esta migration reabre essa decisão a pedido
explícito de JP — não é um desvio não solicitado.

## Análise

**Sem achado.** `lotes_delete_vinculada` segue exatamente o mesmo padrão sintático das 3
policies já existentes (`select`/`insert`/`update`) — mesma fronteira de fazenda +
`papel <> 'financeiro'`. `animais.lote_id` já usa `on delete set null` (Fase 2) — confirmado
por teste real que excluir um lote NUNCA apaga animais associados, só desvincula
(`lote_id` volta a `NULL`). Nenhuma outra tabela referencia `lotes(id)` que pudesse ter um
comportamento de cascata inesperado.

## [VERIFICAÇÃO DE DADOS]

- RLS / Controle de acesso: **validado** — usuário real via GoTrue local: (1) `admin` exclui um
  lote com 1 animal associado — animal sobrevive, `lote_id` vira `NULL`, lote some da tabela;
  (2) `financeiro` da mesma fazenda tenta excluir outro lote — `DELETE 0` (bloqueado pela RLS),
  consistente com `financeiro` também não enxergar `lotes` via `SELECT` (fronteira já
  estabelecida na Fase 2).

## Mudanças de arquivo

- Nenhuma mudança em `supabase/migrations/20260720240000_lotes_delete_policy.sql` — aprovada
  como está.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-lotes-delete.md` (este log).

## Pendências

- Frontend: fluxo de confirmação em duas etapas ("Encerrar Lote" → Arquivar/Excluir → segunda
  confirmação só para Excluir) — próxima tarefa de `developer`.
- `supabase db push` não executado neste log.
