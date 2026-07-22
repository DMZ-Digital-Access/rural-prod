# Log — Papel "admin do software" + tela de controle do prompt/schema de OCR — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** JP pediu uma ferramenta pra controlar o prompt de extração e o schema JSON de
  saída usados por `classificar-documento` (hoje hardcoded em `logica.ts`). Ao decidir quem
  poderia editar essa tela, ficou explícito que tanto ela quanto a tela já existente "Modelo de
  IA" devem ser acessíveis **só ao admin do software** — o admin de cada fazenda/conta perde
  acesso a ambas. O sistema não tinha nenhum conceito de permissão que independesse de fazenda
  (confirmado por busca em todo o frontend/backend) — esta tarefa cria esse primeiro nível.

## O que foi feito

**Novo papel de sistema** (`usuarios.papel_sistema`, migration `20260722110000`): `usuario` |
`admin_software`, independente de `usuarios_fazendas.papel` (que continua sendo o "papel na
fazenda": admin/membro/financeiro, inalterado). Helper `public.is_admin_software()` (SQL,
`security invoker`, `search_path=''`) reaproveitável em qualquer RLS/trigger futuro.

**Achado crítico fechado na mesma migration:** a policy `usuarios_update_own` autoriza UPDATE
sem restrição de coluna — sem guarda, qualquer usuário poderia se autopromover via
`update usuarios set papel_sistema = 'admin_software' where id = auth.uid()`. Estendida a guarda
já existente `prevent_usuarios_identity_change()` (mesma função que já protege
`id`/`email`/`created_at` desde o gate de 2026-07-16) para também bloquear `papel_sistema`.

**Retrofit de `fazendas.llm_provider/llm_model`** (migration `20260722120000`): o trigger
`restringir_alteracao_config_llm()` passou a exigir `is_admin_software()` em vez de
`papel = 'admin'` na fazenda — decisão explícita de JP de centralizar essa configuração.

**Tabela nova `configuracao_extracao_lancamentos`** (migration `20260722130000`) — singleton
global (`id boolean primary key default true check (id)`, no máximo 1 linha), sem `fazenda_id`
(é a mesma extração pra todo o sistema, diferente do modelo/provedor que é por fazenda). SELECT
liberado a todo `authenticated` (todo usuário precisa ler pra sua própria extração funcionar);
UPDATE restrito a `is_admin_software()`. Seed com o EXATO prompt/schema hoje hardcoded — sem
mudança de comportamento até alguém editar pela tela nova.

**Edge Function `classificar-documento`:** `montarChamadaGemini()` passou a receber
`prompt`/`schema` como parâmetros em vez de ler constantes do módulo; `index.ts` busca a config
via o client "do usuário" (mesmo padrão já usado pra ler `fazendas`). `extrairCamposDaResposta()`
não mudou — resiliente por design: se um admin remover/renomear um campo do schema, esse campo
específico volta `null` na extração, nunca quebra a function.

**Frontend:** hooks novos `useSouAdminSoftware`/`useConfiguracaoExtracaoLancamentos`, página nova
`ConfiguracaoExtracaoIaPage.tsx` (editor de JSON livre pro schema, validado com zod antes de
salvar — decisão de JP: JSON cru, não um construtor de campos), retrofit de
`ConfiguracaoIaPage.tsx` (bloqueio TOTAL pra quem não é admin do software, não mais só inputs
desabilitados), `AppShell.tsx` (primeiro item de nav com branching condicional por papel do
projeto — "Modelo de IA"/"Prompt de Extração (IA)" somem pra quem não é admin do software).

## Achado real durante a validação — backfill errado

A migration original mirou `jp@natux.group` (email de trabalho de JP) como primeiro
`admin_software` — mas esse e-mail não existe como usuário cadastrado neste ambiente
(confirmado por `select email from usuarios`, só existem contas de teste). Corrigido com
migration aditiva `20260722140000` mirando `jp.teste.livestock@gmail.com` (a conta realmente
usada em toda validação funcional da sessão).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, incluindo os 2 testes de `montarChamadaGemini`
  ajustados pro novo argumento prompt/schema.
- **Verificação de segurança direta no banco** (psql simulando sessão autenticada via
  `request.jwt.claims`, 6 cenários, todos com o resultado esperado):
  1. Usuário comum tenta se autopromover a `admin_software` → **ERRO** (guarda de imutabilidade).
  2. Admin de fazenda (não admin do software) tenta editar `llm_provider` → **ERRO**.
  3. Admin de fazenda tenta editar `configuracao_extracao_lancamentos` → **0 linhas afetadas**
     (RLS).
  4. Qualquer `authenticated` lê `configuracao_extracao_lancamentos` → **sucesso** (1 linha).
  5. `admin_software` de fato edita `llm_provider` → **sucesso**.
  6. `admin_software` de fato edita `configuracao_extracao_lancamentos` → **sucesso**.
- **Teste funcional real via Playwright contra o Supabase remoto**, logado como
  `jp.teste.livestock@gmail.com` (agora `admin_software`): as 2 telas carregam com dado real,
  prompt/schema editados e persistidos após reload (depois restaurados ao valor original — sem
  lixo de teste na config real), JSON inválido no schema bloqueado com mensagem clara sem
  quebrar a página.
- **Limitação honesta:** não foi possível validar via Playwright o caso negativo (nav escondendo
  os itens e bloqueio "sem acesso" pra um usuário NÃO admin do software) com uma conta nova —
  o projeto tem confirmação de e-mail habilitada no Supabase remoto, e não havia credencial de
  uma conta de teste existente sem `admin_software` disponível. A garantia real (RLS/trigger no
  banco) foi validada diretamente; o código frontend usa o mesmo padrão condicional já provado
  funcionando no caso positivo (`souAdminSoftwareQuery.data === true`, fail-closed por padrão
  enquanto carrega ou se `false`), então o risco residual é baixo, mas fica registrado como não
  100% coberto por teste end-to-end.

## Gate do `cyber_chief`

Não rodado como gate formal separado nesta tarefa (a guarda de autopromoção e as RLS novas foram
desenhadas já seguindo os padrões que o `cyber_chief` exige — `search_path=''`, `security
invoker`, defesa em profundidade via trigger — e verificadas empiricamente acima). Recomendo
incluir esta tarefa no escopo do próximo gate formal, dado que introduz um conceito de permissão
novo no projeto.
