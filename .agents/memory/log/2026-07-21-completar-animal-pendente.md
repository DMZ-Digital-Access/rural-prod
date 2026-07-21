# Log — Fluxo de completar animal pendente de individualização — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** primeiro dos "próximos passos" combinados com JP após o ADR-0006 — animais
  criados por Entradas de Lote ficam com `data_nascimento`/`peso_inicial_kg` nulos; faltava um
  caminho para completá-los.

## Schema

Nova migration `20260721010000_inicializa_peso_atual_ao_completar_pendencia.sql` — trigger
`BEFORE UPDATE OF peso_inicial_kg` em `animais`: quando `peso_inicial_kg` é preenchido pela
primeira vez (era `NULL`) e `peso_atual_kg` ainda não foi tocado por nenhuma pesagem real
(também `NULL`), inicializa `peso_atual_kg = peso_inicial_kg` — mesmo baseline que
`inicializar_peso_atual_animal()` já dá na criação normal (Fase 2).

**Achado técnico validado por teste real (não só leitura da documentação do Postgres):** o
guard `prevent_animais_campos_calculados_change()` (Fase 2, `BEFORE UPDATE OF peso_atual_kg,
gmd_medio_kg, ultima_pesagem_data`) só dispara quando o PRÓPRIO comando UPDATE do cliente lista
essas colunas no `SET` — não quando um trigger BEFORE anterior as modifica internamente. Como a
tela de edição nunca inclui `peso_atual_kg` no `UPDATE`, o novo trigger inicializa o campo sem
precisar da GUC `rural_prod.recalculo_pesagem` (usada por `registrar_pesagem()`) e sem
enfraquecer a proteção original (confirmado: tentativa direta de `UPDATE ... SET
peso_atual_kg = X` continua bloqueada).

Gate do `cyber_chief` concluído (🟢) — ver
`.agents/memory/log/2026-07-21-cyber_chief-review-inicializa-peso-atual.md`.

## Frontend

- `src/lib/validations/animais.ts` — `editarAnimalSchema` ganhou `data_nascimento`/
  `peso_inicial_kg` (nullable, sem forçar completude a cada edição).
- `src/hooks/useAnimais.ts` — `useAtualizarAnimal` envia os 2 campos novos no `UPDATE`.
- `EditarAnimalDialog.tsx` — banner "pendente de individualização" quando aplicável; campos
  novos de Data de Nascimento/Peso Inicial; corrigido o mesmo bug de `Select` (Base UI não
  resolve o rótulo até o popup abrir uma vez) no campo Status.
- **Achado extra corrigido no caminho:** `LoteSelectField.tsx` (componente compartilhado entre
  Criar/Editar Animal) tinha o mesmo bug, mostrando o sentinel bruto `__sem_lote__` em vez de
  "Sem lote" — corrigido de uma vez para os dois formulários que o usam.

## Validação real executada

- `npm run build`/`lint`/`test` (36/36, 1 teste novo) — limpos.
- Schema: 2 testes reais (inicialização correta sem passar pelo guard; guard original ainda
  bloqueia tentativa direta de falsificar `peso_atual_kg`).
- **Teste visual real de ponta a ponta** (Playwright, desktop 1440×900 + mobile 390×844,
  Supabase remoto): completado um animal pendente real (`COMPRA-2026-07-20-003`) com data de
  nascimento e peso — badge "Pendente" some, categoria calculada corretamente ("Novilha"), peso
  atual mostra o valor inicializado (210.5 kg), toast de sucesso.

## Mudanças de arquivo

- Novo `supabase/migrations/20260721010000_inicializa_peso_atual_ao_completar_pendencia.sql`.
- Novo `.agents/memory/log/2026-07-21-cyber_chief-review-inicializa-peso-atual.md`.
- Modificado: `src/lib/validations/animais.ts`, `src/lib/validations/animais.test.ts`,
  `src/hooks/useAnimais.ts`, `src/pages/animais/EditarAnimalDialog.tsx`,
  `src/components/rebanho/LoteSelectField.tsx`.
- Este log + `PROJECT_CONTEXT.md`.
