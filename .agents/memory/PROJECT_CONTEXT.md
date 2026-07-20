# CONTEXTO DO PROJETO — Livestock Control

> Memória viva do squad. Regra completa de leitura/escrita em `.agents/rules/memory-protocol.md`.
> A especificação funcional completa está em `especificacao-sistema.md` (raiz do projeto) —
> este arquivo não repete o conteúdo dela, guarda o que já foi decidido/feito ao longo do
> desenvolvimento e o que ainda está em aberto.

---

## 1. Estado Atual do Projeto

- **Nome:** Livestock Control — Gestão Agropecuária (Rebanho + Compliance + Financeiro)
- **Fase:** Fase 0 concluída. **Fase 1 (Fundação: Autenticação) concluída** (itens 5-7 da
  seção 10 da spec) — schema base (`usuarios`/`fazendas`/`usuarios_fazendas` + ADR-0002)
  aplicado no remoto e testado (32/32 asserções, `qa`, 2026-07-17); frontend de autenticação
  (login/signup/aceitar convite) e shell de roteamento completo (todas as rotas da seção 8,
  módulos ainda não implementados como placeholder) entregues por `developer` em 2026-07-17 —
  ver seção 5. `npm run build`/`npm run lint`/`npm run test` passando limpos; `npm run dev`
  confirmado subindo sem erro (smoke test HTTP, sem navegador real disponível neste ambiente).
  **Fase 2 (Eixo 1 — Gestão Individual de Rebanho) CONCLUÍDA do ponto de vista de
  schema+frontend:** item 8 da seção 10 da spec (schema `lotes`/`animais`/`pesagens` + views +
  `registrar_pesagem()`) escrito por `db_sage` em 2026-07-17, **gate do `cyber_chief` CONCLUÍDO
  (🟢)** no mesmo dia — 3 correções aplicadas diretamente na migration (papel `financeiro` sem
  restrição de acesso a manejo de Eixo 1, contra spec seção 5.4; campos calculados de `animais`
  falsificáveis via INSERT; oráculo de mensagens de erro em `registrar_pesagem()`) — ver seção 5
  e `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`. Migration **aplicada ao banco
  remoto**. Item 9 da seção 10 (telas de Dashboard/Animais/Lotes/Comparativo) implementado por
  `developer` em 2026-07-17 — 6 rotas reais (`/app/dashboard`, `/app/animais`,
  `/app/animais/:id`, `/app/lotes`, `/app/lotes/:id`, `/app/comparativo`) substituindo os
  placeholders, consumindo `animais_com_detalhes`/`lotes_com_estatisticas`/`registrar_pesagem()`
  via `@tanstack/react-query`. `npm run build`/`npm run lint`/`npm run test` (35/35) passando
  limpos. Ver seção 5 e `.agents/memory/log/2026-07-17-developer-frontend-fase2.md`. **Teste
  automatizado real de RLS/RPC/GMD do schema novo CONCLUÍDO** (`qa`, 2026-07-19) — 63/63
  asserções pgTAP passando (25 da Fase 1/ADR-0002 + 38 novas da Fase 2: fórmula de GMD incluindo
  a regressão do bug do protótipo, regra de correção de pesagem, e os 3 achados do gate
  `cyber_chief`), ver seção 5 e
  `.agents/memory/log/2026-07-19-qa-testes-fase2-gmd.md`. **Teste de UI em navegador real
  parcialmente resolvido em 2026-07-20** — Chromium headless (Playwright, via cache local
  `npx`, binário já baixado em `%LOCALAPPDATA%\ms-playwright`) confirmou `npm run dev` servindo
  em `http://localhost:5173`, `/login` renderizando corretamente (título "Livestock Control",
  formulário E-mail/Senha, redirect `?redirect=` preservado pelo `ProtectedRoute`), e submissão
  do formulário com credencial inválida retornando "Invalid login credentials" — confirma que o
  frontend fala de verdade com o Supabase Auth remoto, não é só HTTP 200 de shell vazio (o smoke
  test anterior de Fase 1 só confirmava isso). Zero erros de console além do 400 esperado da
  tentativa de login inválida. Cobertura ainda parcial: só a tela de login foi exercitada, não
  Dashboard/Animais/Lotes/Comparativo (exigiria uma conta de teste real). Nenhum skill de projeto
  para rodar o app existia (`.claude/skills/`) — recomendado `/run-skill-generator` para
  capturar a receita (NODE_PATH apontando pro cache `_npx` do playwright, sem instalação local
  no projeto) para sessões futuras.
  **Fase 3 (Eixo 2 — Dados e Regras) COMPLETA em 2026-07-20, exceto item 14 (Storage, não
  iniciado).** Itens 10/11/13 com gate de segurança concluído e aplicados ao remoto; item 12
  (saldo de rebanho) implementado, gated e com **Checkpoint de Validação de Saldo CONFIRMADO por
  JP** (comparação exata contra os prints reais de Bovino/Ovino) — ver seção 5, entrada "Schema
  + gate de segurança, Fase 3 item 12". Detalhe histórico do início da fase abaixo. Item 10 da
  seção 10 da spec (catálogos
  `especies`/`subtipos_especie`/`agrupamentos_etarios`, sem `fazenda_id` — primeira tabela não
  multi-tenant do projeto) escrito por `db_sage` em 2026-07-20 — migration nova
  `20260720120000_fase3_especies_agrupamentos.sql`, seed completo validado por query real após
  `supabase db reset` local (8 espécies, 9 subtipos, 24 faixas etárias, contagem exata
  confirmada), RLS com SELECT aberto a qualquer `authenticated` (sem filtro de papel — catálogo
  também usado pelo papel `financeiro` em Eixo 2) e zero policy de escrita. Ver seção 5 e
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-especies.md`. **Gate do `cyber_chief`
  CONCLUÍDO (🟢) em 2026-07-20, sem nenhuma correção necessária** — primeira migration da Fase 3
  a passar sem achado. Os 2 pontos técnicos que a `db_sage` pediu atenção (RLS de leitura aberta
  sem filtro de papel; FK composta com MATCH SIMPLE) confirmados corretos por smoke test real
  (`docker exec`/`psql`, sessões `anon`/`authenticated` simuladas): `anon` vê 0 linhas,
  `authenticated` sem vínculo de fazenda vê as 8/9/24 linhas completas, INSERT cross-espécie/
  subtipo rejeitado pela FK composta, escrita bloqueada nas 3 tabelas, `pg_policies` confirma
  exatamente 3 policies (SELECT/authenticated, sem sobra). Ver seção 5 e
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-especies.md`. **CORREÇÃO DE REGISTRO
  (2026-07-20, achado ao verificar antes de um `db push` manual):** as 3 migrations da Fase 3
  (itens 10/11/13) já estavam de fato aplicadas no banco remoto `bsoofshttpboaaokejwt` — esta
  seção e a seção 4 diziam "ainda não aplicada", desatualizado. Confirmado por conexão direta
  (`psql` via pooler `aws-1-us-west-2.pooler.supabase.com`, não só `supabase migration list`):
  `especies` com as 8 linhas do seed, `gtas`/`lancamentos_financeiros` existentes (0 linhas,
  esperado, sem transação real ainda); `supabase db push --dry-run` confirmou "Remote database
  is up to date". Não se sabe, a partir da memória existente, quando/por quem o push foi
  executado — nenhum log documenta essa ação. Itens 12/14 (saldo/storage) seguem NÃO
  iniciados — próximas tarefas.
  **ADR-0004 aceito em 2026-07-20** (`architect`) — fecha a dívida de processo pendente desde
  2026-07-16 (spec seção 3.3): formaliza o desenho técnico de `transacoes_animais` (mecanismo de
  atualização automática de `animais.status`, fronteira de permissão do papel `financeiro`,
  integridade cross-fazenda, reversibilidade, revenda) antes de `db_sage` escrever a migration
  do item 11. Ver seção 5 e `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md`.
  **Item 11 da seção 10 entregue em 2026-07-20** (`db_sage`) — migration nova
  `20260720133000_fase3_gtas_transacoes.sql` com `gtas`/`transacoes`/`transacoes_detalhe`/
  `transacoes_animais`. Referência circular `gtas.transacao_id`↔`transacoes.gta_id` resolvida
  por ordem de criação + `ALTER TABLE ... ADD CONSTRAINT`; `transacoes_animais` implementa o
  ADR-0004 (D1-D6) sem desvio; RLS com três fronteiras distintas de `financeiro` na mesma
  migration (`gtas`=zero acesso, `transacoes`/`transacoes_detalhe`=SELECT only,
  `transacoes_animais`=zero acesso). Validado por `supabase db reset` local + smoke test
  funcional manual dos triggers (inclusive o cenário de `DELETE` em cascata da transação pai
  antecipado pelo ADR-0004 D1). Ver seção 5 e
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-transacoes.md`. **Gate do `cyber_chief`
  CONCLUÍDO (🟢) em 2026-07-20** — as 13 policies de RLS das 3 fronteiras de `financeiro`
  conferidas linha a linha sem achado (nenhuma diluição por cópia-e-cola entre `gtas`/
  `transacoes`/`transacoes_detalhe`/`transacoes_animais`); 1 correção aplicada: corrida (TOCTOU)
  na guarda de coexistência de D5 do ADR-0004 (`reverter_status_animal_apos_desvinculo()`) —
  dois `DELETE`s concorrentes de vínculos de venda distintos do mesmo animal podiam deixar
  `animais.status` preso em `'venda'` permanentemente; corrigido com `select ... for update`,
  mesmo padrão já usado em `promover_papel()` (ADR-0002). Ver seção 5 e
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-transacoes.md`. **Confirmado aplicada
  ao banco remoto** (verificado 2026-07-20 por conexão `psql` direta — ver correção de registro
  logo acima nesta seção; não há log de quando o `db push` foi executado). **Item 13 da seção
  10 entregue em 2026-07-20** (`db_sage`) — migration nova
  `20260720150000_fase3_financeiro_declaracoes_prazos.sql` com `lancamentos_financeiros`,
  `declaracoes_rebanho`, `prazos_declaracao_estado` + funções `definir_prazo_declaracao_estado()`
  (SECURITY DEFINER, único caminho de escrita da tabela de prazos) e
  `obter_prazo_declaracao_estado()` (leitura com fallback do padrão RS, sem seed anual).
  `categoria` de lançamento financeiro decidida como texto livre (sem CHECK/tabela nova).
  `prazos_declaracao_estado` mantida global (sem `fazenda_id`), com escrita restrita a uma função
  auditada em vez de RLS declarativa solta — limite honesto documentado: a função ainda não
  consegue validar que o editor tem fazenda NO estado editado, porque `fazendas` não tem coluna
  de UF hoje (achado desta tarefa, pendência arquitetural nova registrada na seção 4). Validado
  por `supabase db reset` local + suíte pgTAP manual real (11/11 asserções, sessões
  `authenticated` simuladas via `set_config`/`set local role`, não superuser). Um bug de sintaxe
  (`returning p into v_row` após `INSERT ... ON CONFLICT DO UPDATE` convertendo a linha inteira
  para uuid) foi encontrado e corrigido durante a própria validação, antes de ir para o gate. Ver
  seção 5 e `.agents/memory/log/2026-07-20-db_sage-schema-fase3-financeiro.md`. **Gate do
  `cyber_chief` CONCLUÍDO (🟢) em 2026-07-20** — decisão central do gate: **BLOQUEADA e
  CORRIGIDA na hora** a autorização frouxa de `definir_prazo_declaracao_estado()` (em vez de
  aceitar o limite só documentado por `db_sage`), porque o self-signup automático (ADR-0001) faz
  de "vínculo operacional em qualquer fazenda" uma barreira quase inexistente — qualquer usuário
  cadastrado no sistema, sem relação nenhuma com a fazenda/estado alvo, conseguia sobrescrever o
  prazo regulatório de qualquer UF via chamada direta de API. Correção aplicada: `fazendas.estado`
  (coluna nova, nullable, seção 1.0 da migration) + autorização da função agora exige, quando a
  fazenda do chamador TEM `estado` preenchido, que ele coincida com o estado editado (fallback
  permissivo preservado para fazendas sem `estado`, 100% do parque hoje — sem regressão de
  funcionalidade). Um segundo achado próprio do gate corrigido junto: NULL-bypass nas 4
  validações de formato da função (parâmetro NULL pulava a checagem e caía num erro cru de
  `not null constraint` em vez de mensagem própria). Validado por smoke test real (não só leitura
  de código) via `docker exec`/`psql` com sessões `authenticated` simuladas, 7/7 cenários
  conferindo o comportamento esperado, rollback confirmado. **Efeito honesto registrado no
  próprio gate:** a correção NÃO reduz o risco para nenhuma fazenda existente hoje (nenhuma tem
  `estado` preenchido ainda) — fecha a validação estruturalmente, mas o risco central segue
  presente na prática até existir um fluxo de produto que colete `fazendas.estado` (pendência de
  produto, não deste gate — mantida como pendência de segurança monitorada, ver seção 4). Ver
  seção 5 e
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-financeiro.md`. **Confirmado aplicada
  ao banco remoto** (verificado 2026-07-20 por conexão `psql` direta — `lancamentos_financeiros`
  existente; ver correção de registro no início desta seção). Item 12 (view de
  saldo de rebanho, bloqueada por falta dos prints de referência) e item 14 (buckets de Storage)
  seguem NÃO iniciados.
- **Repositório:** criado — `https://github.com/DMZ-Digital-Access/rural-prod` (branch `main`)
- **Stack confirmada:** React 18 + TypeScript + Vite, Tailwind + shadcn/ui (componentes
  `table`/`dialog`/`select`/`badge`/`textarea` adicionados na Fase 2), react-hook-form + zod,
  @tanstack/react-query, Supabase (Postgres + Auth + Storage), sonner, recharts (em uso desde a
  Fase 2 — dashboard e comparativo entre lotes), react-router-dom, Vitest (testes de schema, 35
  testes no total). Hospedagem: Vercel/Netlify (frontend) + Supabase (backend gerenciado).
