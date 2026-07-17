# Log — Testes de RLS/RPC (Fase 1 + ADR-0002) e integração da Edge Function `enviar-convite`

- **Data:** 2026-07-17
- **Agente responsável:** qa (EMMA), squad DMZ.
- **Tipo de tarefa:** escrever e **executar de verdade** uma suíte de testes automatizados
  cobrindo as garantias de RLS/segurança da Fase 1 e do ADR-0002, com atenção especial aos dois
  achados do `cyber_chief` no gate do ADR-0002 (bypass de autorização via NULL, corrida TOCTOU em
  `promover_papel()`), mais um teste de integração HTTP real da Edge Function `enviar-convite`
  (handler completo, não só a lógica pura já coberta por `index.test.ts`).
- **Escopo:** `supabase/tests/database/*.sql` (pgTAP), `supabase/tests/edge-functions/
  enviar-convite.integration.ps1`, `supabase/tests/manual/promover_papel-concorrencia.ps1`.
  Nenhuma migration alterada, nenhum ambiente remoto tocado — tudo local (`supabase start`).

## O que foi lido antes de escrever qualquer teste

1. `.agents/memory/adr/ADR-0001-provisionamento-conta.md` e `ADR-0002-convites-e-papeis-admin.md`.
2. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` e
   `20260716183000_adr0002_convites_papeis.sql` — schema completo, linha a linha.
3. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` e
   `2026-07-16-cyber_chief-review-adr0002.md` — os dois achados críticos que precisavam virar
   regressão explícita: (1) bypass de autorização via NULL em `aceitar_convite()`/
   `handle_new_user()`; (2) corrida TOCTOU em `promover_papel()`.
4. `supabase/functions/enviar-convite/{index.ts,logica.ts,index.test.ts}` — o teste de lógica
   pura já existente e sua nota honesta de que o handler HTTP completo nunca foi testado.

## Ambiente

- Docker Desktop confirmado rodando. `supabase --version` = 2.26.9 (desatualizada; CLI mais
  recente disponível é 2.109.1 — não atualizada nesta tarefa, fora de escopo).
- **Bloqueio encontrado e contornado:** `supabase start` sem flags falhou — o container
  `storage-api` (imagem `v1.24.6`, puxada pela CLI 2.26.9) ficou `unhealthy` com o erro
  `Migration optimize-existing-functions-again not found` (incompatibilidade conhecida entre
  uma CLI antiga e uma imagem de storage-api mais nova que espera um histórico de migrations
  diferente). Isso derrubava a stack inteira (`supabase start` mata todos os containers se
  qualquer um falhar o health check). Depois, com `storage-api`/`imgproxy` excluídos, o
  container `analytics` (Logflare) também ficou `unhealthy` (crash loop por erro interno do
  próprio Logflare, não relacionado ao nosso schema). **Contorno:** `supabase start -x
  storage-api -x imgproxy -x logflare -x vector` — nenhum desses 4 serviços é necessário para
  testar RLS/RPCs Postgres ou a Edge Function `enviar-convite` (que não usa Storage nem
  Analytics). Com essa exclusão, a stack subiu limpa (`db`, `auth`, `rest`, `realtime`, `kong`,
  `edge-runtime`, `studio`, `inbucket`, `pg-meta` todos `healthy`), e as duas migrations
  (`20260716171522` e `20260716183000`) foram aplicadas automaticamente pelo próprio `supabase
  start` no Postgres local — confirmando, como efeito colateral, que as duas migrations rodam
  sem erro do zero num banco limpo.
- pgTAP 1.3.3 disponível via `create extension pgtap` (não pré-instalada, mas `supabase test
  db` roda `create extension if not exists pgtap` no topo de cada arquivo sem problema).

## Suíte A — pgTAP (`supabase/tests/database/*.sql`)

