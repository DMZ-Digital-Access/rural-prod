[ADR-0001]
Título: Estratégia de provisionamento de conta no signup (`usuarios` / `fazendas` / `usuarios_fazendas`)
Data: 2026-07-16
Status: aceito

---

## [CONTEXTO]

Todo novo usuário do Livestock Control precisa, no momento do cadastro (`auth.signUp`),
ganhar três registros correlacionados:

- uma linha em `usuarios` (espelhando `auth.users.id`);
- uma linha em `fazendas` (a propriedade inicial do usuário, dono do relacionamento 1
  usuário = 1 fazenda nesta primeira entrega);
- uma linha em `usuarios_fazendas` com `usuario_id`, `fazenda_id` e `papel = 'dono'` — tabela
  de vínculo que já nasce pensada para suportar múltiplos papéis por fazenda (ver spec seção
  5.4: papel futuro "Financeiro/Contábil", Fase 6 do roadmap).

A especificação (`especificacao-sistema.md`, seção 9, item 1) já registra isso como o
**maior risco identificado no protótipo Bolt.new**: lá, esses inserts eram feitos direto do
client após o signup, e esbarravam sistematicamente em bloqueios de RLS — o client autenticado
tentava inserir em tabelas cujas políticas de RLS não previam esse caminho de escrita
(razoavelmente, já que RLS é default-deny e ninguém havia desenhado uma política de INSERT
para um usuário criar sua própria linha em cascata por três tabelas). O resultado prático no
protótipo era contas "meio criadas": usuário existia em `auth.users`, mas sem `usuarios`/
`fazendas` correspondentes, deixando a aplicação em estado inconsistente logo na primeira
tela pós-login.

A spec já aponta corretamente que a solução não pode ser "ajustar a política de RLS até o
insert do client passar" — a alternativa correta é mover a responsabilidade de criação para
fora do client, com dois caminhos possíveis: (a) trigger de banco em `auth.users`
(`on_auth_user_created`), ou (b) Edge Function chamada com `service_role` depois do signup.
Este ADR decide entre as duas, com critério, e formaliza os detalhes de atomicidade e RLS que
a spec deixa implícitos.

## [DECISÃO]

**Adotar a Alternativa (a): trigger de banco `AFTER INSERT` em `auth.users`**, com uma função
`SECURITY DEFINER` em `public` (`public.handle_new_user()`, seguindo o nome convencional do
próprio padrão documentado pelo Supabase) que, na mesma execução:

1. Insere a linha em `public.usuarios` (`id = new.id`, `nome`/`email` extraídos de
   `new.raw_user_meta_data` / `new.email`).
2. Insere a linha em `public.fazendas` (nome da fazenda vindo de
   `new.raw_user_meta_data->>'nome_fazenda'`, campo que o formulário de signup precisa
   popular via `options.data` no `supabase.auth.signUp()` — é o único jeito de o trigger
   enxergar dado informado no formulário, já que ele só recebe a linha `NEW` de `auth.users`).
3. **É neste mesmo passo, dentro da mesma função trigger, que entra a criação da linha em
   `usuarios_fazendas`** — `INSERT INTO public.usuarios_fazendas (usuario_id, fazenda_id,
   papel) VALUES (new.id, <id da fazenda recém-criada>, 'dono')`. Não há um segundo momento
   ou processo separado para isso: as três tabelas são povoadas em sequência, na mesma
   function body, no mesmo statement de trigger.

A função é registrada via `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR
EACH ROW EXECUTE FUNCTION public.handle_new_user();`, aplicada por migration versionada em
`supabase/migrations/`.

## [ALTERNATIVAS CONSIDERADAS]

**Alternativa 1 — Trigger de banco (`on_auth_user_created`) — ESCOLHIDA**

Prós:
- Atomicidade real, garantida pelo próprio Postgres, não pela aplicação: o `AFTER INSERT`
  dispara **dentro da mesma transação** que o GoTrue (serviço de Auth do Supabase) usa para
  inserir a linha em `auth.users`. Se qualquer insert dentro da função trigger falhar (ex.:
  violação de constraint em `fazendas`), a exceção propaga, a transação inteira é revertida —
  **incluindo a própria linha de `auth.users`**. Não existe estado intermediário possível:
  ou as quatro linhas (`auth.users` + `usuarios` + `fazendas` + `usuarios_fazendas`) existem,
  ou nenhuma existe.
- Cobre todo caminho de criação de usuário automaticamente — signup por email/senha, magic
  link, OAuth (roadmap), ou criação administrativa via dashboard/API — porque todos passam
  pelo mesmo insert em `auth.users`. Não depende de o client "lembrar" de chamar um segundo
  endpoint depois do signup.
