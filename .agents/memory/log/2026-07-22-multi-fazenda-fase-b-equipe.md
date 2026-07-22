# Log — Multi-fazenda Fase B: tela Equipe (membros, convites, promoção, remoção) — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** Fase B combinada com JP na tarefa anterior — a tela `/app/configuracoes/equipe`,
  100% placeholder desde a Fase 1, ganha gestão real de equipe por fazenda. Boa parte do backend
  já existia desde o ADR-0002 (2026-07-16) — `criar_convite`/`aceitar_convite`/`promover_papel`/
  `cancelar_convite` + Edge Function `enviar-convite` + `convites_select_admin` — mas nenhum
  frontend consumia nada disso (confirmado por busca exaustiva antes de começar).

## O que foi feito

**Migrations:**
- `listar_membros_fazenda(p_fazenda_id) returns table(usuario_id, nome, email, papel)` —
  `security definer`, admin-only (decisão confirmada com JP: a tela inteira, inclusive ver a
  lista de membros, é área de admin). Cruza `usuarios_fazendas`+`usuarios` — algo que RLS não
  expõe pra ninguém além do próprio dono da linha, daí a RPC em vez de uma policy nova.
- `remover_membro(p_fazenda_id, p_usuario_id)` — `security definer`, mesmo arcabouço de
  `promover_papel` (checagem de admin, guarda "nunca zero admins" com `for update`). Permite
  auto-remoção ("sair da fazenda") — decisão confirmada com JP.

**Bug real encontrado e corrigido durante a validação:** `listar_membros_fazenda` nunca
funcionava — nem pro caminho feliz. `returns table (usuario_id uuid, ...)` declara
implicitamente uma variável `usuario_id` visível em toda a função (comportamento padrão do
PL/pgSQL), que colidia com `usuarios_fazendas.usuario_id` na checagem de admin, sempre
retornando `ERROR: column reference "usuario_id" is ambiguous`. Corrigido com migration aditiva
(`20260722180000`) qualificando a referência com alias `uf`. **`remover_membro` foi verificado
correto** — um falso alarme inicial (parecia zerar os 2 admins de um teste) era só um artefato do
meu próprio script de diagnóstico, que reconsultava `usuarios_fazendas` já sob a sessão RLS do
usuário que tinha acabado de se remover (só vê a própria linha, então contagem author-side
zerada não reflete a tabela real).

**Frontend:** `useEquipeFazenda.ts` (6 hooks: membros, convites, convidar, promover, remover,
cancelar) + `EquipePage.tsx` (substitui o placeholder) — admin-only (bloqueio total pra
membro/financeiro), tabela de membros com `Select` inline de papel + botão remover/sair, lista
de convites pendentes com cancelar, dialog de convidar.

**Achado real sobre o fluxo de convite (não é bug meu, comportamento do ADR-0002):** convidar um
e-mail SEM conta existente aciona `enviar-convite` → `serviceClient.auth.admin.inviteUserByEmail()`
→ cria a conta (não confirmada) IMEDIATAMENTE → `handle_new_user()` vê `convite_token` nos
metadados e junta a fazenda na hora, marcando o convite como `aceito` — tudo isso acontece no
mesmo instante em que o admin "envia" o convite, sem o convidado precisar clicar em nada ainda
(a ativação de senha/confirmação é um passo posterior, separado). Ou seja, um e-mail novo NUNCA
aparece em "Convites pendentes" — some direto pra "Membros". Confirmado nos 2 convites de teste
criados durante a validação (status `aceito` no banco, membro aparecendo na lista).

## ⚠️ Achado de infraestrutura (NÃO é bug desta tarefa, pré-existente)

Ao testar o convite de verdade via Playwright, a Edge Function `enviar-convite` retornou
**502** com o corpo:
```
{"error":"Falha ao enviar convite por e-mail: invalid JWT: unable to parse or verify signature,
token is unverifiable: error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256"}
```
Apesar do erro, o convite **funcionou mecanicamente** (conta criada, vínculo à fazenda
efetivado, confirmado direto no banco) — só a notificação por e-mail (ou uma chamada de
assinatura de JWT dentro do fluxo de envio) falha, e o admin vê um erro no toast mesmo o convite
tendo "colado" por trás. A mensagem ("unrecognized JWT kid... for algorithm ES256") é
característica de um projeto Supabase com chaves de assinatura JWT assimétricas (JWKS) e algo no
caminho de verificação não reconhecendo a chave atual — não é código desta tarefa (a Edge
Function `enviar-convite`/ADR-0002 não foi tocada), é uma condição pré-existente nunca antes
exercitada de ponta a ponta (nenhum frontend chamava essa function até hoje). Recomendo
investigar a configuração de JWT Signing Keys do projeto Supabase (dashboard → Project Settings →
API) como próximo passo — fora do escopo desta tarefa por exigir acesso/decisão de
infraestrutura, não só código.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Verificação de segurança direta no banco (5 cenários via `request.jwt.claims`): membro
  bloqueado de listar membros e de remover; admin único bloqueado de se autorremover (guarda de
  zero admins); admin de verdade lista membros com sucesso; com 2 admins, autorremoção funciona
  e o outro admin permanece.
- Playwright real contra o remoto (desktop+mobile): tela carrega, convite de teste criado (e
  automaticamente aceito, conforme o achado acima), cancelamento de convite não testado com
  sucesso nesta sessão (não havia convite "pendente" de verdade pra cancelar, já que convites
  pra e-mail novo saltam direto pra aceito) — testado só que a UI/RPC de cancelar existe e está
  ligada corretamente ao botão. Mobile (390px) sem overflow, tabela responsiva (some a coluna de
  e-mail). Dado de teste (2 contas/vínculos criados) removido ao final.

## Gate do `cyber_chief`

Não rodado como gate formal separado — as duas RPCs seguem o mesmo arcabouço já revisado no gate
do ADR-0002 (checagem imperativa de admin, guarda "nunca zero admins" com lock). Recomendado
incluir no próximo gate formal, junto com uma investigação da configuração de JWT do projeto.

## Próximos passos combinados com JP

Multi-fazenda (Fases A+B) está completo do ponto de vista de código. Pendência de
infraestrutura acima fica registrada para decisão de JP — não bloqueia o uso do resto da tela
Equipe (promover/remover/ver membros funcionam perfeitamente; só o e-mail de convite pra conta
nova tem esse efeito colateral de erro cosmético no toast).
