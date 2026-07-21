# Log — Fluxo de Caixa consolidado + exportação CSV — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** último passo combinado com JP para o Módulo Financeiro (item 18, spec seção
  5.2) — visão consolidada de receitas × despesas por período, cruzando vendas/compras de
  animais (módulo de Transações) com os lançamentos financeiros gerais, sem contar o mesmo
  dinheiro duas vezes.

## O que foi feito

1. **Migration `20260721110000_fluxo_caixa_consolidado.sql`** — view
   `fluxo_caixa_consolidado` (`security_invoker=true`), `UNION ALL` de:
   - `transacoes` com `tipo_operacao in ('compra','venda')` e `valor_nota is not null` →
     categoria "Venda de Animais"/"Compra de Animais", `descricao = outra_parte`.
   - `lancamentos_financeiros` **onde `transacao_animal_id is null`** — exclusão deliberada:
     um lançamento vinculado a uma transação de animal representa o MESMO dinheiro já contado
     pela linha de `transacoes`, o comentário original dessa coluna (migration do item 13) já
     previa esse uso exato.
   Sem tabela nova, sem RPC nova — a RLS de `transacoes`/`lancamentos_financeiros` já cobre a
   fronteira de `financeiro` (SELECT apenas) corretamente por si só.
2. **`src/lib/types/fluxoCaixa.ts` + `src/hooks/useFluxoCaixa.ts`** — tipos da view +
   `useFluxoCaixa(fazendaId, filtro)` com filtro ano/mês/tipo/categoria (ano sozinho cobre o
   ano inteiro; ano+mês calcula o intervalo exato do mês).
3. **`FluxoCaixaPage.tsx`** (`/app/rebanho/fluxo-caixa`, nav "Fluxo de Caixa" entre Financeiro
   e Documentos Fiscais) — cards Total Receitas/Total Despesas/Saldo Líquido, filtros, tabela
   com link de volta pra origem (`origem`/`origem_id` da view apontam pra
   `/app/rebanho/transacoes/:id` ou `/app/rebanho/financeiro/:id` conforme o caso).
4. **Exportação CSV** — gerada 100% client-side (Blob + BOM UTF-8, sem Edge Function — ao
   contrário do ZIP de Documentos Fiscais, aqui não há arquivo binário envolvido, só texto).
   **Escopo:** só CSV, não `.xlsx` binário — geraria a necessidade de uma dependência nova
   (`xlsx`/`exceljs`) não usada em nenhum outro lugar do projeto; CSV já abre corretamente no
   Excel/Sheets (testado com BOM UTF-8 pra acentuação não corromper), e o pedido original de JP
   era "CSV/Excel" (spec seção 5.2 também já previa "avaliar OFX no futuro" como opcional).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Teste funcional real com dados reais** (Playwright, Supabase remoto): a tela, mesmo antes
  de qualquer lançamento de teste, já mostrava uma transação de venda de animal real
  (R$20.000,00, Frigorífico Zimmer, categoria "Venda de Animais") — confirma que a UNION com
  `transacoes` funciona sem precisar criar dado novo. Depois, criou 2 lançamentos financeiros de
  teste (despesa R$250 em 05/07, receita R$250 em 20/07), confirmou totais/saldo corretos,
  filtro Ano=2026/Mês=Julho isolando o período, filtro Tipo=Despesa isolando só o lançamento de
  despesa, baixou o CSV de verdade (evento `download` real) e leu o conteúdo do arquivo
  confirmando linhas/valores, e confirmou que o link da linha de origem navega pro lançamento
  financeiro certo (`input[name="descricao"]` com o texto esperado — descoberta durante o teste:
  o campo de descrição é um `<input>` controlado, `innerText()` não pega o valor, é preciso
  `inputValue()`). Teste mobile (390px) sem overflow horizontal (screenshot conferido).
- **Achado do próprio script de teste (não do produto):** a primeira rodada reportou falso
  negativo no filtro Tipo=Despesa (`TIPO_DESPESA_MOSTRA_A: false`) — reproduzido de forma
  isolada num script de debug e confirmado como flake de timing do clique no Select (o
  `waitForTimeout` de 200ms às vezes corria antes do dropdown terminar de renderizar as opções);
  a segunda rodada completa do mesmo script, sem nenhuma mudança de código, passou. Não é um bug
  do `FluxoCaixaPage`.
- Dados de teste (4 linhas de `lancamentos_financeiros` entre as duas rodadas) removidos do
  banco ao final via SQL direto (`docker exec` do container Postgres local conectando de fato no
  pooler remoto — não há policy de DELETE em `lancamentos_financeiros` no app, então a limpeza
  de teste sempre precisa desse caminho).

## Gate do `cyber_chief`

Não rodado — mesma pendência acumulada dos demais módulos de Fase 4 (Transações/Saldo/GTAs/
Financeiro/Configuração de IA/`classificar-documento`/Documentos Fiscais). A view é
`security_invoker=true` e só faz SELECT sobre tabelas cuja RLS já foi revisada nas Fases 3/4
anteriores — risco novo introduzido por esta tarefa é baixo, mas o gate formal continua em
aberto para todo o eixo.

## Próximos passos combinados com JP

Módulo Financeiro (item 18) está funcionalmente completo. Itens restantes da spec: Declaração
Anual (item 19), Configurações/Prazos de Declaração (item 20 — nav ainda placeholder), Painel
Inteligente (item 21, depende de todos os módulos anteriores).
