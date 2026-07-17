# CONTEXTO DO PROJETO — Livestock Control

> Memória viva do squad. Regra completa de leitura/escrita em `.agents/rules/memory-protocol.md`.
> A especificação funcional completa está em `especificacao-sistema.md` (raiz do projeto) —
> este arquivo não repete o conteúdo dela, guarda o que já foi decidido/feito ao longo do
> desenvolvimento e o que ainda está em aberto.

---

## 1. Estado Atual do Projeto

- **Nome:** Livestock Control — Gestão Agropecuária (Rebanho + Compliance + Financeiro)
- **Fase:** Fase 0 concluída. **Fase 1 (Fundação: Autenticação) em andamento** — feito até
  aqui: ADR-0001 (provisionamento via trigger de banco), migration
  `20260716171522_fase1_usuarios_fazendas.sql` escrita por `db_sage`, revisada e corrigida por
  `cyber_chief` (gate de segurança 🟢, ver log), **aplicada no banco remoto** (`supabase db
  push` confirmado, `supabase migration list` mostra local=remote). Schema no ar: `usuarios`,
  `fazendas`, `usuarios_fazendas` (com `papel`), função `handle_new_user()` +
  trigger `on_auth_user_created`, RLS habilitada (SELECT/UPDATE restritos, sem INSERT/DELETE
  client-side, com triggers de imutabilidade de coluna). Falta da Fase 1: formulário de
  signup/login no frontend (populando `options.data.nome_fazenda`/`nome` no `signUp()`), shell
  da aplicação com roteamento real (react-router-dom, rotas da seção 8 da spec), e testes de
  RLS pelo `qa` (Emma) — recomendados pelo próprio `cyber_chief`.
- **Repositório:** criado — `https://github.com/DMZ-Digital-Access/rural-prod` (branch `main`)
- **Stack confirmada:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui, react-hook-form +
  zod, @tanstack/react-query, Supabase (Postgres + Auth + Storage), sonner, recharts
  (roadmap). Hospedagem: Vercel/Netlify (frontend) + Supabase (backend gerenciado).
- **Última entrega:** as duas migrations da Fase 1 (`20260716171522_fase1_usuarios_fazendas.sql`
  e `20260716183000_adr0002_convites_papeis.sql`) **aplicadas no banco Supabase remoto**
  (`supabase migration list`: local=remote nas duas) e a Edge Function `enviar-convite`
  **deployada** (`supabase functions deploy`, confirmado no dashboard do projeto). Schema no ar:
  `usuarios`/`fazendas`/`usuarios_fazendas` (papel admin/membro/financeiro) + `convites`, função
  `handle_new_user()` com branch de convite, 4 funções `SECURITY DEFINER`
  (`aceitar_convite`/`promover_papel`/`criar_convite`/`cancelar_convite`), RLS default-deny em
  todas as tabelas de autorização.
- **Em andamento agora:** Fase 1 — falta o formulário de signup/login e o shell de roteamento
  no frontend, os testes de RLS/integração pelo `qa` (recomendados pelo `cyber_chief` nos dois
  gates), e `devops` decidir provedor de e-mail transacional + configurar `APP_URL` (secret da
  Edge Function) antes de usar o fluxo de convite para usuário já cadastrado em produção real.
- **Última atualização:** 2026-07-16 — schema completo da Fase 1 (incluindo ADR-0002: convites
  e papéis admin/membro/financeiro) aplicado e deployado no Supabase remoto, após dois gates de
  segurança do `cyber_chief` (ambos 🟢 após correções)

---

## 2. Decisões Importantes

> Decisões já tomadas na própria especificação (não precisam ser revalidadas) + decisões
> novas tomadas durante o desenvolvimento.