Convenção: um arquivo por garantia testada, prefixo numérico `NNN_descricao.sql`. Cada arquivo
é autocontido (`begin; ... select * from finish(); rollback;`), cria seus próprios usuários via
insert direto em `auth.users` (dispara `handle_new_user()` de verdade — é o próprio caminho de
provisionamento sendo exercitado como setup), e usa `set_config('request.jwt.claims', ...)` +
`set local role authenticated` para simular a sessão de um usuário autenticado real, do jeito
que `auth.uid()`/`auth.email()` leem essas GUCs localmente (confirmado lendo o código-fonte das
duas funções via `\df+` no Postgres local).

**Resultado real da execução (`supabase test db`), rodado múltiplas vezes durante o
desenvolvimento e uma última vez ao final para confirmação:**

```
./database/001_rls_insert_default_deny.sql ............... ok
./database/002_rls_update_colunas_imutaveis.sql .......... ok
./database/003_rls_usuarios_fazendas_sem_update.sql ...... ok
./database/004_aceitar_convite_regressao_null_email.sql .. ok
./database/005_handle_new_user_regressao_null_email.sql .. ok
./database/006_promover_papel_guarda_sequencial.sql ...... ok
All tests successful.
Files=6, Tests=25,  0 wallclock secs
Result: PASS
```

**25/25 asserções passaram.** Detalhe por arquivo:

### 001 — `001_rls_insert_default_deny.sql` (4 testes)
Insert direto do client (role `authenticated`, sem passar pelas funções/trigger) falha em
`usuarios`, `fazendas`, `usuarios_fazendas` e `convites`, com FKs válidas em todos os casos
(para garantir que a falha é por RLS — SQLSTATE `42501` — não por violação de constraint).
Confirma a garantia central do ADR-0001/ADR-0002 nas 4 tabelas.

### 002 — `002_rls_update_colunas_imutaveis.sql` (6 testes)
`usuarios.email`, `usuarios.id`, `fazendas.usuario_id`, `fazendas.id` continuam bloqueados por
trigger `BEFORE UPDATE` mesmo para o dono da própria linha (RLS permite o UPDATE chegar à
linha; o trigger rejeita explicitamente, SQLSTATE `P0001`). Dois testes de controle confirmam
que `nome` (única coluna com caso de uso real) continua editável em ambas as tabelas — para não
mascarar um over-blocking acidental.

### 003 — `003_rls_usuarios_fazendas_sem_update.sql` (3 testes)
**Nota de implementação relevante:** diferente de INSERT (que gera erro 42501 explícito),
UPDATE sem nenhuma policy aplicável não gera exceção — a cláusula `USING` implícita filtra a
linha para "não visível" e o UPDATE afeta 0 linhas silenciosamente (mesmo comportamento de um
SELECT sem policy). Os testes verificam por comparação de valor (`is()`), não `throws_ok()`.
Confirma que nem uma tentativa trivial (`updated_at`) nem a tentativa de auto-promoção
(`papel`) têm qualquer efeito — regressão do achado nº 1 do gate cyber_chief da Fase 1.

### 004 — `004_aceitar_convite_regressao_null_email.sql` (4 testes) — **O TESTE MAIS IMPORTANTE**
Regressão direta do achado nº 1 do gate cyber_chief no ADR-0002. Cenário: convite pendente,
papel `'admin'` (pior caso), endereçado a um e-mail específico, `convidado_usuario_id` ainda
NULL (não pré-resolvido — a condição que ativa o branch vulnerável). Um "atacante" autenticado
com `auth.email()` NULL (simulado via `request.jwt.claims` sem a claim `email` — mesmo
mecanismo que o cyber_chief descreveu: ativável no dia em que `enable_anonymous_sign_ins`/
`auth.sms.enable_signup` forem habilitados) tenta `aceitar_convite(token)`.

**Resultado: REJEITADO** — `throws_ok` confirma exceção `'Este convite não é endereçado ao
usuário autenticado'`, SQLSTATE `P0001`. Teste adicional confirma que o convite continua
`'pendente'` depois (nenhum efeito colateral da tentativa). Teste de controle confirma que o
destinatário CORRETO (e-mail bate) consegue aceitar normalmente — a correção NULL-safe não
quebrou o fluxo legítimo.

