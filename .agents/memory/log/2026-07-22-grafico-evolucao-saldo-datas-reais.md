# Log — Gráfico Evolução do Saldo: variação na data real — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** JP pediu que o gráfico "Evolução do Saldo" (Painel Inteligente) mostrasse a
  variação exatamente na data em que ocorreu (não mais só um valor por mês fechado), mas sem
  incluir números de dia no eixo do tempo — mantendo só o início de cada mês como rótulo, como já
  era antes.

## O que foi feito

- `useEvolucaoSaldoAno` (`src/hooks/usePainelInteligente.ts`) reescrito: em vez de sempre 12
  checkpoints fixos (fim de cada mês), busca as datas DISTINTAS de `transacoes.data_operacao` no
  ano (mais um checkpoint final em "hoje", se for o ano corrente, ou 31/12 se for ano passado —
  garante que a linha sempre reflita o estado mais atual mesmo sem transação recente) e chama
  `obter_saldo_rebanho()` uma vez por data real. Cada ponto do gráfico carrega `timestamp`
  (posição real no eixo do tempo) e `data` (ISO, pro tooltip).
- `PainelInteligentePage.tsx`: `XAxis` passou de categórico (`dataKey="mes"`, rótulos "Jan"/"Fev"
  igualmente espaçados) pra numérico com escala de tempo (`type="number"`, `scale="time"`,
  `domain={["dataMin","dataMax"]}`) — os pontos agora ficam na posição X real (proporcional à
  data), mas o prop `ticks` fixa os rótulos exibidos só nos timestamps do dia 1 de cada mês
  (`ticksMeses`, calculado no hook), preservando o visual "só início do mês" pedido. Tooltip ganhou
  `labelFormatter` mostrando a data real (`dd/mm/aaaa`) em vez do timestamp cru. Pontos (`dot`)
  habilitados nas linhas pra tornar visível onde cada variação real aconteceu.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos (1 erro de tipo do `labelFormatter` do Recharts
  corrigido no caminho — `label` é `ReactNode`, não `number`, precisa de guarda de tipo).
- Playwright real contra o remoto + conferência visual do screenshot: eixo X mostra só "Jun"/"Jul"
  (sem números de dia); linha com pontos em posições irregulares refletindo as datas reais das
  transações, inclusive o salto acentuado que bate com a compra de ~68 cabeças em 20-22/07/2026
  (visível também em "Últimas Transações"); tooltip ao passar o mouse mostra uma data real
  formatada (`06/05/2026`) com o detalhamento por espécie correto.

## Observação de performance (não é bloqueante, já é a mesma filosofia adotada antes)

O número de chamadas RPC deixa de ter teto fixo de 12 e passa a ser "1 por data distinta de
transação no ano" — em uma fazenda com poucas dezenas de transações por ano (caso real
observado: 4 datas distintas até agora) isso é rápido; se o volume de transações num único ano
crescer muito, é candidato a otimização futura, mesma filosofia já registrada no código antes
("só otimizar quando virar problema real").

## Gate do `cyber_chief`

Não se aplica — só frontend, mesma RPC (`obter_saldo_rebanho`) e mesma tabela (`transacoes`,
leitura) já revisadas em gates anteriores.
