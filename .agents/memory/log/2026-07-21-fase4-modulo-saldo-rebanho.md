# Log — Fase 4, Módulo de Saldo de Rebanho (item 16) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** segundo módulo da Fase 4, seguindo a ordem da spec confirmada por JP
  (Transações → Saldo de Rebanho → GTAs → Financeiro → Declarações → Configurações/prazos →
  Painel Inteligente).

## O que foi feito

Rota `/app/rebanho/saldo` (`SaldoRebanhoPage.tsx`), substituindo o `PlaceholderPage` — reaproveita
100% de `obter_saldo_rebanho()` (item 12/ADR-0005), sem nenhuma migration nova:

- Seletor de espécie (Select, catálogo completo via `useEspecies()`) — spec pede "três visões
  (Bovinos/Equinos/Ovinos), extensível"; implementado como seletor único em vez de abas fixas,
  já cobrindo as 8 espécies do catálogo sem hardcode.
- Seletor de "Saldo referente à data" (`type="date"`, máximo hoje) — consulta saldo histórico em
  qualquer data de corte, spec seção 5.2.
- Tabela por agrupamento etário × sexo com colunas Qtd. Registrada/Qtd. Pendente + linha de
  total, "Não classificado" sempre por último.
- "Imprimir Saldo" via `window.print()` — sem biblioteca de PDF (fora de escopo/complexidade
  desnecessária para uma primeira entrega); `print:hidden` adicionado à sidebar/topbar do
  `AppShell.tsx` e um cabeçalho alternativo (`hidden print:block`) mostrando espécie + data
  aparece só na impressão, para o resultado não sair com a navegação lateral.

Hook novo: `src/hooks/useSaldoRebanho.ts` (`useSaldoRebanho(fazendaId, dataReferencia)`).

## Achado real corrigido: race condition na seleção padrão de espécie

Primeira versão selecionava a espécie padrão assim que `useEspecies()` carregava, sem esperar
`obter_saldo_rebanho()` — como o catálogo responde mais rápido que a RPC de saldo na prática, a
tela sempre abria em **"Abelhas"** (primeira em ordem alfabética, sem nenhuma faixa etária
cadastrada) em vez de "Bovinos" (que tinha saldo real de 25), reproduzido tanto no teste desktop
quanto mobile antes da correção. Corrigido fazendo o `useEffect` de seleção padrão esperar as
DUAS queries (`especiesQuery.data` E `saldoQuery.data`) antes de decidir.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Teste visual real (Playwright, desktop 1440×900 + mobile 390×844, Supabase remoto, conta de
  teste real) — antes da correção, capturou o bug de "Abelhas" nos dois viewports; depois,
  confirmou "Bovinos" selecionado por padrão nos dois, com os 25 animais batendo com o resumo já
  validado no Módulo de Transações e no checkpoint original do item 12. Zero erros de console.
  Tabela em mobile rola horizontalmente dentro do próprio contêiner (mesmo padrão já usado em
  Transações), sem overflow da página.

## Gate do `cyber_chief`

Não rodado nesta tarefa (só frontend, zero migration nova — a RPC/RLS consumida já passou pelos
gates da Fase 3/ADR-0005).

## Próximos passos combinados com JP

Próximo módulo: GTAs (item 17) — lembrar da nota técnica do embed circular
`transacoes`↔`gtas` (ver log do Módulo de Transações) ao construir a listagem/detalhe.