- Não introduz uma superfície de rede adicional nem uma chave `service_role` exposta em um
  endpoint HTTP invocável (ver riscos da Alternativa 2 abaixo).
- É o padrão documentado e testado em produção pelo próprio Supabase para exatamente este
  problema — não é uma solução exótica.

Contras:
- PL/pgSQL é uma habilidade menos comum na equipe do que TypeScript; exige revisão cuidadosa
  de Sofia (`db_sage`) e do próprio Alex, não só do Ryan.
- Falhas na trigger aparecem para o client como um erro genérico de signup vindo do GoTrue
  (não como uma mensagem de aplicação customizada) — exige `RAISE EXCEPTION` com mensagens
  úteis na função e correlação com os logs do Postgres (responsabilidade do Oliver garantir
  observabilidade desses logs).
- Se a lógica de provisionamento precisar crescer para incluir efeitos colaterais que Postgres
  não faz bem nativamente (chamada HTTP a serviço externo, envio de e-mail transacional
  customizado fora do que o Supabase Auth já dispara), o trigger não é o lugar certo para
  isso — precisaria de um padrão complementar (outbox: o trigger grava um evento numa tabela,
  um processo assíncrono separado consome). Não é o caso hoje, mas é uma limitação real do
  caminho escolhido.

**Alternativa 2 — Edge Function com `service_role`, chamada pelo client após `signUp()`**

Prós:
- Escrita em TypeScript, mesma linguagem do resto do app — mais fácil de revisar e testar com
  as ferramentas já usadas pelo squad (Emma/`qa` não precisaria de ferramentas de teste
  específicas para PL/pgSQL).
- Mais fácil de estender com efeitos colaterais externos (chamar outro serviço, lógica de
  negócio mais rica) sem sair do runtime Deno das Edge Functions.
- Logs e observabilidade mais familiares (logs de função, não logs de banco).

Contras (motivo da rejeição):
- **Não é atômico com a criação do usuário.** Existe uma janela real entre o `auth.signUp()`
  retornar sucesso e o client conseguir chamar a Edge Function: se a aba fechar, a rede cair,
  o app crashar, ou a função falhar por qualquer motivo, o resultado é exatamente o mesmo
  problema que a spec já identificou no protótipo — um `auth.users` "órfão", sem `usuarios`/
  `fazendas`/`usuarios_fazendas` correspondentes. Resolver isso corretamente exigiria lógica
  adicional de reconciliação (idempotência, retry no próximo login, verificação de
  "provisionamento incompleto") — complexidade extra para replicar uma garantia que o Postgres
  já dá de graça na Alternativa 1.
- Depende do client iniciar a chamada. Qualquer caminho de criação de usuário que não passe
  pelo fluxo de signup padrão da aplicação (convite administrativo, OAuth adicionado no
  roadmap, criação via dashboard do Supabase em suporte/debug) fica fora da cobertura, a menos
  que cada caminho novo lembre de chamar a mesma função — superfície maior para bugs de
  omissão.
- Expõe um endpoint HTTP que internamente usa `service_role` (bypassa RLS por completo). Isso
  é seguro **somente** se a função validar rigorosamente o JWT do chamador e nunca aceitar
  `user_id`/`fazenda_id` vindos do corpo da requisição — um erro nessa validação vira uma
  vulnerabilidade de escalonamento de privilégio (qualquer usuário autenticado provisionando
  fazenda para outro `user_id` arbitrário). É uma superfície de risco adicional que o trigger
  simplesmente não tem, porque não é invocável via rede.

## [CONSEQUÊNCIAS]

**Positivas:**
- O risco nº 1 do protótipo (item 1, seção 9 da spec) é eliminado estruturalmente, não
  contornado: não há mais nenhum caminho de escrita client-side para `usuarios`/`fazendas`/
  `usuarios_fazendas`, então não há política de RLS "generosa demais" para vazar.
- Garantia de consistência forte por construção: é estruturalmente impossível um usuário
  existir em `auth.users` sem as três linhas correspondentes — não existe o cenário "criação
  de `usuarios` sucede mas a de `fazendas` falha", porque ambas (e `usuarios_fazendas`) vivem
  na mesma transação de banco que a própria criação do usuário no Auth. Uma falha em qualquer
  ponto desfaz tudo, inclusive `auth.users` — o usuário pode simplesmente tentar o signup de
  novo, sem lixo para limpar.