| Data | Decisão | Origem/Responsável | Detalhe |
|---|---|---|---|
| spec v2.0 | Código do protótipo Bolt.new **não será reaproveitado** — projeto novo do zero | Cliente/spec | Seção "Decisão de projeto importante", topo da spec |
| 2026-07-16 | Reconciliação Eixo 1 ↔ Eixo 2: **Opção B (vinculada)** confirmada por JP — não é mais roadmap | JP | Nova tabela `transacoes_animais` (N:N transação↔animal) entra na Fase 3, não na Fase 6; trigger/lógica atualiza `animais.status` automaticamente ao vincular venda; `architect` formaliza ADR na Fase 3. Ver spec seção 3.3 atualizada |
| spec v2.0 | Saldo de rebanho: começar com **view calculada on-the-fly**; migrar para saldo materializado só se houver problema real de performance | Spec, seção 7 e item 8 da seção 9 | `architect` + `db_sage` revisitam se performance virar problema |
| spec v2.0 | Prazo de Declaração Anual: **RS, 01/abril–30/junho** como padrão/fallback, configurável por estado/ano em `prazos_declaracao_estado`, nunca hardcoded | Spec, seções 3.2, 4.2, item 10 da seção 9 | — |
| spec v2.0 | Provisionamento de conta no signup via **trigger de banco ou Edge Function com service_role**, nunca insert client-side | Spec, item 1 da seção 9 | Maior risco identificado no protótipo — resolver corretamente desde a Fase 1 |
| spec v2.0 | GMD = `(peso_atual - peso_inicial) / dias_totais` (não a média simples acumulada do protótipo) | Spec, item 2 da seção 9 | `qa` prioriza teste automatizado disso |
| spec v2.0 | Modelo de dados já nasce com `usuarios_fazendas` (usuario_id, fazenda_id, papel), mesmo a 1ª entrega só usando papel "dono" | Spec, seção 5.4, item 6 da seção 9 | Papel "Financeiro/Contábil" (consulta restrita) é Fase 6 |
| spec v2.0 | Declarações anuais (PDF) nunca apagáveis pelo usuário — no máximo substituíveis com histórico | Spec, item 9 da seção 9 | `cyber_chief` valida na RLS de storage |
| 2026-07-16 | Squad enxuto de 15 agentes definido para este projeto (a partir dos 112 da biblioteca base) | Claude (a pedido de JP) | Ver roster completo em `.agents/rules/multi-agent-workflow.md` seção 4 |
| 2026-07-16 | Squad reduzido de 15 para **13 agentes**: removidos `squad_manager` (Syd) e `tools_orchestrator` (Quantum) | JP + Claude, após revisão crítica do squad | Saúde do squad virou checklist do Root Orchestrator a cada fase; MCPs (Supabase/GitHub) absorvidos pelo `devops` (Oliver). Ambos disponíveis na biblioteca base via `scripts/sync_agents.py --add` se necessário depois |
| 2026-07-16 | Validação de saldo de rebanho (fim da Fase 3) virou **gate nomeado com sign-off explícito do usuário**, não aprovação técnica de rotina da Emma | JP + Claude | Ver `.agents/rules/multi-agent-workflow.md` seção "🔒 Checkpoint de Validação de Saldo" |
| 2026-07-16 | Burro e Jumento: **subtipo único** de Muares (sinônimos regionais, sem distinção prática de manejo) | JP | Seed de `subtipos_especie` — spec seção 3.2 atualizada |
| 2026-07-16 | Unidade de idade de Aves: **semanas** (`unidade_idade` configurável por espécie), mas faixas confirmadas valem **só para o subtipo Frango de Corte** | JP | Matriz/Poedeira/Peru/Codorna/Avestruz seguem sem faixa definida (ciclo de vida >1 ano, incompatível com as faixas do Frango de Corte) |
| 2026-07-16 | Faixas etárias completas para Caprino (meses: 0-6/7-12/13-24/24+), Suíno (dias: 0-30/30-70/70-150/180+), Muar (meses: 0-12/13-24/25-36/36+), Aves-Frango de Corte (semanas: 0-1/1-6/6-8/8+) | JP | Suíno: "acima de 6 meses" convertido para 180 dias para manter unidade única da espécie. Spec seção 3.2 atualizada com seed completo |
| 2026-07-16 | Supabase: **projeto novo** (não reaproveita o do protótipo Bolt.new) | JP | Resolve item 2 da Fase 0, seção 10 da spec |
| 2026-07-16 | **ADR-0001 aceito:** provisionamento de conta no signup via **trigger de banco** `on_auth_user_created` (não Edge Function) — função `SECURITY DEFINER` em `auth.users` cria `usuarios`+`fazendas`+`usuarios_fazendas` (`papel='dono'`) na mesma transação | `architect` (Alex) | Escolhido pela atomicidade real (falha em qualquer insert reverte tudo, inclusive `auth.users` — nunca há conta "meio criada"); Edge Function foi rejeitada por não ser atômica com o signup (janela de rede entre `signUp()` e a chamada da função). Implicação de RLS: nenhuma policy de INSERT necessária/permitida para `authenticated`/`anon` nessas 3 tabelas. Revisar quando o papel Financeiro/Contábil (Fase 6) entrar — hoje a função assume que todo signup cria fazenda nova. Ver `.agents/memory/adr/ADR-0001-provisionamento-conta.md` |
| 2026-07-16 | **ADR-0002 aceito:** papel único hierárquico `admin/membro/financeiro` (substitui `dono`) + convite para fazenda existente (novo usuário ou já cadastrado) já nesta fase, não só Fase 6. Escrita em `usuarios_fazendas`/`convites` só via 4 funções `SECURITY DEFINER` (`aceitar_convite`, `promover_papel`, `criar_convite`, `cancelar_convite`) — zero policy de INSERT/UPDATE/DELETE nova para `authenticated`/`anon`, generalizando a correção do `cyber_chief` na Fase 1. Envio de convite a quem não tem conta exige Edge Function nova (`enviar-convite`, `service_role`) | `architect` (Alex) | Substitui parcialmente o ADR-0001 (só a premissa "todo signup cria fazenda nova"; resto do ADR-0001 continua válido). Ver `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` |

---

## 3. Glossário do Domínio

- **Eixo 1** — gestão individual de rebanho bovino já validada (peso, GMD, lotes de manejo).
- **Eixo 2** — novo escopo: saldo de rebanho por espécie, GTA, transações, financeiro,
  declaração anual. Trabalha em granularidade de lote/lançamento, não animal individual.
- **GTA (Guia de Trânsito Animal)** — documento oficial que autoriza/registra a movimentação
  de animais entre propriedades. Pode ou não estar vinculada a uma transação do sistema.
- **Saldo de Rebanho** — quantidade de animais por espécie/agrupamento etário/sexo,
  **sempre derivado** das transações (nunca digitado manualmente). Tem "Qtd. Registrada"
  (confirmado) e "Qtd. Pendente" (aguardando, ex. GTA não liberada).
  Exceção: **Abelhas** — saldo por unidade de colônia (colmeia/caixa), sem sexo/faixa etária.
- **Agrupamento Etário** — faixa de idade usada no saldo (Eixo 2), **diferente** da
  categoria zootécnica do animal individual (Eixo 1) — são dois sistemas paralelos e
  intencionalmente independentes (ver spec seção 3.2, "não confundir").
- **Declaração Anual de Rebanho** — prestação de contas formal à Secretaria Estadual de
  Agricultura, por espécie/ano, com prazo regulatório configurável.
- **Fazenda** — unidade de propriedade rural no sistema; um usuário pode ter mais de uma.

