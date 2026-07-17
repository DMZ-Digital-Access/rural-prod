# Log — Security Review do ADR-0002 (migration convites/papéis + Edge Function enviar-convite)

- **Data:** 2026-07-16
- **Agente responsável:** cyber_chief (CONSTANTINE) — gate de segurança obrigatório antes de
  `supabase db push`/`supabase functions deploy`, atribuído pelo próprio ADR-0002 ("precisa de
  revisão de segurança própria do cyber_chief antes de entrar em produção") e pelo padrão de
  processo já usado na Fase 1.
- **Tipo de tarefa:** Security review formal de dois artefatos ainda não aplicados/deployados,
  com correção direta nos arquivos (não migration/patch separado — nada foi aplicado a nenhum
  ambiente ainda).
- **Escopo:** `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` (4 funções
  `SECURITY DEFINER`, tabela `convites`, RLS, `handle_new_user()` atualizada) +
  `supabase/functions/enviar-convite/{index.ts,logica.ts}`. Nenhuma outra migration/function
  tocada.

## O que foi lido antes da análise

1. `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` — decisão completa (D1–D4) que os
   dois artefatos implementam.
2. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` — meu próprio review anterior
   (achado de elevação de privilégio na policy de UPDATE de `usuarios_fazendas`, triggers de
   imutabilidade, `search_path`). Piso mínimo de rigor para este gate, não o teto.
3. `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — revisado linha a linha.
4. `supabase/functions/enviar-convite/{index.ts,logica.ts}` e o log do `developer`
   (`.agents/memory/log/2026-07-16-developer-edge-function-convite.md`), que já sinalizava 3
   riscos para avaliação formal.
5. `supabase/config.toml` — para avaliar a probabilidade real (não só teórica) de um dos
   achados abaixo, checando quais provedores de auth estão habilitados hoje neste projeto.

---

## [SECURITY ANALYSIS]

**Componente:** `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` +
`supabase/functions/enviar-convite/{index.ts,logica.ts}`

**Status (após correções aplicadas nesta revisão):** 🟢 Seguro

**Status antes das correções (como recebido):** 🔴 Risco Crítico — havia um caminho real de
bypass de autorização (achado nº 1 abaixo) na função que decide quem entra em qual fazenda com
qual papel. Não é um risco "latente atrás de uma constraint", como o achado da Fase 1 — é um bug
de lógica ternária do próprio SQL, ativável no momento em que qualquer provedor de auth sem
claim de e-mail garantido (telefone, sign-in anônimo, alguns OAuth) for habilitado, algo que
depende só de uma configuração no dashboard/`config.toml`, não de nenhuma mudança de schema.

---

### [VULNERABILIDADES IDENTIFICADAS]

**1. `aceitar_convite()` e `handle_new_user()` — bypass de autorização via NULL em comparação
SQL de três valores (CWE-354/CWE-863, Authorization Bypass)**

- **Impacto:** Crítico | **Probabilidade:** Zero hoje neste projeto espeficamente / Certa no dia
  em que `enable_anonymous_sign_ins` ou `auth.sms.enable_signup` (ambos hoje `false` em
  `supabase/config.toml`) forem habilitados, ou um provedor OAuth sem e-mail garantido for
  adicionado — nenhuma mudança de schema necessária para ativar.
- **Classificação:** STRIDE = Elevation of Privilege. OWASP A01 (Broken Access Control), CWE-354
  (Improper Validation of Integrity Check) / padrão clássico de "NULL bypass" em checagem de
  autorização baseada em comparação SQL.
- **Achado:** a checagem de destinatário em `aceitar_convite()` era
  `if lower(a) <> lower(b) and (... or ...) then raise exception`. Em SQL/PL-pgSQL, qualquer
  comparação com `NULL` usando `<>`/`=` avalia para `NULL` (lógica trivalente), e um `IF NULL
  THEN` em PL/pgSQL é tratado como `FALSE` — ou seja, **a exceção não dispara**. Se
  `auth.email()` retornasse `NULL` (usuário autenticado por um provedor sem claim de e-mail),
  qualquer convite pendente com `convidado_usuario_id` ainda não resolvido seria aceitável por
  **qualquer** chamador autenticado, com o papel oferecido no convite (inclusive `'admin'`) —
  elevação de privilégio vertical completa, sem nenhuma correspondência real de identidade. O
  mesmo padrão exato existia em `handle_new_user()` comparando contra `new.email`: se a linha de
  `auth.users` fosse criada sem e-mail, o branch de convite entraria na fazenda sem checar
  destinatário algum.
- **DREAD:** Damage altíssimo quando ativo (entrada não autorizada em qualquer fazenda, com
  papel arbitrário) / Reproducibility alta (basta um provedor de auth sem e-mail estar
  habilitado) / Exploitability alta (nenhuma ferramenta especial, só uma sessão autenticada sem
  claim de e-mail) / Affected users: potencialmente qualquer fazenda com convite pendente não
  pré-resolvido / Discoverability média (exige ler o código da função, mas o padrão é comum o
  suficiente para ser reconhecido por um pentester).
- **Por que classifiquei como 🔴 antes da correção, diferente do achado equivalente da Fase 1**
  (que ficou em 🟡 por haver uma barreira real, a `CHECK` constraint, ainda que frágil): aqui não
  havia barreira nenhuma além de uma configuração de projeto (`enable_anonymous_sign_ins`,
  `auth.sms.enable_signup`) que qualquer pessoa com acesso ao dashboard Supabase pode alternar
  sem tocar em código ou schema — não é "vai quebrar na Fase 6", é "quebra a qualquer momento que
  alguém habilitar login por telefone", uma decisão de produto plausível e comum, totalmente fora
  do controle desta migration.
- **Mitigação aplicada:** reescrita das duas checagens com variáveis booleanas explicitamente
  NULL-safe — `v_email_bate := auth.email() is not null and lower(a) = lower(auth.email())` (e
  equivalente para `v_uuid_bate`), com `if not (v_email_bate or v_uuid_bate) then raise
  exception`. `NULL` nunca avalia como verdadeiro em nenhum dos dois lados agora. Em
  `handle_new_user()`: `if new.email is null or lower(a) <> lower(new.email) then raise
  exception` — `new.email is null` checado explicitamente primeiro, fail-safe.

**2. `promover_papel()` — condição de corrida (TOCTOU) na guarda "a fazenda nunca fica sem
admin"**

- **Impacto:** Alto (perda de acesso administrativo total a uma fazenda — nenhum usuário
  consegue mais promover ninguém, exige intervenção manual via `service_role`/suporte) |
  **Probabilidade:** Baixa (exige duas chamadas RPC verdadeiramente concorrentes rebaixando dois
  admins diferentes da mesma fazenda no mesmo instante), mas não nula — é exatamente o cenário
  que a própria pergunta do gate levantou, e o app permite múltiplos admins por fazenda por
  design (ADR-0002, decisão 2 de JP).
- **Classificação:** STRIDE = Denial of Service (operacional, não de disponibilidade de
  infraestrutura) via TOCTOU (Time-of-Check to Time-of-Use), CWE-367.
- **Achado:** a guarda original contava admins restantes com um `SELECT COUNT(*)` simples, sem
  lock. Sob `READ COMMITTED` (isolamento padrão do Postgres), duas transações concorrentes que
  rebaixam **dois admins diferentes** da mesma fazenda (cenário mínimo: fazenda com exatamente 2
  admins, X e Y; uma chamada rebaixa X, outra rebaixa Y, simultaneamente) não enxergam a mudança
  uma da outra até o commit — cada uma conta "1 admin restante" (o outro, ainda não commitado) e
  **ambas passam pela guarda**, deixando a fazenda com **zero admins** depois que as duas
  commitarem. A guarda funciona perfeitamente para o caso sequencial (uma chamada de cada vez) —
  o bug só se manifesta sob concorrência real, exatamente o motivo de o ADR/o gate pedirem essa
  verificação explicitamente.
- **Mitigação aplicada:** `perform 1 from usuarios_fazendas where fazenda_id = p_fazenda_id and
  papel = 'admin' for update;` antes da contagem — trava todas as linhas admin da fazenda. A
  segunda transação concorrente bloqueia nesse `for update` até a primeira commitar; ao ser
  liberada, reavalia o `WHERE` contra o dado já committed (papel de X já alterado), então a
  contagem seguinte reflete a realidade e a guarda bloqueia corretamente a segunda operação.
  Custo desprezível (volume de chamadas administrativas é baixo).

**3. `convites_select_convidado` — inconsistência de case-sensitivity (achado menor, correção
por consistência, não por exploração)**

- **Impacto:** Baixo (falha para o lado seguro — under-permissive, não over-permissive) |
  **Probabilidade:** Depende de comportamento não garantido de normalização de e-mail do
  GoTrue/provedor.
- **Achado:** a policy comparava `convidado_email = auth.email()` sem `lower()`, enquanto
  `convidado_email` é sempre normalizado para minúsculas em `criar_convite()` e toda comparação
  equivalente em PL/pgSQL (`aceitar_convite()`, `handle_new_user()`) já usa `lower()` nos dois
  lados. Se `auth.email()` retornar o e-mail com capitalização diferente da usada no convite, o
  convidado simplesmente não veria seu próprio convite pendente via `SELECT` — uma quebra de UX,
  não uma brecha de acesso (a política nunca ficou mais permissiva, só mais restritiva do que o
  necessário).
- **Mitigação aplicada:** `lower(convidado_email) = lower(auth.email())`, alinhado com o resto
  do desenho.

---

### [OUTROS PONTOS REVISADOS — SEM ACHADO]

- **`aceitar_convite()` — corrida de double-accept do mesmo token:** o `for update` no `SELECT`
  do convite serializa corretamente duas chamadas concorrentes com o **mesmo** token (a segunda
  bloqueia até a primeira commitar, e ao ser liberada vê `status = 'aceito'`, rejeitando). A
  checagem de "já vinculado" em `usuarios_fazendas` (tabela diferente, sem lock direto) é segura
  porque a **correção de fato** vem da `unique (usuario_id, fazenda_id)` já existente desde a
  Fase 1 (confirmado em `20260716171522_fase1_usuarios_fazendas.sql:228`) combinada com `ON
  CONFLICT DO NOTHING` + checagem de existência pós-insert — mesmo que duas transações
  concorrentes (ex.: dois convites diferentes para a mesma pessoa/fazenda) passem ambas pela
  checagem inicial, a constraint do banco serializa o insert real, e a checagem pós-insert
  detecta e trata o caso corretamente (nunca duplica vínculo, nunca finaliza com falso sucesso).
- **`criar_convite()`/`cancelar_convite()`:** checagem de admin imperativa, correta, sem
  contornos. `cancelar_convite()` é idempotente por design (`where status = 'pendente'`).
- **`handle_new_user()` — forjar convite_token de outra fazenda/e-mail:** o token é um `uuid`
  gerado server-side (`gen_random_uuid()`, 122 bits de entropia) — não adivinhável. Um usuário
  malicioso não consegue "criar" um convite válido para si mesmo nem reutilizar um convite de
  outro e-mail (bloqueado pela comparação `new.email`, agora NULL-safe). Não há caminho para
  usar um convite_token de terceiro sem também controlar a caixa de e-mail correspondente.
- **RLS de `convites` — vazamento de informação:** ambas as policies de SELECT (`convites
  _select_admin`, `convites_select_convidado`) são estritamente escopadas — admin só vê convites
  das fazendas onde é admin; convidado só vê convites endereçados a ele. Nenhum campo (`token`,
  `papel_oferecido`, `convidado_email`) precisa de restrição adicional: o convidado precisa ver o
  `token` (é assim que a UI mostra a tela de aceite) e o `papel_oferecido` (precisa saber para
  que papel está sendo convidado antes de aceitar); o admin precisa ver os mesmos campos para
  gerenciar/reenviar convites da própria fazenda. Nenhuma policy permite enumeração de convites
  por terceiros — sem policy que aceite `token` como único predicado de leitura, não há oráculo
  de adivinhação.
- **Zero policy de INSERT/UPDATE/DELETE em `convites`/`usuarios_fazendas` para
  `authenticated`/`anon`:** confirmado — todas as escritas passam exclusivamente pelas 4 funções
  `SECURITY DEFINER`. Generaliza corretamente a correção que apliquei na Fase 1.
- **`search_path = ''` + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` (nunca
  `anon`):** presente e correto nas 4 funções novas e em `handle_new_user()`. Todas as
  referências a tabela são schema-qualificadas (`public.xxx`).
- **Edge Function `enviar-convite` — revalidação de permissão (`chamadorEhAdminDaFazenda`):**
  revisada linha a linha. O `fazenda_id` usado na checagem de admin vem sempre do convite lido do
  banco (`convite.fazenda_id`, passo 3 do handler), nunca do corpo da requisição — o único campo
  aceito do corpo é `convite_id`. Nenhum IDOR: um chamador que não é admin da fazenda do convite
  recebe 403 mesmo tendo um `convite_id` válido; a ausência de `.single()`/`for update` na query
  de `usuarios_fazendas` não abre janela relevante porque esta função **nunca escreve** em
  `convites`/`usuarios_fazendas` — só lê e delega toda mutação de estado às funções
  `SECURITY DEFINER` do Postgres (concorrência entre duas chamadas de `enviar-convite` para o
  mesmo convite, no pior caso, dispara `inviteUserByEmail` duas vezes, não duplica vínculo).
  Confirmo a avaliação do `developer` neste ponto.
- **Autenticação via `auth.getUser()`:** correto — nunca decodifica o JWT manualmente, delega ao
  client oficial que valida assinatura/expiração contra o GoTrue.

---

### [AVALIAÇÃO DOS 3 RISCOS SINALIZADOS PELO `developer`]

1. **CORS cai para `*` quando `APP_URL` ausente — NÃO bloqueante.** Autenticação desta função é
   via header `Authorization` (Bearer token), nunca cookie — CORS aberto não permite que um site
   de terceiro "empreste" a sessão ambiente do usuário; um atacante já precisaria ter o token
   para explorar isso, e nesse caso não precisaria de CORS algum (chamaria a API diretamente).
   Ainda assim, adicionei um `console.warn` em `index.ts`, emitido a cada request quando
   `APP_URL` está ausente, para que a ausência dessa variável fique visível nos logs de produção
   em vez de passar despercebida silenciosamente — decisão operacional, não uma falha de
   autorização.
2. **Branch de e-mail para usuário já cadastrado só loga a URL — NÃO bloqueante para este gate
   (é lacuna funcional/produto, não vulnerabilidade).** A URL de aceite logada não é, por si só,
   uma credencial suficiente: `aceitar_convite(token)` sempre revalida que o chamador autenticado
   é o destinatário correto (e-mail ou uuid), então mesmo que alguém com acesso aos logs do
   projeto Supabase capture o token, não consegue aceitar o convite se não for a pessoa
   correspondente. O maior risco real aqui é de produto (o convidado não tem como descobrir o
   convite) — mas mitigado parcialmente: um usuário já cadastrado pode ver seus próprios convites
   pendentes fazendo `SELECT` em `convites` (via `convites_select_convidado`, RLS), então a UI
   pode (e deveria) mostrar uma tela de "convites pendentes" para quem já está logado,
   independente do e-mail ter sido enviado ou não. Recomendo ao `developer`/produto expor essa
   tela antes de considerar o fluxo "convite para usuário existente" pronto para uso real, mas
   isso não bloqueia o deploy da function em si.
3. **Cobertura de teste só da lógica pura — NÃO bloqueante para este gate.** Revisão manual linha
   a linha (feita aqui) confirma que a lógica de autorização está correta. Recomendo fortemente
   ao `qa` (Emma) um teste de integração real (Supabase local + `supabase functions serve`) antes
   do fluxo ir a usuários reais, mas a ausência de teste automatizado do handler HTTP completo
   não é, por si, uma vulnerabilidade — é uma lacuna de confiança/verificação.

---

### [VERIFICAÇÃO DE DADOS]

- **Criptografia em repouso:** sim (padrão Supabase/Postgres gerenciado).
- **Criptografia em trânsito:** sim (padrão Supabase — TLS obrigatório).
- **RLS / Controle de acesso:** válido, após correções. Antes das correções: **inválido** — a
  checagem de destinatário do convite (a barreira central de autorização de duas das quatro
  funções `SECURITY DEFINER`) tinha um caminho de bypass silencioso sob uma condição de dado
  (e-mail nulo) que nenhuma constraint do schema impedia de ocorrer, e que depende só de
  configuração de projeto para se tornar alcançável. Depois das correções: as duas checagens são
  NULL-safe por construção (nunca avaliam para verdadeiro-por-omissão), e a guarda operacional de
  `promover_papel()` é robusta contra concorrência real, não só contra o caso sequencial.

---

### [NOTAS DO CONSTANTINE]

- "Se não corrigirmos a checagem de e-mail de `aceitar_convite()`/`handle_new_user()` agora, o
  dia em que alguém habilitar login anônimo ou por telefone neste projeto — uma decisão de
  produto plausível, não uma mudança de schema — é o mesmo dia em que qualquer sessão autenticada
  sem e-mail vira passe livre para entrar em qualquer fazenda com convite pendente, no papel que
  o convite oferecer, inclusive `admin`. Isso não é uma corrida de baixa probabilidade — é um
  `if NULL then` que nunca dispara, e o SQL não avisa."
- "A guarda de `promover_papel()` estava certa para o caso feliz e errada para o caso que
  realmente importa em um sistema com múltiplos admins por design: dois admins agindo ao mesmo
  tempo. Uma guarda de integridade que só funciona quando ninguém mais está usando o sistema no
  mesmo instante não é uma guarda — é um `TOCTOU` esperando o volume de uso certo para aparecer."
- "Os três riscos que o Ryan já tinha sinalizado foram avaliados com o mesmo rigor que os achados
  que eu mesmo encontrei — nenhum deles é uma vulnerabilidade de autorização, e é por isso que
  nenhum bloqueia este gate. Bloquear teria sido inflar a severidade só para parecer rigoroso;
  não bloquear teria sido não avaliar de verdade. Documentei os dois casos por igual."

---

## Correções aplicadas

Todas diretamente nos arquivos (nenhum aplicado a ambiente real — migration não pushada, function
não deployada):

**`supabase/migrations/20260716183000_adr0002_convites_papeis.sql`:**

1. **`aceitar_convite()`** — checagem de destinatário reescrita com variáveis `v_email_bate`/
   `v_uuid_bate` explicitamente NULL-safe, fechando o bypass de autorização do achado nº 1.
2. **`handle_new_user()`** — checagem `new.email is null or lower(...) <> lower(new.email)`,
   mesma correção aplicada ao branch de convite do trigger de signup.
3. **`promover_papel()`** — `perform ... for update` nas linhas admin da fazenda antes de contar
   quantos admins restariam, fechando a corrida TOCTOU do achado nº 2.
4. **`convites_select_convidado`** — `lower()` nos dois lados da comparação de e-mail (achado
   nº 3, consistência).
5. **Comentário de cabeçalho da migration** atualizado: "Revisão de segurança: PENDENTE" →
   "CONCLUÍDA", com resumo das 3 correções e link para este log.

**`supabase/functions/enviar-convite/index.ts`:**

6. **`console.warn`** emitido a cada request quando `APP_URL` está ausente, tornando a
   configuração faltante visível em logs de produção (risco 1 do `developer`, não bloqueante mas
   endurecido).

Nenhuma mudança de comportamento funcional esperado pela aplicação em nenhum dos casos — todas as
correções fecham um caminho de bypass/corrida que nunca deveria ter sido alcançável pelo uso
legítimo do sistema, ou adicionam visibilidade operacional.

## Pendências / próximos passos (não bloqueantes para este gate)

- **`qa` (Emma):** teste de integração real do handler HTTP completo de `enviar-convite`
  (Supabase local + `supabase functions serve`) — recomendado pelo `developer`, endossado aqui.
  Também recomendo caso de teste explícito para a correção do achado nº 1 (chamar
  `aceitar_convite()`/simular `handle_new_user()` com `auth.email()`/`new.email` nulo, confirmar
  que a exceção dispara) e para o achado nº 2 (duas chamadas concorrentes de `promover_papel()`
  rebaixando dois admins diferentes da mesma fazenda com exatamente 2 admins, confirmar que uma
  delas falha).
- **`devops`:** decidir o provedor de e-mail transacional para convite a usuário já cadastrado
  (`enviarEmailConvite()` em `logica.ts`, `TODO(devops)` explícito) e configurar `APP_URL` via
  `supabase secrets set` antes do deploy em produção.
- **`developer`/produto:** considerar expor uma tela de "convites pendentes" para usuários já
  logados (usa `convites_select_convidado` via RLS), mitigando a lacuna funcional do branch de
  e-mail placeholder mencionada na avaliação do risco 2 acima.
- **Migration liberada para aplicação** (`supabase db push`) e **Edge Function liberada para
  deploy** (`supabase functions deploy`) do ponto de vista deste gate — decisão de quando aplicar
  continua sendo humana/orchestrator, fora do escopo desta revisão.

## Mudanças de arquivo

- `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — editado (ver "Correções
  aplicadas" acima).
- `supabase/functions/enviar-convite/index.ts` — editado (warning de `APP_URL` ausente).
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, seção 1 e seção 4
  atualizadas.
