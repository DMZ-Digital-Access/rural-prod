# Log — Desvincular animais ao arquivar lote + coluna "Lote" na lista de Animais — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **Data:** 2026-07-20
- **Motivação:** JP confirmou que arquivar um lote deve ter o MESMO efeito de excluir sobre os
  animais associados — ficarem sem lote (`lote_id = null`). Antes, só a exclusão fazia isso
  (via `on delete set null`); arquivar só mudava a flag `ativo`, deixando animais "presos" a um
  lote arquivado. Pediu também uma coluna nova na lista de Animais indicando se o animal
  pertence a algum lote atualmente (Sim/Não).

## Schema

Nova migration `20260721000000_lotes_desvincula_animais_ao_arquivar.sql` — trigger
`AFTER UPDATE OF ativo` em `lotes` (`desvincular_animais_ao_arquivar_lote()`, SECURITY
INVOKER): quando `ativo` transiciona `true→false`, `UPDATE animais SET lote_id = null WHERE
lote_id = <lote>`. Reativar (`false→true`) não re-vincula nada (assimétrico, mesma lógica de
"exclusão não tem volta"). Validado por teste real (lote com 2 animais, arquivado — os 2 ficam
com `lote_id=null`). Gate do `cyber_chief` concluído (🟢) — sem elevação de privilégio, quem
arquiva já tem `UPDATE` direto em `animais.lote_id`.

## Frontend

`AnimaisListPage.tsx` — coluna nova "Lote" (Sim/Não, `hidden sm:table-cell`), derivada de
`animal.lote_id !== null`, sem hook/tipo novo (campo já vinha em `animais_com_detalhes`).

## Validação real executada

- `npm run build`/`test` limpos.
- Teste visual real (desktop + mobile) contra o Supabase remoto — coluna "Lote" mostrando
  Sim/Não corretamente para os animais reais da conta de teste (inclusive um animal
  pendente que JP já individualizou manualmente, confirmando o fluxo ponta a ponta).

## Mudanças de arquivo

- Novo `supabase/migrations/20260721000000_lotes_desvincula_animais_ao_arquivar.sql`.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-desvincula-arquivar.md`.
- Modificado `src/pages/animais/AnimaisListPage.tsx`.
- Este log + `PROJECT_CONTEXT.md`.