---

## 4. Bloqueios e Pendências Abertas

> Pontos que a própria spec marca como "validar com o cliente antes de implementar"
> (ver `.agents/rules/multi-agent-workflow.md` seção 6). Remover a linha assim que o usuário
> confirmar.

As 5 pendências que travavam o início da Fase 0/3 foram **todas resolvidas por JP em
2026-07-16** — ver seção 2 (Decisões) e o log
`.agents/memory/log/2026-07-16-orchestrator-resolucao-pendencias.md`. Nenhum bloqueio aberto
no momento; próximo passo é iniciar a Fase 0.

Pendência residual (não bloqueante, não fazia parte das 5 originais): faixa etária dos
subtipos de Aves além de Frango de Corte (Matriz, Poedeira, Peru, Codorna, Avestruz) — segue
sem padrão definido, seguir o mesmo tratamento estrutural (sem seed até validação).

**Pendência de decisão (não bloqueante, achado ao linkar):** o projeto Supabase remoto já
vem com defaults de auth diferentes do `supabase/config.toml` gerado localmente —
`enable_confirmations = true` (confirmação de email obrigatória), `otp_length = 8`,
`max_frequency = "1m0s"`, MFA TOTP habilitado. Ninguém decidiu isso explicitamente ainda
(são os defaults do Supabase para projetos novos, não uma escolha do time). `cyber_chief`
(Constantine) revisa e alinha `config.toml` com o que for decidido na Fase 1 (provisionamento
de conta / auth).

**Pendência de trabalho (não bloqueante):** `qa` (Emma) ainda não escreveu os testes
automatizados de RLS recomendados pelo `cyber_chief` no gate da Fase 1 (insert client-side
falha nas 3 tabelas; update de colunas imutáveis falha mesmo pelo dono da linha; update em
`usuarios_fazendas` falha sempre). Não bloqueia seguir com o frontend, mas deve entrar antes
do fim da Fase 1.

**Pendência de trabalho (não bloqueante — gate de segurança JÁ CONCLUÍDO, falta só aplicar):**
migration do ADR-0002 (`supabase/migrations/20260716183000_adr0002_convites_papeis.sql`) —
tabela `convites`, funções `aceitar_convite`/`promover_papel`/`criar_convite`/`cancelar_convite`,
branch novo em `handle_new_user()`, migração de `papel='dono'` → `'admin'`. **Passou pelo gate do
`cyber_chief` (🟢)** — corrigido um bypass de autorização crítico (comparação de e-mail
NULL-unsafe em `aceitar_convite()`/`handle_new_user()`) e uma corrida TOCTOU na guarda de
"zero admins" de `promover_papel()`, ver
`.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`. **Ainda não aplicada a nenhum
banco** (`supabase db push` é decisão humana/orchestrator). Ver
`.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md`.

**Pendência de trabalho (não bloqueante — gate de segurança JÁ CONCLUÍDO, falta só deployar):**
Edge Function `enviar-convite` (`supabase/functions/enviar-convite/{index.ts,logica.ts,
index.test.ts}`) — branch `admin.inviteUserByEmail` (sem conta) implementado por completo;
branch de e-mail transacional (já tem conta) é um placeholder deliberado (`emailEnviado: false`,
provedor a definir por `devops`, ver ADR-0002 D3). **Passou pelo gate do `cyber_chief` (🟢)** —
revalidação de permissão do chamador confirmada correta; CORS `*`/branch placeholder/cobertura de
teste avaliados e considerados não bloqueantes, ver log do review. **Ainda não deployada**
(`supabase functions deploy` é decisão humana/orchestrator). Antes de produção real: `devops`
precisa configurar `APP_URL` via `supabase secrets set` e decidir o provedor de e-mail
transacional. Ver `.agents/memory/log/2026-07-16-developer-edge-function-convite.md` e
`.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`.

---

## 5. Histórico de Tarefas Complexas (mais recente primeiro)

### 2026-07-16 — Aplicação/deploy do ADR-0002 (migration + Edge Function) — `orchestrator` (via Claude)

- **O que foi feito:** após o gate 🟢 do `cyber_chief` (correções de NULL-bypass e TOCTOU já
  aplicadas nos arquivos), revisado o SQL corrigido linha a linha e aplicado
  `20260716183000_adr0002_convites_papeis.sql` no banco remoto via `supabase db push`.
  Deployada a Edge Function `enviar-convite` via `supabase functions deploy enviar-convite
  --project-ref bsoofshttpboaaokejwt`. Confirmado com `supabase migration list`: as duas
  migrations da Fase 1 (Fase 1 base + ADR-0002) batem local=remote.
- **Decisões:** nenhuma nova — execução do que já estava revisado e liberado pelas tarefas
  anteriores (db_sage + developer + cyber_chief).
- **Mudanças de arquivo:** nenhuma no repo além desta entrada de memória — a mudança real foi
  no banco remoto (schema `convites` + 4 funções + `handle_new_user()` atualizada) e no painel
  de Edge Functions do projeto Supabase.
- **Pendências:** `qa` (Emma) — testes de RLS/integração recomendados nos dois gates de
  segurança; `devops` — decidir provedor de e-mail transacional e configurar o secret
  `APP_URL` da Edge Function antes de usar o fluxo de convite para usuário já cadastrado em
  produção real; frontend (signup/login + shell de rotas) ainda não começou.
- **Log completo:** esta própria entrada — tarefa de execução simples, sem log próprio (mesmo
  padrão da aplicação da migration da Fase 1 base).

### 2026-07-16 — Security review (gate ADR-0002) da migration convites/papéis + Edge Function `enviar-convite` — `cyber_chief` (CONSTANTINE, via Claude)