### 005 — `005_handle_new_user_regressao_null_email.sql` (3 testes)
Mesma classe de bug, segundo local onde existia: o branch de convite dentro de
`handle_new_user()` (trigger de signup), não só `aceitar_convite()`. Insert direto em
`auth.users` com `email = NULL` e `raw_user_meta_data->>'convite_token'` válido — dispara o
trigger na mesma transação (garantia de atomicidade do ADR-0001).

**Resultado: o INSERT INTEIRO falha** (`throws_ok`, mensagem `'Convite não corresponde ao
e-mail desta conta'`) — a exceção propaga e reverte tudo, inclusive a linha de `auth.users`
que estava sendo inserida (não sobra usuário órfão). Convite confirmado como continuando
`'pendente'` depois.

### 006 — `006_promover_papel_guarda_sequencial.sql` (5 testes)
Guarda "a fazenda nunca fica sem admin" — **caso sequencial** (achado nº 2, uma chamada de cada
vez). Cobre: usuário sem vínculo não pode chamar `promover_papel()` (autorização); único admin
de uma fazenda não consegue se auto-rebaixar (guarda dispara); papel confirmado inalterado
depois; teste de controle mostra que a guarda NÃO é overly-restritiva — com 2 admins, o
rebaixamento de um deles funciona normalmente.

**Honestidade de cobertura (nota explícita no próprio arquivo):** este arquivo sozinho **não**
prova que a corrida TOCTOU está corrigida — só que a guarda funciona sem concorrência real. O
teste de concorrência real está na Suíte C, executado separadamente (pgTAP não permite duas
conexões simultâneas dentro do mesmo arquivo).

## Suíte B — Integração HTTP real da Edge Function `enviar-convite`

Arquivo: `supabase/tests/edge-functions/enviar-convite.integration.ps1` (PowerShell — não há
equivalente nativo ao pgTAP para Edge Functions Deno no ecossistema Supabase CLI local).

**Convenção documentada no cabeçalho do script:** roda contra `supabase functions serve
enviar-convite --no-verify-jwt` (local, já em execução) + `supabase start` (local, já em
execução). `--no-verify-jwt` é necessário para que a validação de autenticação da PRÓPRIA
função (`auth.getUser()` em `index.ts`) seja exercitada, em vez de a plataforma rejeitar antes
de a requisição chegar ao código. Cria 2 usuários reais via signup GoTrue (sessão e JWT reais,
não forjados), fixtures de convite via `psql` direto (envolvendo INSERTs em uma CTE +
`SELECT` externo — necessário porque `psql -tA` ainda imprime o command tag, ex. `INSERT 0 1`,
como linha adicional mesmo em modo tuples-only quando o statement de topo não é um SELECT puro;
descoberto durante a primeira execução, que falhou por causa disso — ver "Problemas encontrados
e corrigidos" abaixo). Assertivas via comparação de status code HTTP; idempotente (e-mails
únicos por execução via GUID), sempre limpa os usuários de teste no `finally`.

**Resultado real da execução (rodado duas vezes seguidas para confirmar idempotência):**

```
=== Testes HTTP ===
ok 1 - requisicao sem Authorization retorna 401
ok 2 - chamador nao-admin da fazenda retorna 403
ok 3 - convite_id inexistente retorna 404
ok 4 - convite nao-pendente (cancelado) retorna erro (409)
ok 5 - admin da fazenda + convite pendente retorna 200 (controle positivo)

TODOS OS 5 TESTES PASSARAM
```

**5/5 testes passaram**, cobrindo os 4 casos mínimos pedidos (403/404/erro-não-pendente/401) e
um controle positivo (200, via branch `admin.inviteUserByEmail`, capturado pelo Inbucket local).

