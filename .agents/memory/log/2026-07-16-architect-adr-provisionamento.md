# Log — ADR-0001: estratégia de provisionamento de conta no signup

- **Data:** 2026-07-16
- **Agente responsável:** architect (Alex) — executado via Claude, injeção direta de
  `.agents/agents/architect.md` (Direct Injection Proxy), a pedido de JP
- **Tipo de tarefa:** ADR formal (decisão técnica estrutural, protocolo da seção "ADR" do
  prompt do Alex)

## Contexto

A spec (`especificacao-sistema.md`, seção 9, item 1) já marca o provisionamento de conta no
signup como o maior risco identificado no protótipo Bolt.new: inserts diretos do client em
`usuarios`/`fazendas` esbarravam em RLS, deixando contas "meio criadas". A spec aponta duas
alternativas válidas sem escolher entre elas: trigger de banco (`on_auth_user_created`) ou
Edge Function com `service_role`. `multi-agent-workflow.md` (seção 5, Fase 1) já atribui essa
decisão ao `architect`. Esta tarefa formaliza o ADR correspondente, antes de qualquer
implementação (Fase 1, item 5 do plano da spec).

## O que foi lido

`especificacao-sistema.md` completa (com atenção à seção 9 item 1, seção 5.4, seção 10 Fase
1), `.agents/rules/multi-agent-workflow.md`, `.agents/memory/PROJECT_CONTEXT.md` (estado
atual: Fase 0 concluída, banco Supabase novo e limpo, próximo passo real é Fase 1),
`.agents/rules/memory-protocol.md`.

## Análise feita

Avaliadas as duas alternativas com critério real (não só repetição da spec):

- **Trigger de banco (`AFTER INSERT` em `auth.users`, função `SECURITY DEFINER`)** — escolhida.
  Atomicidade real: o trigger roda na mesma transação que o GoTrue usa para criar o usuário em
  `auth.users`; qualquer falha na criação de `usuarios`/`fazendas`/`usuarios_fazendas` reverte
  também o próprio `auth.users` — não há estado "meio criado" possível. Cobre todos os
  caminhos de criação de usuário automaticamente (não depende do client lembrar de chamar um
  segundo passo). Contras: PL/pgSQL menos familiar à equipe, erros aparecem como erro genérico
  do GoTrue no client, exige log/observabilidade no Postgres.
- **Edge Function com `service_role`** — rejeitada. Não é atômica com a criação do usuário:
  existe uma janela real entre `auth.signUp()` retornar e o client conseguir chamar a função
  (queda de rede, fechamento de aba, crash) — reproduz exatamente o problema que a spec já
  identificou no protótipo, só que num ponto diferente do fluxo. Depende do client iniciar a
  chamada (superfície maior para omissão em caminhos futuros como OAuth). Expõe um endpoint
  HTTP com `service_role` que precisa validar rigorosamente o JWT do chamador para não virar
  vetor de escalonamento de privilégio.

Detalhado também, conforme pedido:
- Onde entra `usuarios_fazendas` com `papel = 'dono'`: na mesma function body do trigger,
  logo após criar `fazendas`, no mesmo statement/transação.
- Garantias de atomicidade: transação única do Postgres — ou as 4 linhas (`auth.users` +
  `usuarios` + `fazendas` + `usuarios_fazendas`) existem, ou nenhuma existe. Não há cenário de
  "`usuarios` criado mas `fazendas` falhou" — a exceção reverte tudo.
- Implicação de RLS: nenhuma política de INSERT necessária para `authenticated`/`anon` nessas
  3 tabelas — o trigger roda como role com `BYPASSRLS`. RLS default-deny já cobre o client;
  isso vira caso de teste explícito para o `cyber_chief`, não uma omissão silenciosa.

## Decisões tomadas nesta tarefa

- **ADR-0001 aceito:** provisionamento de conta via trigger de banco `on_auth_user_created`,
  não Edge Function.
- Critério de revisão mais importante identificado: a função assume hoje "todo signup cria
  uma fazenda nova" — isso deixa de ser verdade quando o papel Financeiro/Contábil (Fase 6)
  for implementado (usuário convidado se junta a fazenda existente, sem criar `fazendas`
  nova). Sinalizado explicitamente no ADR para revisão nesse ponto do roadmap.

## Mudanças de arquivo

- Criado `.agents/memory/adr/ADR-0001-provisionamento-conta.md` (novo, pasta `adr/` criada).
- Este log: `.agents/memory/log/2026-07-16-architect-adr-provisionamento.md`.
- `PROJECT_CONTEXT.md`: nova entrada no topo da seção 5 (Histórico) e nova linha na seção 2
  (Decisões). Seções 1, 3 e 4 não alteradas — esta tarefa não muda o estado real do projeto
  (ainda não há implementação) nem resolve/cria bloqueio.

## Pendências / próximos passos

- Nenhuma bloqueante. Próximo passo real: implementação da Fase 1 (Ryan/`developer` escreve a
  migration com a função e o trigger a partir deste ADR; Sofia/`db_sage` revisa o schema e as
  policies de RLS resultantes; Constantine/`cyber_chief` faz o gate de RLS/auth antes de a
  Fase 1 avançar, conforme `multi-agent-workflow.md` seção 5).
- Este ADR **não implementa** nada — não foi criada migration SQL nem tocado `supabase/`,
  por estar fora do escopo desta tarefa.
