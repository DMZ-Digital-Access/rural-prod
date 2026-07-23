# Log — Code splitting por rota — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** item 11 do roadmap salvo em PROJECT_CONTEXT.md — o build vinha avisando
  repetidamente ao longo da sessão que o bundle inteiro passava de 500kB minificado (1,46MB de
  fato) — o app inteiro (todas as ~20 telas) virava um único arquivo JS, baixado por completo no
  primeiro carregamento, mesmo que o usuário só fosse abrir o Dashboard.

## O que foi feito

`src/router.tsx` reescrito usando o `lazy` nativo do data router do React Router (`createBrowserRouter`)
— cada rota-folha (e o layout `FinanceiroLayout`) agora tem `lazy: () => import(...).then((m) => ({
Component: m.XxxPage }))` em vez de `element: <XxxPage />` com import estático no topo do arquivo.
Confirmado via leitura direta do `.d.ts` do `react-router` (não suposição) o formato exato de
`LazyRouteFunction`. Mantidos eager (import estático, sem `lazy`): `ProtectedRoute` (crítico pro
primeiro paint de qualquer rota autenticada), `Navigate` (redirects, já é parte do core do React
Router) e `NotFoundPage` (pequeno, fallback de qualquer URL não reconhecida). Removido também o
mecanismo `appRoutes`/`PlaceholderPage`, morto desde que a Fase 4 terminou (array vazio).

Decisão consciente: sem `HydrateFallback` por rota — numa navegação normal via `<Link>`, o router
mantém a tela anterior visível até o chunk novo carregar (sem flash de loading); só no caso raro
de abrir um link direto/atualizar a página numa rota interna, a área de conteúdo (não o menu)
fica em branco por um instante. Aceitável por ora, mesma filosofia de só otimizar mais quando
virar problema real.

## Resultado

Bundle principal (`index-*.js`) caiu de **1,46MB para ~350KB** (109KB gzip) — o resto virou
dezenas de chunks pequenos (a maioria <10KB), carregados sob demanda por rota. Chunks
compartilhados grandes (Supabase client ~208KB, Recharts ~331KB) continuam em arquivos próprios,
baixados uma vez e reaproveitados entre as telas que os usam — não duplicados. **Aviso de "chunks
maiores que 500kB" sumiu do build.**

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Playwright real contra o BUILD DE PRODUÇÃO** (`vite preview`, não o dev server — o dev server
  do Vite já serve ESM nativo, não provaria nada sobre o comportamento real do bundle) — nas 18
  rotas autenticadas + login: contagem de chunks JS distintos baixados cresce incrementalmente a
  cada rota nova visitada (28 → 43 → 46 → ... → 86 no total), confirmando carregamento sob
  demanda de verdade, não tudo de uma vez. Nenhuma rota quebrou, nenhum erro de console. Testado
  também o caso de recarregar a página direto numa rota interna (`/app/financeiro/lancamentos`)
  — funciona sem erro, mesmo sem `HydrateFallback`.

## Gate do `cyber_chief`

Não se aplica — só configuração de bundling/roteamento, sem mudança de lógica de negócio, dado
ou RLS.
