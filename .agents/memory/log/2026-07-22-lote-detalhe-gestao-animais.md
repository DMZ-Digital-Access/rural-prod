# Log — Detalhe do Lote: transferir/retirar animal + incluir animais — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** pedido de JP — na tela de detalhe do lote, poder retirar ou transferir de lote
  um animal já na lista, e incluir mais animais no lote (lista alfabética por identificação +
  busca).

## O que foi feito

**Hooks novos** (`src/hooks/useAnimais.ts`): `useAtualizarLoteDoAnimal(animalId)` (muda o
`lote_id` de UM animal — `null` retira, qualquer outro id move pra outro lote) e
`useAdicionarAnimaisAoLote(loteId)` (UPDATE em lote via `.in(...)`, pra incluir vários animais de
uma vez). Nenhuma migration nova precisou ser escrita — a RLS já existente
(`animais_update_vinculada`, papel <> financeiro) e o trigger `validar_lote_mesma_fazenda` (já
revisados no gate da Fase 2) cobrem toda a validação de segurança necessária.

**Componentes novos** (`src/pages/lotes/`):
- `MudarLoteDialog.tsx` — um único botão "Ações" (ícone) por animal, abre um `Select` com todos
  os lotes da fazenda + "Sem lote". Retirar e transferir são o MESMO gesto (escolher o destino),
  confirmado com JP depois de eu ter perguntado sobre o significado de "substituir".
- `AdicionarAnimaisDialog.tsx` — campo de busca por identificação + checklist com todos os
  animais ativos da fazenda que ainda não estão NESTE lote (inclusive os que já têm outro lote —
  decisão confirmada com JP: selecionar um assim "rouba" ele pro lote atual, sem precisar ir na
  tela de origem primeiro). Mesmo padrão JSX de checklist-em-div-rolável já usado em
  `SaidaAnimaisIndividuaisForm.tsx` (Módulo de Transações) — sem componente Combobox/Command,
  filtro client-side simples.

## Bug real encontrado e corrigido durante a validação

`MudarLoteDialog` inicialmente reusava `LoteSelectField` (`src/components/rebanho/
LoteSelectField.tsx`), o mesmo componente usado nos formulários de criar/editar animal — mas
esse componente depende de `FormControl`/`useFormContext()` (react-hook-form), e este dialog não
usa react-hook-form, só `useState`. Resultado: tela quebrava com "Cannot destructure property
'getFieldState' of 'useFormContext(...)' as it is null" ao abrir o diálogo — só descoberto
porque testei de verdade no navegador via Playwright (`npm run build` não pega esse tipo de erro
de runtime). Corrigido substituindo por um `Select` plano (mesmo padrão já usado em
`ConfiguracaoIaPage.tsx`/`EquipePage.tsx`, que também não usam react-hook-form).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Playwright real contra o remoto: incluiu um animal de teste no lote (busca por identificação
  filtrando corretamente), moveu esse animal pra um segundo lote de teste (criado só pra validar
  o fluxo, removido ao final), confirmou que ele sumiu do lote de origem e apareceu no destino, e
  reverteu pro estado original ("Sem lote") — sem deixar rastro de teste. Mobile (390px) sem
  overflow, tanto na tela de detalhe quanto no diálogo de incluir animais (confirmado por
  screenshot).
- **Nota:** JP estava usando o app de verdade em paralelo a essa validação (criou uma fazenda
  nova e um lote novo, "Lote para Dezembro 2026", e moveu alguns animais reais entre lotes) — o
  filtro de "animais disponíveis pra incluir" mostrou corretamente animais com outro lote como
  disponíveis (rotulados "já tem lote"), confirmando que a decisão de produto ("roubar" de outro
  lote) funciona também com dado real, não só de teste.

## Gate do `cyber_chief`

Não se aplica — nenhuma migration nova, só frontend consumindo RLS/trigger já revisados no gate
da Fase 2 (`animais_update_vinculada`, `validar_lote_mesma_fazenda`).
