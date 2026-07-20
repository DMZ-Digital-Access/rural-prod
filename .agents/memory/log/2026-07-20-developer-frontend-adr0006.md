# Log — Frontend ADR-0006: indicador "Pendente" na lista de Animais — `developer` (RYAN, via Claude)

- **Data:** 2026-07-20
- **Agente responsável:** developer (Ryan) — indicador visual para animais criados
  automaticamente por Entradas de Lote (ADR-0006), pendentes de individualização.

## O que foi feito

1. **`src/lib/types/rebanho.ts`** — `Animal.data_nascimento`/`peso_inicial_kg` e
   `AnimalComDetalhes.idade_dias`/`idade_meses`/`categoria` agora `| null` (refletindo o schema
   nullable do ADR-0006). Função nova `animalPendenteIndividualizacao(animal)` — deriva
   "pendente" de `data_nascimento is null or peso_inicial_kg is null`, sem coluna de status
   nova (mesma decisão do ADR-0006 D1).
2. **`AnimaisListPage.tsx`** — badge "Pendente" (âmbar) ao lado do `StatusAnimalBadge` quando
   `animalPendenteIndividualizacao(animal)`; célula de Categoria mostra "—" em vez de `null`.
3. **`AnimalDetailPage.tsx`** — subtítulo mostra "Pendente de individualização" quando
   `categoria` é `null`; campo "Idade" mostra "—" em vez de `null meses`.
4. **`LoteDetailPage.tsx`** — célula de Categoria da tabela de animais do lote: "—" em vez de
   `null`.
5. **`DashboardPage.tsx`** — animais pendentes (categoria `null`) excluídos do gráfico de
   Distribuição por Categoria (evitava uma barra "null" no eixo X); nota de texto abaixo do
   gráfico informa quantos ficaram de fora por estarem pendentes.

## Validação real executada

- `npm run build`/`lint`/`test` (35/35) — limpos.
- **Teste visual real** (Playwright, desktop 1440×900 + mobile 390×844) contra o Supabase
  remoto: criada uma compra real de 5 Bovinos (2 machos + 3 fêmeas) via
  `registrar_entrada_saida_lote()` — os 5 animais (`COMPRA-2026-07-20-001`..`005`) apareceram
  imediatamente na lista de Animais, com badge "Pendente" visível ao lado de "Ativo", categoria
  "—", peso "—", em ambas as resoluções, sem overflow. Zero erros de console.

## Mudanças de arquivo

- `src/lib/types/rebanho.ts`, `src/pages/animais/AnimaisListPage.tsx`,
  `src/pages/animais/AnimalDetailPage.tsx`, `src/pages/lotes/LoteDetailPage.tsx`,
  `src/pages/dashboard/DashboardPage.tsx`.
- Este log + `PROJECT_CONTEXT.md`.

## Pendências

- Fluxo de "completar" um animal pendente (preencher `data_nascimento`/`peso_inicial_kg`) ainda
  não implementado — `EditarAnimalDialog` hoje só edita identificação/lote/status. Próxima
  tarefa natural: estender esse dialog (ou criar um fluxo dedicado) para coletar os 2 campos
  que faltam quando o animal está pendente.
- Tela de seleção de animal individual para Venda/Óbito/Consumo (ADR-0004) ainda não construída.
