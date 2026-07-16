[ADR-0002]
Título: Convites para fazenda existente, papel único hierárquico (admin/membro/financeiro) e
caminho de escrita controlado para `usuarios_fazendas`
Data: 2026-07-16
Status: aceito

---

## [CONTEXTO]

O ADR-0001 fechou o provisionamento de conta assumindo uma premissa única: **todo signup cria
uma fazenda nova**, com o criador virando `papel = 'dono'` na mesma transação, via trigger
`handle_new_user()` `SECURITY DEFINER`. O próprio ADR-0001 já previa, no seu Critério de
Revisão nº 1, que essa premissa deixaria de valer no dia em que fosse possível "entrar em
fazenda existente por convite" — e listava explicitamente, no nº 4, "signup permitindo
escolher entrar em fazenda existente por convite, mesmo fora do papel Financeiro/Contábil"
como gatilho de revisão. Esse dia chegou: JP decidiu (fora do escopo deste ADR — ver seção
"Decisões já tomadas" abaixo) que o produto passa a suportar convite de fazenda já nesta fase,
não só na Fase 6, e que o modelo deixa de ser 1 usuário = 1 fazenda.

Isso também antecipa, mais cedo do que a spec original previa, o papel "Financeiro/Contábil"
da seção 5.4 de `especificacao-sistema.md` — que hoje entra como um valor do mesmo campo
`papel` hierárquico único, não como um mecanismo de acesso separado.

O security review do `cyber_chief` na Fase 1 (`.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md`)
deixou um segundo terreno sensível que este ADR precisa respeitar: a policy de UPDATE em
`usuarios_fazendas` foi **removida por completo**, não restringida coluna a coluna, porque uma
policy `WITH CHECK` que mistura autorização (o chamador pode fazer isso?) e mutação de dado
(qual o novo valor de `papel`?) na mesma cláusula declarativa é exatamente a classe de bug que
gerou o achado nº 1 daquele review (CWE-915, elevação de privilégio horizontal→vertical, hoje
inerte só porque a `CHECK` constraint não permitia outro valor além de `'dono'`). Este ADR
**não pode reabrir esse buraco** ao resolver "como promover alguém a admin" — a keyword do
`cyber_chief` foi clara: *"Não vou aprovar uma migration cujo controle de acesso depende de
uma constraint não relacionada continuar do jeito que está."*

Este ADR decide o desenho técnico dos três pontos abaixo, todos consequência das decisões que
JP já tomou (não reabertas aqui):

1. Papel único hierárquico `'admin' | 'membro' | 'financeiro'` em `usuarios_fazendas.papel`,
   substituindo `'dono'` — quem cria a fazenda vira simplesmente o primeiro `'admin'`.
2. Qualquer admin pode promover (ou rebaixar) outro membro — sem hierarquia especial para o
   criador original.
3. Convite funciona tanto para usuário novo quanto para usuário já cadastrado, em qualquer
   fazenda — o modelo N:N usuário↔fazenda vale desde já, não só na Fase 6.

**Nota de revisão do ADR-0001:** este ADR substitui parcialmente o ADR-0001, apenas na parte
que assume que **todo signup cria fazenda nova**. O restante do ADR-0001 — a decisão entre
trigger de banco vs. Edge Function para o caminho de signup *sem* convite pendente, e as
garantias de atomicidade que essa escolha proporciona — **continua válido e não é revisado
aqui**. O campo `Status:` do ADR-0001 foi atualizado para refletir isso (ver arquivo).

## [DECISÃO]

### D1 — Modelo de papel

`usuarios_fazendas.papel` passa a aceitar `'admin' | 'membro' | 'financeiro'` via CHECK
constraint (troca de constraint, não do tipo da coluna — mesma estratégia já decidida na
migration da Fase 1). `'dono'` deixa de existir como valor. `fazendas.usuario_id` continua
sendo o único registro de "quem criou originalmente" — não duplicado no papel.

### D2 — Problema A: caminho de escrita controlado para `usuarios_fazendas` (e para a nova
tabela `convites`)