- **Última entrega:** frontend do Eixo 1 (Fase 2) — Dashboard, Animais (lista + detalhe +
  registro de pesagem via RPC), Lotes (lista + detalhe + arquivar/reativar), Comparativo entre
  lotes — implementado por `developer` em 2026-07-17. Ver seção 5,
  `.agents/memory/log/2026-07-17-developer-frontend-fase2.md`. Antes disso: frontend de
  autenticação (`/login`, `/signup` com suporte a `?convite=<token>`, `/convites/aceitar`) e
  shell de roteamento (`react-router-dom`, `ProtectedRoute`, `AppShell` com navegação em duas
  seções + Configurações) implementados por `developer` — ver
  `.agents/memory/log/2026-07-17-developer-frontend-fase1.md`. As duas migrations da Fase 1
  (`20260716171522_fase1_usuarios_fazendas.sql` e `20260716183000_adr0002_convites_papeis.sql`)
  e a migration da Fase 2 (`20260717140000_fase2_lotes_animais_pesagens.sql`) **aplicadas no
  banco Supabase remoto**; Edge Function `enviar-convite` **deployada**. Schema no ar:
  `usuarios`/`fazendas`/`usuarios_fazendas` (papel admin/membro/financeiro) + `convites` +
  `lotes`/`animais`/`pesagens` (+ views `animais_com_detalhes`/`lotes_com_estatisticas`), função
  `handle_new_user()` com branch de convite, funções `SECURITY DEFINER`
  (`aceitar_convite`/`promover_papel`/`criar_convite`/`cancelar_convite`/`registrar_pesagem`),
  RLS default-deny em todas as tabelas de autorização (Eixo 1 também exclui `papel='financeiro'`
  em todas as policies, spec seção 5.4).
- **Em andamento agora:** nada bloqueando a Fase 2 do ponto de vista de código ou de testes de
  banco. Pendências abertas (não bloqueantes, ver seção 4): teste de UI em navegador real (nenhum
  agente teve acesso até agora); ação humana da conta Resend (`RESEND_API_KEY`/`APP_URL`,
  ADR-0003); policy de SELECT pública por token em `convites` não implementada; testes de
  componente/E2E reais do frontend não escritos em nenhuma fase (só os schemas zod puros);
  seletor de fazenda multi-tenant não existe (`useFazendaAtual` pega sempre o vínculo mais antigo
  do usuário).
- **Retrofit de responsividade mobile concluído em 2026-07-20** (`developer`) — Shell +
  Eixo 1 completo (AppShell com drawer mobile via `Sheet` novo, tabelas com colunas priorizadas
  por breakpoint, headers empilháveis). `npm run build`/`lint`/`test` (35/35) limpos. Primeiro
  teste visual real em viewport mobile do projeto (Playwright, 390×844, contra o remoto). Eixo 2
  fica de fora (placeholder). Ver seção 5 e
  `.agents/memory/log/2026-07-20-developer-retrofit-mobile-eixo1.md`.
- **Última atualização:** 2026-07-19 — `qa` (Emma) escreveu e **rodou de verdade** a suíte pgTAP
  de RLS/RPC/GMD da Fase 2 (63/63 asserções, incluindo a regressão do bug de GMD do protótipo e
  os 3 achados do gate `cyber_chief`). Ver seção 5 e
  `.agents/memory/log/2026-07-19-qa-testes-fase2-gmd.md`. Antes disso, 2026-07-17: `developer`
  (Ryan) implementou as 6 telas do Eixo 1 (Dashboard/Animais/Lotes/Comparativo), fechando a
  Fase 2 do ponto de vista de frontend. Ver
  `.agents/memory/log/2026-07-17-developer-frontend-fase2.md`.

---

## 2. Decisões Importantes

> Decisões já tomadas na própria especificação (não precisam ser revalidadas) + decisões
> novas tomadas durante o desenvolvimento.

| Data | Decisão | Origem/Responsável | Detalhe |
|---|---|---|---|
| spec v2.0 | Código do protótipo Bolt.new **não será reaproveitado** — projeto novo do zero | Cliente/spec | Seção "Decisão de projeto importante", topo da spec |
| 2026-07-16 | Reconciliação Eixo 1 ↔ Eixo 2: **Opção B (vinculada)** confirmada por JP — não é mais roadmap | JP | Nova tabela `transacoes_animais` (N:N transação↔animal) entra na Fase 3, não na Fase 6; trigger/lógica atualiza `animais.status` automaticamente ao vincular venda. Ver spec seção 3.3 atualizada. **ADR formalizado em 2026-07-20 — ver linha ADR-0004 abaixo** |
| 2026-07-20 | **ADR-0004 aceito:** desenho técnico de `transacoes_animais` — dois triggers `SECURITY INVOKER` (não `SECURITY DEFINER`); `AFTER INSERT` só muta `animais.status` para `venda` quando `tipo_operacao_transacao = 'venda'` (coluna nova, denormalizada/imutável, capturada no `BEFORE INSERT`); `financeiro` sem NENHUM acesso (nem `SELECT`) à tabela; cross-fazenda validado por trigger (padrão `validar_lote_mesma_fazenda()`); `DELETE` reverte `status` para `'ativo'` só se ainda for `'venda'` e não houver outro vínculo de venda remanescente; sem trava de banco para revenda de animal já vendido/morto/baixado (mitigação só na UI) | `architect` (Alex) | Fecha a dívida de processo pendente desde 2026-07-16 (spec seção 3.3, "architect formaliza ADR na Fase 3"). Ver `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md` |
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
| 2026-07-20 | **Correção:** faixa etária de Ovino mudou de 0-6/Mais de 6 meses (decisão de 2026-07-16, linha acima) para **0-12/Mais de 12 meses** | JP, após comparar com print real do sistema da Secretaria | Print real do módulo "Saldo Atual" de Ovino contradisse a decisão anterior — Bovino no mesmo print bateu 100% com o já semeado, sem mudança. Corrigido via migration nova (não editando a migration já aplicada) — ver `.agents/memory/log/2026-07-20-db_sage-fix-ovino-agrupamento.md` |
| 2026-07-16 | Supabase: **projeto novo** (não reaproveita o do protótipo Bolt.new) | JP | Resolve item 2 da Fase 0, seção 10 da spec |
| 2026-07-16 | **ADR-0001 aceito:** provisionamento de conta no signup via **trigger de banco** `on_auth_user_created` (não Edge Function) — função `SECURITY DEFINER` em `auth.users` cria `usuarios`+`fazendas`+`usuarios_fazendas` (`papel='dono'`) na mesma transação | `architect` (Alex) | Escolhido pela atomicidade real (falha em qualquer insert reverte tudo, inclusive `auth.users` — nunca há conta "meio criada"); Edge Function foi rejeitada por não ser atômica com o signup (janela de rede entre `signUp()` e a chamada da função). Implicação de RLS: nenhuma policy de INSERT necessária/permitida para `authenticated`/`anon` nessas 3 tabelas. Revisar quando o papel Financeiro/Contábil (Fase 6) entrar — hoje a função assume que todo signup cria fazenda nova. Ver `.agents/memory/adr/ADR-0001-provisionamento-conta.md` |
| 2026-07-16 | **ADR-0002 aceito:** papel único hierárquico `admin/membro/financeiro` (substitui `dono`) + convite para fazenda existente (novo usuário ou já cadastrado) já nesta fase, não só Fase 6. Escrita em `usuarios_fazendas`/`convites` só via 4 funções `SECURITY DEFINER` (`aceitar_convite`, `promover_papel`, `criar_convite`, `cancelar_convite`) — zero policy de INSERT/UPDATE/DELETE nova para `authenticated`/`anon`, generalizando a correção do `cyber_chief` na Fase 1. Envio de convite a quem não tem conta exige Edge Function nova (`enviar-convite`, `service_role`) | `architect` (Alex) | Substitui parcialmente o ADR-0001 (só a premissa "todo signup cria fazenda nova"; resto do ADR-0001 continua válido). Ver `.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md` |
| 2026-07-17 | **ADR-0003 aceito:** provedor de e-mail transacional = **Resend** (API HTTP simples sem SDK Node-específico, tier gratuito de 3.000 e-mails/mês, deliverability adequada) para o branch "convidado já tem conta" de `enviarEmailConvite()`. Código implementado gated por `RESEND_API_KEY` (opcional, ausente hoje — fallback de log preservado). `APP_URL` de dev local = `http://localhost:5173` (porta padrão do Vite, sem `server.port` customizado) | `devops` (Oliver) | Precisa de ação humana para completar: criar conta Resend, gerar API key, rodar `supabase secrets set RESEND_API_KEY=...`/`APP_URL=...` e `supabase functions deploy`. Atualizar `APP_URL` para a URL pública real quando o frontend for deployado (Vercel/Netlify). Ver `.agents/memory/adr/ADR-0003-provedor-email-transacional.md` |

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

**Contexto de produto novo, registrado por JP em 2026-07-20 — para Fase 4 (Transações) e item 14
(Storage), NÃO implementado ainda:**

1. **"Doc Faltante" — estado por operação, distinto de "GTA Pendente".** Cada `transacao` pode
   ter até 3 documentos: Nota, Contranota, GTA — o usuário pode cadastrar a operação com
   qualquer subconjunto deles (inclusive só a nota própria). Quando falta a GTA → "GTA Pendente"
   (já implementado, é o que `obter_saldo_rebanho()` usa, spec/print confirmam). Quando falta
   Nota **e/ou** Contranota → deve ser identificado como **"Doc Faltante"**, um status
   SEPARADO que não entra na conta de `Qtd. Registrada`/`Qtd. Pendente` do saldo (JP confirmou
   explicitamente: misturar os dois sob "Pendente" confundiria o usuário, e divergiria do número
   real do portal da Secretaria, que só conhece GTA). No card/item de cada operação (tela de
   Transações, Fase 4), os campos pendentes devem aparecer, ou o link do documento para
   visualização/download quando presente.
2. **Falta schema para upload dos documentos de Nota/Contranota.** Hoje `transacoes` só tem
   `numero_nota` (texto) e `tem_contranota` (boolean) — nenhuma coluna de arquivo. Para o "link
   do documento" que JP descreveu, provavelmente precisa de colunas tipo `arquivo_path`/
   `arquivo_mime_type` por documento (mesmo padrão já usado em `gtas`), o que cruza com o item
   14 (Storage), ainda não iniciado. Não modelado nesta sessão — fica para quando o item 14
   for retomado.
3. **Fluxo Compra → Animal individual (Eixo 2 → Eixo 1), confirmado compatível com o schema
   atual, sem mudança necessária:** ao registrar uma `transacao` de compra, os animais ainda NÃO
   existem como registros individuais em `animais` — só o saldo agregado
   (`transacoes_detalhe`) é conhecido no momento da compra. O cadastro individual (identificador,
   pesagem, "brincagem"/identificação, lote opcional) acontece depois, como passo manual
   separado do Eixo 1 — sem vínculo automático de volta à `transacao` de compra que originou a
   entrada. `obter_saldo_rebanho()` (item 12, ver seção 5) já é compatível com esse fluxo, pois
   opera inteiramente sobre `transacoes_detalhe` (agregado), sem depender de `animais` existir.
   Relevante para o desenho da tela de Transações (Fase 4), registrado aqui para não se perder.

**Pendência de trabalho (não bloqueante — schema modelado, gate de segurança ainda NÃO
rodado):** migration da Fase 3, item 13
(`supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`) —
`lancamentos_financeiros`/`declaracoes_rebanho`/`prazos_declaracao_estado` +
`definir_prazo_declaracao_estado()`/`obter_prazo_declaracao_estado()`. **Ainda não passou pelo
gate do `cyber_chief`** — próximo passo obrigatório antes de `supabase db push`. Ver seção 5 e
`.agents/memory/log/2026-07-20-db_sage-schema-fase3-financeiro.md`.

**Pendência de segurança monitorada (não bloqueante, PARCIALMENTE corrigida pelo `cyber_chief`
em 2026-07-20 — não eliminada):** `fazendas` ganhou a coluna `estado` (UF, nullable, migration
`20260720150000_fase3_financeiro_declaracoes_prazos.sql`, seção 1.0) e
`definir_prazo_declaracao_estado()` agora exige, quando a fazenda do chamador TEM `estado`
preenchido, que ele coincida com o estado sendo editado — fechando estruturalmente o risco
original (qualquer usuário cadastrado, via self-signup automático do ADR-0001, conseguia
sobrescrever o prazo regulatório de qualquer UF, não só a de fazendas reais daquele estado).
**Efeito honesto:** nenhuma fazenda existente hoje tem `estado` preenchido (coluna nasce vazia,
sem backfill, decisão explícita do gate para não regredir funcionalidade nem exigir fluxo de
produto novo) — então o risco **segue presente na prática** para todo o parque atual, caindo no
fallback permissivo antigo ("qualquer vínculo `papel <> financeiro` em alguma fazenda"). Só
deixa de estar presente para uma fazenda específica quando ela preencher `estado` (já editável
hoje pelo próprio admin/membro, mesma policy de `nome`). Fecha por completo quando existir um
fluxo de produto que colete esse dado (signup novo e/ou "complete seu cadastro" para fazendas já
cadastradas — não implementado, fora do escopo técnico que `cyber_chief` resolve sozinho). Ver
`.agents/memory/log/2026-07-20-cyber_chief-review-fase3-financeiro.md` para a análise completa
de risco e a decisão de bloquear/corrigir em vez de só documentar.