- **Veredito: 🟢 Seguro — migration e Edge Function LIBERADAS para aplicação/deploy**
  (`supabase db push` / `supabase functions deploy`), decisão de quando aplicar continua
  humana/orchestrator, fora do escopo deste gate. **Antes das correções: 🔴 Risco Crítico** —
  havia um bypass de autorização real, não apenas latente.
- **O que foi feito:** security review formal de
  `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` (4 funções
  `SECURITY DEFINER`, tabela `convites`, RLS, `handle_new_user()`) e de
  `supabase/functions/enviar-convite/{index.ts,logica.ts}`, gate exigido explicitamente pelo
  próprio ADR-0002. **Achado crítico:** `aceitar_convite()` e `handle_new_user()` comparavam
  e-mail do chamador com `<>`/lógica trivalente do SQL sem tratar `NULL` — se `auth.email()`/
  `new.email` viesse `NULL` (provedor de auth sem claim de e-mail garantido, ex.: telefone/
  anônimo — hoje desabilitados em `supabase/config.toml`, mas por configuração, não por garantia
  de schema), a checagem de destinatário do convite era silenciosamente pulada (`IF NULL THEN`
  = `FALSE` em PL/pgSQL), permitindo que qualquer sessão autenticada sem e-mail aceitasse
  qualquer convite pendente não pré-resolvido, com o papel oferecido (inclusive `'admin'`) — CWE-
  354/STRIDE Elevation of Privilege. **Achado de corrida:** a guarda "a fazenda nunca fica sem
  admin" em `promover_papel()` usava `SELECT COUNT(*)` sem lock — duas chamadas concorrentes
  rebaixando dois admins diferentes da mesma fazenda (cenário mínimo: 2 admins, cada chamada
  rebaixa um) passavam ambas pela guarda sob `READ COMMITTED`, podendo deixar a fazenda com zero
  admins (CWE-367 TOCTOU). **Achado menor:** policy `convites_select_convidado` comparava e-mail
  sem `lower()` nos dois lados (inconsistente com o resto do desenho, falha para o lado seguro,
  não uma brecha). Os 3 riscos já sinalizados pelo `developer` (CORS `*` sem `APP_URL`, branch de
  e-mail placeholder, cobertura de teste parcial) foram avaliados formalmente e nenhum bloqueia o
  gate — nenhum é uma vulnerabilidade de autorização.
- **Decisões:** corrigir tudo diretamente nos arquivos (nada aplicado a nenhum ambiente ainda).
  `aceitar_convite()`/`handle_new_user()`: checagens reescritas com booleanos explicitamente
  NULL-safe. `promover_papel()`: `for update` nas linhas admin da fazenda antes de contar
  restantes, fechando a corrida. `convites_select_convidado`: `lower()` nos dois lados.
  `enviar-convite/index.ts`: `console.warn` quando `APP_URL` ausente, para visibilidade
  operacional (não bloqueante, endurecimento).
- **Mudanças de arquivo:**
  `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` editado (4 correções + header
  atualizado); `supabase/functions/enviar-convite/index.ts` editado (warning de `APP_URL`); novo
  log; esta entrada em `PROJECT_CONTEXT.md` (+ seções 1 e 4).
- **Pendências (não bloqueantes):** `qa` (Emma) — teste de integração real do handler HTTP
  completo de `enviar-convite`, e casos de teste explícitos para os dois achados corrigidos
  (e-mail nulo bloqueia aceite; duas demoções concorrentes não zeram admins). `devops` — decidir
  provedor de e-mail transacional e configurar `APP_URL` antes de produção. `developer`/produto —
  considerar tela de "convites pendentes" para usuários já logados, mitigando a lacuna do branch
  de e-mail placeholder.
- **Log completo:** `.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`

### 2026-07-16 — Edge Function `enviar-convite` (ADR-0002 D3) — `developer` (RYAN, via Claude)

- **O que foi feito:** implementada a Edge Function Deno/TypeScript `enviar-convite`
  (`supabase/functions/enviar-convite/`), chamada pelo client depois que `criar_convite()` (RPC)
  já rodou com sucesso. Arquivo `index.ts` só orquestra HTTP (parsing, os dois clients Supabase —
  um com o JWT do chamador para `auth.getUser()`, outro `service_role` para as operações
  privilegiadas —, montagem de respostas); toda a lógica de decisão foi extraída para
  `logica.ts` (sem dependência de rede), especificamente para ser testável sem disparar
  `Deno.serve` como efeito colateral do import. Fluxo: busca o convite por `convite_id` via
  `service_role` (404 se não existir); **revalida a permissão do chamador** consultando
  `usuarios_fazendas` para confirmar `papel='admin'` na `fazenda_id` **lida do convite no
  banco** (nunca de qualquer campo do corpo da requisição — único parâmetro de entrada aceito é
  `convite_id`), 403 se não for; rejeita convite não-pendente (409); branch por
  `convidado_usuario_id`: `null` chama `admin.inviteUserByEmail` (dispara `handle_new_user()`,
  que lê `convite_token`); preenchido é um placeholder deliberado (loga a URL de aceite, retorna
  `emailEnviado: false` com o motivo explícito — provedor de e-mail transacional não decidido,
  fora do escopo do `developer`). CORS com preflight `OPTIONS` tratado; todo o handler dentro de
  um `try/catch` único, nunca deixa exceção sem resposta JSON.
- **Decisões:** branch de e-mail para usuário já cadastrado nunca falha a função — o convite já
  é válido nesse ponto, só o canal de notificação está pendente (débito técnico visível,
  documentado como `TODO(devops)` isolado em `enviarEmailConvite()`, não uma decisão de provedor
  tomada pelo `developer`). Lógica pura separada em `logica.ts` de propósito técnico (evitar que
  importar o módulo para teste levante um servidor HTTP real).
