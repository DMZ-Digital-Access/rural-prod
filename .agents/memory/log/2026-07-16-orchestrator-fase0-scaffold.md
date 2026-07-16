# Log — Fase 0: repositório Git + scaffold do projeto

- **Data:** 2026-07-16
- **Agente responsável:** orchestrator (ORCH) — executado via Claude em sessão Cowork
- **Tipo de tarefa:** Setup técnico (Fase 0 da spec, seção 10, itens 1–3)

## Contexto

Com as 5 pendências de modelagem resolvidas (ver
`2026-07-16-orchestrator-resolucao-pendencias.md`), JP pediu para seguir com o próximo passo
real do plano de implementação: dar início à Fase 0. O repositório Git já existia (criado
numa tarefa anterior desta mesma sessão, remote `DMZ-Digital-Access/rural-prod`), então o
foco foi inicializar o projeto propriamente dito.

## O que foi feito

1. **Scaffold Vite:** `npx create-vite@latest tmp-app --template react-ts`, movido para a
   raiz do repo (mantendo `.agents/`, `scripts/`, `.env`, `.gitignore`,
   `especificacao-sistema.md` intactos). Nota: a primeira tentativa (`npm create vite@latest`)
   gerou o template `vanilla-ts` por engano (sem depender de nenhuma decisão do usuário) —
   descartada e refeita com `npx create-vite@latest` explicitamente.
2. **Tailwind CSS v4** via `@tailwindcss/vite`, plugado em `vite.config.ts` junto com o alias
   `@` → `./src` (também configurado em `tsconfig.json`/`tsconfig.app.json` via `paths`, sem
   `baseUrl` — opção deprecada na versão do TypeScript instalada, gerava erro de build).
3. **shadcn/ui** inicializado (`npx shadcn@latest init -d`) — paleta neutra padrão por
   enquanto; a paleta semântica (verde/laranja/vermelho/azul) pedida na spec (seção 6) fica
   para quando `ux` (Victoria) desenhar os componentes reais.
4. **Libs da stack** (spec seção 2): react-router-dom, @tanstack/react-query,
   react-hook-form, zod, @hookform/resolvers, @supabase/supabase-js, sonner, lucide-react,
   recharts.
5. **Cliente Supabase** (`src/lib/supabase.ts`), lendo `VITE_SUPABASE_URL`/
   `VITE_SUPABASE_ANON_KEY` — variáveis com prefixo `VITE_` adicionadas ao `.env` (duplicando
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` sem prefixo que já estavam lá), porque só variáveis com
   esse prefixo ficam expostas ao código do browser pelo Vite. `.env.example` criado como
   convenção do repositório.
6. **CI básico** — `.github/workflows/ci.yml` (lint + build no push/PR para `main`).
7. Removidos os assets/páginas de demonstração que vêm por padrão no template do Vite
   (`App.css`, `hero.png`, `react.svg`, `icons.svg`), substituídos por uma página inicial
   mínima em `src/App.tsx`.
8. Validação local antes do commit: `npm run build` (tsc + vite build) e `npm run lint`
   (oxlint) — ambos passando (1 warning esperado, de código gerado pelo próprio shadcn CLI
   em `button.tsx`, não é algo a corrigir).

## Bloqueio encontrado (não existia antes desta tarefa)

Ao tentar planejar o link do projeto Supabase, `supabase projects list` (CLI já autenticada
localmente) só retornou dois projetos — `oddra-dev` e um `rural-prod` diferente (ref
`salvrbdjyxontsjpfjyp`, criado às 01:38 de hoje) — nenhum dos dois é o projeto do produto.
O projeto real (ref `bsoofshttpboaaokejwt`, credenciais no `.env`) foi criado por JP na conta
Supabase **"Dmz Labs 06"**, diferente da conta **"DMZ Devops 01"** logada na CLI local (usada
por outros projetos, então não é desejável trocar o login global por esse). Confirmado
diretamente com JP.

**Necessário para destravar:** um Personal Access Token da conta Dmz Labs 06
(supabase.com/dashboard/account/tokens), adicionado ao `.env` como `SUPABASE_ACCESS_TOKEN`.
Com ele, dá para rodar `supabase link --project-ref bsoofshttpboaaokejwt` (via
`$env:SUPABASE_ACCESS_TOKEN`, sem tocar no login global da CLI) e seguir com
`supabase db push`/migrations nas próximas fases.

## Commits

- `ee7e657` — `feat: scaffold do projeto Livestock Control (Fase 0)`

## Pendências

- Obter o Personal Access Token da conta Dmz Labs 06 e adicionar a `.env` como
  `SUPABASE_ACCESS_TOKEN` — bloqueia o link do schema local ao projeto remoto.
- Paleta semântica de cores (spec seção 6) ainda não aplicada ao shadcn/ui — não bloqueia
  Fase 0, cabe a `ux` (Victoria) quando as telas reais começarem a ser desenhadas.