**Item já resolvido — gate de segurança JÁ CONCLUÍDO e migration JÁ APLICADA ao remoto:**
migration da Fase 3, item 11 (`supabase/migrations/20260720133000_fase3_gtas_transacoes.sql`) —
`gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais`. `transacoes_animais` implementa
o ADR-0004 (D1-D6) sem desvio (confirmado linha a linha no gate). **Passou pelo gate do
`cyber_chief` (🟢)** em 2026-07-20 — as 13 policies de RLS das 3 fronteiras distintas de
`financeiro` (`gtas`=zero, `transacoes`/`transacoes_detalhe`=SELECT only, `transacoes_animais`=
zero) conferidas uma a uma sem nenhum achado de diluição por cópia-e-cola (a preocupação que a
própria `db_sage` tinha sinalizado não se concretizou); os dois triggers de integridade cruzada
`gtas`↔`transacoes` (`validar_gta_transacao_mesma_fazenda`/`validar_transacao_gta_mesma_fazenda`,
iniciativa própria da `db_sage`) revisados como código novo, NULL-safe, sem achado. **1 correção
aplicada:** corrida (TOCTOU) na guarda de coexistência de D5 do ADR-0004
(`reverter_status_animal_apos_desvinculo()`) — dois `DELETE`s concorrentes de vínculos de venda
distintos do mesmo animal podiam fazer `animais.status` ficar preso em `'venda'`
permanentemente mesmo depois de todos os vínculos removidos; corrigido com `select ... for
update` na linha de `animais`, serializando as duas execuções, mesmo padrão já usado em
`registrar_pesagem()` (Fase 2) e `promover_papel()` (ADR-0002). `especie_id`/
`agrupamento_etario_id` com `on delete restrict` e ausência de policy de DELETE em `gtas`/
`transacoes`/`transacoes_detalhe` avaliados como decisões corretas de segurança, sem achado. Ver
seção 5 e `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-transacoes.md`. **Confirmado
aplicada ao banco remoto** (verificado 2026-07-20 por conexão `psql` direta ao pooler
`aws-1-us-west-2` — `gtas` existente; ver correção de registro na seção 1). Não há log de quando
o `db push` foi executado.

**Item já resolvido — gate de segurança JÁ CONCLUÍDO e migration JÁ APLICADA ao remoto:**
migration da Fase 3, item 10
(`supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`) — catálogos
`especies`/`subtipos_especie`/`agrupamentos_etarios`, seed completo (8/9/24 linhas, validado por
query real após `supabase db reset` local, não só por leitura do SQL). **Passou pelo gate do
`cyber_chief` (🟢) em 2026-07-20, sem nenhuma correção necessária** — os 2 pontos de atenção
técnica que a `db_sage` tinha deixado para o gate (RLS de leitura aberta a qualquer
`authenticated` sem filtro de papel; integridade subtipo↔espécie via FK composta com MATCH
SIMPLE) foram confirmados corretos por smoke test real, não só leitura de código: `anon` vê 0
linhas nas 3 tabelas; `authenticated` sem nenhum vínculo de fazenda vê as 8/9/24 linhas
completas (necessário para o papel `financeiro` popular seletores de Eixo 2); INSERT/UPDATE/
DELETE bloqueados para `authenticated` (RLS default-deny, `pg_policies` confirma exatamente 3
policies, todas SELECT/authenticated); tentativa de inserir faixa etária cruzando
espécie/subtipo incompatível (Bovino apontando para subtipo de Aves) rejeitada pela FK composta.
Os dois pontos de transcrição de dado que a `db_sage` tinha sinalizado (Muares como subtipo
ÚNICO "Mula/Burro/Jumento"; sobreposição de borda + hiato 151-179 dias nas faixas de Suíno e
Aves-Frango de Corte) foram avaliados como decisões de modelagem/produto já corretamente
tomadas, sem nenhum vetor de segurança associado — não geraram correção. Ver
`.agents/memory/log/2026-07-20-db_sage-schema-fase3-especies.md` e
`.agents/memory/log/2026-07-20-cyber_chief-review-fase3-especies.md`. **Confirmado aplicada ao
banco remoto** (verificado 2026-07-20 por conexão `psql` direta — `especies` com as 8 linhas do
seed). Com isso, **as 3 migrations da Fase 3 (itens 10/11/13) estão todas com gate concluído E
já aplicadas ao remoto** — não há `db push` pendente para nenhuma delas.

**Pendência de trabalho (não bloqueante — gate de segurança JÁ CONCLUÍDO, falta só aplicar):**
migration da Fase 2 (`supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql`) —
tabelas `lotes`/`animais`/`pesagens`, views `animais_com_detalhes`/`lotes_com_estatisticas`,
função `registrar_pesagem()` + trigger `atualizar_animal_apos_pesagem()` (fórmula de GMD
corrigida, spec seção 9 item 2). Escrita por `db_sage` em 2026-07-17. **Passou pelo gate do
`cyber_chief` (🟢)** no mesmo dia — corrigidos: (1) RLS de `lotes`/`animais`/`pesagens` e a
autorização de `registrar_pesagem()` não excluíam `papel='financeiro'` (já ativo em produção via
ADR-0002), violando spec seção 5.4 ("sem acesso a manejo individual de animais/lotes/pesagens");
(2) `inicializar_peso_atual_animal()` só protegia os 3 campos calculados de `animais` contra
UPDATE, não contra INSERT — falsificação possível na criação do animal; (3) mensagens de erro de
`registrar_pesagem()` unificadas (oráculo de enumeração de `animal_id` entre fazendas). Ver
`.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`. **Aplicada ao banco remoto** — as
telas de frontend (`developer`, 2026-07-17, ver seção 5) já consomem o schema em produção.
**Testes automatizados de RLS/RPC/GMD CONCLUÍDOS e passando** (`qa`, 2026-07-19, 63/63
asserções — inclui regressão do bug de GMD do protótipo e dos 3 achados do `cyber_chief` acima —
ver `.agents/memory/log/2026-07-19-qa-testes-fase2-gmd.md`). Pendências não bloqueantes
remanescentes: duas decisões de produto seguem sem confirmação explícita de JP (pesagem em
animal vendido/morto/baixado não bloqueada; `peso_inicial_kg` editável sem recálculo imediato de
GMD) e se `financeiro` deve ter alguma visão read-only de Eixo 1 (a correção aplicada segue a
leitura mais estrita da spec — zero acesso, nem leitura; o frontend não esconde os itens de menu
correspondentes por papel); cobertura de teste sem as views
`animais_com_detalhes`/`lotes_com_estatisticas` nem `calcular_categoria_animal()`, e sem teste
de concorrência real para `registrar_pesagem()` (lista completa de lacunas honestas no log de
2026-07-19).


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

**Pendência de trabalho resolvida em 2026-07-17 (`qa`/Emma):** os testes automatizados de RLS
recomendados pelo `cyber_chief` no gate da Fase 1 e no gate do ADR-0002 foram escritos e
**executados de verdade** contra Supabase local — 32/32 asserções passaram, incluindo a
regressão do bypass de autorização via NULL e um teste de concorrência real da guarda de
`promover_papel()`. Ver `.agents/memory/log/2026-07-17-qa-testes-fase1-adr0002.md` e seção 5.
Pendências residuais não bloqueantes desta rodada: cobertura pgTAP dedicada de
`criar_convite()`/`cancelar_convite()`; teste HTTP do branch Resend de `enviar-convite` quando
`RESEND_API_KEY` existir; CLI do Supabase local desatualizada (2.26.9), forçando excluir
`storage-api`/`imgproxy`/`logflare`/`vector` de `supabase start` local (não usados pelos testes
desta rodada, mas bloqueiam testar Storage/Analytics localmente até a CLI ser atualizada).

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

**Pendência de trabalho (não bloqueante — gate de segurança JÁ CONCLUÍDO, código do provedor JÁ
IMPLEMENTADO):** Edge Function `enviar-convite` (`supabase/functions/enviar-convite/{index.ts,
logica.ts,index.test.ts}`) — branch `admin.inviteUserByEmail` (sem conta) implementado por
completo; branch de e-mail transacional (já tem conta) agora chama a Resend de verdade via
`fetch()` quando `RESEND_API_KEY` está configurada, com fallback seguro (log da URL,
`emailEnviado: false`) quando ausente ou em caso de falha — ver ADR-0003 (`devops` decidiu o
provedor em 2026-07-17). **Já deployada em versão anterior** (`supabase functions deploy`
confirmado no dashboard), mas a versão com Resend **ainda não foi redeployada** — precisa de
`supabase functions deploy enviar-convite --project-ref bsoofshttpboaaokejwt` depois que os
secrets abaixo existirem.

