# Log — Fase 4, Painel Inteligente (item 21) — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** último item da Fase 4 (spec seção 5.2) — dashboard consolidado do Eixo 2,
  substituindo o placeholder em `/app/rebanho`. Antes de implementar, levantei (via subagente de
  pesquisa) todos os hooks/RPCs já existentes que o painel precisava consumir, pra não duplicar
  lógica nem adivinhar formatos de dado errados.

## O que foi feito

`/app/rebanho` (`PainelInteligentePage.tsx`) unifica:

1. **Alertas acionáveis** (`AlertaCard.tsx`, componente novo com 4 níveis — ok/atenção/crítico/
   indefinido, paleta semântica da spec seção 6):
   - GTAs pendentes de liberação — reaproveita `useGtasLista` já existente, só lê `.total` com
     filtro `status: "pendente"` (sem hook novo).
   - Declaração Anual pendente do ano corrente — os mesmos 3 estados já usados no card de prazo
     da tela de Declarações (fora do prazo/dentro do prazo com pendência/prazo vencido),
     recalculados aqui cruzando `useDeclaracoesLista`, `useEstadoFazenda` e
     `usePrazoDeclaracao` (todos hooks já existentes).
2. **Cards de saldo atual por espécie** — reaproveita `useResumoSaldoAno(fazendaId, anoAtual)`
   (já existia, usado no cabeçalho de Transações) sem nenhuma mudança — `saldoFim` já é
   exatamente "saldo como hoje" quando o ano passado é o corrente.
3. **Gráfico de evolução do saldo ao longo do ano** (`useEvolucaoSaldoAno`, hook novo em
   `usePainelInteligente.ts`) — chama `obter_saldo_rebanho()` (RPC já existente, item 12) num
   checkpoint por mês já fechado do ano (até 12 chamadas em paralelo via `Promise.all`, nunca
   uma view/RPC nova de série histórica — a spec seção 7 já tinha decidido "view calculada
   on-the-fly, sem saldo materializado enquanto não houver problema real de performance", então
   estender o padrão existente é mais consistente que inventar agregação nova no banco).
   Recharts `LineChart`, uma linha por espécie (chaves dinâmicas, sem hardcodar nomes).
4. **Resumo financeiro do ano** — receitas/despesas/saldo líquido via `useFluxoCaixa` (já
   existia); cabeças compradas × vendidas via `useResumoTransacoesAno` (hook novo, consulta leve
   somando `transacoes.quantidade_animais` — coluna já existe na tabela, não precisou de
   `transacoes_detalhe`).
5. **Acesso rápido** — últimas 5 transações/lançamentos, reaproveitando `useTransacoesLista`/
   `useLancamentosLista` já existentes (primeira página, sem filtro, só corta em 5 no client).

## Achados reais durante o teste

- **Falso alarme investigado a fundo:** o card de saldo mostrou "Bovinos: 24" enquanto uma
  consulta SQL direta via `psql` a `obter_saldo_rebanho()` devolvia 0 linhas pra essa fazenda —
  parecia inconsistência real. Investigação confirmou que **não é bug**: a função depende de
  `auth.uid()` (via RLS/lógica interna) pra saber quais fazendas o chamador pode ver, e uma
  sessão `psql` direta não tem usuário autenticado (`auth.uid()` NULL) — mesmo comportamento já
  documentado antes pro trigger `restringir_alteracao_config_llm`. Conferido com dado real
  (`transacoes_detalhe`: 13+7+2+3 machos/fêmeas compradas − 1 vendida = 24, bate exato) e com o
  gráfico (linha sobe exatamente no mês de julho, quando as transações de teste aconteceram).
- **Bug real e corrigido:** o alerta de Declaração mostrava por um instante "Nenhum prazo
  cadastrado" (estado `indefinido`) enquanto as queries (`useDeclaracoesLista`/
  `usePrazoDeclaracao`/`useEstadoFazenda`) ainda estavam carregando, antes de se autocorrigir pro
  estado real ("Prazo encerrado") assim que os dados chegavam — um flash de mensagem enganosa.
  Corrigido adicionando uma guarda de `isLoading` antes de computar a situação.
- **Observação de performance (não corrigida, documentada):** a página dispara muitas queries em
  paralelo (até ~12 chamadas RPC só pro gráfico de evolução, em dezembro) — o carregamento
  completo levou mais de 1,5s contra o Supabase remoto real num teste. Aceitável por ora (mesma
  filosofia da spec: só otimizar quando virar problema real), mas vale monitorar se o volume de
  dados crescer.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, build passou de primeira (só a correção do
  loading state exigiu um segundo build, também limpo).
- **Teste funcional real via Playwright, desktop+mobile, Supabase remoto**, com dados reais
  (não mockados): confirmou todas as seções renderizando com dado de verdade (saldo Bovinos=24,
  cabeças 55/1, receitas R$20.000, despesas R$564,25), clicou numa transação recente no atalho
  e confirmou navegação pro detalhe certo, conferiu visualmente que a linha do gráfico sobe
  exatamente no mês em que as transações de teste ocorreram. Mobile (390px) sem overflow
  horizontal.

## Gate do `cyber_chief`

Não se aplica — nenhuma migration nova, só frontend consumindo RPCs/views já revisadas em gates
anteriores (Fase 3: `obter_saldo_rebanho`; 2026-07-21: `fluxo_caixa_consolidado`).

## Próximos passos combinados com JP

**Fase 4 completa** — todos os itens da spec (15 a 21) e os 3 itens da discussão de UX estão
implementados e validados. Pendência acumulada em aberto: gate formal do `cyber_chief` cobrindo
toda a Fase 4 (Transações, Saldo, GTAs, Financeiro completo, Configuração de IA, Declaração
Anual reestruturada, Prazos de Declaração, Painel Inteligente) nunca foi rodado — candidato
natural pra próxima tarefa, junto com a reversão da política de DELETE em
`lancamentos_financeiros` que merece atenção prioritária nesse gate.