**Princípio adotado, generalizando a correção do `cyber_chief`:** qualquer tabela cujas
colunas codificam autorização (`usuarios_fazendas.papel`, `convites.status`) tem **zero
policy de INSERT/UPDATE/DELETE para `authenticated`/`anon`**. Toda escrita nessas tabelas
passa por um conjunto pequeno e auditável de funções `SECURITY DEFINER`, que fazem a
validação de permissão do chamador **dentro do corpo da função**, nunca via `WITH CHECK`
declarativo. Isso não é um caso especial — é a mesma disciplina que already levou à remoção da
policy `usuarios_fazendas_update_own`, agora aplicada de propósito a todo o desenho novo, em
vez de descoberta reativamente de novo numa revisão futura.

Três funções novas, todas `SECURITY DEFINER`, `SET search_path = ''` (padrão de hardening já
estabelecido pelo `cyber_chief` em `handle_new_user()`), com `REVOKE ALL ... FROM PUBLIC` e
`GRANT EXECUTE ... TO authenticated` apenas (nunca `anon` — todas exigem `auth.uid()`):

1. **`public.aceitar_convite(p_token uuid) RETURNS uuid`** (retorna `fazenda_id`)
   - Busca o convite por `token`, valida `status = 'pendente'` e `expires_at > now()`.
   - Valida que o e-mail do chamador (`auth.email()` — helper nativo do Supabase que lê o
     claim `email` do JWT já validado pelo GoTrue, **não** uma query direta a `auth.users`)
     bate com `convites.convidado_email`, OU que `convidado_usuario_id = auth.uid()` (caso já
     resolvido na criação do convite, ver D3).
   - Insere em `usuarios_fazendas (usuario_id, fazenda_id, papel)` com
     `(auth.uid(), convites.fazenda_id, convites.papel_oferecido)`. `ON CONFLICT
     (usuario_id, fazenda_id) DO NOTHING`, com verificação explícita de conflito antes/depois
     para devolver um erro claro ("já vinculado a esta fazenda") em vez de sucesso silencioso
     enganoso.
   - Atualiza o próprio convite: `status = 'aceito'`, `accepted_at = now()`,
     `convidado_usuario_id = auth.uid()`.
   - Tudo dentro da mesma function body — a leitura do convite, a escrita em
     `usuarios_fazendas` e a atualização do convite são atômicas (mesma transação implícita da
     chamada RPC), eliminando o risco de replay/double-accept que uma abordagem em dois
     passos client-side teria (ver Alternativa 2 rejeitada abaixo).

2. **`public.promover_papel(p_fazenda_id uuid, p_usuario_id uuid, p_novo_papel text) RETURNS
   void`**
   - Valida `p_novo_papel in ('admin', 'membro', 'financeiro')`.
   - Valida que `auth.uid()` **já é `admin`** de `p_fazenda_id` — query direta a
     `usuarios_fazendas` dentro da função (a função bypassa RLS por ser `SECURITY DEFINER`,
     mas a checagem de permissão é feita explicitamente pelo código da função, não delegada à
     RLS).
   - Valida que `p_usuario_id` já tem vínculo com `p_fazenda_id` (esta função é só para mudar
     papel de quem já está na fazenda — nunca cria vínculo novo; criar vínculo é sempre via
     convite/`aceitar_convite`).
   - **Guarda de integridade operacional:** se a mudança resultaria em `p_fazenda_id` ficando
     com **zero** vínculos `papel = 'admin'` (ex.: o único admin sendo rebaixado a `membro`),
     a função rejeita com erro explícito. Sem essa guarda, a fazenda ficaria num estado sem
     ninguém capaz de promover ninguém de volta — um deadlock operacional, não um problema de
     segurança, mas evitável a custo zero dentro da mesma função que já está validando o
     chamador.
   - `UPDATE usuarios_fazendas SET papel = p_novo_papel WHERE usuario_id = p_usuario_id AND
     fazenda_id = p_fazenda_id`.

3. **`public.criar_convite(p_fazenda_id uuid, p_email text, p_papel text) RETURNS uuid`**
   (retorna `token`)
   - Valida `auth.uid()` é `admin` de `p_fazenda_id` (mesma checagem imperativa de
     `promover_papel`).
   - Valida `p_papel in ('admin', 'membro', 'financeiro')`.
   - Normaliza `p_email` (`lower(trim(...))`), resolve `convidado_usuario_id` fazendo lookup
     em `public.usuarios` por e-mail — se existir conta com esse e-mail, popula o campo; se
     não, deixa `null` (ver D3, é assim que o convite sabe diferenciar "pessoa nova" de
     "pessoa já cadastrada" sem precisar da Admin API só para essa checagem).
   - Insere a linha em `convites` (`status = 'pendente'`, `expires_at = now() + 7 dias` como
     default sensato, revisável por produto).
   - Não envia e-mail — isso é responsabilidade do client/Edge Function (D3).