**Problemas encontrados e corrigidos durante o desenvolvimento deste teste** (documentado para
não se perder — não é ruído, é o tipo de armadilha que outro agente vai encontrar de novo, ver
regra 0 do `memory-protocol.md`):
1. Windows PowerShell 5.1 não tem `-SkipHttpErrorCheck` em `Invoke-WebRequest` (feature do
   PowerShell 7+) — script reescrito para usar `curl.exe` com `-o`/`-w` separados (corpo e
   status code em streams diferentes), mais robusto que fazer parsing de uma string combinada.
2. `psql -tA -c "insert ... returning id;"` imprime o `id` E o command tag `INSERT 0 1` como
   duas linhas de saída — ao capturar isso em uma variável PowerShell a partir de `docker exec`
   (que retorna array de linhas), o `$OFS` default (espaço) junta as duas linhas ao
   interpolar numa string, corrompendo o UUID (`"5474fb6e-... INSERT 0 1"`), que então falhava
   como UUID inválido na Edge Function (confirmado no log de `functions serve`: `invalid input
   syntax for type uuid`). Corrigido envolvendo todo INSERT de fixture numa CTE + `SELECT`
   externo (`with ins as (insert ... returning id) select id from ins;`), que não gera tag.

## Suíte C — Concorrência real de `promover_papel()` (achado nº 2, ADR-0002)

Arquivo: `supabase/tests/manual/promover_papel-concorrencia.ps1`. Não é pgTAP (pgTAP roda tudo
numa única sessão/transação — não há como simular duas conexões concorrentes de verdade
dentro de um arquivo pgTAP). Abre duas sessões `psql` reais via `docker exec` no container do
Postgres local, orquestradas para forçar uma corrida real:

- **Sessão A:** `BEGIN`; trava manualmente (`FOR UPDATE`) as mesmas linhas `papel='admin'` da
  fazenda que `promover_papel()` trava internamente; dorme 5s segurando o lock; só então chama
  `promover_papel()` para rebaixar o admin A; `COMMIT`.
- **Sessão B:** inicia ~2s depois (A já detém o lock); chama `promover_papel()` imediatamente
  para rebaixar o admin B (um admin **diferente** da **mesma** fazenda, exatamente o cenário
  mínimo do achado nº 2: 2 admins, cada chamada rebaixa um).

**Resultado real da execução (rodado com sucesso, saída completa capturada):**

```
--- Saida sessao A ---
... resultado_a (vazio = sucesso) ...
COMMIT
SESSION_A_DONE

--- Saida sessao B ---
SESSION_B_CALLING_PROMOVER_PAPEL
ERROR:  Operação bloqueada: a fazenda ficaria sem nenhum admin
CONTEXT:  PL/pgSQL function public.promover_papel(uuid,uuid,text) line 72 at RAISE
ROLLBACK
SESSION_B_DONE

=== Verificacao final ===
admins_restantes=1 papel_a=membro papel_b=admin
ok - fazenda termina com exatamente 1 admin (nunca 0)
ok - exatamente uma das duas chamadas concorrentes foi corretamente bloqueada pela guarda

TESTE DE CONCORRENCIA PASSOU
```

Sessão B foi genuinamente forçada a **bloquear** (não apenas "executar depois" — o
`for update` interno de `promover_papel()` colidiu com o lock que a sessão A já detinha nas
mesmas linhas), e ao ser liberada reavaliou a contagem de admins contra o dado já commitado por
A (papel de A já alterado para `'membro'`), rejeitando corretamente a si mesma. Fazenda terminou
com exatamente 1 admin — nunca 0. **Isso é a prova de que a correção do achado nº 2
(`for update` antes de contar) funciona sob concorrência real, não só no caso sequencial** — a
lacuna que o arquivo 006 (pgTAP) deixava explicitamente documentada como não coberta.

## Resumo de execução real (não apenas "testes escritos")

