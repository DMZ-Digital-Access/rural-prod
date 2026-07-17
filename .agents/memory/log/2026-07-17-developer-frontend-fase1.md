# Log — Frontend Fase 1: Autenticação + Shell de Roteamento

- **Data:** 2026-07-17
- **Agente responsável:** developer (RYAN), squad DMZ.
- **Tipo de tarefa:** implementação de frontend — formulários de autenticação
  (login/signup/aceitar convite) e shell de roteamento completo da área
  logada, últimos dois itens em aberto da Fase 1 (spec seção 10, itens 5-6).
  Nenhuma migration/tabela alterada (schema já estava completo para o que
  esta tarefa precisa, ADR-0001/ADR-0002 já aplicados no remoto).

## O que foi lido antes de escrever qualquer código

1. `especificacao-sistema.md` — seções 1, 2, 6, 8 (mapa de rotas completo) e
   10.
2. `.agents/memory/adr/ADR-0001-provisionamento-conta.md` — contrato do
   `signUp()` (`options.data.nome`/`nome_fazenda`, fallback `'Minha
   Fazenda'` no backend).
3. `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` — seção D2:
   contrato de `?convite_token` no signup e da RPC `aceitar_convite`.
4. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` e
   `20260716183000_adr0002_convites_papeis.sql` — lidas por completo para
   confirmar as mensagens exatas de `RAISE EXCEPTION` (ex.: "Convite não
   corresponde ao e-mail desta conta", "Este convite não é endereçado ao
   usuário autenticado") que a UI precisa exibir tal como vêm do backend.
5. `src/lib/supabase.ts`, `src/App.tsx`, `src/main.tsx`, `vite.config.ts`,
   `components.json`, `package.json` — estado atual do projeto.
6. `.agents/memory/PROJECT_CONTEXT.md` seções 1, 2 e 4 — confirmado que o
   schema/RLS/RPCs da Fase 1 e do ADR-0002 já estavam aplicados no remoto e
   testados pelo `qa` (32/32 asserções, 2026-07-17), e que a única pendência
   real para fechar a Fase 1 era exatamente este frontend.

## O que foi feito

### 1. Componentes shadcn/ui
Adicionados via `npx shadcn@latest add input label card sonner --yes`:
`input.tsx`, `label.tsx`, `card.tsx`, `sonner.tsx` (usa `next-themes`,
adicionado como dependência pelo próprio CLI).

**Achado de ferramenta:** `npx shadcn@latest add form` (rodado separadamente
e depois de novo com `--overwrite`/`DEBUG=*`) terminava em "Checking
registry." sem erro e sem escrever nenhum arquivo, em várias tentativas —
`npx shadcn@latest view form` confirma que o componente existe no registro
(`"type": "registry:ui"`), então não é um nome inválido; a causa raiz não
foi investigada a fundo (não é o escopo desta tarefa), mas é uma armadilha
que outro agente vai encontrar de novo. **Contorno:** `src/components/ui/
form.tsx` escrito à mão seguindo o padrão de referência do shadcn/ui
(`FormProvider`/`Controller` do react-hook-form + Context ligando
Label/Message ao campo certo pelo `id`), com uma adaptação: `FormControl`
usa `React.cloneElement` em vez de `Slot` de `@radix-ui/react-slot`, porque
este projeto usa `@base-ui/react` como base de primitives (não Radix, ver
`button.tsx`/`input.tsx`) e não há Slot equivalente instalado — evita puxar
uma dependência nova só para isso. Comentário no topo do arquivo documenta a
decisão para quem for atualizar via CLI depois.

### 2. Provider de autenticação (`src/lib/auth.tsx`)
`AuthProvider` com `session`/`user`/`loading` via `supabase.auth.getSession()`
no mount + `onAuthStateChange()` para manter sincronizado (login/logout/
refresh em qualquer aba). Hook `useAuth()` lança erro claro se usado fora do
provider. `loading` só vira `false` depois do primeiro `getSession()`
resolver — é essa garantia que `ProtectedRoute` usa para não redirecionar
precocemente um usuário com sessão persistida em localStorage.

### 3. Roteamento (`src/router.tsx`)
`createBrowserRouter` com TODAS as rotas da seção 8 da spec: `/login`,
`/signup`, `/convites/aceitar` (públicas) e as 15 rotas `/app/*` (protegidas
por `ProtectedRoute` como rota-pai com `<Outlet/>`). As 15 rotas `/app/*`
(exceto o próprio shell) renderizam `PlaceholderPage` a partir de uma tabela
de configuração (`path`/`title`/`fase`) — nenhuma delas tem feature real
ainda (Fases 2/3/4 não começaram), mas a navegação inteira existe e é
clicável. `/` redireciona para `/app/dashboard`; rota catch-all (`*`) mostra
`NotFoundPage` (só para paths realmente fora do mapa, não para módulos
pendentes).

### 4. `ProtectedRoute` (`src/components/ProtectedRoute.tsx`)
Mostra "Carregando sessão…" enquanto `loading`; sem sessão, redireciona para
`/login?redirect=<path+search atual, url-encoded>` (preserva o destino,
usado pelo fluxo de `/convites/aceitar`); com sessão, renderiza `AppShell`
em volta do `<Outlet/>`.

### 5. Páginas de autenticação
- **`SignupPage`**: lê `?convite=<token>` via `useSearchParams`. Schema zod
  montado dinamicamente (`buildSignupSchema(temConvite)`) — com convite,
  `nomeFazenda` não é pedido nem obrigatório; sem convite, é obrigatório.
  `signUp()` monta `options.data` condicionalmente (`convite_token` OU
  `nome_fazenda`, nunca os dois). Erro do Supabase mostrado **tal como
  vem** (`error.message`) — cobre as mensagens exatas de `RAISE EXCEPTION`
  do ADR-0002 (convite expirado/não encontrado/e-mail não bate). Trata o
  caso `data.session === null` (confirmação de e-mail habilitada no projeto
  remoto, ver `PROJECT_CONTEXT.md` seção 4) mostrando toast "verifique seu
  e-mail" em vez de tentar navegar para uma sessão que não existe.
  **Limitação documentada em `TODO` no próprio arquivo:** não busca/exibe
  para qual fazenda/papel o convite é, porque as policies de SELECT de
  `convites` exigem `authenticated` E ser admin/destinatário (ADR-0002) —
  não há leitura pública por token hoje. Não implementada nenhuma policy
  nova por conta própria (fora do escopo desta tarefa e do que o
  `cyber_chief` revisou) — registrado como pendência para
  `db_sage`/`cyber_chief`, não resolvido aqui.
- **`LoginPage`**: email/senha, `signInWithPassword()`, lê `?redirect=` e
  navega para lá (ou `/app/dashboard`) no sucesso.
- **`AceitarConvitePage`**: lê `?token=`. Sem sessão → `<Navigate>` para
  `/login?redirect=/convites/aceitar?token=...`. Com sessão → chama
  `supabase.rpc('aceitar_convite', { p_token })` uma única vez (guardado
  por `useRef`, à prova do duplo-effect do `StrictMode` em dev); sucesso →
  toast + redireciona `/app/dashboard`; erro → mensagem da RPC exibida
  inline (não só toast, fica visível na tela).
- **Logout**: `supabase.auth.signOut()` dentro do `AppShell`, com toast de
  erro se falhar.

### 6. Shell da área logada (`src/components/layout/AppShell.tsx`)
Sidebar com três seções — "Manejo Individual" (Dashboard/Animais/Lotes/
Comparativo), "Rebanho & Compliance" (Painel/Saldo/GTAs/Transações/
Financeiro/Declarações) e "Configurações" (dados da fazenda/prazos/equipe) —
usando `NavLink` para destacar a rota ativa. E-mail do usuário logado e
botão de logout no rodapé. Funcional, deliberadamente não polido (UX visual
é fase futura, conforme a tarefa).

### 7. `App.tsx`
Composição: `QueryClientProvider` (novo `QueryClient` do react-query) →
`AuthProvider` → `RouterProvider` (com `router` de `src/router.tsx`) +
`<Toaster />` (sonner). `main.tsx` não precisou mudar (já renderiza `<App/>`
dentro de `StrictMode`).

## Testes

Não existia framework de teste frontend configurado no projeto. Instalado
**Vitest** (`npm install -D vitest`, versão 4.1.10) — escolhido por ser o
padrão de facto para projetos Vite, zero configuração extra de bundler, e
mesma sintaxe `describe`/`it`/`expect` já usada pelo `qa` nos testes de
banco. `vitest.config.ts` novo na raiz (separado de `vite.config.ts`,
environment `node`, sem necessidade de jsdom pois só testa os schemas zod
puros). Script `"test": "vitest run"` adicionado a `package.json`.

`src/lib/validations/auth.ts` — schemas extraídos das páginas para serem
testáveis isoladamente (`loginSchema`, `buildSignupSchema(temConvite)`).
`src/lib/validations/auth.test.ts` — **10 testes, 10/10 PASS** (`npm run
test`): email/senha válidos e inválidos do login; `nomeFazenda` obrigatório
sem convite e dispensado com convite; senha curta rejeitada (< 6
caracteres); nome vazio rejeitado; payload completo válido aceito.

**Honestidade de cobertura (lacuna declarada, mesma regra que já vale para
o resto do squad):** nenhum teste de componente (React Testing Library não
instalada — decisão de manter o escopo desta rodada só nos schemas puros,
que é onde está a lógica condicional mais fácil de quebrar silenciosamente
— ex.: esquecer de tornar `nomeFazenda` opcional no branch de convite).
Nenhum teste end-to-end/integração real do fluxo de `signUp()`/
`signInWithPassword()`/`aceitar_convite()` contra o Supabase remoto ou local
a partir do frontend — o `qa` já validou esses caminhos na camada de banco/
RPC diretamente (ver `2026-07-17-qa-testes-fase1-adr0002.md`), mas ninguém
ainda exercitou o formulário React de ponta a ponta contra um backend real.

## Validação

1. `npm run build` (`tsc -b && vite build`) — **passou limpo**, zero erros
   de tipo. Aviso de chunk >500kB pós-minificação (bundle único, sem
   code-splitting ainda) — esperado nesta fase, não é erro.
2. `npm run lint` (oxlint) — **passou, exit code 0**. Três warnings
   `react(only-export-components)` (fast-refresh), um deles pré-existente
   em `button.tsx` (não tocado nesta tarefa, já era assim antes) — os
   outros dois (`auth.tsx`, `form.tsx`) são do mesmo padrão inevitável
   (contexto + hook exportados do mesmo arquivo do provider/componente).
   Não são erros, não bloqueiam.
3. `npm run test` (vitest) — 10/10 testes passaram.
4. `npm run dev` rodado em background por tempo suficiente para confirmar
   subida sem erro (log: `VITE v8.1.5 ready in 973 ms`, sem stack trace).
   `Invoke-WebRequest` contra `http://localhost:5173`, `/login` e
   `/app/dashboard` — **200 OK nos três** (SPA: todos servem o mesmo HTML
   shell, roteamento real acontece client-side). Processo derrubado depois
   (`TaskStop`).

**Limitação honesta e explícita:** não há acesso a navegador real neste
ambiente — o smoke test acima confirma que o servidor sobe e responde HTTP
200, **não** que a UI renderiza/navega/envia formulários corretamente no
DOM. Nenhuma interação visual (clicar em botão, preencher formulário,
navegar entre telas) foi de fato exercitada. Isso é uma lacuna de cobertura
real, não uma alegação de teste que não existe.

## Decisões

- `form.tsx` escrito à mão (ver seção "O que foi feito", item 1) em vez de
  gerado pelo CLI — documentado no próprio arquivo para não ser sobrescrito
  sem essa nota na próxima tentativa de `shadcn add form`.
- Mensagens de erro de signup/aceite de convite mostradas **exatamente como
  vêm do Supabase** (`error.message`), nunca reescritas/genéricas — decisão
  explícita do ADR-0002 (D2, "Negativas/trade-offs aceitos") para o branch
  de convite bloqueado.
- Nenhuma policy de RLS nova criada em `convites` para resolver a exibição
  de "para qual fazenda você foi convidado" na tela de signup — documentado
  como `TODO` no código e nesta pendência de log, não implementado sem
  revisão do `cyber_chief`/`db_sage` (fora do que esta tarefa autoriza).
- Vitest escolhido como framework de teste frontend (nenhum existia antes) —
  documentado aqui e no `vitest.config.ts` para o resto do squad saber por
  quê.

## Mudanças de arquivo

**Novos:**
`src/lib/auth.tsx`, `src/lib/validations/auth.ts`,
`src/lib/validations/auth.test.ts`, `src/router.tsx`,
`src/components/ProtectedRoute.tsx`, `src/components/layout/AppShell.tsx`,
`src/components/ui/form.tsx` (mão), `src/components/ui/input.tsx`,
`src/components/ui/label.tsx`, `src/components/ui/card.tsx`,
`src/components/ui/sonner.tsx` (via shadcn CLI), `src/pages/PlaceholderPage.tsx`,
`src/pages/NotFoundPage.tsx`, `src/pages/auth/LoginPage.tsx`,
`src/pages/auth/SignupPage.tsx`, `src/pages/auth/AceitarConvitePage.tsx`,
`vitest.config.ts`.

**Editados:** `src/App.tsx` (composição dos providers), `package.json`
(dependência `next-themes` via shadcn CLI, devDependency `vitest`, script
`test`).

**Não tocados:** nenhuma migration, nenhum arquivo em `supabase/`.

## Pendências / próximos passos

- **Fecha a Fase 1** do ponto de vista dos itens 5 e 6 da seção 10 da spec
  (autenticação + shell de roteamento) — o item 7 (schema base) já estava
  concluído e testado. Ver seção 1 de `PROJECT_CONTEXT.md` atualizada.
- Pendência independente, já registrada antes desta tarefa e não afetada
  por ela: ação humana da Resend (`RESEND_API_KEY`/`APP_URL`) para o branch
  de e-mail de convite a usuário já cadastrado funcionar de verdade em
  produção (ADR-0003) — não bloqueia o fechamento da Fase 1 em si.
- Exibição de "fazenda/papel do convite" na tela de signup (policy de
  SELECT pública por token em `convites`) — pendência de decisão para
  `db_sage`/`cyber_chief`, não implementada aqui.
- Teste de componente (Testing Library) e teste end-to-end real do
  formulário contra Supabase (local ou remoto) — não fazia parte do escopo
  razoável desta rodada (só schemas puros), fica como pendência futura do
  `qa`/`developer`.
- Bundle único >500kB pós-minificação — considerar code-splitting por rota
  quando os módulos de Fase 2/3/4 começarem a ter conteúdo real (hoje é só
  aviso, não bloqueia nada).