4. **`public.cancelar_convite(p_convite_id uuid) RETURNS void`**
   - Valida `auth.uid()` é `admin` da fazenda do convite.
   - Só age se `status = 'pendente'` (idempotente/seguro se já foi aceito ou já cancelado).
   - `UPDATE convites SET status = 'cancelado' WHERE id = p_convite_id`.

Nenhuma policy de INSERT/UPDATE/DELETE é criada em `usuarios_fazendas` nem em `convites` para
`authenticated`/`anon` — RLS default-deny cobre tudo que não passa por essas quatro funções.
`convites` recebe apenas policies de **SELECT** (leitura não concede privilégio, então é
seguro expressá-la declarativamente): admin vê os convites enviados pelas fazendas onde é
admin; o convidado vê os convites endereçados a ele (`convidado_email = auth.email() OR
convidado_usuario_id = auth.uid()`).

**Signup com convite pendente (usuário novo):** `handle_new_user()` passa a checar
`new.raw_user_meta_data->>'convite_token'` no início da função:
- Se **ausente**: comportamento inalterado do ADR-0001 (cria `fazendas` nova, vínculo
  `papel = 'admin'` em vez de `'dono'` — única mudança neste caminho).
- Se **presente**: busca o convite por token, valida `status = 'pendente'`,
  `expires_at > now()` e `lower(convidado_email) = lower(new.email)` (comparação contra
  `new.email`, que vem de `auth.users` — dado da própria linha sendo inserida pelo GoTrue, não
  algo que o client possa forjar independentemente do e-mail real da conta). Se válido: **não
  cria `fazendas`**, insere `usuarios_fazendas (new.id, convite.fazenda_id,
  convite.papel_oferecido)`, marca o convite como aceito — tudo na mesma transação do
  `AFTER INSERT ON auth.users`, preservando a garantia de atomicidade central do ADR-0001. Se
  o token vier presente mas **inválido/expirado/e-mail não bate**: `RAISE EXCEPTION`,
  bloqueando o signup (decisão deliberada — ver [ALTERNATIVAS CONSIDERADAS], não é o mesmo
  caso do fallback de `nome_fazenda` do ADR-0001).

Isso cobre o caso "admin convida e-mail que ainda não tem conta" de forma unificada: seja o
novo usuário completando o signup padrão do app com o token capturado da URL de convite (via
`options.data` do `signUp()`), seja a conta tendo sido pré-criada pela Supabase Admin API
(`inviteUserByEmail`, ver D3) — em ambos os casos a linha é inserida em `auth.users`, o mesmo
trigger dispara, e a mesma lógica de branch decide criar fazenda nova vs. entrar na existente.
Nenhum caminho novo de criação de conta escapa dessa cobertura, pelo mesmo motivo que o
ADR-0001 já argumentou a favor do trigger sobre a Edge Function.

### D3 — Problema B: como o convite chega a quem ainda não tem conta

A tabela `convites` (Postgres) é a fonte da verdade de estado do convite — mas Postgres não
envia e-mail. Isso exige uma **Edge Function** (`enviar-convite`, roda com `service_role`) como
componente novo do desenho, chamada pelo client **depois** que `criar_convite()` retorna com
sucesso (dois passos, não um — ver por que isso é aceitável, abaixo).

Fluxo:
1. Admin chama `criar_convite(fazenda_id, email, papel)` via RPC — grava o convite,
   `convidado_usuario_id` já resolvido se a conta existir.
2. Client chama a Edge Function `enviar-convite`, passando o `convite_id`. A função:
   - Revalida a permissão do chamador a partir do JWT que o Supabase repassa automaticamente
     na invocação (não confia em nada do corpo além do id do convite).
   - Se `convidado_usuario_id` **não é nulo** (conta já existe): envia um e-mail transacional
     próprio (provedor a definir por `devops`) com link para uma tela in-app de "aceitar
     convite" — a aceitação em si sempre acontece via `aceitar_convite(token)` depois que o
     usuário está autenticado (login normal, se ainda não estava).
   - Se `convidado_usuario_id` **é nulo** (sem conta): chama
     `supabase.auth.admin.inviteUserByEmail(email, { data: { convite_token: token },
     redirectTo: ... })`. Isso cria a linha em `auth.users` imediatamente (estado não
     confirmado) — o que já dispara `handle_new_user()` na hora, populando
     `raw_user_meta_data` com o mesmo `convite_token` que o `signUp()` client-side usaria
     (mesmo mecanismo, dois pontos de entrada). O usuário completa a conta (define senha) ao
     clicar o link do e-mail que o próprio Supabase Auth envia.