**Pendência de ação humana (não bloqueante — só ação humana falta, nada técnico pendente):**
criar conta na Resend (https://resend.com), gerar API key, e rodar os dois `supabase secrets
set` documentados em `.agents/memory/adr/ADR-0003-provedor-email-transacional.md`
(`RESEND_API_KEY` e `APP_URL=http://localhost:5173` para dev local) antes do redeploy da Edge
Function. Quando o frontend for deployado (Vercel/Netlify), `APP_URL` precisa ser atualizada
para a URL pública real — instrução com ⚠️ explícito no próprio ADR-0003. Nenhum agente pode
executar esta pendência (criação de conta externa e aplicação de secrets em produção são
decisões humanas/orchestrator).

**Pendência de decisão resolvida NÃO implementar sem revisão (achado do `developer` em
2026-07-17, frontend Fase 1):** a tela de `/signup` com `?convite=<token>` não consegue
mostrar para qual fazenda/papel o usuário está sendo convidado antes de completar o cadastro,
porque as policies de SELECT de `convites` (ADR-0002) exigem `authenticated` E ser
admin/destinatário — não há hoje leitura pública por token. Resolver exigiria uma policy nova
(ex.: SELECT por `token` sem exigir sessão), não implementada por conta própria — pendência de
decisão para `db_sage`/`cyber_chief`. Ver
`.agents/memory/log/2026-07-17-developer-frontend-fase1.md`.

**Pendência de trabalho (não bloqueante — Fase 1 fechada, mas cobertura de teste do frontend
é parcial):** `developer` (Ryan) só escreveu testes automatizados para os schemas zod puros de
validação de formulário (`src/lib/validations/auth.test.ts`, Vitest, 10/10 PASS) — nenhum
teste de componente (Testing Library não instalada) nem end-to-end real do fluxo de
signup/login/aceite de convite a partir do frontend contra um Supabase real. Sem acesso a
navegador neste ambiente, o smoke test de `npm run dev` confirmou apenas que o servidor sobe e
responde HTTP 200, não que a UI renderiza/interage corretamente.

---

## 5. Histórico de Tarefas Complexas (mais recente primeiro)

### 2026-07-20 — Frontend ADR-0005: "Individualizar Animal" + "Entradas e Saídas de Animais de Lote" — `developer` (RYAN, via Claude)

- **O que foi feito:** RPC nova `registrar_entrada_saida_lote()` (migration
  `20260720220000_adr0005_rpc_entrada_saida_lote.sql`, SECURITY INVOKER, insere transacao+
  transacoes_detalhe atomicamente validando soma machos+fêmeas) + frontend completo: botão
  "Novo animal" renomeado para "Individualizar Animal" (rótulo de peso → "Peso de hoje (kg)");
  novo botão/dialog "Entradas e Saídas de Animais de Lote" (5 tipos de operação, Machos/Fêmeas,
  outra parte com rótulo dinâmico, data, valor/peso opcionais).
- **Construído mobile-first desde o início** (diretriz nova de JP, ver seção 2) — validado
  visualmente em 1440×900 E 390×844 antes de considerar a tarefa concluída, não como retrofit.
- **Validação:** `npm run build`/`lint`/`test` (35/35) limpos; RPC testada localmente com
  usuários reais via GoTrue (soma correta, rejeição de zero animais, `financeiro` bloqueado pela
  RLS existente); Playwright confirma os dois botões lado a lado em desktop/empilhados em
  mobile, formulário completo renderizando sem overflow nas duas resoluções.
- **Log completo:** `.agents/memory/log/2026-07-20-developer-frontend-adr0005.md`.
- **Pendências:** upload real de Nota/Contranota depende do item 14 (Storage); card de detalhe
  de operação com GTA/Nota/Contranota "presente ou pendente" ainda não implementado (Fase 4);
  Venda/Óbito/Consumo vinculados a animal individual específico (via `transacoes_animais`) sem
  UI ainda — esta tela só cobre lançamento agregado.

### 2026-07-20 — ADR-0005 + schema + gate: expansão de transacoes (nascimento/obito/consumo, docs independentes, saldo "Não classificado") — `architect`+`db_sage`+`cyber_chief` (via Claude)

- **Motivação:** JP pediu, fora da sequência da spec, mudar a UX de Animais — botão
  "Individualizar Animal" (renomeação) + novo botão "Entradas e Saídas de Animais de Lote" (5
  tipos: Compra/Venda/Nascimento/Óbito/Consumo). Isso reabriu decisões de schema já gateadas
  (itens 11/12) — formalizado em `ADR-0005-expansao-transacoes-doc-tracking.md`.
- **Decisões (D1-D7), todas confirmadas por JP em tempo real:** `tipo_operacao` ganha 3 valores
  aditivamente (nascimento/obito/consumo, pastoreio continua existindo); Óbito→`morte`,
  Consumo→`baixa` via extensão do trigger do ADR-0004; **Nascimento fica FORA** do mecanismo de
  `transacoes_animais` (agregado só, mesmo tratamento de Compra — animal não existe
  individualmente ainda); GTA sem mudança (já cobre presente/pendente); Nota/Contranota ganham
  colunas de arquivo (`arquivo_nota_path`/`arquivo_contranota_path`), `tem_contranota` removida;
  `peso_total_kg` novo (opcional); `transacoes_detalhe.agrupamento_etario_id` vira nullable
  (sexo sem faixa etária) — saldo ganha seção "Não classificado" (só aparece com movimento
  real, não polui o catálogo regulatório de `agrupamentos_etarios`); `outra_parte` único
  mantido (sem campos separados de comprador/vendedor).
- **Schema implementado** em `20260720210000_adr0005_expansao_transacoes.sql` — aditiva sobre
  os itens 11/12, sem editar migrations já aplicadas.
- **Validado localmente** com usuários reais via GoTrue: nascimento/óbito/consumo funcionando
  exatamente como desenhado; sexo sem faixa etária isolado em "Não classificado";
  **regressão confirmada** — reprodução do cenário Ovino do gate do item 12 continua idêntica
  após a reescrita da view de saldo.
- **Gate do `cyber_chief` CONCLUÍDO (🟢) no mesmo dia, sem correção necessária** — `financeiro`
  e `admin` veem os mesmos números na linha "Não classificado"; `anon` bloqueado.
- **Logs completos:** `.agents/memory/log/2026-07-20-db_sage-schema-adr0005.md` e
  `.agents/memory/log/2026-07-20-cyber_chief-review-adr0005.md`.
- **Pendências:** frontend (renomear botão + novo fluxo de lançamento) é a próxima tarefa;
  upload real de Nota/Contranota depende do item 14 (Storage), ainda não iniciado.

### 2026-07-20 — Schema + gate de segurança, Fase 3 item 12: saldo de rebanho (view calculada) — `db_sage` + `cyber_chief` (via Claude)

- **O que foi feito:** item 12 desbloqueado no mesmo dia pelos prints reais que JP forneceu
  (`Bovinos/Ovino-saldo-atual.png` + `Controle-entradas-saidas.png` + `Declaracoes-de-animais.png`
  + GTAs). Migration nova `20260720200000_fase3_saldo_rebanho.sql` — 3 objetos só-leitura:
  view `saldo_rebanho_movimentos` (granular, sinalizada +/-, classificação registrada/pendente),
  função `obter_saldo_rebanho(p_data_referencia date default current_date)` (agrega contra a
  espinha completa fazenda×espécie×agrupamento×sexo, replicando os zeros do print), e a view de
  conveniência `saldo_rebanho` (nome literal da spec, "saldo de hoje").
- **Decisão de design mais importante:** classificar registrada/pendente via
  `transacoes.status_gta_transacao` (que `financeiro` TEM acesso), não via JOIN em
  `gtas.status_liberacao` (RLS exclui `financeiro` por completo) — evita que `financeiro` veja
  um saldo ERRADO (todo mundo cairia em "registrada" por não enxergar a GTA) sem nenhum erro
  visível. Validado na prática: `admin` e `financeiro` da MESMA fazenda leem números idênticos.
- **Ambiguidade resolvida com JP:** venda com GTA pendente gera `qtd_pendente` negativo
  (matematicamente correto, mas nenhum print mostra esse caso). JP confirmou: pendente se
  aplica simetricamente a entrada E saída — "quando ainda não tem no sistema a GTA referente
  àquela transação". Implementação já escrita validada sem mudança de código.
- **Reprodução exata dos 2 prints reais** (Ovino: 4/4 combinações; Bovino: 8/8 combinações,
  incluindo totais 201 registrada/184 pendente) — testado localmente com usuários reais via
  GoTrue (`/auth/v1/signup`), não superuser simulado.
- **Gate do `cyber_chief` CONCLUÍDO (🟢) no mesmo dia, sem correção necessária** — `security_
  invoker=true` confirmado nas 2 views; isolamento cross-fazenda confirmado; `anon` vê 0 linhas.
- **Limite honesto:** `transacoes_detalhe` é opcional (spec) — transações reais só com
  `observações` em texto livre (comuns no print de JP) não entram no saldo calculado até serem
  estruturadas.
- **Checkpoint de Validação de Saldo — CONFIRMADO por JP em 2026-07-20.** Comparação lado a
  lado apresentada em tabela (Ovino 4/4 combinações; Bovino 8/8 combinações incluindo os totais
  201 registrada/184 pendente) — JP confirmou explicitamente "os números batem, pode fechar o
  item 12" após pedir para ver a tabela (não apenas a descrição em texto). **Item 12 e Fase 3
  (Eixo 2 — Dados e Regras) considerados completos, exceto item 14 (Storage), ainda não
  iniciado.** Nota: a comparação usou transações de TESTE inseridas localmente (desfeitas por
  `rollback`) — o banco remoto tem a função/views aplicadas, mas nenhuma transação real da
  fazenda de JP lançada nelas ainda.
- **Logs completos:** `.agents/memory/log/2026-07-20-db_sage-schema-fase3-saldo.md` e
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-saldo.md`.

### 2026-07-20 — Retrofit de responsividade mobile: Shell + Eixo 1 — `developer` (RYAN, via Claude)

- **O que foi feito:** a pedido de JP, priorizado antes de retomar a Fase 3 (item 12). Auditoria
  prévia mostrou o app essencialmente desktop-only (sidebar fixa sem breakpoints, só 4 páginas
  usando `lg:grid-cols-*`, nenhum uso de `sm:`). Escopo: `AppShell` + as 6 telas do Eixo 1
  (Dashboard/Animais/AnimalDetail/Lotes/LoteDetail/Comparativo) + 3 formulários. Eixo 2 fica de
  fora (ainda é placeholder, Fase 4).
- **Componente novo:** `src/components/ui/sheet.tsx` — não existia; construído sobre o mesmo
  primitivo de `Dialog` (`@base-ui/react/dialog`, projeto usa `components.json` style
  `base-nova`, não Radix) com posicionamento de painel lateral, em vez de rodar
  `npx shadcn add sheet` (assume Radix, quebraria consistência).
- **`AppShell`:** sidebar fixa só a partir de `lg` (1024px); abaixo disso, hambúrguer + `Sheet`
  deslizante com a mesma navegação de 3 seções (`SidebarNav` extraído como componente
  compartilhado). Navegar por um item do drawer fecha ele automaticamente.
- **Tabelas** (Animais/Lotes/LoteDetail): colunas secundárias ocultas progressivamente
  (`hidden sm:table-cell`/`md:table-cell`/`lg:table-cell`) em vez de só depender do
  `overflow-x-auto` de fábrica do componente `Table`.
- **Headers de página:** `flex items-center justify-between` → empilha em `flex-col` abaixo de
  `sm`, evitando título e botão/seletor disputarem espaço em telas estreitas.
- **Não precisou de mudança:** formulários e grids `dl` de estatística já eram mobile-first por
  acidente — confirmado por teste visual real, não assumido.
- **Validação:** `npm run build`/`lint`/`test` (35/35) limpos, sem regressão. **Primeiro teste
  visual real em viewport mobile deste projeto** — Chromium headless via Playwright, 390×844,
  logado contra o Supabase remoto com a conta de teste real: Dashboard, drawer, Animais, Lotes,
  LoteDetail, AnimalDetail, tudo sem overflow horizontal, zero erros de console. Achado de
  timing (não bug): Dashboard demora até ~1s pra carregar dados na primeira renderização
  (latência de rede contra o remoto), não é uma trava.
- **Pendências:** telas de Eixo 2 (placeholder) ficam para quando forem implementadas de
  verdade; nenhum teste de componente/E2E automatizado cobre o drawer (só validação visual
  manual); bottom tab bar foi considerada e descartada por JP em favor do drawer.
- **Log completo:** `.agents/memory/log/2026-07-20-developer-retrofit-mobile-eixo1.md`

### 2026-07-20 — Correção de dado: faixas etárias de Ovino (comparação com prints reais da Secretaria) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** JP compartilhou 6 prints reais do sistema da Secretaria Estadual de
  Agricultura (Saldo Atual de Bovino e Ovino, Declarações, GTAs) e da planilha manual da fazenda
  (Controle de entradas e saídas) — massa de teste de aceite do item 12 (checkpoint de validação
  de saldo). Comparação imediata revelou que Bovino bate 100% com o já semeado, mas Ovino no
  print real usa faixas **"0-12 meses"/"mais de 12 meses"**, diferente do que a migration
  `20260720120000_fase3_especies_agrupamentos.sql` semeou ("0-6"/"Mais de 6", decisão de
  2026-07-16). JP confirmou corrigir para o print real.
- **Correção aplicada:** nova migration
  `supabase/migrations/20260720190000_fix_ovino_agrupamento_etario.sql` (UPDATE de 2 linhas
  existentes, não uma reescrita da migration antiga — que já estava aplicada ao remoto).
  Validada localmente (`supabase db reset`) e aplicada ao remoto (`supabase db push`),
  reconfirmada por `psql` direto contra `bsoofshttpboaaokejwt`.
- **Achados secundários não bloqueantes:** aba "Vacinação" no print de Bovino (módulo fora da
  spec/schema atual, não implementado); espécie "Caninos" no print de Declarações (sempre 0,
  fora do catálogo de 8 espécies do produto — provavelmente categoria genérica do formulário do
  Estado).
- **Pendência:** os prints em si não foram versionados no repo (só vistos inline na conversa,
  sem caminho de arquivo) — se quiser guardá-los como massa de teste formal para `qa`, precisa
  fornecer os arquivos.
- **Log completo:** `.agents/memory/log/2026-07-20-db_sage-fix-ovino-agrupamento.md`

### 2026-07-20 — Security review Fase 3, item 10: especies/subtipos_especie/agrupamentos_etarios — `cyber_chief` (CONSTANTINE, via Claude)

- **O que foi feito:** gate de segurança formal de
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`, entregue pela `db_sage`
  no mesmo dia (ver entrada mais abaixo). Único item dos 3 já escritos na Fase 3 (10/11/13) que
  ainda não tinha passado pelo gate — fecha a Fase 3 do ponto de vista de segurança até aqui.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push` (decisão de aplicar continua
  humana/orchestrator). **Nenhuma correção necessária** — primeira migration da Fase 3 a sair do
  gate sem nenhum achado que exigisse mudança de código.
- **Ponto 1 — RLS de leitura aberta a qualquer `authenticated`, sem filtro de papel: correto.**
  Diferente de `lotes`/`animais`/`pesagens` (Fase 2), onde `financeiro` é excluído por spec
  5.4, aqui excluir por papel seria erro: este catálogo alimenta os módulos de Eixo 2, aos quais
  `financeiro` tem acesso explícito, e as 3 tabelas não carregam dado sensível por
  fazenda/usuário. Validado por smoke test real (`docker exec`/`psql`, sessões
  `anon`/`authenticated` simuladas via `set local role` + `request.jwt.claims`, não superuser):
  `anon` vê 0 linhas; `authenticated` sem nenhum vínculo de fazenda vê as 8/9/24 linhas completas
  nas 3 tabelas.
- **Ponto 2 — FK composta com MATCH SIMPLE (integridade subtipo↔espécie): correto.** MATCH
  SIMPLE não valida a FK quando `subtipo_especie_id` é NULL (caso normal para
  Bovino/Suíno/Equino/Ovino/Caprino) — comportamento correto, sem janela de inconsistência.
  Confirmado por teste direto: INSERT de faixa etária de Bovinos apontando para o subtipo
  "Frango de Corte" (que pertence a Aves) **rejeitado** pela constraint
  `agrupamentos_etarios_subtipo_mesma_especie`.
- **Ponto 3 — decisões de transcrição (Muares subtipo único; sobreposição Suíno/Aves-Frango):
  não são achados de segurança**, ficam como pendência de modelagem/produto já registrada na
  seção 4, sem vetor de bypass/injeção/exposição associado.
- **Restante revisado sem achados:** escrita (INSERT/UPDATE/DELETE) bloqueada para
  `authenticated` nas 3 tabelas (`pg_policies` confirma exatamente 3 policies, todas
  SELECT/authenticated, sem sobra) — INSERT rejeitado por RLS, UPDATE/DELETE afetam 0 linhas;
  `especies.ativo` sem filtro na RLS de SELECT avaliado como soft-disable de UI, não achado;
  cascatas (`on delete cascade`) sem risco de exploração via client (escrita já bloqueada);
  nenhuma função nova nesta migration (só reaproveita `trigger_set_updated_at()`, já revisado).
- **Mudanças de arquivo:** nenhuma mudança em
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql` — aprovada como está;
  novo `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-especies.md`; esta entrada +
  seções 1 e 4 de `PROJECT_CONTEXT.md`.
- **Pendências:** nenhuma pendência de segurança nova. Com este gate, as 3 migrations da Fase 3
  (itens 10/11/13) estão todas liberadas para `supabase db push` (decisão humana/orchestrator).
  Itens 12 (saldo, bloqueado por prints de referência) e 14 (Storage) seguem não iniciados.
- **Log completo:** `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-especies.md`

### 2026-07-20 — Security review Fase 3, item 13: lancamentos_financeiros/declaracoes_rebanho/prazos_declaracao_estado — `cyber_chief` (CONSTANTINE, via Claude)

- **O que foi feito:** gate de segurança formal de
  `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`, entregue pela
  `db_sage` no mesmo dia (entrada abaixo). A tarefa pedia uma decisão explícita entre aceitar o
  limite documentado por `db_sage` em `definir_prazo_declaracao_estado()` (mitigação só por
  auditoria) ou bloquear a migration até correção real.
- **Veredito:** 🟢 Seguro — **depois** da correção aplicada neste mesmo gate. Liberada para
  `supabase db push` (decisão de aplicar continua humana/orchestrator).
- **Decisão central: opção (a), BLOQUEAR e CORRIGIR na hora, não (b) aceitar documentado.**
  Motivo: a checagem original ("papel <> financeiro em QUALQUER fazenda") não é uma barreira
  significativa, porque o ADR-0001 dá `papel='admin'` automático em fazenda própria a todo
  signup novo — na prática, **qualquer pessoa que cria uma conta grátis no sistema**, sem
  nenhuma relação com a fazenda/estado alvo, já tinha permissão para chamar
  `definir_prazo_declaracao_estado('RS', ...)` e sobrescrever o prazo que TODAS as fazendas
  gaúchas usam para saber se estão em dia com uma obrigação regulatória — via chamada direta à
  API (RPC), independente de qualquer tela de UI existir. Isso é sabotagem plausível contra
  terceiros sem relação com o atacante, não "admin de boa-fé errando de estado por engano" — uma
  categoria de risco desproporcional para aceitar só com auditoria como mitigação, ainda mais
  porque a correção estava dentro do escopo já pré-autorizado pela tarefa e tinha custo baixo
  (sem exigir coluna obrigatória nem fluxo de produto novo).
- **Correção 1 — `fazendas.estado` + autorização corrigida:** `alter table public.fazendas add
  column estado text` (nullable, `check (estado is null or estado ~ '^[A-Z]{2}$')`, seção 1.0
  nova da migration). `definir_prazo_declaracao_estado()` passou a exigir, quando a fazenda do
  chamador TEM `estado` preenchido, que ele coincida com o estado sendo editado; fazendas sem
  `estado` (hoje, 100% do parque — coluna nasce vazia, sem backfill, por decisão explícita da
  tarefa) continuam no fallback permissivo antigo, sem regressão de funcionalidade.
  **Efeito honesto documentado no próprio SQL e aqui:** para o parque de fazendas existente
  HOJE, o risco não é eliminado (nenhuma tem `estado` preenchido ainda) — é uma correção
  estrutural progressiva, que fecha por completo assim que o produto passar a coletar `estado`
  (fluxo "complete seu cadastro", fora do escopo técnico deste gate). Mantido como pendência de
  segurança monitorada na seção 4, não removido.
- **Correção 2 — NULL-bypass, achado próprio deste gate (não sinalizado por `db_sage`):** os 4
  parâmetros de `definir_prazo_declaracao_estado()` não tratavam `NULL` explicitamente nas
  checagens de formato (`if v_estado !~ regex` com `v_estado = NULL` avalia `NULL`, tratado como
  falso em PL/pgSQL — a validação era pulada silenciosamente, e o erro só aparecia depois, cru,
  do `not null constraint` da tabela). Corrigido com `is null` explícito antes de cada validação,
  com mensagens próprias.
- **Restante da migration revisado linha a linha, sem outros achados:** as 3 fronteiras de
  `financeiro` (SELECT liberado em `lancamentos_financeiros`/`declaracoes_rebanho`, zero escrita;
  SELECT aberto sem filtro em `prazos_declaracao_estado`) conferidas contra spec 5.4 — corretas;
  `usuarios_fazendas.papel not null` confirmado (sem o vetor de bypass via NULL do achado do
  ADR-0002); upsert por `(estado, ano_referencia)` correto; `categoria` texto livre e ausência de
  DELETE em `lancamentos_financeiros`/`declaracoes_rebanho` avaliados como decisões corretas,
  consistentes com padrões já aceitos.
- **Validação real executada (local, não remota):** `supabase db reset` aplicou as 6 migrations
  sem erro. Smoke test funcional real via `docker exec`/`psql`, sessões `authenticated`
  simuladas via `set_config`/`set local role` (não superuser), dentro de transação com
  `rollback` final: (1) coluna/CHECK confirmados; (2) admin de fazenda sem `estado` chamando
  para RS — passou (fallback preservado); (3) admin de fazenda com `estado=RS` chamando para RS
  — passou; (4) admin de fazenda com `estado=RS` chamando para PR — **rejeitado**, confirma que
  a correção bloqueia o cenário central do risco; (5) `p_estado=NULL` — rejeitado com mensagem
  própria, não erro cru; (6) `p_ano_referencia`/datas NULL — rejeitados com mensagens próprias.
  7/7 cenários conferindo o esperado, nenhum dado de teste ficou no banco.
- **Mudanças de arquivo:**
  `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql` editado (seção
  1.0 nova, autorização da função corrigida, comentários atualizados); novo
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-financeiro.md`; esta entrada + seções
  1 e 4 de `PROJECT_CONTEXT.md`.
- **Pendências:** `qa` recomendado a escrever cobertura pgTAP formal dos dois achados (fazenda
  com estado divergente rejeitada; NULL-bypass fechado). Pendência de produto (fora do escopo
  técnico deste gate): fluxo que colete `fazendas.estado` de usuários novos e existentes, para
  a correção deixar de depender do fallback permissivo. `supabase db push` não executado
  (decisão humana/orchestrator).
- **Log completo:** `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-financeiro.md`

### 2026-07-20 — Schema Fase 3, item 13: lancamentos_financeiros/declaracoes_rebanho/prazos_declaracao_estado (Eixo 2) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** modelada e escrita em SQL a terceira parte da Fase 3 (spec seção 10, item
  13) — migration nova e aditiva
  `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`, com as tabelas
  `lancamentos_financeiros`, `declaracoes_rebanho`, `prazos_declaracao_estado` e as funções
  `definir_prazo_declaracao_estado()` (SECURITY DEFINER) e `obter_prazo_declaracao_estado()`
  (SQL, STABLE).
- **Decisão 1 — `categoria` de `lancamentos_financeiros`:** texto livre, sem CHECK e sem tabela
  de categorias configurável nova. A spec deixa em aberto entre "enum fixo" e "tabela
  configurável"; um CHECK travando nos 7 exemplos da spec contradiria a premissa de "não fixo",
  e uma tabela nova é cara agora sem ganho real de integridade (categoria não é FK de ninguém).
  Migração futura pode promover a coluna para FK se o cliente pedir customização (spec 5.3).
- **Decisão 2 — `prazos_declaracao_estado` (a mais importante da tarefa):** tabela mantida
  GLOBAL (sem `fazenda_id`, como a spec 3.2 já define — é dado publicado pelo órgão estadual,
  igual para toda fazenda na mesma UF/ano). O risco real (um admin de uma fazenda alterando o
  prazo que afeta TODAS as fazendas do mesmo estado) é mitigado fechando a escrita para um único
  caminho: zero policy de INSERT/UPDATE/DELETE na tabela (default-deny, mesmo padrão de
  `usuarios`/`fazendas`/`convites`), toda escrita passa por `definir_prazo_declaracao_estado()`
  (SECURITY DEFINER), que exige vínculo `papel <> financeiro` em pelo menos uma fazenda, valida
  formato de UF e consistência de datas, faz upsert por `(estado, ano_referencia)` e grava uma
  coluna nova `atualizado_por_usuario_id` para auditoria. **Limite honesto e documentado
  extensivamente:** a checagem não valida que a fazenda do chamador está NO estado editado,
  porque `fazendas` não tem coluna de UF hoje (achado desta tarefa — ver pendência nova na seção
  4). Rejeitada a alternativa "uma linha por fazenda" por contradizer a natureza do dado.
- **Decisão 3 — fallback do padrão RS sem seed anual:** tabela nasce vazia; a função
  `obter_prazo_declaracao_estado(estado, ano)` calcula o padrão RS (01/04-30/06, via
  `make_date()`, nunca hardcoded) só quando não há linha cadastrada e o estado é RS; para outros
  estados sem cadastro, retorna NULL — só o RS tem padrão validado com o cliente.
- **Bug encontrado e corrigido na própria validação (antes do gate):**
  `returning p into v_row` (referenciando o alias do INSERT dentro de um `ON CONFLICT DO
  UPDATE ... RETURNING`) fazia o Postgres tentar converter a linha inteira em `uuid` —
  corrigido para `returning * into v_row`, forma correta e idiomática de PL/pgSQL. Registrado no
  log como armadilha de sintaxe para outros agentes evitarem.
- **Validação real executada (local, não remota):** `supabase db reset` aplicou as 6 migrations
  sem erro. `pg_policies` confirmou as 7 policies esperadas (3+3+1, a última tabela só com
  SELECT). Suíte pgTAP manual real (não parte da suíte formal do `qa`) com 11/11 asserções
  passando, usando sessões `authenticated` simuladas via `set_config('request.jwt.claims', ...)`
  + `set local role authenticated` (validação de POLICY real, não superuser bypassando RLS):
  upsert idempotente por UF/ano, rejeição de UF inválida e datas invertidas, UPDATE direto
  (client) em `prazos_declaracao_estado` afeta 0 linhas tanto para admin quanto para financeiro
  (só a função escreve), `financeiro` com vínculo único (sem fazenda própria, cenário real de
  convite) tem SELECT em `lancamentos_financeiros`/`declaracoes_rebanho`/prazos mas é bloqueado
  em toda escrita (`42501` em INSERT nas duas tabelas, erro customizado da função para prazos),
  e o fallback RS/outros-estados confirmado por leitura direta. Rollback confirmado ao final —
  nenhum dado de teste ficou no banco.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`; novo
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-financeiro.md`; esta entrada + seções 1 e
  4 de `PROJECT_CONTEXT.md`. Nenhuma tabela de fase anterior tocada; view de saldo de rebanho
  (item 12, bloqueada por falta dos prints de referência) e buckets de Storage (item 14) não
  implementados.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase db push` — atenção
  especial ao limite honesto da decisão 2 (mitigação via função + auditoria, não impedimento
  estrutural), à ausência de CHECK em `categoria`, e à distinção de policy de DELETE entre
  `lancamentos_financeiros` (decisão própria) e `declaracoes_rebanho` (decisão já dada pela
  spec, item 9 seção 9). Pendência arquitetural nova registrada na seção 4: `fazendas.estado`
  não existe, útil para uma migração futura fechar a validação de autorização por completo.
  `supabase db push` não executado (decisão humana/orchestrator).
- **Log completo:** `.agents/memory/log/2026-07-20-db_sage-schema-fase3-financeiro.md`

### 2026-07-20 — Security review Fase 3, item 11: gtas/transacoes/transacoes_detalhe/transacoes_animais — `cyber_chief` (CONSTANTINE, via Claude)

- **O que foi feito:** gate de segurança formal de
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql`, entregue pela `db_sage` no
  mesmo dia (entrada abaixo). Escopo: as 13 policies de RLS das 3 fronteiras distintas de
  `financeiro` na mesma migration, os 2 triggers de integridade cruzada `gtas`↔`transacoes`
  (iniciativa própria da `db_sage`, fora do escopo original de tarefa), e os 3 triggers de
  `transacoes_animais` que implementam o ADR-0004 (D1-D6).
- **Veredito:** 🟢 Seguro, liberada para `supabase db push` (decisão de aplicar continua
  humana/orchestrator).
- **As 3 fronteiras de `financeiro` — sem achado:** conferidas uma a uma contra a regra correta
  de cada tabela (`gtas`=zero acesso; `transacoes`/`transacoes_detalhe`=SELECT permitido, zero
  escrita; `transacoes_animais`=zero acesso, ADR-0004 D3). Nenhuma diluição por cópia-e-cola
  entre as 4 tabelas — o maior risco que a própria `db_sage` tinha sinalizado para este gate não
  se concretizou. `usuarios_fazendas.papel` confirmado `not null` desde a Fase 1, então
  `papel <> 'financeiro'` não tem o mesmo vetor de bypass via NULL do achado crítico do
  ADR-0002 (coluna diferente, sempre não-nula por schema).
- **Os 2 triggers `gtas`↔`transacoes` — sem achado:** `is distinct from` (NULL-safe) + `if not
  found` explícito, mensagens de erro genéricas idênticas para "não encontrado" e "fazenda
  diferente", `fazenda_id` imutável em ambas as tabelas (sem janela de corrida possível depois
  do vínculo validado).
- **1 achado corrigido — corrida (TOCTOU) na guarda de coexistência de D5 do ADR-0004:**
  `reverter_status_animal_apos_desvinculo()` fazia `select status from animais where id =
  old.animal_id` sem lock antes de checar se existe outro vínculo de venda remanescente. Duas
  transações `DELETE` concorrentes desvinculando dois vínculos de venda DISTINTOS do MESMO
  animal (cenário que o próprio ADR-0004 D6 permite por design) cada uma via a linha da outra
  como "ainda existente" (não commitada), e **nenhuma** revertia `animais.status` para
  `'ativo'` — o dado ficava preso em `'venda'` para sempre, sem nenhum caminho de UI que
  corrigisse sozinho. Mesma classe de bug do achado nº2 do gate do ADR-0002
  (`promover_papel()`), com efeito oposto (guarda conservadora demais em vez de permissiva
  demais). Corrigido com `for update` na consulta, serializando as duas execuções — a segunda a
  obter o lock sempre enxerga o estado pós-commit real e decide corretamente.
- **Mudanças de arquivo:**
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` editado (1 `for update`
  adicionado + comentário de função atualizado); novo
  `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-transacoes.md`; esta entrada + seções
  1 e 4 de `PROJECT_CONTEXT.md`.
- **Pendências:** `qa` recomendado a escrever teste de concorrência real (duas sessões `psql`)
  reproduzindo o cenário do achado corrigido, mesmo padrão já usado para a corrida de
  `promover_papel()`. `supabase db push` não executado (decisão humana/orchestrator).
- **Log completo:** `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-transacoes.md`

### 2026-07-20 — Schema Fase 3, item 11: gtas/transacoes/transacoes_detalhe/transacoes_animais (Eixo 2) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** modelada e escrita em SQL a segunda parte da Fase 3 (spec seção 10, item
  11) — migration nova e aditiva
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql`, com as tabelas `gtas`,
  `transacoes`, `transacoes_detalhe` (spec seção 3.2, schema já fechado) e `transacoes_animais`
  (ADR-0004, D1-D6, implementado sem desvio).
- **Referência circular `gtas.transacao_id`↔`transacoes.gta_id`:** resolvida por ordem de
  criação — `transacoes` criada primeiro com `gta_id` sem FK (aponta para frente); `gtas` criada
  em seguida já com a FK completa para `transacoes`; `ALTER TABLE transacoes ADD CONSTRAINT`
  fecha o lado que faltava. Complementada por dois triggers próprios desta migration
  (`validar_gta_transacao_mesma_fazenda()`/`validar_transacao_gta_mesma_fazenda()`, não pedidos
  pela spec/ADR) que garantem que o vínculo bidirecional, quando preenchido, só liga registros
  da MESMA `fazenda_id` — mesmo princípio de `validar_lote_mesma_fazenda()` (Fase 2).
- **`transacoes_animais` — ADR-0004 implementado literalmente:** coluna `tipo_operacao_transacao`
  denormalizada e imutável (D1); `preparar_vinculo_transacao_animal()` (`BEFORE INSERT`, D2+D4)
  valida cross-fazenda e denormaliza; `aplicar_status_animal_apos_vinculo()` (`AFTER INSERT`, D2)
  aplica `animais.status='venda'` só para `tipo_operacao_transacao='venda'`;
  `reverter_status_animal_apos_desvinculo()` (`AFTER DELETE`, D5) reverte com as guardas de
  idempotência e coexistência; todos `SECURITY INVOKER` (D2); sem trava de revenda (D6). Um
  smoke test funcional confirmou inclusive o cenário mais delicado que o D1 do ADR antecipava —
  `DELETE` em cascata da `transacoes` pai disparando o trigger `AFTER DELETE` de
  `transacoes_animais` sem erro de ordenação, graças à denormalização.
- **RLS — três fronteiras distintas de `financeiro` na mesma migration:** `gtas` = zero acesso
  (nem SELECT, spec 5.4 lista GTAs explicitamente em "sem acesso"); `transacoes`/
  `transacoes_detalhe` = SELECT permitido, zero INSERT/UPDATE/DELETE (fecha a "nota de
  dependência" que o ADR-0004 D3 deixou em aberto, na direção que o próprio ADR já antecipava
  como mais consistente com a spec); `transacoes_animais` = zero acesso (ADR-0004 D3, sem
  desvio). Sem policy de DELETE em `gtas`/`transacoes`/`transacoes_detalhe` (decisão própria,
  justificada pelo efeito colateral em cascata sobre `transacoes_animais` que um DELETE de
  transação teria).
- **Divergência deliberada da migration anterior:** `especie_id` (em `gtas`/`transacoes`) e
  `agrupamento_etario_id` (em `transacoes_detalhe`) usam `on delete restrict`, não `cascade`
  como `agrupamentos_etarios.especie_id` na migration de catálogos — ali é catálogo→catálogo
  (aceitável cascatear), aqui é catálogo→dado transacional real (nunca apagar histórico de
  GTA/transação por efeito colateral de limpeza de catálogo).
- **Validação real executada (local, não remota):** `supabase db reset` aplicou as 5 migrations
  do zero sem erro. `pg_policies` confirmou as 12 policies esperadas. Smoke test funcional
  manual (via `docker exec`/`psql`, sempre com `rollback`, nenhum dado deixado no banco) cobriu:
  referência circular, rejeição cross-fazenda em `gtas`↔`transacoes` e em `transacoes_animais`,
  ciclo completo INSERT-venda→status/DELETE→reversão, guarda de coexistência de múltiplos
  vínculos de venda, `numero_gta` único por fazenda (mas repetível entre fazendas), e o cenário
  de `DELETE` em cascata da transação pai — todos passaram.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql`; novo
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-transacoes.md`; esta entrada + seções 1 e
  4 de `PROJECT_CONTEXT.md`. Nenhuma tabela de fase anterior tocada; saldo de rebanho,
  `lancamentos_financeiros`, `declaracoes_rebanho`, `prazos_declaracao_estado` e buckets de
  Storage (itens 12-14 da mesma fase) não implementados.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase db push` — atenção
  especial às três fronteiras distintas de `financeiro`, à confirmação linha a linha do
  ADR-0004 em `transacoes_animais`, aos dois triggers de integridade cruzada `gtas`↔`transacoes`
  (decisão própria, não pedida), à divergência de `on delete restrict` vs. `cascade`, e à
  ausência de policy de DELETE em `transacoes`/`gtas`/`transacoes_detalhe`. `supabase db push`
  não executado (decisão humana/orchestrator). Depois do gate: itens 12-14 da mesma fase — não
  iniciados aqui.