| Suíte | Arquivos | Asserções | Resultado |
|---|---|---|---|
| A — pgTAP (RLS/RPCs) | 6 | 25 | 25/25 PASS |
| B — Integração HTTP `enviar-convite` | 1 | 5 | 5/5 PASS (rodado 2x) |
| C — Concorrência real `promover_papel()` | 1 | 2 verificações finais | PASS |
| **Total** | **8** | **32** | **32/32 PASS** |

**O achado mais importante desta tarefa — a regressão do bypass de autorização via NULL
(achado nº 1 do gate cyber_chief no ADR-0002) — PASSOU**, nos dois locais onde o bug existia
(`aceitar_convite()` e o branch de convite de `handle_new_user()`), confirmado por execução
real contra Postgres local, não por revisão manual de código.

## O que NÃO foi testado / limitações honestas

- **Storage e Analytics (Logflare) não foram testados** — excluídos do `supabase start` local
  por incompatibilidade de imagem/CLI (ver seção Ambiente). Não são usados por nenhum dos dois
  artefatos revisados nesta tarefa (Fase 1/ADR-0002/`enviar-convite`), então não bloqueiam esta
  entrega, mas ficam como pendência de investigação separada se algum módulo futuro depender
  deles localmente (ex.: quando Storage entrar em uso real para PDFs de declaração anual).
- **O branch de e-mail transacional via Resend** (`RESEND_API_KEY` configurada) não foi testado
  — a env var não está configurada neste ambiente local (mesma situação documentada no
  ADR-0003/PROJECT_CONTEXT.md seção 4: ninguém criou a conta Resend ainda). O teste de controle
  positivo (`5_controle_sucesso`) exercitou o branch `admin.inviteUserByEmail` (pessoa sem
  conta), não o branch de Resend (pessoa já com conta) — esse segundo branch, sem
  `RESEND_API_KEY`, cai no fallback de log já validado pelos testes de lógica pura existentes
  em `index.test.ts` (`enviarEmailConvite`), não retestado aqui via HTTP real.
- **`cancelar_convite()` e `criar_convite()`** não ganharam teste pgTAP dedicado nesta tarefa —
  a checagem de autorização de ambos segue o mesmo padrão imperativo já testado indiretamente
  em `promover_papel()` (arquivo 006) e não fazia parte do escopo explícito desta tarefa (os
  dois achados do cyber_chief + a lacuna de RLS da Fase 1). Pendência não bloqueante para uma
  rodada futura de testes, se o squad quiser fechar 100% de cobertura das 4 funções
  `SECURITY DEFINER`.
- **CLI do Supabase não foi atualizada** (2.26.9 → 2.109.1 disponível) — o bloqueio do
  `storage-api` é justamente um sintoma dessa desatualização; atualizar a CLI provavelmente
  resolveria o problema na raiz, mas está fora do escopo desta tarefa de QA (é uma decisão de
  `devops`/ambiente, não de teste).

## Mudanças de arquivo

- Novos `supabase/tests/database/001_rls_insert_default_deny.sql` até
  `006_promover_papel_guarda_sequencial.sql` (6 arquivos pgTAP).
- Novo `supabase/tests/edge-functions/enviar-convite.integration.ps1`.
- Novo `supabase/tests/manual/promover_papel-concorrencia.ps1`.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5; seção 4 atualizada
  (pendência de testes de RLS/Edge Function removida, uma nova pendência menor registrada —
  ver seção "O que NÃO foi testado" acima).

## Pendências / próximos passos

- Nenhum bloqueio técnico para a Fase 1 do ponto de vista deste gate de testes. Aprovação final
  continua sendo decisão do usuário — esta tarefa reporta status técnico objetivo, não aprova
  nada (fora do escopo desta agente).
- `devops`: considerar atualizar a CLI do Supabase (2.26.9 → mais recente) para eliminar a
  necessidade de excluir `storage-api`/`logflare`/`vector` do `supabase start` local.
- `qa` (rodada futura, não bloqueante): cobertura pgTAP dedicada para `criar_convite()` e
  `cancelar_convite()`; teste HTTP do branch Resend quando `RESEND_API_KEY` for configurada.