**Por que a não-atomicidade entre passo 1 e passo 2 é aceitável aqui**, ao contrário do que o
ADR-0001 rejeitou para o provisionamento original: no caso do ADR-0001, uma falha entre os dois
passos deixava uma **conta autenticável, porém sem dados de aplicação** — um estado quebrado e
visível ao usuário na primeira tela pós-login. Aqui, uma falha entre os dois passos deixa
apenas um convite `'pendente'` no banco sem e-mail enviado — nenhum dado inconsistente, nenhum
acesso indevido, e totalmente recuperável (o admin vê o convite "pendente" na UI e pode
reenviar, simplesmente chamando `enviar-convite` de novo). Não há necessidade de replicar a
garantia transacional do trigger para este passo.

### D4 — Problema C: migração dos dados existentes

A migration futura (trabalho do `db_sage`, fora do escopo deste ADR) precisa, nesta ordem —
ordem importa, porque a constraint atual só permite `'dono'`:

1. `ALTER TABLE usuarios_fazendas DROP CONSTRAINT usuarios_fazendas_papel_check;`
2. `UPDATE usuarios_fazendas SET papel = 'admin' WHERE papel = 'dono';`
3. `ALTER TABLE usuarios_fazendas ADD CONSTRAINT usuarios_fazendas_papel_check CHECK (papel IN
   ('admin', 'membro', 'financeiro'));`

Fazer o UPDATE antes de trocar a constraint (passo 2 antes do 3, mas depois do drop no passo
1) é obrigatório: tentar `UPDATE ... SET papel = 'admin'` enquanto a constraint antiga
(`CHECK (papel IN ('dono'))`) ainda existe falha imediatamente.

## [ALTERNATIVAS CONSIDERADAS]

**Para o caminho de escrita controlado (Problema A):**

**Alternativa 1 — Funções `SECURITY DEFINER` (RPC) — ESCOLHIDA**

Prós:
- Validação de permissão do chamador é código imperativo, explícito, testável isoladamente —
  não uma cláusula `WITH CHECK` declarativa que mistura autorização e mutação de dado na mesma
  expressão (exatamente a forma do achado nº 1 do `cyber_chief`).
- `GRANT EXECUTE`/`REVOKE` por função dá controle de superfície independente e mais granular
  que RLS por tabela — cada função tem exatamente um propósito, fácil de auditar
  individualmente.
- Operações multi-etapa (validar convite → inserir vínculo → marcar convite aceito) são
  atômicas por construção dentro do corpo da função, sem depender do client executar duas
  chamadas em sequência sem falhar no meio.

Contras:
- Mais uma camada de PL/pgSQL para a equipe manter (mesmo trade-off já aceito no ADR-0001 para
  `handle_new_user()` — Alex/Sofia revisam em par).
- Lógica de autorização "espalhada" entre RLS (leitura) e funções (escrita) exige documentação
  clara de qual mecanismo protege o quê, para não confundir revisores futuros — mitigado
  documentando isso nesta seção e nos comentários SQL de cada função.

**Alternativa 2 — Reabrir policy de INSERT/UPDATE em `usuarios_fazendas`, com `WITH CHECK`
referenciando `convites` — REJEITADA**

Prós:
- Sem função nova: o client insere direto, `WITH CHECK` valida contra a linha de convite
  correspondente.

Contras (motivo da rejeição):
- Marcar o convite como aceito exigiria um **segundo** statement do client (`UPDATE convites
  SET status = 'aceito' ...`), não atômico com o insert em `usuarios_fazendas` — janela real
  para o client falhar entre os dois passos, deixando o convite reutilizável (`status` ainda
  `'pendente'`) mesmo após o vínculo já ter sido criado — risco de double-accept/replay do
  mesmo token, ou de dois vínculos "quase simultâneos" pela mesma pessoa se o client tentar de
  novo após um timeout aparente.