- **Log completo:** `.agents/memory/log/2026-07-20-db_sage-schema-fase3-transacoes.md`

### 2026-07-20 — ADR-0004: desenho técnico de `transacoes_animais` (Opção B) — `architect` (ALEX, via Claude)

- **O que foi feito:** formalização do ADR-0004
  (`.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md`), fechando uma dívida de
  processo registrada desde 2026-07-16 (`especificacao-sistema.md` seção 3.3 dizia
  "`architect` formaliza o ADR correspondente na Fase 3" e isso nunca aconteceu). A Fase 3 já
  começou (catálogos `especies`/`subtipos_especie`/`agrupamentos_etarios` entregues por
  `db_sage` no mesmo dia, ver entrada abaixo) e o próximo bloco da mesma fase é exatamente
  `gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais` (spec seção 10, item 11) — hora
  certa de fechar a decisão antes de `db_sage` escrever essa migration. Escopo estritamente o
  desenho técnico de `transacoes_animais` — `gtas`/`transacoes`/`transacoes_detalhe` não foram
  redesenhadas (schema já fechado pela spec seção 3.2, fora de escopo).
- **As 5 decisões tomadas:** (1) **mecanismo** — dois triggers `SECURITY INVOKER` (não
  `SECURITY DEFINER` — quem insere já tem `UPDATE` direto em `animais.status`, sem RLS a
  contornar): `BEFORE INSERT` valida cross-fazenda e denormaliza uma coluna nova
  `tipo_operacao_transacao` (cópia imutável do `tipo_operacao` da transação, capturada no
  momento do vínculo, para não depender de reconsultar `transacoes` num `DELETE` em cascata
  futuro); `AFTER INSERT` só muta `animais.status = 'venda'` quando
  `tipo_operacao_transacao = 'venda'` — vínculos a `compra`/`entrada_pastoreio`/
  `saida_pastoreio` são permitidos e gravados sem efeito colateral. (2) **fronteira
  `financeiro`** — zero acesso (nem `SELECT`) a `transacoes_animais`, por dois motivos
  independentes: a spec seção 5.4 já nega a `financeiro` "edição de transações" (não deveria
  ter escrita em `transacoes` também — nota de dependência deixada para `db_sage` desenhar a
  RLS de `transacoes` nesse sentido, fora do escopo deste ADR); e `animal_id` é dado de manejo
  individual (Eixo 1), mesma categoria que a Fase 2 já nega a `financeiro` sem exceção. Decisão
  reavaliada com critério próprio, não copiada automaticamente do padrão da Fase 2. (3)
  **cross-fazenda** — trigger `BEFORE INSERT`, `SECURITY INVOKER`, mensagem de erro genérica,
  mesmo padrão de `validar_lote_mesma_fazenda()` (Fase 2). (4) **reversibilidade** — trigger
  `AFTER DELETE` reverte `status` para `'ativo'` só se o vínculo desfeito era venda, o status
  atual ainda for `'venda'` (guarda de não-regressão contra um `'morte'`/`'baixa'` aplicado
  depois) e não houver outro vínculo de venda remanescente para o mesmo animal (guarda de
  coexistência). (5) **revenda** — sem trava de banco nesta fase (mesmo padrão de
  "decisão de produto sem bloqueio técnico" já confirmado aceitável pelo `cyber_chief` na Fase 2
  para `registrar_pesagem()`); pendência de UX deixada para `developer` sinalizar visualmente
  animal não-`ativo` na tela de seleção de animais.