- **Mudanças de arquivo:** novos `supabase/functions/enviar-convite/index.ts`,
  `supabase/functions/enviar-convite/logica.ts`,
  `supabase/functions/enviar-convite/index.test.ts`; este log; `PROJECT_CONTEXT.md` (esta seção
  + seção 4). Nenhum arquivo `.sql` tocado; nenhum deploy executado.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase functions deploy` —
  atenção especial ao CORS com fallback `*` quando `APP_URL` está ausente e à lacuna funcional
  do branch de e-mail placeholder (ver log completo, seção de riscos). Handler HTTP completo de
  `index.ts` não coberto por teste automatizado (só a lógica pura de `logica.ts` está) — Deno
  não estava disponível nesta máquina para rodar `deno test` e confirmar execução real;
  recomendado teste de integração real pelo `qa`. Provedor de e-mail transacional para convite a
  usuário já cadastrado segue sem decisão (`devops`).
- **Log completo:** `.agents/memory/log/2026-07-16-developer-edge-function-convite.md`

### 2026-07-16 — Migration SQL do ADR-0002 (convites + papéis admin/membro/financeiro) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** implementada em SQL a decisão do ADR-0002, em migration nova e
  aditiva sobre `20260716171522_fase1_usuarios_fazendas.sql` (nenhuma tabela recriada):
  (1) D1/D4 — migração de papel na ordem exata do ADR (`DROP CONSTRAINT` → `UPDATE
  papel='dono'→'admin'` → `ADD CONSTRAINT` nova com `admin/membro/financeiro`); (2) D3
  parcial — tabela `convites` completa (todos os campos do ADR, trigger `set_updated_at`
  reaproveitado, RLS habilitada com só 2 policies de SELECT — admin vê convites das fazendas
  onde é admin, convidado vê os endereçados a ele — zero policy de INSERT/UPDATE/DELETE);
  (3) D2 — as 4 funções `SECURITY DEFINER` (`aceitar_convite`, `promover_papel`,
  `criar_convite`, `cancelar_convite`), todas com `search_path=''`, `REVOKE ALL FROM PUBLIC`
  + `GRANT EXECUTE TO authenticated` (nunca `anon`); (4) D2 — `handle_new_user()` atualizada
  (`CREATE OR REPLACE`) com o branch de `convite_token`: presente e válido entra na fazenda
  existente, presente e inválido bloqueia o signup com `RAISE EXCEPTION`, ausente preserva o
  comportamento do ADR-0001 com `papel='admin'`.
- **Decisões de implementação resolvidas** (pontos que o ADR deixava em aberto): `DEFAULT` da
  coluna `papel` trocado de `'dono'` (agora inválido) para `'membro'` (menor privilégio,
  nunca exercitado na prática); `SELECT ... FOR UPDATE` no convite (tanto em
  `aceitar_convite()` quanto no branch de `handle_new_user()`) para fechar janela de corrida
  entre aceites concorrentes com o mesmo token, decorrente do próprio argumento de
  atomicidade do ADR; FKs de `convites` (`convidado_usuario_id` → `ON DELETE SET NULL`,
  `convidado_por` → `ON DELETE CASCADE`, sem especificação no ADR); `status` de `convites`
  implementado só com os 3 valores efetivamente escritos pelas funções (`pendente`/`aceito`/
  `cancelado`) — `'expirado'` fica para uma migration futura, se o job de expiração do ADR
  (não decidido) for implementado.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260716183000_adr0002_convites_papeis.sql`; este log;
  `PROJECT_CONTEXT.md` (esta seção + seção 4). Seção 1 (Estado Atual) **não foi alterada** —
  migration escrita, ainda não aplicada a nenhum banco.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase db push` (atenção
  redobrada às 4 funções novas e ao branch novo de `handle_new_user()` — riscos detalhados no
  log completo, incluindo duplicação de lógica de validação entre `aceitar_convite()` e
  `handle_new_user()`, e a policy `convites_select_admin` consultando `usuarios_fazendas`
  dentro do próprio `USING`). Depois do gate: Edge Function `enviar-convite` (`developer`) e
  testes de RLS/RPC (`qa`) seguem fora do escopo desta tarefa.
- **Log completo:** `.agents/memory/log/2026-07-16-db_sage-migration-adr0002.md`

### 2026-07-16 — ADR-0002: convites para fazenda existente e papéis admin/membro/financeiro — `architect` (Alex, via Claude)

- **O que foi feito:** formalizada a decisão técnica para as três mudanças de modelo já
  decididas por JP (papel único hierárquico `admin/membro/financeiro` substituindo `dono`;
  qualquer admin pode promover outro membro; convite funciona para usuário novo ou já
  cadastrado, N:N usuário↔fazenda já nesta fase). Endereça o Critério de Revisão nº 1 e nº 4
  do ADR-0001, que já previa este momento.
- **Decisões:** (1) toda escrita em `usuarios_fazendas`/`convites` passa a ser feita
  exclusivamente por 4 funções `SECURITY DEFINER` (`aceitar_convite`, `promover_papel`,
  `criar_convite`, `cancelar_convite`), cada uma validando a permissão do chamador dentro do
  próprio corpo — zero policy de INSERT/UPDATE/DELETE nova para `authenticated`/`anon`,
  generalizando a partir de agora (não só reativamente) a correção que o `cyber_chief` já
  aplicou na Fase 1 contra escalação de privilégio em `usuarios_fazendas`; (2)
  `handle_new_user()` ganha um branch para signup com convite pendente (entra em fazenda
  existente em vez de criar nova, valida token+e-mail, bloqueia o signup se o token vier
  presente mas inválido); (3) tabela `convites` nova como fonte da verdade do convite +
  Edge Function `enviar-convite` (`service_role`) para o envio em si, com branch entre
  `admin.inviteUserByEmail` (sem conta) e e-mail transacional próprio (já tem conta); (4)
  ordem obrigatória da migração de dados existentes (`papel='dono'` → `'admin'`): drop da
  constraint antiga antes do UPDATE, senão a constraint antiga rejeita o novo valor.
- **Mudanças de arquivo:** criado `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md`;
  editado `.agents/memory/adr/ADR-0001-provisionamento-conta.md` (campo `Status:` — só nota de
  substituição parcial, conteúdo original preservado); este log; `PROJECT_CONTEXT.md` (esta
  seção + seções 2 e 4). Nenhuma migration SQL escrita — decisão e documentação apenas,
  implementação é tarefa seguinte do `db_sage`.
- **Pendências:** `db_sage` implementa a migration a partir deste ADR (tabela `convites`, as 4
  funções, atualização de `handle_new_user()`, troca de constraint de `papel` com migração de
  dados); gate do `cyber_chief` obrigatório antes de aplicar, com atenção redobrada às funções
  `SECURITY DEFINER` novas e à Edge Function `enviar-convite`. Provedor de e-mail transacional
  para convite a usuário já cadastrado não decidido aqui — é do `devops` (Oliver).
- **Log completo:** `.agents/memory/log/2026-07-16-architect-adr-0002-convites.md`

### 2026-07-16 — Aplicação da migration da Fase 1 no banco remoto — `orchestrator` (via Claude)

- **O que foi feito:** após o gate 🟢 do `cyber_chief`, revisado o SQL final linha a linha
  (checagem de sintaxe, ordem de triggers `BEFORE UPDATE`, `search_path` vazio combinado com
  chamadas schema-qualificadas) e aplicado com `supabase db push --password <SUPABASE_DB_PASSWORD>`
  no projeto remoto (`bsoofshttpboaaokejwt`, conta Dmz Labs 06). Confirmado com
  `supabase migration list`: local `20260716171522` = remote `20260716171522`.
- **Decisões:** nenhuma nova — execução da migration já revisada e liberada pelas duas tarefas
  anteriores (db_sage + cyber_chief).
- **Mudanças de arquivo:** nenhuma no repo além desta entrada de memória — a mudança real foi
  no banco remoto (schema `usuarios`/`fazendas`/`usuarios_fazendas` + trigger + RLS agora ao
  vivo no Supabase).
- **Pendências:** ver seção 4 (testes de RLS do `qa`) e seção 1 (falta frontend de
  signup/login e shell de roteamento para a Fase 1 fechar).
- **Log completo:** esta própria entrada — tarefa de execução simples, sem log próprio (não
  gerou decisão nova nem achado a documentar além do que já está nos logs de db_sage/cyber_chief).

### 2026-07-16 — Security review (gate RLS/auth) da migration da Fase 1 — `cyber_chief` (CONSTANTINE, via Claude)

- **Veredito: 🟢 Seguro — migration LIBERADA para aplicação** (`supabase db push`), decisão de
  quando aplicar continua humana/orchestrator, fora do escopo deste gate.
- **O que foi feito:** security review formal (protocolo `[SECURITY ANALYSIS]`) de
  `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql`, gate atribuído a
  `cyber_chief` na Fase 1 (`.agents/rules/multi-agent-workflow.md` seção 5). Ponto levantado
  pelo squad confirmado como risco real (embora hoje inerte): a policy
  `usuarios_fazendas_update_own` permitia UPDATE sem restrição de coluna no próprio vínculo,
  incluindo `papel` — inofensivo hoje só porque a `CHECK` constraint aceita exclusivamente
  `'dono'`, mas se tornaria uma escalação de privilégio horizontal→vertical completa (STRIDE:
  Elevation of Privilege) no dia em que a Fase 6 estender essa constraint para incluir
  `'financeiro'` (papel de consulta restrita, spec seção 5.4) sem revisitar esta policy —
  cenário já mapeado no próprio ADR-0001 (critério de revisão nº 1), não hipotético. Revisão
  também identificou dois achados adicionais de menor severidade (colunas `usuario_id` em
  `fazendas` e `email` em `usuarios` reescrevíveis sem restrição, sem exploração ativa hoje
  mas sem justificativa para ficarem abertas) e um item de hardening (`search_path` não fixado
  em `trigger_set_updated_at()` / `set search_path = public` menos restritivo que necessário
  em `handle_new_user()`).
- **Decisões:** corrigir tudo diretamente no arquivo da migration (ainda não aplicada a
  nenhum banco), não como migration de correção separada. Para `usuarios_fazendas`: policy de
  UPDATE removida por completo (não restringida coluna a coluna) — não há hoje nem está
  previsto nenhum campo do vínculo que o próprio usuário deva editar; mudança de papel é
  sempre fluxo administrativo/de convite (Fase 6). Para `usuarios`/`fazendas`: adicionados
  triggers `BEFORE UPDATE` de imutabilidade (`prevent_usuarios_identity_change()`,
  `prevent_fazendas_identity_change()`) bloqueando `id`/`created_at` e, respectivamente,
  `email`/`usuario_id`, mantendo `nome` livre (único campo com caso de uso real) — defesa em
  profundidade porque `WITH CHECK` de RLS não consegue comparar valor novo com valor antigo da
  linha (limitação do Postgres), só um trigger com acesso a `OLD`/`NEW` consegue.
- **Mudanças de arquivo:**
  `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` editado diretamente (ver
  log completo para o detalhamento de cada mudança); novo log; esta entrada em
  `PROJECT_CONTEXT.md`.
- **Pendências:** não bloqueante — `qa` (Emma) deve adicionar casos de teste automatizados
  para as garantias de RLS validadas aqui (insert client-side falha nas 3 tabelas; update de
  colunas imutáveis falha mesmo pelo dono da linha; update em `usuarios_fazendas` falha
  sempre), já sinalizado desde o ADR-0001 e agora ampliado. Quando a Fase 6 estender a
  constraint de `papel`, qualquer nova policy de UPDATE proposta para `usuarios_fazendas`
  precisa de nova revisão deste gate antes de entrar.
- **Log completo:** `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md`

### 2026-07-16 — Migration SQL da Fase 1 (usuarios/fazendas/usuarios_fazendas) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** implementada em SQL a decisão do ADR-0001 — migration única com a
  function genérica `trigger_set_updated_at()`, as tabelas `usuarios`/`fazendas`/
  `usuarios_fazendas` (spec seções 3.1/5.4), a função `handle_new_user()` (`SECURITY DEFINER`)
  + trigger `on_auth_user_created` em `auth.users`, e RLS nas 3 tabelas (SELECT/UPDATE
  restritos ao próprio usuário/fazenda vinculada, sem nenhuma policy de INSERT/DELETE para
  `authenticated`/`anon`, com comentário SQL citando o ADR-0001 documentando a ausência
  proposital).
- **Decisões:** (1) constraint de `papel` em `usuarios_fazendas` via `CHECK` sobre `text`
  (não `enum`), para a Fase 6 (`financeiro`) ser uma migration pequena de troca de constraint,
  sem alterar o tipo da coluna; (2) fallback do nome da fazenda (ponto que o ADR-0001 deixava
  em aberto) resolvido como `'Minha Fazenda'` quando `raw_user_meta_data->>'nome_fazenda'`
  vier ausente/vazio, em vez de `RAISE EXCEPTION` — bloquear o signup por um campo de UX
  secundário reintroduziria o mesmo risco que o trigger existe para eliminar; nome é editável
  depois em Configurações.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql`; este log; esta entrada em
  `PROJECT_CONTEXT.md`. Seção 1 (Estado Atual) **não foi alterada** — migration escrita, ainda
  não aplicada ao banco (aplicação é tarefa seguinte, após revisão humana).