- Uma policy de UPDATE equivalente para promoção (`promover_papel` via RLS) precisaria de uma
  subquery sobre a própria `usuarios_fazendas` dentro do `WITH CHECK` para verificar se o
  chamador é admin — é literalmente a mesma forma estrutural da policy que o `cyber_chief` já
  rejeitou nesta tabela. Reabrir esse padrão, mesmo com uma condição adicional, contraria
  diretamente a recomendação registrada no log daquele review ("nenhuma [policy de UPDATE em
  `usuarios_fazendas`] deve ser criada sem `with check` explícito por coluna e sem essa
  revisão [do cyber_chief]").

**Alternativa 3 — Policy de UPDATE em `usuarios_fazendas` restrita à coluna `papel`, com
`WITH CHECK` checando admin do chamador — REJEITADA**

Prós:
- Mais "nativo" a RLS, sem função/RPC extra.

Contras (motivo da rejeição): mesma classe de risco da Alternativa 2 — mistura autorização e
mutação numa cláusula declarativa única, exige revisão do `cyber_chief` a cada mudança de
forma (ele já pediu isso explicitamente no log da Fase 1), e não resolve por si só a
atomicidade "validar convite + marcar aceito" do caso de aceite (só serve para promoção, não
para entrada via convite). Rejeitada pelos mesmos motivos da Alternativa 2, sem vantagem
adicional que justifique reabrir a discussão com o `cyber_chief` outra vez.

**Para o envio do convite a quem não tem conta (Problema B):**

**Alternativa 1 — Tabela `convites` própria + Edge Function `enviar-convite` (branch
`inviteUserByEmail` vs. e-mail próprio) — ESCOLHIDA**

Prós: ver D3. Cobre os dois sub-casos da decisão 3 de JP (usuário novo e usuário já
cadastrado) com o mesmo esquema de dados e o mesmo mecanismo de leitura de token em
`handle_new_user()`. Convites por fazenda são consultáveis (lista de pendentes, expiração,
cancelamento) — necessário para qualquer UI de gestão de equipe.