- **Trade-offs sinalizados para `db_sage`:** coluna nova `tipo_operacao_transacao` não estava
  na spec literal, mas é necessária para os mecanismos de D2/D4/D5 funcionarem sem depender de
  ordem de execução de cascata; ausência de `SECURITY DEFINER` só é segura se as policies de
  `INSERT`/`DELETE` de `transacoes_animais` implementarem literalmente a exclusão de
  `financeiro` decidida em D3 (senão o trigger `SECURITY INVOKER` herdaria a falha
  silenciosamente); a fronteira de `financeiro` decidida aqui assume que a RLS futura de
  `transacoes`/`transacoes_detalhe` também vai negar escrita a esse papel — se `db_sage`
  decidir diferente, o ADR precisa ser revisitado (critério de revisão nº1 do próprio ADR).
- **Mudanças de arquivo:** novo
  `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md`; novo
  `.agents/memory/log/2026-07-20-architect-adr-0004-transacoes-animais.md`; esta entrada +
  seções 1, 2 e 4 de `PROJECT_CONTEXT.md` (linha pendente de 2026-07-16 na seção 2 resolvida,
  apontando para este ADR). Nenhum SQL/migration escrito — tarefa de decisão e documentação,
  não implementação.
- **Pendências:** `db_sage` implementa `transacoes_animais` (+ `gtas`/`transacoes`/
  `transacoes_detalhe`, spec seção 10 item 11) seguindo D1-D6 do ADR-0004; `cyber_chief` faz o
  gate de segurança de praxe antes de `supabase db push`, com atenção especial à fronteira de
  `financeiro` (D3) e à ausência de `SECURITY DEFINER` (D2/D4/D5); `developer` implementa a
  sinalização de UX de D6 quando as telas de Eixo 2 chegarem (Fase 4).
- **Log completo:** `.agents/memory/log/2026-07-20-architect-adr-0004-transacoes-animais.md`

### 2026-07-20 — Schema Fase 3, item 10: catálogos especies/subtipos_especie/agrupamentos_etarios (Eixo 2) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** modelada e escrita em SQL a primeira parte da Fase 3 (spec seção 10, item
  10) — migration nova e aditiva
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`, com as tabelas
  `especies`, `subtipos_especie`, `agrupamentos_etarios` (spec seção 3.2), **primeiras tabelas do
  projeto sem `fazenda_id`** — catálogo de referência global, compartilhado por todas as
  fazendas, não multi-tenant. Seed completo transcrito da spec: 8 espécies, 9 subtipos
  (Aves: 6, Muares: 1 subtipo único "Mula/Burro/Jumento", Abelhas: 2), 24 faixas etárias
  (Bovino 4, Equino 2, Ovino 2, Caprino 4, Muar 4, Suíno 4 em dias, Aves-Frango de Corte 4 em
  semanas — Abelhas e os 5 demais subtipos de Aves deliberadamente sem faixa, spec seção 3.2).
- **Decisões de modelagem:** (1) integridade subtipo↔espécie garantida por **FK composta**
  (`subtipos_especie` ganha `unique(id, especie_id)`; `agrupamentos_etarios` referencia
  `(subtipo_especie_id, especie_id) → subtipos_especie(id, especie_id)`), não por trigger —
  MATCH SIMPLE (default do Postgres) não verifica a FK quando `subtipo_especie_id` é NULL, caso
  normal das espécies sem subtipo; (2) unicidade de `ordem` por grupo via **2 índices únicos
  parciais** (não 1 UNIQUE simples) — NULL não é igual a NULL em UNIQUE do Postgres, um UNIQUE
  simples não fecharia o caso das espécies sem subtipo; (3) índice composto
  `(especie_id, subtipo_especie_id, ordem)` cobrindo a consulta principal do módulo de Saldo de
  Rebanho; (4) RLS com **SELECT aberto a qualquer `authenticated`, sem filtro de fazenda nem de
  papel** (diferente de `lotes`/`animais`/`pesagens` da Fase 2, que excluem `financeiro`) — este
  catálogo também alimenta os módulos de Eixo 2 aos quais `financeiro` TEM acesso; zero policy
  de INSERT/UPDATE/DELETE (escrita só via migration/seed, mesmo padrão default-deny do
  ADR-0001/ADR-0002).
- **Duas decisões de transcrição sinalizadas para o gate do `cyber_chief`:** Muares como subtipo
  ÚNICO "Mula/Burro/Jumento" (a redação da spec seção 3.2 é ambígua, segui a instrução explícita
  da tarefa); limites de Suíno/Aves-Frango de Corte transcritos literalmente com sobreposição de
  borda entre linhas adjacentes e um hiato não coberto de 151-179 dias em Suíno (característica
  do dado de origem da spec, não erro desta migration — fica registrado para quem escrever a
  futura função de classificação idade→faixa). Ver seção 4 e o log para detalhe completo.
- **Validação real executada (local, não remota):** `supabase db reset` local aplicou as 4
  migrations do zero sem erro de sintaxe/constraint. Query de contagem confirmou 8/9/24 linhas
  exatamente como o desenho previa. Query com JOIN completo confirmou que a FK composta associou
  corretamente cada faixa etária ao subtipo certo (ou NULL, quando aplicável). `pg_tables`/
  `pg_policies` confirmaram RLS habilitada com só 1 policy de SELECT por tabela, zero policy de
  escrita — verificado por inspeção direta do catálogo do Postgres, não só por leitura do SQL.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`; novo
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-especies.md`; esta entrada + seções 1 e 4
  de `PROJECT_CONTEXT.md`. Nenhuma tabela de fase anterior tocada; `gtas`/`transacoes`/
  `transacoes_detalhe`/`transacoes_animais`/`lancamentos_financeiros`/`declaracoes_rebanho`/
  `prazos_declaracao_estado` (itens 11-14 da mesma fase) não implementados.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase db push` — atenção
  especial pedida às 2 decisões de transcrição acima e à decisão de RLS "leitura aberta sem
  filtro de papel". `supabase db push` não executado (decisão humana/orchestrator). Depois do
  gate: itens 11-14 da mesma fase (GTAs/transações/saldo/financeiro/declarações/storage) —
  tarefas seguintes, não iniciadas aqui. **Atualização 2026-07-20 (`architect`):** o desenho
  técnico de `transacoes_animais` (parte do item 11) já está decidido via ADR-0004 antes de
  `db_sage` começar essa migration — ver entrada logo acima na seção 5.
- **Log completo:** `.agents/memory/log/2026-07-20-db_sage-schema-fase3-especies.md`

### 2026-07-19 — Testes pgTAP da Fase 2 (GMD/regra de correção/regressões de segurança) — `qa` (Emma, via Claude)