- Implicação de RLS, explícita para Constantine (`cyber_chief`) revisar na Fase 1: as tabelas
  `usuarios`, `fazendas` e `usuarios_fazendas` **não precisam de nenhuma política de INSERT
  para os papéis `authenticated`/`anon`**. A função trigger roda como `SECURITY DEFINER`, sob
  o role owner da função (tipicamente `postgres`/`supabase_admin` nas migrations do Supabase),
  que tem `BYPASSRLS` — é esse role, não o usuário final, que executa os inserts. Portanto o
  desenho de RLS correto para essas três tabelas é: **sem política de INSERT para
  client** (RLS default-deny cobre isso automaticamentre — não é preciso nem escrever uma
  policy `WITH CHECK (false)` explícita, embora seja aceitável documentar a ausência
  deliberada com um comentário SQL), com policies de SELECT/UPDATE normais restritas ao
  próprio usuário (`usuarios.id = auth.uid()`) e à(s) fazenda(s) vinculada(s) via
  `usuarios_fazendas` (`fazenda_id IN (SELECT fazenda_id FROM usuarios_fazendas WHERE
  usuario_id = auth.uid())`). Isso deve virar um caso de teste de RLS explícito ("insert
  direto do client autenticado nessas 3 tabelas deve falhar"), não apenas uma omissão.

**Negativas / trade-offs aceitos:**
- Equipe assume manutenção de lógica crítica em PL/pgSQL, exigindo par de revisão
  Alex/Sofia sempre que a função mudar — não é trabalho que o Ryan deve mexer sozinho sem
  esse par, dado o nível de risco (é o caminho que faz ou não faz um usuário novo conseguir
  usar o produto).
- Erros de signup ficam menos "amigáveis" por padrão (mensagem genérica do GoTrue) até que a
  função tenha `RAISE EXCEPTION` com mensagens específicas e Oliver garanta que os logs do
  Postgres do projeto Supabase estejam acessíveis/monitorados para debug.
- A função, como desenhada, assume que **todo signup cria uma fazenda nova** (modelo atual:
  1 usuário = 1 fazenda = dono). Essa suposição é conhecidamente temporária — ver critério de
  revisão abaixo.

**Riscos a monitorar:**
- Nome da fazenda depende de `raw_user_meta_data` ser corretamente populado pelo formulário de
  signup (`options.data` no client) — se o campo vier vazio/nulo, a função precisa de um
  fallback sensato (ex.: `'Minha Fazenda'` ou erro explícito bloqueando o signup) em vez de
  falhar silenciosamente ou gravar `NULL`. Detalhe de implementação para Ryan/Sofia, mas o
  comportamento esperado (fallback vs. erro bloqueante) deve ser decidido explicitamente na
  implementação, não deixado implícito.
- Mudanças futuras no comportamento transacional do GoTrue/Supabase (fora do controle do
  squad) que alterassem a premissa "o trigger roda na mesma transação do insert em
  `auth.users`" invalidariam a garantia de atomicidade central deste ADR — baixa
  probabilidade, mas Oliver deve acompanhar changelog do Supabase relacionado a Auth.

## [CRITÉRIOS DE REVISÃO]

Esta decisão deve ser revisada se:

1. **Fase 6 (papel Financeiro/Contábil) for implementada.** Nesse momento, nem todo signup
   deve criar uma fazenda nova — um usuário convidado como "Financeiro/Contábil" se junta a
   uma fazenda **já existente** via `usuarios_fazendas` com `papel = 'financeiro'`, sem criar
   `fazendas` nova. A função trigger atual, no formato descrito neste ADR, não distingue esses
   dois casos. Será preciso estender a lógica (ex.: checar um campo em
   `raw_user_meta_data` indicando "convite para fazenda X" vs. "signup de dono novo") antes de
   implementar esse papel — sinalizar para Alex revisar este ADR nesse ponto do roadmap, não
   depois.
2. **A criação de conta precisar de efeitos colaterais que Postgres não deve fazer
   diretamente** (chamada HTTP síncrona a serviço externo no fluxo de signup, por exemplo).
   Nesse caso, considerar o padrão outbox (trigger grava evento, processo assíncrono separado
   consome) como complemento — não substituto — deste trigger, preservando a atomicidade da
   criação das 3 tabelas centrais.
3. **Houver evidência real de problema de performance ou de comportamento inesperado do
   GoTrue** em relação à premissa de atomicidade transacional descrita nas Consequências.
4. **O modelo de "1 usuário = 1 fazenda" mudar** de qualquer outra forma não prevista aqui
   (ex.: signup permitindo escolher entrar em fazenda existente por convite, mesmo fora do
   papel Financeiro/Contábil).
