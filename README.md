# Livestock Control

Webapp de gestão agropecuária (gestão de rebanho + controle regulatório/financeiro). Ver
[`especificacao-sistema.md`](./especificacao-sistema.md) para a especificação funcional e de
dados completa, e [`.agents/AGENTS.md`](./.agents/AGENTS.md) para o squad de desenvolvimento e
o fluxo de trabalho deste repositório.

## Stack

React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, react-router-dom, @tanstack/react-query,
react-hook-form + zod, Supabase (Postgres + Auth + Storage).

## Desenvolvimento

```bash
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

- `npm run build` — build de produção (inclui checagem de tipos)
- `npm run lint` — lint (oxlint)
- `npm run preview` — preview local do build de produção