- **O que foi feito:** escrita e **execução real** (`supabase db reset` + `supabase test db`) de
  5 arquivos pgTAP novos contra o schema `lotes`/`animais`/`pesagens` da Fase 2, continuando a
  numeração da suíte da Fase 1 (`supabase/tests/database/007` a `011`). Cobertura: (A) fórmula de
  GMD — caso feliz comparado contra a MESMA fórmula calculada em SQL (não um número decorado);
  **regressão do bug do protótipo** com 3 pesagens de variação não-uniforme (inclusive uma queda
  de peso no meio) provando que o GMD depende só de `peso_inicial` + pesagem MAIS RECENTE, nunca
  de uma média das variações sucessivas; `dias_totais=0` → `NULL` sem erro. (B) regra de correção
  de `registrar_pesagem()` — UPDATE do mesmo registro a 1 dia de distância, INSERT novo a 6 dias,
  e o limite EXATO de 2 dias (inclusivo) também testado como UPDATE. (C) regressão dos 3 achados
  do gate `cyber_chief` (`.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`): papel
  `financeiro` bloqueado em SELECT/INSERT/UPDATE de `lotes`/`animais`/`pesagens` e em
  `registrar_pesagem()`; INSERT direto em `animais` com campos calculados falsificados é
  sobrescrito silenciosamente pelo trigger; vazamento entre fazendas testado nas duas direções
  (SELECT vazio, INSERT `42501`, `validar_lote_mesma_fazenda()` rejeitando associação cruzada A→B
  e B→A). **63/63 asserções passaram** (25 pré-existentes da Fase 1/ADR-0002 + 38 novas),
  suíte completa rodada duas vezes seguidas para confirmar ausência de flakiness.
- **Achados de tooling (não são achados de produto):** `INSERT ... RETURNING` não pode ser
  subquery direta em `FROM` (só dentro de uma CTE `WITH`); uma `WITH` de escrita não pode ficar
  aninhada dentro de uma subquery escalar passada a `is()` (precisa estar no nível mais externo
  do comando); arquivos que escrevem na temp table `t_ids` DEPOIS de assumir a sessão
  `authenticated` precisam de `grant insert` nela, não só `grant select` (convenção anterior só
  precisava de `select` porque os ids eram todos capturados antes da troca de role).
- **O que NÃO foi testado (honestidade de cobertura):** as views `animais_com_detalhes`/
  `lotes_com_estatisticas` não têm teste pgTAP dedicado (revisadas linha a linha pelo
  `cyber_chief`, mas sem cobertura automatizada própria); `calcular_categoria_animal()` sem teste
  unitário; nenhum teste de concorrência real (duas sessões `psql`) para `registrar_pesagem()`
  (o `for update` existe e foi revisado, mas não repeti o padrão de concorrência real já usado
  para `promover_papel()` na Fase 1); nenhum teste de UI/frontend (fora do escopo desta tarefa).
- **Mudanças de arquivo:** novos `supabase/tests/database/007_gmd_formula_calculo.sql`,
  `008_registrar_pesagem_regra_correcao.sql`, `009_rls_regressao_papel_financeiro.sql`,
  `010_animais_insert_campos_calculados_regressao.sql`,
  `011_vazamento_entre_fazendas_lotes_animais.sql`; novo log; esta entrada + seções 1 e 4 de
  `PROJECT_CONTEXT.md`.
- **Pendências:** nenhum bloqueio técnico identificado por este gate de testes — aprovação final
  continua sendo decisão do usuário (`qa` proibida de aprovar). Lacunas de cobertura listadas
  acima ficam como trabalho futuro não bloqueante.
- **Log completo:** `.agents/memory/log/2026-07-19-qa-testes-fase2-gmd.md`

### 2026-07-17 — Frontend Fase 2, Eixo 1: Gestão Individual de Rebanho — `developer` (Ryan, via Claude)

- **O que foi feito:** implementadas as 6 telas do Eixo 1 (spec seção 5.1/10 item 9), fechando a
  Fase 2 do ponto de vista de frontend: `/app/dashboard` (stat tiles + distribuição por
  status/categoria + filtro por lote), `/app/animais` (listagem + criar/editar via dialog),
  `/app/animais/:id` (detalhe + histórico de pesagens + formulário de registro via RPC),
  `/app/lotes` (listagem com estatísticas + criar/editar/arquivar/reativar), `/app/lotes/:id`
  (detalhe + animais associados), `/app/comparativo` (2 bar charts + tabela comparando peso
  médio/GMD médio entre lotes). Componentes shadcn novos: `table`/`dialog`/`select`/`badge`/
  `textarea` (todos gerados sem problema pelo CLI, ao contrário de `form` na Fase 1). Camada de
  dados nova: `src/hooks/{useFazendaAtual,useLotes,useAnimais,usePesagens}.ts` sobre
  `@tanstack/react-query`, sempre via `animais_com_detalhes`/`lotes_com_estatisticas` (nunca as
  tabelas base direto) e `registrar_pesagem()` via RPC (nunca INSERT direto em `pesagens`, que
  não tem policy nenhuma).
- **Achado de tooling:** `z.coerce.number()` + `zodResolver` (`@hookform/resolvers` v5) + Zod v4
  quebra a inferência de tipos de `useForm<T>()` (o `Resolver` gerado tem tipo de entrada
  `unknown` diferente do tipo de saída `number`). Contornado sem `z.coerce`: schemas usam
  `z.number()` puro, campos numéricos convertem string→number no próprio `<Input
  type="number">` via `valueAsNumber`. Documentado nos 3 arquivos de schema para o próximo
  agente não perder tempo redescobrindo.
- **Decisões:** `useFazendaAtual()` pega o vínculo mais antigo do usuário em `usuarios_fazendas`
  como "a" fazenda (sem seletor multi-tenant na UI — débito técnico documentado, ADR-0002 já
  permite multi-fazenda via convites mas a spec desta tarefa não pediu o seletor);
  `criarAnimalSchema`/`editarAnimalSchema` separados (edição só toca
  identificação/lote/status, nunca os 3 campos calculados nem os campos de criação);
  gráficos usam as CSS vars `--chart-1..5` já existentes no tema em vez de uma paleta nova
  (skill `dataviz` consultada: um eixo por gráfico, hue único por série, nunca dual-axis nem
  rainbow por categoria numa série só). Nenhuma tela específica para o papel `financeiro` (RLS
  já bloqueia no backend; o `AppShell` não esconde os links de Manejo Individual
  condicionalmente por papel — pendência de UX, não de segurança).
- **Validação real executada:** `npm run build` limpo (zero erros de tipo). `npm run lint`
  (oxlint) limpo, exit 0, só os 4 warnings de fast-refresh pré-existentes. `npm run test`
  (Vitest) 35/35 PASS (10 da Fase 1 + 25 novos: `animais.test.ts`/`lotes.test.ts`/
  `pesagens.test.ts`). `npm run dev` subiu sem erro; `Invoke-WebRequest` confirmou HTTP 200 nas
  7 rotas novas (SPA — roteamento client-side) e nos 7 módulos `.tsx` novos requisitados
  diretamente pela URL de transform do Vite (confirma ausência de erro de sintaxe/import além
  do que `tsc -b` já garante). **Limitação honesta, igual à da Fase 1:** sem navegador real
  neste ambiente — nenhuma interação de UI (clicar, preencher formulário, abrir dialog) foi de
  fato exercitada; nenhum teste de componente escrito (Testing Library não instalada).
- **Mudanças de arquivo:** ver lista completa no log. Resumo: 5 componentes shadcn novos, 1
  arquivo de tipos, 3 pares schema+teste, 4 hooks de dados, 2 componentes compartilhados
  (`StatusAnimalBadge`, `LoteSelectField`), 13 arquivos de página/dialog/form novos em
  `src/pages/{animais,lotes,dashboard,comparativo}/`, `src/router.tsx` editado (6 rotas reais).
  Nenhuma migration tocada; nenhuma rota de Eixo 2 implementada.
- **Pendências:** `qa` — teste automatizado real de RLS/RPC do schema da Fase 2 (mesmo padrão
  já feito para Fase 1/ADR-0002, ainda não rodado para `lotes`/`animais`/`pesagens`); teste de
  UI em navegador real quando disponível; seletor de fazenda multi-tenant; esconder/adaptar
  navegação para o papel `financeiro` (UX, não segurança); code-splitting por rota (bundle
  único >500kB, aviso desde a Fase 1, ainda não endereçado).
- **Log completo:** `.agents/memory/log/2026-07-17-developer-frontend-fase2.md`

### 2026-07-17 — Security review (gate Fase 2) da migration lotes/animais/pesagens — `cyber_chief` (CONSTANTINE, via Claude)

- **Veredito: 🟢 Seguro — migration LIBERADA para aplicação** (`supabase db push`), decisão de
  quando aplicar continua humana/orchestrator, fora do escopo deste gate. **Antes das
  correções: 🟡 Seguro com Observações** — sem vazamento cross-tenant (a modelagem da Sofia já
  fechava essa classe de risco corretamente), mas com um achado de severidade Alta já
  exercitável hoje, não latente.
- **O que foi feito:** security review formal de
  `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` (tabelas
  `lotes`/`animais`/`pesagens`, 2 views, 3 funções, RLS), gate obrigatório antes de
  `supabase db push`, mesmo padrão de rigor da Fase 1/ADR-0002. **Achado nº1 (Alto):** as 7
  policies de RLS das 3 tabelas e a checagem de autorização de `registrar_pesagem()` escopavam
  só por vínculo de fazenda, sem checar `papel` — permitindo que um usuário `papel='financeiro'`
  (já um valor válido em produção desde o ADR-0002, com `criar_convite()` já aceitando esse
  papel) lesse e escrevesse livremente em lotes/animais/pesagens, contrariando
  `especificacao-sistema.md` seção 5.4, que nega explicitamente qualquer acesso (nem leitura) de
  Financeiro/Contábil a "manejo individual de animais/lotes/pesagens". **Achado nº2 (Médio):**
  `inicializar_peso_atual_animal()` só protegia `peso_atual_kg`/`gmd_medio_kg`/
  `ultima_pesagem_data` contra UPDATE direto (trigger dedicado da própria Sofia) — um INSERT
  direto em `animais` podia fabricar esses 3 campos calculados sem nenhuma pesagem real ter
  ocorrido, a mesma falsificação que a migration já reconhecia como inaceitável, só que pela
  porta que a guarda de UPDATE não cobre. **Achado nº3 (Baixo):** mensagens de erro distintas em
  `registrar_pesagem()` para "animal não existe" vs. "sem permissão" formavam um oráculo de
  enumeração entre fazendas — unificadas em uma mensagem genérica, mesmo padrão já usado em
  `validar_lote_mesma_fazenda()`. Os 5 pontos de atenção que a Sofia deixou explicitamente para
  este gate foram avaliados: `security_invoker=true` nas 2 views (lógica confirmada correta —
  RLS das tabelas base se propaga ao consulente real), a GUC `rural_prod.recalculo_pesagem`
  (robusta contra o vetor de ataque real — `pg_catalog` não exposto pelo PostgREST, `is_local`
  seguro sob pooler transaction-mode), autorização de `registrar_pesagem()` (revisada linha a
  linha, só o achado nº1 encontrado), e as 2 decisões de produto (pesagem em animal
  vendido/morto/baixado; recálculo não imediato de GMD ao editar `peso_inicial_kg`) confirmadas
  como não sendo achados de segurança.
- **Decisões:** corrigir tudo diretamente no arquivo (nada aplicado a nenhum banco ainda).
  7 policies de RLS + `registrar_pesagem()`: adicionado `papel <> 'financeiro'`.
  `inicializar_peso_atual_animal()`: reescrita para forçar incondicionalmente os 3 campos
  calculados no `BEFORE INSERT` (`peso_atual_kg = peso_inicial_kg`, os outros dois `null`),
  ignorando qualquer valor enviado pelo client. `registrar_pesagem()`: mensagens de erro
  unificadas.
- **Mudanças de arquivo:**
  `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` editado (3 correções +
  header atualizado); novo log; esta entrada em `PROJECT_CONTEXT.md` (+ seções 1 e 4).
- **Pendências (não bloqueantes):** `qa` (Emma) — casos de teste explícitos para os 3 achados
  corrigidos (financeiro bloqueado nas 3 tabelas; INSERT não falsifica campos calculados;
  mensagem de erro única). `developer`/produto — confirmar se `financeiro` deve ter alguma visão
  read-only de Eixo 1 antes das telas (a correção seguiu a leitura mais estrita da spec: zero
  acesso); confirmar as 2 decisões de produto já sinalizadas pela Sofia.
- **Log completo:** `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`

### 2026-07-17 — Schema Fase 2: lotes/animais/pesagens (Eixo 1) — `db_sage` (SOFIA, via Claude)

- **O que foi feito:** modelada e escrita em SQL a Fase 2 (spec seção 10, item 8) — migration
  nova e aditiva `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql`, com as
  tabelas `lotes`/`animais`/`pesagens` (spec seção 3.1), a função pura de categorização
  automática `calcular_categoria_animal()` (IMMUTABLE, recebe idade já calculada — não
  `data_nascimento` — para ser genuinamente pura), as views `animais_com_detalhes` e
  `lotes_com_estatisticas` (ambas com `security_invoker = true`), e
  `public.registrar_pesagem()` (RPC `SECURITY DEFINER`) + trigger
  `atualizar_animal_apos_pesagem()` implementando a regra de correção de pesagem (≤ 2 dias =
  UPDATE, senão INSERT) e a fórmula de GMD **corrigida** do débito técnico prioritário desta
  fase (spec seção 9, item 2): `GMD = (peso_atual - peso_inicial) / dias_totais`.
- **Decisões:** (1) `pesagens` só tem SELECT declarativo — toda escrita via
  `registrar_pesagem()` (`SECURITY DEFINER`), generalizando o padrão do ADR-0002 (correção
  precisa de SELECT antes do comando, RLS declarativa não expressa isso); `lotes`/`animais`
  ganham policies de INSERT/UPDATE declarativas normais (sem decisão condicional nem
  recálculo derivado nelas fora dos 3 campos calculados, ver decisão 3); (2) `dias_totais` do
  GMD usa `animais.created_at` (data de registro), não `data_nascimento` — `peso_inicial_kg` é
  capturado na criação do animal, que pode já ser adulto; `dias_totais <= 0` →
  `gmd_medio_kg = NULL` (não erro, não `0`); (3) `animais.peso_atual_kg`/`gmd_medio_kg`/
  `ultima_pesagem_data` são campos calculados, protegidos contra UPDATE direto do client por
  trigger com flag de sessão local à transação (RLS não escopa coluna); (4)
  `animais.lote_id` só pode apontar para lote da MESMA fazenda (trigger dedicado) — sem isso,
  um animal poderia poluir `lotes_com_estatisticas` de outra fazenda; (5) AMBAS as views usam
  `security_invoker = true` (Postgres 15+) — sem essa opção, views vazariam TODOS os
  animais/lotes de TODAS as fazendas para qualquer usuário autenticado (IDOR real, apesar de
  RLS correta nas tabelas base) — achado preventivo próprio, não pedido explicitamente, mas
  dentro do princípio "vazamento entre fazendas inaceitável" desta fase.