Contras: precisa de uma Edge Function nova (superfície adicional, ainda que com escopo
estreito e revalidação de permissão no corpo — mesmo padrão de cautela que o ADR-0001 já
aplicou à Alternativa 2 rejeitada lá, mas aqui o **efeito** de uma falha é apenas "e-mail não
enviado", não "conta inconsistente").

**Alternativa 2 — Usar `admin.inviteUserByEmail` para todo mundo, inclusive quem já tem conta
— REJEITADA**

Contras: essa API é desenhada para *criar* conta; chamá-la contra um e-mail que já tem
`auth.users` correspondente é semanticamente errada (gera erro ou reenvia fluxo de convite de
criação de conta sobre uma conta já confirmada, colidindo com fluxos normais de login/reset de
senha do usuário). Obrigaria toda entrada em fazenda existente — mesmo entre dois usuários já
cadastrados — a depender de Admin API/Edge Function, quando o caso "usuário já autenticado
aceita convite" é resolvido de forma mais simples e barata por uma RPC comum
(`aceitar_convite`).

**Alternativa 3 — Sem tabela `convites` própria; estado do convite vive só em
`raw_user_meta_data`/no que a Admin API já guarda — REJEITADA**

Contras: não cobre o caso "usuário já cadastrado" (a Admin API de invite só cria conta nova,
não tem equivalente para "adicionar usuário existente a um tenant"); sem consulta estruturada
("convites pendentes da fazenda X", expiração configurável, cancelamento), a UI de gestão de
equipe não teria de onde ler esse estado; um usuário com convites pendentes para múltiplas
fazendas simultaneamente não é bem representado por um blob de metadata por usuário.

## [CONSEQUÊNCIAS]

**Positivas:**
- O modelo N:N usuário↔fazenda passa a valer desde já, sem esperar a Fase 6 — spec seção 5.4
  é absorvida antecipadamente, dentro de um desenho mais geral (três papéis, não só
  "Financeiro/Contábil" como caso especial).
- Nenhuma policy de INSERT/UPDATE/DELETE nova é aberta em `usuarios_fazendas` para
  `authenticated`/`anon` — a garantia central do ADR-0001 (RLS default-deny nessa tabela) é
  preservada integralmente, só o **caminho de escrita controlado** cresce (mais funções, não
  mais policies abertas).
- `convites` nasce seguindo a mesma disciplina (zero policy de INSERT/UPDATE/DELETE para
  client) desde o primeiro dia, em vez de precisar de uma correção reativa como aconteceu com
  `usuarios_fazendas` na Fase 1 — a lição do `cyber_chief` vira convenção aplicada
  preventivamente, não descoberta de novo.
- `handle_new_user()` ganha um único branch novo (convite presente ou não), sem duplicar
  lógica entre o caminho "usuário pré-criado pela Admin API" e "usuário via `signUp()` do
  form" — ambos disparam o mesmo trigger.

**Negativas / trade-offs aceitos:**
- Mais quatro funções `SECURITY DEFINER` em PL/pgSQL para a equipe manter e revisar em par
  (Alex/Sofia), além de `handle_new_user()`. Superfície de código sensível cresce
  proporcionalmente à funcionalidade nova — esperado, não um desvio de plano.
- Envio de e-mail de convite depende de uma Edge Function nova (`enviar-convite`), com
  `service_role` — precisa de revisão de segurança própria do `cyber_chief` antes de entrar em
  produção (revalidação de JWT do chamador, nunca confiar em `fazenda_id`/`papel` vindos do
  corpo da requisição — mesma cautela já registrada no ADR-0001 para a Alternativa 2 rejeitada
  lá).
- Convite para usuário novo, se o token vier inválido/expirado, **bloqueia o signup** com erro
  explícito (ao contrário do fallback silencioso que o ADR-0001 escolheu para `nome_fazenda`).
  É uma escolha deliberada — ver justificativa em D2 — mas é um comportamento que Ryan precisa
  implementar com mensagem de erro clara no formulário (não repetir o padrão de "erro genérico
  do GoTrue" que o ADR-0001 já sinalizou como fraqueza).

**Riscos a monitorar:**
- `promover_papel` sem hierarquia especial (decisão 2 de JP) significa que qualquer admin pode
  rebaixar qualquer outro admin (inclusive o criador original da fazenda) — comportamento
  intencional, mas deve ser comunicado claramente na UI ("qualquer admin tem os mesmos
  poderes") para não surpreender o criador original da fazenda.
- Usuário convidado via `admin.inviteUserByEmail` que tentar se cadastrar de novo pelo
  formulário público de signup (em vez de clicar o link do convite) vai receber erro "e-mail
  já cadastrado" do GoTrue, porque a linha em `auth.users` já existe (não confirmada) desde o
  momento em que o convite foi criado — comportamento correto, mas precisa de mensagem de
  erro/orientação adequada no frontend (Ryan) para não parecer um bug.
- Sem job de expiração ativo (`status = 'expirado'` nunca é setado automaticamente nesta
  decisão) — convites vencidos continuam com `status = 'pendente'` no banco, só ficam
  inutilizáveis porque `aceitar_convite`/`handle_new_user()` checam `expires_at > now()` no
  momento do uso. Suficiente para o MVP; se a UI precisar distinguir visualmente "pendente" de
  "vencido" sem essa checagem redundante no client, um job periódico (`pg_cron` ou Edge
  Function agendada) que faz `UPDATE convites SET status = 'expirado' WHERE status =
  'pendente' AND expires_at < now()` é uma extensão futura simples, não decidida aqui.

## [CRITÉRIOS DE REVISÃO]

Esta decisão deve ser revisada se:

1. Surgir necessidade de um papel adicional além de `admin`/`membro`/`financeiro`, ou de
   permissões granulares dentro de um papel (ex.: "financeiro com acesso a X mas não a Y") —
   nesse ponto, `papel` como `text` único pode não ser suficiente e o modelo pode precisar de
   uma tabela de permissões separada.
2. For necessário permitir que um usuário sem papel `admin` cancele/reenvie o próprio convite
   pendente que ele mesmo recebeu (hoje só quem criou o convite/admin da fazenda pode
   cancelar) — mudaria as policies de SELECT e possivelmente adicionaria uma função nova.
3. O volume de convites justificar um job de expiração ativo (ver Riscos a monitorar) em vez
   da checagem `expires_at > now()` feita só no momento de uso.
4. A Edge Function `enviar-convite` precisar lidar com reenvio em massa/rate limiting — fora
   do escopo deste ADR, que assume volume baixo (convite manual, um admin por vez).
