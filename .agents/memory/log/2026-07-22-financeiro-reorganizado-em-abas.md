# Log — Financeiro reorganizado em abas, fora de "rebanho" — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** discussão de UX com JP (planejamento antes de qualquer código, sem pressa) —
  4 páginas soltas no menu (Transações, Financeiro, Fluxo de Caixa, Documentos Fiscais), todas
  dentro de "Rebanho & Compliance" e com URL `/rebanho/*`, confundiam porque "Financeiro"
  sozinho não era o financeiro completo da fazenda (não incluía compra/venda de animais) e
  "rebanho" na URL não fazia sentido pra uma área que é o dinheiro TOTAL da fazenda. JP pediu
  especificamente: uma aba de "Transações de Animais" dentro do Financeiro (só move a página
  existente, sem juntar com Saldo de Rebanho), URL sem "rebanho", e menu reorganizado numa
  seção própria de topo.

## O que foi feito

1. **`FinanceiroLayout.tsx`** (novo) — layout de abas usando `@base-ui/react/tabs` (`Tabs.Root`/
   `Tabs.List`/`Tabs.Tab`, mesma lib já usada em Dialog/Select do projeto). Cada aba é
   renderizada como um `<Link>` do react-router via `render={<Link .../>}` (mesmo padrão de
   composição já usado em `DialogTrigger`) — a navegação real é feita pelo próprio link, o
   `Tabs.Root` só sincroniza o estado visual (`value` = pathname atual, via prefixo mais longo
   que casa, pra manter a aba-mãe destacada mesmo em rotas de detalhe tipo
   `/financeiro/transacoes/:id`). Estilizado com o modificador `aria-selected:` do Tailwind
   (confirmado que a Base UI expõe `aria-selected` no botão do Tab).
2. **Rotas reestruturadas** (`router.tsx`) — `/app/financeiro` vira uma rota pai com
   `FinanceiroLayout` + filhas: index (Visão Geral = `FluxoCaixaPage`), `transacoes`
   (+`transacoes/:id`), `lancamentos` (+`lancamentos/:id`), `documentos`. Nenhuma página mudou de
   conteúdo, só de rota — `TransacoesListPage`/`TransacaoDetailPage` (antes em
   `/rebanho/transacoes`) e as 3 páginas do antigo Financeiro migraram pra cá.
3. **Menu (`AppShell.tsx`)** — Transações/Financeiro/Fluxo de Caixa/Documentos Fiscais saíram de
   "Rebanho & Compliance". Nova seção de topo **"Financeiro"** com uma única entrada (sem
   `end`, fica destacada em qualquer sub-rota). Saldo de Rebanho ficou onde estava, em Rebanho &
   Compliance (é sobre estoque de animais, não dinheiro).
4. **6 links internos corrigidos** pra apontar pras novas URLs: `TransacoesListPage`,
   `TransacaoDetailPage`, `FluxoCaixaPage` (link de volta pra origem, tanto transação quanto
   lançamento), `DocumentosFiscaisPage`, `LancamentoDetailPage` (2 lugares: link "Voltar" e
   `navigate()` após excluir), `LancamentosListPage`.
5. **Polimento:** H1 da página de Lançamentos Gerais mudou de "Financeiro" (duplicava o nome da
   seção/aba) pra "Lançamentos Gerais".

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Teste real via Playwright, desktop+mobile, Supabase remoto:** login, clicou no item
  "Financeiro" do menu, navegou pelas 4 abas conferindo a URL de cada uma
  (`/app/financeiro`, `/app/financeiro/transacoes`, `/app/financeiro/lancamentos`,
  `/app/financeiro/documentos`), confirmou dados reais carregando em cada aba (3 transações
  reais na aba de Transações, totais reais no Fluxo de Caixa), clicou no link de origem de um
  movimento do tipo "transação de animal" na Visão Geral e confirmou que abre
  `/app/financeiro/transacoes/:id` corretamente. Mobile (390px): menu lateral mostra a seção
  "Financeiro" com a entrada única; barra de abas rola horizontalmente dentro do próprio
  contêiner sem causar overflow da página. Zero erros de console em toda a sequência.

## Gate do `cyber_chief`

Não se aplica — mudança é 100% de frontend (rotas/navegação), nenhuma tabela, RLS ou Edge
Function tocada.

## Próximos passos combinados com JP

Item 2 do plano de UX: tela de Lançamento Rápido (2 botões — Operação com animais reaproveitando
`EntradaSaidaLoteDialog`, Despesas e Receitas Gerais reaproveitando o fluxo de captura+IA já
existente), acessível via card de destaque no Dashboard. Depois, item 3: reestruturação de
schema da Declaração Anual (uma declaração por ano + itens de espécie/quantidade).
