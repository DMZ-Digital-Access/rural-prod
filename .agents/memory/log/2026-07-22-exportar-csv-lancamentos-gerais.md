# Log — Exportar CSV em Lançamentos Gerais — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** JP pediu o mesmo botão "Exportar CSV" que já existia em Fluxo de Caixa (Visão
  Geral) também na aba Lançamentos Gerais.

## O que foi feito

- `src/lib/exportarCsv.ts` (novo) — utilitário compartilhado (`gerarConteudoCsv`/`baixarCsv`),
  extraído de dentro de `FluxoCaixaPage.tsx` (que foi refatorado pra usá-lo, sem mudar
  comportamento) pra não duplicar a lógica de escape RFC 4180 + BOM UTF-8 numa segunda tela.
- `buscarTodosLancamentosParaExport()` (novo, `useLancamentosFinanceiros.ts`) — função simples
  (não é hook, chamada sob demanda no clique) que busca TODOS os lançamentos que casam com o
  filtro ativo da tela, ignorando a paginação (mesmo comportamento já usado em Fluxo de Caixa:
  exporta tudo que bate com o filtro, não só a página visível de 20).
- Botão "Exportar CSV" adicionado em `LancamentosListPage.tsx`, ao lado de "Novo Lançamento".
  Colunas: Tipo, Categoria, Descrição, Data, Valor, Pago, Data pagamento, Contraparte, Validado
  (mesmas informações já visíveis na tabela da tela).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Playwright real contra o remoto: botão ativo, CSV baixado de verdade, número de linhas de dado
  bate exatamente com o total de lançamentos do filtro ativo (não só a página), cabeçalho e
  formatação (vírgula decimal, escape de campo com vírgula) corretos.

## Gate do `cyber_chief`

Não se aplica — só frontend, mesma query já usada (com RLS já revisada) em `useLancamentosLista`,
sem `.range()`.