- **Mudanças de arquivo:** novo
  `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql`; novo
  `.agents/memory/log/2026-07-17-db_sage-schema-fase2.md`; esta seção + seção 1 de
  `PROJECT_CONTEXT.md`. Nenhuma tabela da Fase 1 tocada; nenhum item de Eixo 2 (GTAs/
  transações/saldo) implementado.
- **Pendências:** gate obrigatório do `cyber_chief` antes de `supabase db push` — atenção
  especial pedida a: `security_invoker = true` nas views (crítico se a versão do Postgres não
  honrar a opção), a flag de sessão `rural_prod.recalculo_pesagem` (mecanismo novo neste
  projeto, checar comportamento sob o pooler transaction-mode do Supabase), a checagem de
  autorização de `registrar_pesagem()` isoladamente, e duas decisões de produto não bloqueantes
  para confirmar com `developer`/JP antes das telas: `registrar_pesagem()` não bloqueia pesagem
  em animal com status venda/morte/baixa (deliberado, não restringido); `peso_inicial_kg`
  editável depois da criação sem re-disparar recálculo imediato de GMD (só recalcula na
  próxima pesagem). Depois do gate: `developer` constrói as telas (spec seção 10, item 9);
  `qa` prioriza teste automatizado da fórmula de GMD e da regra de correção de pesagem (spec
  seção 9, item 5). `supabase db push` não executado — fora do escopo desta tarefa.
- **Log completo:** `.agents/memory/log/2026-07-17-db_sage-schema-fase2.md`

### 2026-07-17 — Frontend Fase 1: autenticação + shell de roteamento — `developer` (Ryan, via Claude)

- **O que foi feito:** implementados os dois itens que faltavam para fechar a Fase 1 (spec
  seção 10, itens 5-6). Componentes shadcn/ui adicionados (`input`/`label`/`card`/`sonner` via
  CLI; `form` escrito à mão — CLI não gerou o arquivo em várias tentativas, sem erro, ver log).
  Provider de autenticação (`src/lib/auth.tsx`, `useAuth()`) com `getSession()` + 
  `onAuthStateChange()`. Roteamento completo (`src/router.tsx`, `createBrowserRouter`) com
  TODAS as rotas da seção 8 da spec — as 15 rotas `/app/*` de módulos ainda não implementados
  (Fases 2/3/4) renderizam `PlaceholderPage` honesto em vez de 404/tela em branco.
  `ProtectedRoute` redireciona para `/login?redirect=...` sem sessão, preservando destino
  (usado por `/convites/aceitar`). `AppShell` com navegação em duas seções ("Manejo Individual"/
  "Rebanho & Compliance") + Configurações, conforme spec seção 6. Páginas: `SignupPage`
  (schema zod dinâmico conforme `?convite=<token>` presente ou não, ADR-0002 D2 — sem convite
  pede `nome_fazenda`, com convite não pede; erros do Supabase mostrados exatamente como vêm,
  cobrindo as mensagens de `RAISE EXCEPTION` do `handle_new_user()`), `LoginPage`
  (`signInWithPassword`, respeita `?redirect=`), `AceitarConvitePage` (chama
  `aceitar_convite(p_token)` uma vez com usuário já autenticado, redireciona para login com
  destino preservado se não houver sessão).
- **Decisões:** `form.tsx` escrito à mão (padrão shadcn de referência, mas `FormControl` usa
  `React.cloneElement` em vez de `Slot`/`@radix-ui/react-slot`, porque o projeto usa
  `@base-ui/react`, não Radix, e não há Slot equivalente instalado). Vitest escolhido como
  primeiro framework de teste frontend do projeto (nenhum existia) — só para os schemas zod
  puros (`src/lib/validations/auth.ts`/`.test.ts`, 10/10 testes passando), não para
  componentes (Testing Library não instalada, lacuna declarada). Nenhuma policy de RLS nova
  criada em `convites` para resolver a exibição de "fazenda/papel do convite" na tela de
  signup — documentado como `TODO` no código, pendência para `db_sage`/`cyber_chief`, não
  implementada por conta própria (fora do que esta tarefa autoriza).
- **Validação real executada:** `npm run build` (`tsc -b && vite build`) limpo, zero erros de
  tipo (só aviso de bundle >500kB, esperado nesta fase). `npm run lint` (oxlint) limpo, exit
  code 0 (3 warnings de fast-refresh, não-bloqueantes, um pré-existente). `npm run test`
  (Vitest) 10/10 PASS. `npm run dev` subiu sem erro (log confirmado) e respondeu HTTP 200 em
  `/`, `/login` e `/app/dashboard` (smoke test via `Invoke-WebRequest`), processo derrubado
  depois. **Limitação honesta:** sem navegador real disponível neste ambiente — o smoke test
  confirma que o servidor sobe e responde, não que a UI renderiza/navega/envia formulários
  corretamente no DOM; nenhuma interação visual foi de fato exercitada.
- **Mudanças de arquivo:** novos `src/lib/auth.tsx`, `src/lib/validations/auth.ts`,
  `src/lib/validations/auth.test.ts`, `src/router.tsx`, `src/components/ProtectedRoute.tsx`,
  `src/components/layout/AppShell.tsx`, `src/components/ui/form.tsx` (mão),
  `src/components/ui/{input,label,card,sonner}.tsx` (CLI), `src/pages/PlaceholderPage.tsx`,
  `src/pages/NotFoundPage.tsx`, `src/pages/auth/{LoginPage,SignupPage,AceitarConvitePage}.tsx`,
  `vitest.config.ts`; editados `src/App.tsx` (composição de providers), `package.json`
  (`next-themes` via CLI, `vitest` devDependency, script `test`); este log; `PROJECT_CONTEXT.md`
  (esta seção + seção 1). Nenhuma migration/arquivo em `supabase/` tocado.
- **Pendências:** ação humana da Resend (ADR-0003, independente desta tarefa); policy de SELECT
  pública por token em `convites` (decisão de `db_sage`/`cyber_chief`); testes de
  componente/E2E do frontend (não escritos nesta rodada); code-splitting por rota quando os
  módulos de Fase 2/3/4 ganharem conteúdo real (bundle único hoje, só aviso).
- **Log completo:** `.agents/memory/log/2026-07-17-developer-frontend-fase1.md`

### 2026-07-17 — Testes de RLS/RPC (Fase 1 + ADR-0002) e integração da Edge Function `enviar-convite` — `qa` (Emma, via Claude)

- **O que foi feito:** escrita e **execução real** (não só descrição) de 3 suítes de teste
  contra Supabase local (`supabase start`, ambas as migrations aplicadas do zero num Postgres
  limpo). Suíte A — 6 arquivos pgTAP em `supabase/tests/database/` (25 asserções, 25/25 PASS):
  insert direto do client falha nas 4 tabelas de autorização (`usuarios`/`fazendas`/
  `usuarios_fazendas`/`convites`); update de colunas imutáveis falha mesmo pelo dono da linha;
  update em `usuarios_fazendas` nunca tem efeito (sem policy nenhuma); **regressão do achado
  nº1 do gate cyber_chief no ADR-0002** (bypass de autorização via NULL) nos dois locais onde o
  bug existia — `aceitar_convite()` e o branch de convite de `handle_new_user()` — confirmada
  como **corrigida** (rejeita, não aceita silenciosamente) por execução real, com teste de
  controle confirmando que o caminho legítimo continua funcionando; guarda "fazenda nunca fica
  sem admin" de `promover_papel()` testada no caso sequencial. Suíte B —
  `supabase/tests/edge-functions/enviar-convite.integration.ps1`, teste de integração HTTP real
  do handler completo (`supabase functions serve` + chamadas HTTP de fato via `curl.exe`,
  usuários/JWTs reais via signup GoTrue): 5/5 PASS (401 sem auth, 403 não-admin, 404 convite
  inexistente, 409 convite não-pendente, 200 controle positivo) — cobre exatamente a lacuna que
  `index.test.ts` (do `developer`) já documentava não cobrir. Suíte C —
  `supabase/tests/manual/promover_papel-concorrencia.ps1`, **teste de concorrência real** (duas
  sessões `psql` de verdade via `docker exec`, não simulação) do **achado nº2** (corrida
  TOCTOU): duas chamadas concorrentes rebaixando os 2 admins de uma mesma fazenda — confirmado
  que a segunda sessão bloqueia de verdade no lock da primeira e, ao ser liberada, reavalia
  contra o dado já commitado, rejeitando corretamente; fazenda termina com exatamente 1 admin,
  nunca 0. **Total: 32/32 asserções passaram em execução real.**
- **Bloqueio de ambiente encontrado e contornado:** `supabase start` sem flags falhava
  (`storage-api` unhealthy por incompatibilidade CLI 2.26.9/imagem nova; depois `logflare`
  também). Contornado com `supabase start -x storage-api -x imgproxy -x logflare -x vector` —
  nenhum necessário para os testes desta tarefa. Ver log para detalhes e recomendação de
  atualizar a CLI.
- **Decisões:** convenção de organização documentada nos próprios arquivos: pgTAP para
  banco (`supabase/tests/database/NNN_descricao.sql`, um arquivo por garantia, autocontido
  `begin;...rollback;`), PowerShell para integração HTTP de Edge Function (não há equivalente
  pgTAP nativo para Deno) e para o teste de concorrência real (pgTAP roda numa única sessão,
  não serve para simular duas conexões concorrentes).
- **O que NÃO foi testado (honestidade de cobertura):** `criar_convite()`/`cancelar_convite()`
  sem teste pgTAP dedicado (mesmo padrão de autorização já testado indiretamente); branch
  Resend do `enviar-convite` não testado via HTTP real (`RESEND_API_KEY` ausente neste
  ambiente, mesma pendência já registrada no ADR-0003); Storage/Analytics não testados
  (excluídos do `supabase start` local, não usados por nenhum artefato desta tarefa).
- **Mudanças de arquivo:** novos `supabase/tests/database/001_rls_insert_default_deny.sql` a
  `006_promover_papel_guarda_sequencial.sql`; novo
  `supabase/tests/edge-functions/enviar-convite.integration.ps1`; novo
  `supabase/tests/manual/promover_papel-concorrencia.ps1`; novo log; esta entrada +
  seção 4 de `PROJECT_CONTEXT.md`.
- **Pendências:** nenhum bloqueio técnico para a Fase 1 do ponto de vista deste gate de testes
  — aprovação final continua sendo decisão do usuário (`qa` está proibida de aprovar, ver
  regras do próprio agente). `devops`: considerar atualizar a CLI do Supabase. `qa` (rodada
  futura, não bloqueante): cobertura de `criar_convite()`/`cancelar_convite()`, teste HTTP do
  branch Resend quando a API key existir.
- **Log completo:** `.agents/memory/log/2026-07-17-qa-testes-fase1-adr0002.md`

### 2026-07-17 — ADR-0003: provedor de e-mail transacional (Resend) + `APP_URL` — `devops` (Oliver, via Claude)

- **O que foi feito:** resolvidas as duas pendências deixadas pelo gate do `cyber_chief` no
  ADR-0002 (`.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md`). Avaliado com
  critério real (integração HTTP simples em Deno sem SDK Node-específico, tier gratuito,
  deliverability) Resend vs. SendGrid vs. Postmark vs. Amazon SES — Resend escolhida (SES
  descartada principalmente por exigir assinatura AWS SigV4 sem SDK; SendGrid/Postmark sem tier
  gratuito permanente comparável). Implementada a chamada HTTP real à Resend em
  `supabase/functions/enviar-convite/logica.ts` (`montarChamadaResend()`, função pura) e
  `index.ts` (branch com `fetch()` real), **gated por `RESEND_API_KEY`** — ausente hoje, então o
  comportamento atual (fallback de log, `emailEnviado: false`) é preservado sem nenhuma
  regressão. `enviarEmailConvite()` deixou de ser "placeholder aguardando decisão" e virou o
  fallback deliberado (usado quando a env var está ausente OU quando a chamada à Resend falha).
  Decidido e documentado `APP_URL` para dev local (`http://localhost:5173`, confirmado contra
  `vite.config.ts`/`package.json` — sem `server.port` customizado, porta padrão do Vite).
- **Decisões:** ver seção 2 (linha ADR-0003). Nova env var opcional `RESEND_FROM_EMAIL` (default
  no código: sender de sandbox `onboarding@resend.dev`, trocar por domínio verificado antes de
  produção real com usuários fora da equipe).
- **Mudanças de arquivo:** `supabase/functions/enviar-convite/logica.ts` editado
  (`montarChamadaResend()` nova, `enviarEmailConvite()` recontextualizada); `index.ts` editado
  (branch Resend + fallback, env vars documentadas no cabeçalho); `index.test.ts` editado (2
  testes novos para `montarChamadaResend()`); novo `.agents/memory/adr/
  ADR-0003-provedor-email-transacional.md`; novo log; esta entrada + seções 1, 2 e 4 de
  `PROJECT_CONTEXT.md`.
- **Pendências:** ação humana — criar conta Resend, gerar API key, rodar `supabase secrets set
  RESEND_API_KEY=...`/`APP_URL=http://localhost:5173` (comandos exatos no ADR-0003) e
  `supabase functions deploy enviar-convite --project-ref bsoofshttpboaaokejwt` para a versão
  nova ir ao ar. Atualizar `APP_URL` quando o frontend for deployado. `qa` (Emma) segue com o
  teste de integração real do handler HTTP completo pendente, agora incluindo o branch Resend.
- **Log completo:** `.agents/memory/log/2026-07-17-devops-email-provider-app-url.md`

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
