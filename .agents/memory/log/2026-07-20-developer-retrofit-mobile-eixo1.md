# Log — Retrofit de responsividade mobile: Shell + Eixo 1 (Fase 1/2) — `developer` (RYAN, via Claude)

- **Data:** 2026-07-20
- **Agente responsável:** developer (Ryan) — a pedido de JP, fora da sequência normal da Fase 3
  (spec seção 10), priorizado antes de retomar o item 12.
- **Tipo de tarefa:** Retrofit de UI — o app era essencialmente desktop-only (auditoria prévia:
  sidebar fixa sem nenhum breakpoint, só 4 páginas de negócio usando `lg:grid-cols-*`, nenhum
  uso de `sm:`, tabelas com `overflow-x-auto` de fábrica mas sem priorização de coluna).
- **Escopo:** shell de navegação (`AppShell`) + as 6 telas do Eixo 1 (Dashboard, Animais,
  AnimalDetail, Lotes, LoteDetail, Comparativo) + os 3 formulários (CriarAnimalDialog,
  RegistrarPesagemForm, LoteFormDialog) — Eixo 2 (Saldo/GTAs/Transações/Financeiro) fica de fora
  porque a maioria ainda não tem frontend (Fase 4).

## O que foi feito

1. **Componente `Sheet` novo** (`src/components/ui/sheet.tsx`) — não existia no projeto (só
   `Dialog`). Construído sobre o mesmo primitivo já usado por `Dialog`
   (`@base-ui/react/dialog`), só com posicionamento de painel lateral (`side="left"`, slide-in/
   slide-out via `tw-animate-css`) em vez de modal centralizado — mesmo padrão que o shadcn/ui
   usa no mundo Radix (Sheet reaproveita Dialog). Não usei `npx shadcn add sheet` porque o
   registro padrão do shadcn assume Radix; este projeto usa `@base-ui/react` (`components.json`,
   style `base-nova`) — construir à mão manteve consistência com o padrão já usado por
   `dialog.tsx`.
2. **`AppShell.tsx` responsivo** — sidebar fixa (`<aside>`) agora só a partir de `lg` (1024px,
   `hidden lg:flex`). Abaixo disso, uma barra superior compacta (`lg:hidden`) com botão de
   hambúrguer que abre um `Sheet` deslizante contendo a mesma navegação de 3 seções
   (`SidebarNav`, extraído como componente compartilhado entre os dois layouts). Navegar por um
   item dentro do Sheet fecha o drawer automaticamente (callback `onNavigate`) — sem isso o
   usuário precisaria fechar manualmente a cada clique, fricção desnecessária (heurística de UX
   básica, mesmo sem uma tarefa formal da Victoria neste retrofit pontual).
3. **Tabelas (`AnimaisListPage`, `LotesListPage`, `LoteDetailPage`)** — colunas secundárias
   ocultas progressivamente (`hidden sm:table-cell`/`hidden md:table-cell`/`hidden lg:table-cell`)
   em vez de depender só do scroll horizontal de fábrica do componente `Table` (shadcn):
   Animais mantém Identificação/Status/Peso/Ações sempre visíveis, Categoria aparece a partir de
   `md`, GMD a partir de `sm`, Última pesagem a partir de `lg`. Lotes mantém Nome/Status/Animais
   ativos/Ações sempre visíveis, Peso médio a partir de `sm`, GMD médio a partir de `md`. Mesma
   lógica na tabela de animais embutida em `LoteDetailPage`.
4. **Headers de página** (`flex items-center justify-between` → `flex flex-col gap-3 sm:flex-row
   sm:items-center sm:justify-between`) em `AnimaisListPage`, `LotesListPage`, `DashboardPage`
   (título+seletor de lote), `AnimalDetailPage` e `LoteDetailPage` (título+badge+botões) —
   evita título e botão/seletor disputando espaço horizontal em telas estreitas.
5. **Não precisou de mudança:** os formulários (`CriarAnimalDialog`, `LoteFormDialog`,
   `RegistrarPesagemForm`) e os grids `dl` de estatística (`AnimalDetailPage`,
   `LoteDetailPage`, `DashboardPage`, `ComparativoPage`) já eram mobile-first por acidente —
   `flex-col` como padrão com `sm:flex-row`/`lg:grid-cols-*` só acima do breakpoint, e
   `DialogContent` já usa `w-full max-w-[calc(100%-2rem)]`. Confirmado por teste visual real, não
   assumido.

## Validação real executada

- **`npm run build`** (tsc -b + vite build) — sem erros de tipo, só o aviso pré-existente de
  chunk >500kB (não relacionado a este retrofit).
- **`npm run lint`** (oxlint) — sem erros, só os 4 warnings pré-existentes de
  `react(only-export-components)` em arquivos não tocados por esta tarefa.
- **`npm run test`** (vitest) — 35/35 passando, sem regressão.
- **Teste visual real em navegador**, pela primeira vez neste projeto num viewport mobile —
  Chromium headless via Playwright (cache local `npx`, sem instalação nova), viewport 390×844
  (iPhone 12/13), logado com a conta de teste real (`jp.teste.livestock@gmail.com`) contra o
  Supabase remoto: Dashboard (com e sem dado — farm ganhou 3 animais/1 lote reais entre uma
  rodada e outra, provavelmente uso manual do JP com as credenciais fornecidas), abertura do
  drawer (Sheet desliza corretamente, navegação completa visível, X fecha), clique num item do
  drawer navega e fecha o drawer sozinho, Animais/Lotes/LoteDetail/AnimalDetail todos sem
  overflow horizontal, tabelas mostrando só as colunas priorizadas, formulário de pesagem
  empilhado verticalmente. Zero erros de console em todas as telas. Screenshots not committed
  (ambiente de trabalho local do agente).
- **Achado de timing, não bug:** Dashboard mostrou "Carregando dados…" por até ~1s em alguns
  testes — confirmado que é só latência de rede contra o Supabase remoto (com 4s de espera os
  dados aparecem normalmente), não uma trava real.

## Mudanças de arquivo

- Novo `src/components/ui/sheet.tsx`.
- `src/components/layout/AppShell.tsx` — reescrito para responsivo (drawer mobile + sidebar
  desktop).
- `src/pages/animais/AnimaisListPage.tsx`, `src/pages/lotes/LotesListPage.tsx`,
  `src/pages/lotes/LoteDetailPage.tsx` — colunas de tabela priorizadas por breakpoint.
- `src/pages/dashboard/DashboardPage.tsx`, `src/pages/animais/AnimalDetailPage.tsx` — headers
  empilháveis em mobile.
- Este log + `PROJECT_CONTEXT.md` (seções 1 e 5).

## Pendências

- Este retrofit cobre só Shell + Eixo 1. Telas de Eixo 2 (Saldo/GTAs/Transações/Financeiro/
  Declarações/Painel Inteligente) ainda são placeholder — responsividade delas fica para quando
  forem implementadas de verdade (Fase 4), não faz sentido polir tela vazia agora.
- Nenhum teste de componente/E2E automatizado cobre o drawer mobile — só validação visual manual
  via Playwright nesta tarefa. Se quiser cobertura automatizada permanente, é trabalho futuro do
  `qa`.
- Barra de navegação inferior (bottom tab bar) foi considerada e descartada por JP em favor do
  drawer — não é uma pendência, é uma decisão já tomada.