- **Pendências:** migration não aplicada (`supabase db push`/`migration up` propositalmente
  não executado, fora do escopo desta tarefa). Revisão recomendada antes de aplicar:
  `architect` (Alex) confirma aderência ao ADR-0001; `cyber_chief` (Constantine) valida RLS,
  incluindo o caso de teste explícito pedido pelo ADR ("insert direto do client autenticado
  nas 3 tabelas deve falhar").
- **Log completo:** `.agents/memory/log/2026-07-16-db_sage-migration-fase1.md`

### 2026-07-16 — ADR-0001: provisionamento de conta no signup — `architect` (Alex, via Claude)

- **O que foi feito:** formalizado o ADR que a spec (seção 9, item 1) e o `multi-agent-workflow.md`
  (Fase 1) já atribuíam ao `architect`. Avaliadas com critério real as duas alternativas que a
  spec aponta — trigger de banco `on_auth_user_created` vs. Edge Function com `service_role` —
  e decidido pelo trigger: atomicidade garantida pelo Postgres (o trigger roda na mesma
  transação que o GoTrue usa para criar `auth.users`; falha em qualquer insert reverte tudo,
  inclusive o próprio `auth.users`), cobrindo todo caminho de criação de usuário sem depender
  de o client completar um segundo passo de rede. Edge Function foi rejeitada por reproduzir,
  num ponto diferente do fluxo, o mesmo tipo de risco que o protótipo já teve (janela de
  inconsistência entre `signUp()` e a chamada da função).
- **Decisões:** ver seção 2 (linha "ADR-0001 aceito"). Detalhado no ADR: onde entra o insert de
  `usuarios_fazendas` (`papel='dono'`, mesma function body do trigger, mesma transação);
  garantias de atomicidade (tudo ou nada, nunca "usuarios criado mas fazendas falhou");
  implicação de RLS (nenhuma policy de INSERT client-side necessária/permitida nas 3 tabelas —
  o trigger roda como role com `BYPASSRLS`, RLS default-deny já cobre o client, e isso deve
  virar caso de teste explícito do `cyber_chief`).
- **Mudanças de arquivo:** criado `.agents/memory/adr/ADR-0001-provisionamento-conta.md` (pasta
  `adr/` nova); este log; `PROJECT_CONTEXT.md` (esta seção + seção 2). Seções 1, 3 e 4 não
  alteradas — decisão de arquitetura, não mudança de estado do projeto.
- **Pendências:** nenhuma bloqueante. Próximo passo real: implementação na Fase 1 (`developer`
  escreve a migration a partir do ADR; `db_sage` revisa schema/RLS; `cyber_chief` faz o gate
  antes de a Fase 1 avançar). Este ADR não implementa nada — nenhuma migration SQL foi criada,
  fora do escopo desta tarefa.
- **Log completo:** `.agents/memory/log/2026-07-16-architect-adr-provisionamento.md`

### 2026-07-16 — Fase 0: link do projeto Supabase — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** resolvido o bloqueio da tarefa anterior. JP gerou um Personal Access
  Token na conta Supabase "Dmz Labs 06" (`SUPABASE_ACCESS_TOKEN` no `.env`) e a senha do
  banco (`SUPABASE_DB_PASSWORD`, resetada via dashboard). Com os dois, `supabase link
  --project-ref bsoofshttpboaaokejwt --password <senha>` funcionou (via env var, sem alterar
  o login global da CLI). Rodado também `supabase init` (não existia `supabase/config.toml`
  local ainda) e confirmado `supabase migration list`: banco remoto limpo, sem migrations —
  esperado, projeto novo.
- **Achado (não decisão, só observação):** o config remoto já vem com
  `enable_confirmations = true`, `otp_length = 8`, MFA TOTP habilitado — defaults do Supabase
  para projeto novo, diferentes do `config.toml` local gerado pelo CLI. Registrado como
  pendência de decisão não bloqueante (seção 4) para `cyber_chief` revisar na Fase 1.
- **Mudanças de arquivo:** `supabase/config.toml` e `supabase/.gitignore` versionados
  (commit `744e633`); `.env` ganhou `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`
  (gitignored, não versionados).
- **Pendências:** nenhuma bloqueante. Próximo passo real: Fase 1 (autenticação e shell da
  aplicação) — ver seção 5 de `multi-agent-workflow.md`.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-fase0-scaffold.md` (mesma
  entrada da tarefa anterior, atualizada com esta seção)

### 2026-07-16 — Fase 0: repositório + scaffold do projeto — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** criado o repositório Git novo (`DMZ-Digital-Access/rural-prod`,
  branch `main`) e feito o primeiro push; scaffold do projeto React 18 + TypeScript + Vite
  (template react-ts), Tailwind CSS v4 + shadcn/ui inicializado, path alias `@/*`, todas as
  libs da stack instaladas (react-router-dom, @tanstack/react-query, react-hook-form + zod,
  @supabase/supabase-js, sonner, lucide-react, recharts). Cliente Supabase básico em
  `src/lib/supabase.ts`, `.env.example` como convenção, CI básico (GitHub Actions: lint +
  build) em `.github/workflows/ci.yml`. Build e lint validados localmente (`npm run build`,
  `npm run lint`) antes do commit.
- **Decisões:** nenhuma nova (execução do que já estava decidido na spec, seção 10, Fase 0).
- **Bloqueio encontrado:** projeto Supabase do produto está em conta diferente da que a CLI
  local usa — ver seção 4 (Bloqueios), novo item.
- **Mudanças de arquivo:** scaffold completo do app na raiz do repo (ver commit
  `ee7e657`); `.env` ganhou `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (duplicando as
  versões sem prefixo, necessárias para o client Vite expor a variável ao browser).
- **Pendências:** obter `SUPABASE_ACCESS_TOKEN` da conta Dmz Labs 06 para linkar o projeto.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-fase0-scaffold.md`

### 2026-07-16 — Resolução das 5 pendências de modelagem — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** JP respondeu diretamente às 5 pendências da seção 4 (bloqueio de
  Fase 0/3). A mais relevante: reconciliação Eixo 1 ↔ Eixo 2 mudou de Opção A (recomendação
  da spec) para **Opção B** — vínculo automático entre transação e animais individuais desde
  a primeira entrega, não mais roadmap (item 28 da Fase 6 removido, absorvido pela Fase 3/4).
  Também confirmadas: Muares como subtipo único, faixas etárias completas de Caprino/Suíno/
  Muar/Aves-Frango de Corte, e Supabase novo.
- **Decisões:** ver seção 2 (cinco linhas de 2026-07-16).
- **Mudanças de arquivo:** `especificacao-sistema.md` atualizada (seções 3.2, 3.3, 9, 10);
  `PROJECT_CONTEXT.md` (esta seção + seções 1, 2, 4); `multi-agent-workflow.md` (seções 5, 6).
- **Pendências:** nenhuma das 5 originais. Resta apenas a faixa etária dos demais subtipos de
  Aves (não bloqueante, ver seção 4).
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-resolucao-pendencias.md`

### 2026-07-16 — Revisão crítica do squad: 15 → 13 agentes + gate de saldo — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** JP pediu uma avaliação honesta de "essa é a equipe ideal?". Reanálise
  identificou dois agentes sem responsabilidade exclusiva (`squad_manager`, `tools_orchestrator`)
  e um risco de processo (validação de saldo tratada como aprovação técnica de rotina em vez
  de gate de alta consequência).
- **Decisões:** ver seção 2 (duas linhas de 2026-07-16 mais recentes).
- **Mudanças de arquivo:** removidos `squad_manager.md` e `tools_orchestrator.md` de
  `.agents/agents/`; `scripts/sync_agents.py` e `rules/multi-agent-workflow.md` atualizados
  (roster, seções 1/3/4/5, novo gate "🔒 Checkpoint de Validação de Saldo"); `AGENTS.md`
  atualizado para 13 agentes.
- **Pendências:** nenhuma nova — as pendências da seção 4 continuam as mesmas.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-revisao-squad.md`

### 2026-07-16 — Squad montado para o projeto — `orchestrator` (via Claude/Cowork)

- **O que foi feito:** Lida a especificação completa (`especificacao-sistema.md`), definida
  uma equipe enxuta de 15 agentes (a partir dos 112 da biblioteca base) e instalado o bundle
  `.agents/` completo neste projeto: agentes, regras de orquestração mapeadas às 6 fases da
  spec, protocolo de memória e este documento de contexto.
- **Decisões:** ver seção 2 (linha 2026-07-16) e roster completo em
  `.agents/rules/multi-agent-workflow.md`.
- **Pendências:** ver seção 4 acima — nenhuma delas bloqueia o início da Fase 0, mas todas
  devem ser resolvidas antes das fases que dependem delas.
- **Log completo:** `.agents/memory/log/2026-07-16-orchestrator-setup-squad.md`
