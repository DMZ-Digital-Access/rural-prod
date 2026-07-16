# Log — Migration SQL da Fase 1 (usuarios/fazendas/usuarios_fazendas) a partir do ADR-0001

- **Data:** 2026-07-16
- **Agente responsável:** db_sage (SOFIA) — a pedido do orchestrator, para implementar em SQL
  a decisão já formalizada pelo `architect` no ADR-0001
- **Tipo de tarefa:** Modelagem de schema + escrita de migration (SQL não aplicado ao banco)

## Contexto

O ADR-0001 (`.agents/memory/adr/ADR-0001-provisionamento-conta.md`, aceito em 2026-07-16)
decidiu a estratégia de provisionamento de conta no signup: trigger de banco `AFTER INSERT ON
auth.users`, função `SECURITY DEFINER` `public.handle_new_user()`, criando `usuarios` +
`fazendas` + `usuarios_fazendas` (`papel='dono'`) na mesma transação. O ADR já especifica os
predicados de RLS esperados e deixa explícito que nenhuma policy de INSERT/DELETE deve existir
para `authenticated`/`anon` nessas 3 tabelas. Faltava a implementação em SQL, versionada como
migration do Supabase — esta tarefa.

## O que foi lido antes de começar

1. `ADR-0001-provisionamento-conta.md` — decisão completa, seções [DECISÃO] e [CONSEQUÊNCIAS].
2. `especificacao-sistema.md`, seções 3.1 (campos de `usuarios`/`fazendas`, trigger genérico
   `trigger_set_updated_at()` já mencionado como padrão do Eixo 1 original) e 5.4 (campo
   `papel` de `usuarios_fazendas`, papel futuro "Financeiro/Contábil" na Fase 6).
3. `PROJECT_CONTEXT.md` (estado atual, decisões, glossário) e `memory-protocol.md`.
4. Confirmado que `supabase/migrations/` estava vazia — nenhuma migration anterior no projeto.

## O que foi construído

Um único arquivo:
`supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql`, contendo:

1. `public.trigger_set_updated_at()` — function genérica reaproveitável (primeira migration do
   projeto, ainda não existia).
2. Tabelas `public.usuarios`, `public.fazendas`, `public.usuarios_fazendas` conforme spec
   seções 3.1/5.4, com índices nas FKs e `UNIQUE(usuario_id, fazenda_id)` em
   `usuarios_fazendas`.
3. `public.handle_new_user()` + trigger `on_auth_user_created` em `auth.users`, exatamente
   como desenhado no ADR-0001 (mesma transação, mesma function body para as 3 tabelas).
4. RLS habilitado nas 3 tabelas; policies de SELECT/UPDATE restritas ao próprio
   usuário/fazenda vinculada; **nenhuma policy de INSERT/DELETE** para `authenticated`/`anon`,
   com comentário SQL extenso citando o ADR-0001 explicando que a ausência é proposital.

## Decisões tomadas nesta tarefa

- **Constraint de `papel`: CHECK sobre `text`, não `enum` do Postgres.** Motivo documentado no
  próprio SQL: um enum exige `ALTER TYPE ... ADD VALUE` para crescer (mais pesado/menos
  reversível de revisar); um CHECK é trocável com `drop constraint` + `add constraint` numa
  migration pequena, sem alterar o tipo de dado nem migrar linhas — importante porque a Fase 6
  (papel `financeiro`) já está mapeada para estender exatamente este campo. Constraint hoje
  restringe a `('dono')` apenas; comentário no SQL aponta o valor futuro.
- **Fallback do nome da fazenda: `'Minha Fazenda'`, não erro bloqueante** — esta era a decisão
  de implementação que o ADR-0001 deixava explicitamente em aberto ("Detalhe de implementação
  para Ryan/Sofia"). Escolhido fallback em vez de `RAISE EXCEPTION` porque bloquear o signup
  inteiro por um campo de UX secundário reintroduziria, por outra porta, o mesmo tipo de risco
  que o ADR-0001 elimina (conta que não consegue se completar, sem caminho de recuperação para
  o usuário) — e porque o nome da fazenda é editável depois em Configurações, então errar o
  fallback não é perda de integridade, só UX subótima num caso de borda que não deveria
  disparar se o formulário de signup popular `options.data.nome_fazenda` corretamente.
  `NULLIF(TRIM(...), '')` trata tanto ausência da chave quanto string vazia como "não
  informado".
- **`usuarios_fazendas` ganhou policies de SELECT/UPDATE (não só SELECT).** O ADR menciona
  "SELECT/UPDATE" para `fazendas`/`usuarios_fazendas` de forma geral; documentei no SQL que a
  policy de UPDATE existe por consistência de padrão e não abre um caminho de escrita novo na
  prática (a aplicação não tem, nesta fase, nenhuma tela que edite `usuarios_fazendas`).
- **Índices adicionados** em `fazendas.usuario_id`, `usuarios_fazendas.usuario_id` e
  `usuarios_fazendas.fazenda_id` — não pedidos explicitamente no ADR, mas óbvios dado que são
  exatamente as colunas usadas nos predicados de RLS (toda consulta autenticada faz lookup por
  elas).

## Mudanças de arquivo

- Novo: `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5 (Histórico), linkando este log e o
  arquivo de migration. **Seção 1 (Estado Atual) NÃO foi alterada** — a migration foi escrita,
  não aplicada; isso é uma tarefa seguinte, após revisão humana.

## Pendências / próximos passos

- **Não aplicado ao banco.** Nenhum `supabase db push`/`migration up` foi executado — fora do
  escopo desta tarefa, decisão de aplicar é humana, depois de revisão.
- Revisão recomendada antes de aplicar: `architect` (Alex, autor do ADR) confirma que a
  implementação bate com a decisão; `cyber_chief` (Constantine) valida RLS, incluindo o caso
  de teste explícito que o ADR pede ("insert direto do client autenticado nas 3 tabelas deve
  falhar").
- Quando a Fase 6 (papel Financeiro/Contábil) começar, a constraint de `papel` em
  `usuarios_fazendas` precisa de uma migration nova (`drop constraint` +
  `add constraint ... check (papel in ('dono', 'financeiro'))`) — e `handle_new_user()`
  precisa da lógica de distinção "signup de dono novo" vs. "convite para fazenda existente"
  que o próprio ADR-0001 já sinaliza no critério de revisão nº 1.
