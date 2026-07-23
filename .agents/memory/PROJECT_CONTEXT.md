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
- **Última atualização:** 2026-07-21 — **Fase 4 iniciada** (telas reais do Eixo 2), primeiro
  módulo: **Módulo de Transações** (item 15 da seção 10, `/app/rebanho/transacoes` +
  `/app/rebanho/transacoes/:id`), escolhido por JP como o primeiro dos 6 módulos ("um módulo por
  vez, começando por Transações, ordem da spec"). Lista com resumo de saldo início/fim de ano por
  espécie (reaproveita `obter_saldo_rebanho()`), filtros (ano/espécie/operação/contraparte) e
  paginação (spec seção 6, requisito crítico para tabelas densas). Detalhe individual mostra
  sexo/faixa etária (`transacoes_detalhe`), GTA vinculada, e o fluxo de doc-tracking progressivo
  descrito por JP na sessão anterior: Nota/Contranota com badge Presente/Pendente + upload real
  para o bucket `transacoes-documentos` (item 14, primeira tela a usar de fato o upload que tinha
  ficado pendente) + "Ver documento" via signed URL; formulário para completar número/valor da
  nota, peso total, status da GTA e observações a qualquer momento, sem exigir nada no lançamento
  inicial. Acesso de `financeiro` tratado como somente-leitura (esconde upload/formulário de
  edição, mas SELECT no restante da tela funciona — RLS já cobria isso desde a Fase 3).
  **Achado real durante o teste visual, corrigido nesta mesma tarefa:** o embed PostgREST
  `transacoes -> gtas` retornava **HTTP 300 Multiple Choices** (não um erro visível no console,
  a tela ficava presa em "Carregando…" para sempre) — causa: a referência circular deliberada
  `transacoes.gta_id <-> gtas.transacao_id` (ADR/migration item 11, decisão 1) dá ao PostgREST
  duas FKs candidatas para o mesmo embed, e ele não escolhe sozinha. Corrigido com o hint
  explícito de constraint `gtas!transacoes_gta_id_fkey(...)` no `select`. Vale o registro para
  qualquer embed futuro envolvendo `transacoes`/`gtas` (Módulo de GTAs, item 17, vai precisar do
  mesmo cuidado no sentido inverso). Também reincidiu (e foi corrigido do mesmo jeito já
  documentado antes) o bug de `useForm({ values: ... })` trocando de não-controlado para
  controlado quando os dados assíncronos chegam — `Select` de Status da GTA ficava em branco;
  resolvido com `useEffect` + `form.reset()` explícito, mesmo padrão já usado em
  `SaidaAnimaisIndividuaisForm`/`EntradaAgregadaForm`.
  **Validação:** `npm run build`/`lint`/`test` (36/36) limpos; teste visual real (Playwright,
  desktop 1440×900 + mobile 390×844, Supabase remoto, conta de teste real) — lista e detalhe
  sem overflow nem erro de console em nenhum dos dois viewports; teste funcional de ponta a
  ponta (não só visual): editou número/valor da nota e status da GTA, **recarregou a página** e
  confirmou persistência real no banco (não só estado local do form); fez upload real de um PDF
  de teste para o bucket `transacoes-documentos`, confirmou o badge mudar para "Presente" e o
  botão "Ver documento" abrir a signed URL de verdade. Dados de teste (número/valor/status/
  observações/arquivo da transação usada) resetados ao original ao final — o arquivo de teste em
  si fica no bucket (mesma limitação já documentada no log do item 14: sem `service_role` no
  `.env` para limpar via Storage API, sem risco real).
  **Gate do `cyber_chief`:** ainda não rodado nesta tarefa — pendente antes de considerar o
  módulo definitivamente fechado (ver seção 4).
  **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-transacoes.md`.
- **Segundo módulo da Fase 4 concluído (2026-07-21): Módulo de Saldo de Rebanho** (item 16,
  `/app/rebanho/saldo`) — 100% reaproveitando `obter_saldo_rebanho()` (item 12/ADR-0005), zero
  migration nova. Seletor de espécie (catálogo completo, não só 3 fixas) + seletor de data de
  corte + tabela agrupamento etário × sexo com Qtd. Registrada/Pendente + "Imprimir Saldo" via
  `window.print()` (sidebar/topbar escondidos na impressão via `print:hidden` no `AppShell`).
  **Achado real corrigido:** a seleção padrão de espécie tinha race condition — decidia assim
  que o catálogo de espécies carregava, sem esperar a RPC de saldo, e sempre travava em
  "Abelhas" (primeira alfabética, sem dado nenhum) em vez de "Bovinos" (saldo real de 25);
  corrigido fazendo o efeito esperar as duas queries. Validado com `build`/`lint`/`test`
  (36/36) e teste visual real desktop+mobile contra o remoto, confirmando o bug antes da
  correção e o comportamento certo depois. Gate do `cyber_chief` não rodado (só frontend). Ver
  `.agents/memory/log/2026-07-21-fase4-modulo-saldo-rebanho.md`.
- **Terceiro módulo da Fase 4 concluído (2026-07-21): Módulo de GTAs** (item 17,
  `/app/rebanho/gtas` + `/app/rebanho/gtas/:id`) — listagem com filtros (status/espécie/período),
  paginação, cadastro (`CriarGtaDialog`) e edição inline no detalhe (mesmo `GtaForm.tsx`
  compartilhado nos dois), upload real do documento original (bucket `gtas-documentos`) com botão
  "Ver GTA" só dentro do detalhe (nunca na listagem, conforme spec), vínculo opcional a uma
  transação (Select das últimas 100 transações). Papel `financeiro` bloqueado explicitamente na
  UI com mensagem clara (RLS já bloqueava desde a Fase 3, isso é só UX). Reaproveitou o mesmo
  cuidado do hint de constraint (`transacoes!gtas_transacao_id_fkey`) para o embed
  `gtas -> transacoes` — confirmado o nome exato via `pg_constraint` antes de escrever, para não
  repetir o erro 300 já visto no Módulo de Transações. Validado com `build`/`lint`/`test`
  (36/36) e teste funcional completo (cadastro real + upload real + "Ver GTA" abrindo signed URL)
  desktop+mobile contra o remoto; dado de teste removido ao final. Gate do `cyber_chief` não
  rodado (só frontend). Ver `.agents/memory/log/2026-07-21-fase4-modulo-gtas.md`.
- **Duas correções reais de JP durante o Módulo de GTAs (2026-07-21), ambas aplicadas ao
  remoto:**
  1. **Cardinalidade transação↔GTA estava errada.** JP: "as GTAs são feitas uma para cada
     caminhão que transporta a carga... em uma transação pode existir 1 nota e 1 contranota mas
     mais de 1 GTA relacionada à mesma operação". A migration original do item 11 desenhou um
     vínculo circular 1:1 (`transacoes.gta_id` <-> `gtas.transacao_id`) — errado. Corrigido
     (`20260721050000_corrige_cardinalidade_transacao_gta.sql`) removendo só
     `transacoes.gta_id` (0/2 preenchido em produção, sem perda de dado) —
     `gtas.transacao_id` (muitos-para-um) já era a modelagem certa. `TransacaoDetailPage.tsx`
     agora mostra uma LISTA de GTAs vinculadas (`useGtasDaTransacao`, novo hook), não mais um
     campo único. Confirmado organicamente no teste: a transação de teste já tinha uma GTA real
     de sessão anterior (`AC-871811`) vinculada — depois da correção, as DUAS GTAs (a antiga +
     uma nova de teste) aparecem juntas na lista, prova real da cardinalidade N.
  2. **`gtas.quantidade_animais` (campo novo, fora da spec original)** — JP pediu para
     identificar quantos animais estão incluídos em cada documento de GTA
     (`20260721040000_gtas_quantidade_animais.sql`, nullable — 1 GTA real já existia sem esse
     campo). Exigido no formulário (zod) a partir de agora.
  3. **Fluxo de liberação automática ao enviar o documento** — JP pediu que, ao fazer upload do
     arquivo de uma GTA pendente, o sistema pergunte se deve marcar como liberada (documento
     chegando é, na prática, o sinal de liberação). Implementado como um card inline em
     `GtaDetailPage.tsx` com campo de data (default hoje) e as opções "Marcar como liberada"/
     "Manter pendente". **Achado corrigido no processo:** o form "Editar GTA" precisou de
     `key={gta.updated_at}` para remontar (react-hook-form só lê `defaultValues` no primeiro
     mount) — sem isso, confirmar a liberação atualizava o banco mas o form continuava
     mostrando os valores antigos.
  Validado com `build`/`lint`/`test` (36/36) e teste funcional real (Playwright, desktop,
  Supabase remoto) cobrindo as três mudanças de uma vez. Ver
  `.agents/memory/log/2026-07-21-fase4-modulo-gtas.md` (seção de correção) para o detalhe
  completo.
- **Terceira correção de JP, mesma sessão: bucket `declaracoes-rebanho` também aceita imagem**
  (não só PDF). Migration `20260721060000_declaracoes_rebanho_aceita_imagem.sql` — os 3 buckets
  do item 14 agora aceitam exatamente o mesmo conjunto de formatos (PDF + JPEG/PNG/WebP/HEIC/
  HEIF). Ver `.agents/memory/log/2026-07-21-storage-buckets-item14.md` (seção de correção).
- **Correção no Módulo de Transações (2026-07-21): todos os campos editáveis.** JP pediu que a
  tela de detalhe da transação permita editar TODOS os campos, "inclusive o número de animais, o
  nome da outra parte... todos os campos" — antes só numero_nota/valor_nota/peso_total_kg/
  status_gta_transacao/observacoes eram editáveis. Agora outra_parte/data_operacao/especie_id/
  quantidade_animais também são, no mesmo form (renomeado "Completar dados da operação" →
  "Editar operação"). **Única exceção deliberada, confirmada com JP:** `tipo_operacao` continua
  fixo — trocar o tipo depois de criado deixaria inconsistentes os vínculos já feitos
  (`transacoes_animais` para Venda/Óbito/Consumo, animais pendentes já criados para Compra/
  Nascimento/Entrada de Pastoreio). Sem migration (colunas já existiam). Validado com
  `build`/`lint`/`test` (36/36) e teste funcional real com reload de página confirmando
  persistência. Ver `.agents/memory/log/2026-07-21-fase4-modulo-transacoes.md` (seção de
  correção).
- **Bug real corrigido em `NumericInput` (componente compartilhado, 2026-07-21):** JP reportou
  que o campo de peso só aceitava "uma casa de número inteiro" antes de travar. Causa raiz: o
  `useEffect` que resincroniza o texto exibido a partir do `value` externo (pensado só para
  `form.reset()`) na verdade disparava a CADA tecla digitada (o próprio `onChange` do input já
  atualiza esse `value`), reformatando/arredondando para `casasDecimais` imediatamente — com
  `casasDecimais=0` isso não tinha efeito visível (formatar um inteiro sem decimais devolve o
  mesmo texto), mas assim que qualquer campo passou a usar `casasDecimais>0` (peso total, ver
  correção anterior desta mesma sessão) digitar "1" virava "1,00" na hora, e a tecla seguinte já
  entrava depois da vírgula em vez de continuar o número inteiro — impossível digitar números de
  mais de 1 dígito. Corrigido com uma guarda (`paraNumero(texto) === value`) que só reformata
  quando o valor externo realmente diverge do que já está digitado. Reproduzido e confirmado só
  com Playwright `pressSequentially` (digitação tecla-por-tecla real) — `fill()` mascarava o bug
  porque seta o valor inteiro de uma vez, sem disparar o `useEffect` no meio do caminho. Afeta
  TODOS os campos de peso/valor do app (compartilhado) — `build`/`lint`/`test` (36/36) limpos,
  sem log dedicado (fix pontual de componente, não decisão de arquitetura).
- **Módulo Financeiro iniciado (2026-07-21): listagem/CRUD de lançamentos** (item 18, passo
  1/3, `/app/rebanho/financeiro` + `/app/rebanho/financeiro/:id`) — filtros (tipo/categoria/
  pago/período), paginação, resumo de receitas/despesas, vínculo opcional a uma transação de
  animal. **Campo novo pedido por JP, fora da spec original:** "Pago" (Sim/Não) + data do
  pagamento obrigatória quando Sim (migration
  `20260721070000_lancamentos_financeiros_pago.sql`, mesmo padrão de
  `gtas.status_liberacao`/`data_liberacao`). Papel `financeiro` só lê (RLS já bloqueava escrita
  desde a Fase 3, item 13) — botão "Novo Lançamento" e formulário de edição escondidos para
  esse papel. Validado com `build`/`lint`/`test` (36/36, build limpo já na primeira tentativa)
  e teste funcional real com reload de página confirmando persistência do campo `pago`. Gate do
  `cyber_chief` não rodado (só frontend). Ver
  `.agents/memory/log/2026-07-21-fase4-modulo-financeiro-lancamentos.md`. **Próximos passos do
  módulo:** classificação assistida por IA (ver decisão de planejamento acima) e visão
  consolidada de fluxo de caixa + exportação.
- **Configuração de Modelo de IA (2026-07-21):** JP pediu "ambiente para os admin da conta
  escolherem a LLM usada no sistema" (Anthropic/OpenAI/Gemini). **Decisão confirmada:** chave
  de API compartilhada/nossa, não BYOK — admin só escolhe entre provedor/modelo já configurado
  no backend. Migration `20260721080000_fazendas_config_llm.sql` —
  `fazendas.llm_provider`/`llm_model` + trigger `restringir_alteracao_config_llm` (só papel
  `admin` pode alterar — achado real: a policy `fazendas_update_vinculada` existente autorizava
  qualquer papel vinculado, sem essa guarda `membro`/`financeiro` poderiam mudar a config).
  Nova tela `/app/configuracoes/ia` ("Modelo de IA" no menu). Catálogo de modelos em
  `src/lib/llmCatalog.ts` — Anthropic (Haiku 4.5/Sonnet 5/Opus 4.8, fonte verificada), OpenAI
  (gpt-4o-mini/gpt-4o, sugestão de confiança média, não verificada ao vivo), Gemini (lista
  fornecida diretamente por JP: gemini-2.5-pro/gemini-2.5-flash/gemini-3.5-flash/
  gemini-3.1-pro-preview/gemini-3-pro-preview). **Validado com teste real de segurança**
  (usuário de teste temporário vinculado como `membro`, logado de verdade via
  `@supabase/supabase-js`, UPDATE bloqueado com a mensagem exata do trigger). **Achado
  operacional:** o trigger bloqueia até UPDATE via `psql` superusuário direto (`auth.uid()` é
  NULL fora de sessão autenticada) — para corrigir esses campos via SQL direto no futuro,
  precisa `alter table public.fazendas disable/enable trigger
  restringir_alteracao_config_llm`. Ainda NÃO implementado: a Edge Function que de fato chama o
  provedor escolhido (esta tarefa só persiste a escolha). Ver
  `.agents/memory/log/2026-07-21-configuracao-modelo-ia.md`.
- **Edge Function `classificar-documento` construída (2026-07-21)** — pedido de JP: "constroi a
  edge function usando gemini como padrao". Recebe imagem/PDF, lê `fazendas.llm_provider/
  llm_model` (via client do usuário, RLS já restringe), chama o Gemini (`generateContent` +
  `responseSchema` para JSON estruturado) e devolve os 7 campos de `lancamentos_financeiros`
  pro frontend pré-preencher — **nunca grava no banco**. DEFAULT de
  `fazendas.llm_provider`/`llm_model` trocado para `'gemini'`/`'gemini-2.5-flash'` (migration
  `20260721090000`, só Gemini está implementado). Deployada com sucesso
  (`supabase functions deploy`). **Pendência de infraestrutura (mesma classe do
  RESEND_API_KEY/ADR-0003):** `GEMINI_API_KEY` não configurada ainda — a function detecta e
  retorna erro claro em vez de falhar confuso; ninguém gerou a chave ainda. Validado de ponta a
  ponta contra a function real deployada (Playwright): toda a cadeia funciona (auth, leitura de
  config via RLS, checagem de provedor/chave), só a chamada real ao Gemini não foi validada
  (sem chave disponível). Testes Deno escritos mas não executados (CLI Deno ausente no Windows
  de desenvolvimento). Ver `.agents/memory/log/2026-07-21-edge-function-classificar-documento.md`.
- **Repositório de Documentos Fiscais construído (2026-07-21)** — pedido de JP: guardar o
  documento original (nota/boleto/recibo) de cada lançamento financeiro, separado dos
  documentos de transação de pecuária, agrupado por mês da nota, com tela para financeiro/
  contábil + admin (filtros ano/mês) e download em ZIP do mês. Migration
  `20260721100000_lancamentos_documentos_fiscais.sql` — `lancamentos_financeiros.arquivo_path/
  arquivo_mime_type` + bucket `lancamentos-documentos` (caminho
  `{fazenda_id}/{AAAA-MM do data_lancamento}/{id}.{ext}`). **Compressão de imagem no cliente**
  antes do upload (`src/lib/comprimirImagem.ts`, canvas → JPEG qualidade 0.8, só se realmente
  menor) — PDF e HEIC/HEIF não são comprimidos (risco/suporte de navegador). Tela
  `/app/rebanho/financeiro-documentos` ("Documentos Fiscais" no menu). **Edge Function nova
  `gerar-zip-lancamentos`** — monta ZIP do mês com `npm:jszip`, nomeando cada arquivo
  `{AAAA-MM-DD}_{NNN}_{entrada|saida}_{categoria}.{ext}` (pedido explícito de JP: ordem
  alfabética = ordem cronológica, NNN = sequencial no mês). Deployada com sucesso. **Validado de
  ponta a ponta de verdade:** Playwright criou 2 lançamentos reais, enviou imagem real (testando
  compressão) e PDF, baixou o ZIP via evento real de download do navegador e **extraiu o ZIP
  para conferir o conteúdo** — nomes e ordem exatamente como pedido. Ver
  `.agents/memory/log/2026-07-21-documentos-fiscais-repositorio.md`.
- **Fluxo de Caixa consolidado + exportação CSV construído (2026-07-21)** — último passo do
  Módulo Financeiro (item 18, spec seção 5.2). View nova `fluxo_caixa_consolidado`
  (`security_invoker=true`, migration `20260721110000_fluxo_caixa_consolidado.sql`) faz `UNION
  ALL` de (a) `transacoes` com `tipo_operacao in ('compra','venda')` e `valor_nota` preenchido
  (categoria "Venda de Animais"/"Compra de Animais") e (b) `lancamentos_financeiros` **onde
  `transacao_animal_id is null`** — exclusão deliberada para não contar duas vezes o dinheiro de
  um lançamento já vinculado a uma transação de animal (o comentário original dessa coluna, da
  migration do item 13, já previa esse uso). Sem tabela/RPC nova — RLS das duas tabelas de
  origem já cobre a fronteira de `financeiro` (só leitura). Tela nova
  `/app/rebanho/fluxo-caixa` ("Fluxo de Caixa" no menu, entre Financeiro e Documentos Fiscais) —
  cards de Total Receitas/Despesas/Saldo Líquido, filtros ano/mês/tipo/categoria, tabela com link
  de volta pra origem (transação ou lançamento, conforme `origem`/`origem_id` da view).
  **Exportação:** só CSV (não `.xlsx` binário — exigiria dependência nova tipo `xlsx`/`exceljs`,
  não usada no projeto; escopo combinado com JP era "CSV/Excel" e CSV abre no Excel sem
  problema). Geração client-side (Blob + BOM UTF-8, sem Edge Function). **Validado de ponta a
  ponta com dados reais:** Playwright criou 2 lançamentos de teste (despesa 05/07 e receita
  20/07, R$250 cada), confirmou que a view já trazia uma transação de venda de animal real
  (R$20.000, Frigorífico Zimmer) somada corretamente às receitas antes mesmo de criar os testes,
  confirmou filtro por tipo (Despesa isola só o lançamento despesa), baixou o CSV de verdade e
  leu o conteúdo (linhas e valores batendo), e confirmou que o link da linha de origem navega
  pro lançamento financeiro certo (`input[name="descricao"]` com o valor esperado). Teste mobile
  (390px) sem overflow horizontal. Dados de teste removidos do banco ao final via SQL direto.
  `build`/`lint`/`test` (36/36) limpos. Gate do `cyber_chief` não rodado (só view read-only +
  frontend, sem tabela nova nem RPC). Ver
  `.agents/memory/log/2026-07-21-fluxo-caixa-consolidado.md`. **Módulo Financeiro (item 18)
  agora completo** do ponto de vista funcional: lançamentos, Pago/data pagamento, classificação
  por IA, documentos fiscais + ZIP, fluxo de caixa consolidado + CSV.
- **Captura de documento como entrada de "Novo Lançamento" — modal reutilizável (2026-07-21):**
  pedido de JP para mudar o comportamento do botão "Novo Lançamento": agora abre primeiro a
  captura de documento (desktop: um seletor de arquivo aceitando imagem+PDF; mobile: três
  botões separados — Câmera/Galeria/Arquivos, como app nativo) e só depois o formulário
  (pré-preenchido pela IA). **Confirmado com JP:** continua existindo "Preencher manualmente"
  (upload não é obrigatório) e o seletor de desktop aceita imagem além de PDF. Componente novo
  `src/components/documentos/CapturarDocumentoDialog.tsx` — deliberadamente genérico (não sabe
  nada de "lançamento financeiro", só devolve um `File` ou sinaliza "pular"), pensado para
  qualquer entrada de documento futura no app reusar a mesma UI. `CriarLancamentoDialog.tsx`
  virou uma máquina de 2 etapas (captura → formulário), só monta o `LancamentoForm` quando os
  dados já estão prontos (mesmo padrão já usado no projeto pra evitar bug de `Select`
  controlado/não-controlado). **Validado de verdade com Playwright** (desktop e mobile): UI
  correta em cada breakpoint, "Preencher manualmente" abre formulário vazio, upload real
  disparou a Edge Function `classificar-documento` de verdade e mostrou o erro esperado de
  `GEMINI_API_KEY` ausente sem travar o fluxo (a modal de captura ficou aberta pra nova
  tentativa). `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-21-captura-documento-novo-lancamento.md`.
- **Rascunho de lançamento com validação pendente + exclusão (2026-07-21):** JP perguntou como
  o upload estava sendo tratado hoje — resposta: **não era salvo no bucket durante a
  classificação por IA**, o arquivo era descartado da memória após a chamada ao Gemini; nada
  persistia até o usuário confirmar o formulário, e nem aí o arquivo em si (precisava reenviar
  manualmente depois). Corrigido pela sequência que JP propôs: upload → salva no bucket → IA →
  preenche o modal → aguarda confirmação; se o usuário abandonar sem confirmar, o rascunho
  continua no banco com os dados da IA, marcado "não validado". **Confirmado com JP:**
  rascunhos contam nos totais (Fluxo de Caixa/resumo) desde a extração, não só após validar;
  e exclusão de lançamento passou a ser permitida mesmo após validado (correção de erro).
  Migration `20260721120000_lancamentos_validado_e_delete.sql` — coluna
  `validado_pelo_usuario` (default true; só nasce false nos rascunhos de IA) + policy de DELETE
  nova (**reversão deliberada** da decisão original "sem DELETE" da migration do item 13 —
  ver seção 2). `CriarLancamentoDialog.tsx` reescrito: cria rascunho → salva documento →
  classifica → abre formulário JÁ VINCULADO ao rascunho (não mais um INSERT solto); se a
  classificação falhar, mantém rascunho+documento e deixa pra preenchimento manual. Badge
  "Não validado" (só aparece no estado excepcional) + filtro na lista + botão "Excluir
  lançamento" com dupla confirmação no detalhe. **Validado de ponta a ponta com Playwright**
  contra o Supabase remoto: upload real (classificação falhou de verdade por falta de
  `GEMINI_API_KEY`, caminho de fallback exercitado na prática), abandono sem confirmar deixando
  o rascunho na lista com o badge certo, confirmação removendo o badge, exclusão real com
  navegação de volta, e confirmação de que fechar a captura ANTES de escolher arquivo não cria
  nenhum rascunho. `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-21-rascunho-validacao-e-exclusao-lancamento.md`.
- **Correção real: API do Gemini migrou para Interactions API (2026-07-21) —
  `classificar-documento` finalmente validada de ponta a ponta.** JP configurou a
  `GEMINI_API_KEY` de produção; ao ativar o secret e testar de verdade pela primeira vez, a
  chamada ao Gemini falhou com 404 — não por falta de chave, mas porque a API
  `generateContent` usada na implementação original **foi aposentada pelo Google**
  ("no longer available to new users... use the Interactions API"). Confirmado por chamadas
  HTTP reais e diretas (não suposição): a API vigente é `POST v1alpha/interactions`, com
  autenticação por header `x-goog-api-key` (não mais `?key=` na URL), partes multimodais com
  `type: "image"` ou `type: "document"` (PDF — `image` com mime PDF é rejeitado com 400) e
  resposta em `{status, steps:[...]}` (texto no passo `model_output`, não mais
  `candidates[]`). `logica.ts`/`index.ts`/`index.test.ts` de `classificar-documento`
  reescritos para o novo contrato e redeployados. **Catálogo de modelos também corrigido**
  (`src/lib/llmCatalog.ts`): `gemini-2.5-pro`/`gemini-2.5-flash`/`gemini-3-pro-preview`
  (originalmente pedidos por JP) estão todos mortos pra chaves novas — removidos;
  `gemini-3.5-flash`/`gemini-3.1-pro-preview` confirmados funcionando, mantidos;
  `gemini-3.6-flash` adicionado como novo padrão (migration
  `20260721130000_fazendas_llm_modelo_gemini_atualizado.sql`, com backfill das fazendas que
  estavam no default morto). **Validado de ponta a ponta pela primeira vez de verdade:**
  Playwright gerou uma imagem sintética de nota fiscal real (não um pixel em branco) e os 6
  campos extraídos pelo Gemini bateram exatamente com o conteúdo do documento. Ver
  `.agents/memory/log/2026-07-21-correcao-api-gemini-interactions.md`.
- **Fase 4, Módulo Declaração Anual de Rebanho (item 19) construído (2026-07-21):**
  `/app/rebanho/declaracoes` — histórico de `declaracoes_rebanho` por espécie/ano (schema e
  bucket já existentes desde itens anteriores da Fase 3/14), "Nova Declaração", "Marcar como
  enviada" (data de envio + upload opcional de PDF/imagem), edição restrita a quantidade/data
  de referência (espécie/ano imutáveis após criação, protege o
  `unique(fazenda_id, especie_id, ano_referencia)` do banco). **Achado real:** o card de prazo
  regulatório depende de `fazendas.estado`, que nasce `NULL` pra toda fazenda existente (sem
  fluxo de "complete seu cadastro") — adicionado um seletor de UF inline na própria tela (só
  não-financeiro), reaproveitando a policy já existente (mesmo nível de `nome`, sem RLS nova).
  **Achado e correção durante o teste:** o seletor de UF tinha o mesmo bug de `Select`
  não-controlado→controlado já visto antes no projeto — corrigido com sentinela (`SEM_UF`),
  mesmo padrão dos filtros existentes. **Validado de ponta a ponta com Playwright**
  (desktop+mobile, Supabase remoto): configurou estado real, prazo calculado corretamente
  (marcado "Prazo encerrado" — data do sistema depois de 30/06), criou declaração, marcou como
  enviada com upload real de PDF, abriu o documento via signed URL real, confirmou edição
  travando espécie/ano. `build`/`lint`/`test` (36/36) limpos, build passou de primeira. Ver
  `.agents/memory/log/2026-07-21-declaracao-anual-rebanho.md`.
- **Financeiro reorganizado em abas, fora de "rebanho" (2026-07-22):** discussão de UX com JP
  (planejamento antes de qualquer código) sobre 3 melhorias de usabilidade. Primeira executada:
  Transações/Financeiro/Fluxo de Caixa/Documentos Fiscais eram 4 itens soltos dentro de "Rebanho
  & Compliance" com URL `/rebanho/*` — confuso porque "Financeiro" sozinho não era o financeiro
  completo (não incluía animais) e "rebanho" não fazia sentido pro dinheiro TOTAL da fazenda.
  Viraram **abas de uma única área `/app/financeiro`** (`FinanceiroLayout.tsx`, usa
  `@base-ui/react/tabs` com cada aba renderizada como `<Link>` — navegação real por rota, não
  painel condicional): Visão Geral (Fluxo de Caixa) | Transações de Animais (a página
  Transações, só movida, com seu resumo de saldo) | Lançamentos Gerais | Documentos Fiscais.
  Saldo de Rebanho **não entrou** — continua em Rebanho & Compliance (é sobre estoque de
  animais, não dinheiro). Menu ganhou uma seção de topo própria "Financeiro" com uma única
  entrada. 6 links internos corrigidos pras novas URLs. **Validado de ponta a ponta com
  Playwright** (desktop+mobile): navegação entre as 4 abas com URLs corretas, dados reais
  carregando em cada uma, link de origem de uma transação de animal no Fluxo de Caixa abrindo a
  URL nova corretamente. `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-22-financeiro-reorganizado-em-abas.md`.
- **Tela de Lançamento Rápido (2026-07-22):** segundo item da mesma discussão de UX. Não havia
  nenhum atalho de ação no app — pra registrar algo era preciso navegar até a lista específica
  primeiro. Nova tela `/app/lancamento-rapido`, 2 botões grandes ("Operação com Animais" /
  "Despesas e Receitas Gerais"), **reaproveitando 100% dos fluxos já existentes**
  (`EntradaSaidaLoteDialog`/`CriarLancamentoDialog`, que ganharam uma prop opcional `trigger`
  pra trocar o visual do botão-gatilho sem duplicar nenhuma lógica — Animais/Transações/
  Financeiro continuam idênticos quando essa prop não é usada). Acessível via card de destaque
  no Dashboard (decisão explícita de JP: só o card, sem item novo no menu). **Validado de ponta
  a ponta com Playwright** (desktop+mobile): os dois botões abrem de verdade os dialogs
  corretos. `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-22-lancamento-rapido.md`.
- **Declaração Anual reestruturada: 1 declaração/ano + itens de espécie (2026-07-22):**
  terceiro e último item da discussão de UX. O desenho original (item 19, 2026-07-21) modelava
  uma linha por (fazenda, espécie, ano) — cada espécie com seu próprio status/envio/PDF. JP
  apontou a correção: a Declaração Anual é **um documento por ano**, cobrindo todas as espécies.
  Migration `20260722100000_declaracoes_rebanho_itens_por_especie.sql` (tabela confirmada vazia
  antes da alteração, corte limpo): pai perde `especie_id`/`quantidade_declarada`, ganha
  `unique(fazenda_id, ano_referencia)`; tabela filha nova `declaracoes_rebanho_itens`
  (espécie × quantidade, RLS via join em `declaracao_id`, DELETE liberado pra admin/membro —
  remover uma espécie do detalhamento é diferente de apagar a declaração inteira, que continua
  proibida). RPC nova `criar_declaracao_rebanho()` (SECURITY INVOKER) cria pai+itens
  atomicamente numa única chamada. `DeclaracaoForm.tsx` ganhou lista dinâmica de espécie×
  quantidade via `useFieldArray`. Listagem: 1 linha por ano, expansível pro detalhamento.
  **Achado real no teste:** bug de pluralização ("190 animalis" em vez de "animais" — sufixo
  errado, corrigido pra ternário de palavra inteira). **Validado de ponta a ponta com
  Playwright** (desktop+mobile): criação com 2 espécies, expansão, edição removendo uma
  espécie e corrigindo quantidade, marcar como enviada — tudo confirmado com dados reais.
  `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-22-declaracao-anual-reestruturada.md`. **Os 3 itens da discussão
  de UX estão concluídos.**
- **Fase 4, Configurações > Prazos de Declaração construído (2026-07-22, item 20):** substitui
  o placeholder em `/app/configuracoes/prazos-declaracao`. Editor de `fazendas.estado` (UF) +
  tabela de prazos cadastrados de `prazos_declaracao_estado`, com "Novo prazo"/"Editar" via a
  RPC já existente `definir_prazo_declaracao_estado()` (upsert por estado/ano — nenhuma
  migration nova). Escrita exige papel `<> financeiro` (mesma fronteira da RPC, diferente de
  Modelo de IA que é admin-only). **Refatoração de limpeza:** o editor de UF que vivia embutido
  no card de prazo da tela de Declarações (solução temporária do item 19) foi removido de lá —
  agora linka pra esta tela nova, centralizando a edição num lugar só. **Validado de ponta a
  ponta com Playwright** (desktop+mobile): cadastrou um prazo real, editou, e confirmou na
  tela de Declarações que o prazo cadastrado passou a valer no lugar do fallback "padrão RS".
  `build`/`lint`/`test` (36/36) limpos. Ver `.agents/memory/log/2026-07-22-prazos-declaracao.md`.
- **Fase 4, Painel Inteligente construído (2026-07-22, item 21) — ÚLTIMO ITEM DA FASE 4.**
  `/app/rebanho` unifica: alertas acionáveis (GTAs pendentes, Declaração pendente com os mesmos
  3 estados da tela de Declarações), cards de saldo atual por espécie (reaproveita
  `useResumoSaldoAno` já existente, zero mudança), gráfico de evolução do saldo ao longo do ano
  (hook novo `useEvolucaoSaldoAno` — estende `obter_saldo_rebanho()` já existente com até 12
  checkpoints mensais em paralelo, **sem view/RPC nova de série histórica**, consistente com a
  decisão da spec de manter saldo "calculado on-the-fly"), resumo financeiro do ano (reaproveita
  `useFluxoCaixa`; cabeças compradas/vendidas via hook novo `useResumoTransacoesAno`, soma
  simples de `transacoes.quantidade_animais`), e atalhos pras últimas transações/lançamentos.
  **Investigação real que descartou um falso alarme:** uma consulta SQL direta via `psql`
  parecia contradizer o saldo mostrado na tela — confirmado que é o mesmo comportamento já
  documentado de `auth.uid()` ser NULL fora de sessão autenticada (função depende de RLS/
  usuário logado), não um bug; o valor da tela bateu exato com a soma manual de
  `transacoes_detalhe`. **Bug real encontrado e corrigido:** o alerta de Declaração mostrava
  brevemente "Nenhum prazo cadastrado" enquanto as queries ainda carregavam, antes de
  autocorrigir — resolvido com guarda de `isLoading`. **Observação de performance documentada
  (não corrigida):** a página dispara bastante query em paralelo (até ~12 RPCs pro gráfico em
  dezembro), aceitável por ora. **Validado de ponta a ponta com Playwright** (desktop+mobile,
  dado real): todas as seções com valores reais, clique num atalho navegando pro detalhe certo,
  linha do gráfico subindo exatamente no mês certo. `build`/`lint`/`test` (36/36) limpos. Ver
  `.agents/memory/log/2026-07-22-painel-inteligente.md`. **Com isso, a Fase 4 (itens 15-21 da
  spec, seção 10) está completa.**
- **Atualização anterior:** 2026-07-22 — **gate formal do `cyber_chief` da Fase 4 completa,
  veredito 🟢 Seguro** (sem achados bloqueantes), seguido da criação do papel "admin do
  software" (`usuarios.papel_sistema`, independente de fazenda) e da tela
  `/app/configuracoes/extracao-ia` pra controlar o prompt/schema de `classificar-documento` —
  ambas essa tela e "Modelo de IA" agora restritas ao admin do software, não mais ao admin de
  cada fazenda. Ver seção 5,
  `.agents/memory/log/2026-07-22-cyber_chief-review-fase4-completa.md` e
  `.agents/memory/log/2026-07-22-admin-software-e-configuracao-extracao-ia.md`.
- **Atualização anterior:** 2026-07-22 — **Multi-fazenda, Fase A**: um usuário agora pode ser
  vinculado a mais de uma fazenda com um seletor real (`FazendaSwitcher`, sempre visível no
  menu) — `useFazendaAtual()` foi reescrito pra resolver a fazenda selecionada (persistida em
  localStorage) contra a lista real de vínculos, sem quebrar nenhum dos 19 call sites existentes.
  RPC nova `criar_fazenda()` permite a um admin já existente cadastrar fazenda adicional. Tela
  `/app/configuracoes` deixou de ser placeholder (dados da fazenda/usuário + lista "Minhas
  Fazendas"). Achado de RLS corrigido: `fazendas.nome` só editável por admin/membro (financeiro
  não).
- **Última atualização:** 2026-07-22 — **Code splitting por rota** (item 11 do roadmap
  resolvido) — `router.tsx` reescrito com `lazy` nativo do React Router. Bundle principal caiu
  de 1,46MB pra ~350KB. Validado com Playwright contra o build de produção real (`vite preview`).
  Ver `.agents/memory/log/2026-07-22-code-splitting.md`.
- **Atualização anterior:** 2026-07-22 — **Auditoria de responsividade mobile em todas as telas**
  (item 10 do roadmap resolvido) — sweep Playwright real nas 23 rotas de `/app/*`. 3 bugs reais
  corrigidos (tabelas sem `overflow-x-auto`: `AnimaisListPage`/`ComparativoPage`/
  `LoteDetailPage`, sobras da Fase 2). Ver `.agents/memory/log/2026-07-22-auditoria-mobile.md`.
- **Atualização anterior:** 2026-07-22 — **Gate formal do `cyber_chief` pro multi-fazenda (Fases
  A+B) + tela Equipe, veredito 🟢 Seguro, sem achados** — verificação adversarial de IDOR/
  elevação de privilégio em `criar_fazenda`/`listar_membros_fazenda`/`remover_membro`, nenhum
  bypass encontrado. Item 4 do roadmap resolvido (seção 4). Ver
  `.agents/memory/log/2026-07-22-cyber_chief-review-multi-fazenda.md`.
- **Atualização anterior:** 2026-07-22 — **Gráfico Evolução do Saldo mostra a variação na data
  real** (não mais só 1 ponto por mês fechado) — eixo do tempo virou escala numérica, mas os
  rótulos continuam só no início de cada mês (pedido de JP). Ver
  `.agents/memory/log/2026-07-22-grafico-evolucao-saldo-datas-reais.md`. Também salvo nesta
  sessão: roadmap "pronto e ultra profissional" combinado com JP (seção 4, topo) — prioridades a
  confirmar antes de começar qualquer item.
- **Atualização anterior:** 2026-07-22 — **Exportar CSV em Lançamentos Gerais.** Mesmo botão que já
  existia em Fluxo de Caixa, agora também na aba Lançamentos Gerais — exporta TODOS os
  lançamentos que casam com o filtro ativo (ignora paginação), não só a página visível. Lógica de
  CSV (escape RFC 4180 + BOM UTF-8) extraída pra `src/lib/exportarCsv.ts`, reaproveitada nas duas
  telas. Ver `.agents/memory/log/2026-07-22-exportar-csv-lancamentos-gerais.md`.
- **Atualização anterior:** 2026-07-22 — **Multi-fazenda, Fase B: tela Equipe**. RPCs novas
  `listar_membros_fazenda()`/`remover_membro()` (admin-only, mesma guarda "nunca zero admins" já
  usada em `promover_papel`) + frontend ligando pela primeira vez o backend de convites do
  ADR-0002 (`criar_convite`/`promover_papel`/`cancelar_convite` + Edge Function
  `enviar-convite`), que existia desde 2026-07-16 sem nenhuma UI. Bug real corrigido:
  `listar_membros_fazenda` nunca funcionava por ambiguidade de coluna (`usuario_id` do RETURNS
  TABLE colidindo com a coluna da tabela). **⚠️ Achado de infraestrutura pré-existente, NÃO
  bloqueante para o resto da tela:** `enviar-convite` retorna 502 ("invalid JWT... unrecognized
  JWT kid... for algorithm ES256") ao notificar um convite por e-mail — o convite funciona
  mecanicamente mesmo assim (conta criada, vínculo efetivado), só a notificação falha. Parece
  configuração de JWT Signing Keys do projeto Supabase — precisa de investigação de
  infraestrutura, fora do escopo de código. Multi-fazenda (Fases A+B) está completo do ponto de
  vista de código. Ver seção 4, `.agents/memory/log/2026-07-22-multi-fazenda-fase-b-equipe.md` e
  `.agents/memory/log/2026-07-22-multi-fazenda-fase-a.md`.
- **Atualização anterior:** 2026-07-22 — **Detalhe do Lote (Eixo 1): transferir/retirar animal +
  incluir animais.** `MudarLoteDialog` (Select único: outro lote ou "Sem lote", mesmo gesto pra
  retirar/transferir) e `AdicionarAnimaisDialog` (busca por identificação + checklist, inclusive
  animais que já têm outro lote — "rouba" pro lote atual). Sem migration nova — RLS/trigger da
  Fase 2 já cobriam. Bug real corrigido: `LoteSelectField` (react-hook-form) não funciona fora de
  um `<Form>` — trocado por `Select` plano. Ver
  `.agents/memory/log/2026-07-22-lote-detalhe-gestao-animais.md`.
- **Atualização anterior:** 2026-07-22 — **Botão "Baixar ZIP" (Documentos Fiscais) + catálogo
  Gemini.** Botão não era bug de lógica — só nascia desabilitado até ano/mês serem preenchidos
  manualmente; agora nasce com o mês corrente já selecionado. **Achado real (mesma classe do
  incidente de 2026-07-21):** `gemini-2.5-flash-lite` (pedido por JP como novo padrão) está
  MORTO — confirmado com upload real de documento, mesmo erro "no longer available to new
  users". `gemini-3.5-flash-lite` (segunda opção pedida) testado com sucesso e virou o novo
  padrão em lugar dele. Ver `.agents/memory/log/2026-07-22-zip-botao-e-catalogo-gemini.md`.
- **Atualização anterior:** 2026-07-19 — `qa` (Emma) escreveu e **rodou de verdade** a suíte pgTAP
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
| 2026-07-21 | **Módulo Financeiro (item 18) vai incluir classificação assistida por IA de lançamentos:** usuário envia imagem/PDF de um documento (nota/boleto/recibo), sistema pré-preenche valor/data/categoria/contraparte/tipo via Supabase Edge Function chamando a API da Anthropic (Claude Haiku 4.5 — extração/classificação, custo estimado <R$10/mês mesmo em uso intenso), usuário confirma/edita antes de qualquer gravação. Sem mudança de schema — dado extraído fica só no estado do formulário até confirmação | JP | Decisão de planejamento, ainda não implementada — entra no escopo quando o Módulo Financeiro for construído. Ver spec seção 12, entrada "Planejado: classificação assistida por IA de lançamentos financeiros" |
| 2026-07-21 | **Reversão deliberada:** `lancamentos_financeiros` passa a permitir **DELETE** (admin/membro) — a migration original do item 13 (2026-07-20) tinha vetado exclusão de propósito ("correção é via UPDATE", risco de invalidar período já exportado pra contabilidade externa) | JP | Motivo: um lançamento pode ser validado por engano ou com erro (inclusive rascunho de IA mal lido) e precisa poder ser descartado, não só corrigido. Mitigação: dupla confirmação na UI, documento do bucket nunca apagado junto. Ver migration `20260721120000_lancamentos_validado_e_delete.sql` e `.agents/memory/log/2026-07-21-rascunho-validacao-e-exclusao-lancamento.md` — sinalizado para revisão do `cyber_chief` quando o gate formal da Fase 4 rodar |
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

**📋 ROADMAP "pronto e ultra profissional" — combinado com JP em 2026-07-22, ordem de
prioridade a confirmar com ele antes de começar qualquer item (ele pediu pra guardar o plano,
ainda não pra executar):**

🔴 Bloqueadores reais de produção:
1. E-mail transacional não está de fato configurado — sem conta Resend real (hoje só loga no
   servidor em vez de enviar) e sem resolver o problema de JWT Signing Keys (`enviar-convite`
   retorna 502, ver achado logo abaixo). Sem isso, convite de equipe e qualquer notificação por
   e-mail não chegam de verdade a ninguém.
1b. **"Esqueci minha senha" (recuperação de senha) — não existe hoje** (confirmado por busca no
    código em 2026-07-22, nenhum fluxo de `resetPasswordForEmail` implementado). Decisão de JP:
    fazer isso **junto com o item 1** (e-mail transacional) — não faz sentido construir/testar
    recuperação de senha antes de ter e-mail de verdade saindo, já que o teste de ponta a ponta
    depende de receber o e-mail com o link de reset. Supabase Auth já suporta nativamente, só
    falta a tela/fluxo no frontend.
2. Frontend sem hospedagem configurada (Vercel/Netlify planejado, nunca configurado) — só roda
   local (`npm run dev`) hoje. Precisa decidir e configurar `APP_URL` de produção.
3. Nenhum teste de carga real feito — não sabemos quantos usuários/fazendas simultâneas o plano
   atual do Supabase aguenta.

🟡 Segurança/qualidade de dado pendentes:
4. ~~Multi-fazenda (Fases A+B) e a tela Equipe nunca passaram por um gate formal do
   `cyber_chief`.~~ **RESOLVIDO em 2026-07-22 — gate formal concluído, veredito 🟢 Seguro, sem
   achados.** Verificação adversarial específica de IDOR/elevação de privilégio em
   `criar_fazenda`/`listar_membros_fazenda`/`remover_membro` — nenhum caminho de bypass
   encontrado. Ver `.agents/memory/log/2026-07-22-cyber_chief-review-multi-fazenda.md`.
5. `fazendas.estado` (usado pra travar o prazo regulatório certo por UF) está vazio em toda
   fazenda existente — risco documentado no gate de 2026-07-20 segue presente na prática.
6. DELETE em `lancamentos_financeiros` sem trilha de auditoria (risco aceito, documentado).
7. Sem CI/CD — `build`/`lint`/`test` roda manualmente a cada sessão, não automaticamente.

🟢 "Ultra profissional" (Fase 5 da spec, não iniciada):
8. Testes automatizados cobrindo Fase 3/4 (hoje só Fase 1/2 têm suíte pgTAP real).
9. Monitoramento de erros em produção (Sentry ou equivalente) — não existe hoje.
10. ~~Auditoria de responsividade mobile em TODAS as telas.~~ **RESOLVIDO em 2026-07-22** —
    sweep Playwright (390px) nas 23 rotas de `/app/*`. 3 bugs reais corrigidos (tabelas sem
    `overflow-x-auto`: `AnimaisListPage`/`ComparativoPage`/`LoteDetailPage`, sobras de páginas
    da Fase 2 anteriores ao padrão consolidado). Ver
    `.agents/memory/log/2026-07-22-auditoria-mobile.md`.
11. ~~Code splitting.~~ **RESOLVIDO em 2026-07-22** — `router.tsx` reescrito com `lazy` nativo
    do data router. Bundle principal caiu de 1,46MB pra ~350KB; aviso de "chunks >500kB" sumiu
    do build. Validado com Playwright contra o BUILD DE PRODUÇÃO (`vite preview`, não o dev
    server) — chunks carregando sob demanda por rota, confirmado incrementalmente. Ver
    `.agents/memory/log/2026-07-22-code-splitting.md`.

🔵 Roadmap futuro (Fase 6 da spec): PWA/offline, gráficos de evolução temporal mais ricos
(parcialmente atendido pelo gráfico de Evolução do Saldo do Painel Inteligente), alertas
proativos por e-mail/WhatsApp.

**⚠️ ABERTA (2026-07-22) — infraestrutura, não código:** Edge Function `enviar-convite`
(ADR-0002, existe desde 2026-07-16 mas só foi exercitada de ponta a ponta agora, na Fase B do
multi-fazenda — tela Equipe) retorna 502 ao tentar notificar um convite por e-mail:
`"invalid JWT: unable to parse or verify signature, token is unverifiable: error while executing
keyfunc: unrecognized JWT kid <nil> for algorithm ES256"`. O convite FUNCIONA mecanicamente
mesmo assim (conta criada via `inviteUserByEmail`, vínculo à fazenda efetivado via
`handle_new_user()`, confirmado direto no banco) — só a etapa de notificação/e-mail falha, e o
admin vê um erro no toast mesmo o convite tendo colado por trás. Parece configuração de JWT
Signing Keys do projeto Supabase (dashboard → Project Settings → API) — precisa de investigação
de infraestrutura, não é algo que uma migration/código resolve sozinho. Ver
`.agents/memory/log/2026-07-22-multi-fazenda-fase-b-equipe.md`.

**Contexto de produto registrado por JP em 2026-07-20 (itens 1-2 abaixo) — RESOLVIDO em
2026-07-21 pelo Módulo de Transações (ver seção 1/5):**

1. ~~"Doc Faltante" — estado por operação, distinto de "GTA Pendente".~~ Implementado: cada
   `transacao` mostra Nota/Contranota como badge Presente/Pendente **independente** de
   `status_gta_transacao` (que continua fora da conta de saldo, só a GTA entra em
   `Qtd. Registrada`/`Qtd. Pendente`, ver item 12). Não existe um status agregado único
   "Doc Faltante" na UI — cada documento tem seu próprio badge, que é o que o formulário de
   completar dados edita a qualquer momento.
2. ~~Falta schema para upload dos documentos de Nota/Contranota.~~ Implementado via ADR-0005
   (`arquivo_nota_path`/`arquivo_nota_mime_type`/`arquivo_contranota_path`/
   `arquivo_contranota_mime_type` em `transacoes`) + item 14 (bucket `transacoes-documentos`) +
   upload real de fato ligado na UI nesta tarefa (2026-07-21).
3. **Fluxo Compra → Animal individual (Eixo 2 → Eixo 1) — SUPERADO por ADR-0006.** A nota
   original dizia que a compra não criava `animais` automaticamente; ADR-0006
   (2026-07-20) mudou isso: `registrar_entrada_saida_lote()` agora cria os `animais` pendentes de
   individualização automaticamente para compra/nascimento/entrada_pastoreio. Mantido aqui só
   como referência histórica de que a decisão já foi revisitada.

**RESOLVIDO em 2026-07-22 — gate `cyber_chief` da Fase 4 completa, veredito 🟢 Seguro.** Cobriu
Transações, Saldo de Rebanho, GTAs e Módulo Financeiro completo (lançamentos/Pago, Configuração
de IA, `classificar-documento`, Documentos Fiscais/ZIP, Fluxo de Caixa, Declaração Anual
reestruturada, Prazos de Declaração, Painel Inteligente) — 17 migrations + 2 Edge Functions. O
achado sob investigação (possível IDOR em `registrar_saida_animais_individuais()`) foi
confirmado protegido pelo trigger `preparar_vinculo_transacao_animal` (ADR-0004). Duas
observações não bloqueantes registradas (falta de trilha de auditoria no DELETE de
`lancamentos_financeiros`; risco baixo de conteúdo de documento influenciar texto livre da
extração por IA). Ver `.agents/memory/log/2026-07-22-cyber_chief-review-fase4-completa.md`.

**Nota técnica para o Módulo de GTAs (item 17, próximo depois de Saldo de Rebanho):** o embed
PostgREST entre `transacoes` e `gtas` exige o hint de constraint (`gtas!transacoes_gta_id_fkey` ou
o equivalente do lado de `gtas`) por causa da referência circular deliberada — sem isso, o
PostgREST responde **HTTP 300 Multiple Choices** silenciosamente (sem erro de console, só a tela
trava carregando para sempre). Achado real durante o teste desta tarefa, documentado em
`.agents/memory/log/2026-07-21-fase4-modulo-transacoes.md` — qualquer embed novo envolvendo essas
duas tabelas (a tela de GTAs vai precisar do embed no sentido inverso, `transacoes` a partir de
`gtas`) precisa do mesmo cuidado.

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

### 2026-07-22 — Code splitting por rota — `developer` (via Claude)

- **O que foi feito:** `router.tsx` reescrito usando o `lazy` nativo do data router do React
  Router (`createBrowserRouter`) — cada rota-folha (e `FinanceiroLayout`) carrega seu próprio
  chunk sob demanda em vez de tudo entrar no bundle inicial. `ProtectedRoute`/`Navigate`/
  `NotFoundPage` continuam eager (críticos/pequenos). Removido também o mecanismo morto
  `appRoutes`/`PlaceholderPage` (array vazio desde o fim da Fase 4).
- **Resultado:** bundle principal caiu de 1,46MB pra ~350KB (109KB gzip) — aviso de "chunks
  >500kB" sumiu do build.
- **Validado:** `build`/`lint`/`test` (36/36); Playwright real contra o BUILD DE PRODUÇÃO
  (`vite preview`, não o dev server) — contagem de chunks JS distintos cresce incrementalmente a
  cada rota nova visitada (28→86 no total), confirmando carregamento sob demanda de verdade.
  Testado também reload direto numa rota interna, sem erro.
- **Gate do `cyber_chief`:** não se aplica (só bundling/roteamento).

### 2026-07-22 — Auditoria de responsividade mobile em todas as telas — `developer` (via Claude)

- **O que foi feito:** sweep Playwright real (390×844) nas 23 rotas de `/app/*` — checagem
  automática de overflow horizontal + screenshot completo de cada uma pra revisão visual manual
  (overflow automático sozinho não pega conteúdo cortado dentro de um container já-rolável, que
  não vaza pra fora da página mas ainda fica mal indicado visualmente).
- **3 bugs reais corrigidos:** `AnimaisListPage.tsx`, `ComparativoPage.tsx`,
  `LoteDetailPage.tsx` — tabelas sem nenhum wrapper `overflow-x-auto`, coluna "Ações" genuinamente
  inacessível no mobile (sem rolagem nenhuma). Eram sobras de páginas da Fase 2, de antes do
  padrão `overflow-x-auto` se consolidar nas telas mais recentes.
- **Falso alarme investigado e descartado:** abas de Financeiro e tabelas de
  `SaldoRebanhoPage`/`FluxoCaixaPage` pareciam cortadas nas screenshots, mas já tinham
  `overflow-x-auto` — são roláveis de verdade, só falta uma pista visual de que dá pra arrastar
  (não bloqueante).
- **Validado:** `build`/`lint`/`test` (36/36); Playwright confirmou as 3 tabelas corrigidas
  realmente roláveis (script que rola até o fim do container e confirma a coluna "Ações"
  aparecendo). Nenhuma das 23 rotas tem overflow horizontal da página.
- **Gate do `cyber_chief`:** não se aplica (só CSS/layout).

### 2026-07-22 — Security review: multi-fazenda (Fases A+B) + tela Equipe — `cyber_chief` (CONSTANTINE, via Claude)

- **O que foi feito:** gate formal cobrindo as 4 migrations do multi-fazenda/Equipe
  (`20260722150000` a `20260722180000`) + todo o frontend que as consome — item 4 do roadmap
  salvo em 2026-07-22. Verificação adversarial focada em IDOR/elevação de privilégio: admin de
  uma fazenda tentando agir sobre usuário/recurso de OUTRA fazenda (bloqueado em todos os pontos
  de entrada), guarda "nunca zero admins" reaproveitando o padrão já validado no ADR-0002,
  `listar_membros_fazenda` (SECURITY DEFINER) escopado corretamente sem vazamento cross-tenant.
- **Veredito:** 🟢 Seguro, sem achados. Ver
  `.agents/memory/log/2026-07-22-cyber_chief-review-multi-fazenda.md`.

### 2026-07-22 — Gráfico Evolução do Saldo mostra a variação na data real — `developer` (via Claude)

- **O que foi feito:** `useEvolucaoSaldoAno` reescrito — em vez de 12 checkpoints fixos (fim de
  cada mês), busca as datas distintas de `transacoes.data_operacao` no ano (mais um checkpoint
  final em hoje/31-12) e chama `obter_saldo_rebanho()` uma vez por data real. `XAxis` do gráfico
  virou escala numérica de tempo — pontos na posição real, mas rótulos continuam só no início de
  cada mês (pedido de JP). Tooltip mostra data real formatada; pontos habilitados nas linhas.
- **Validado:** `build`/`lint`/`test` (36/36); Playwright real + conferência visual — eixo só com
  nomes de mês, linha com pontos em posições reais (inclusive o salto de ~68 cabeças em
  20-22/07/2026), tooltip com data correta. Ver
  `.agents/memory/log/2026-07-22-grafico-evolucao-saldo-datas-reais.md`.
- **Gate do `cyber_chief`:** não se aplica (só frontend, mesma RPC já revisada).

### 2026-07-22 — Exportar CSV em Lançamentos Gerais — `developer` (via Claude)

- **O que foi feito:** botão "Exportar CSV" adicionado em `LancamentosListPage.tsx`, mesmo padrão
  já usado em Fluxo de Caixa — exporta TODOS os lançamentos que casam com o filtro ativo da tela
  (`buscarTodosLancamentosParaExport()`, função sob demanda sem `.range()`), não só a página
  visível de 20. Lógica de escape CSV (RFC 4180) + BOM UTF-8 extraída de dentro de
  `FluxoCaixaPage.tsx` pra `src/lib/exportarCsv.ts` (utilitário compartilhado), que foi
  refatorada pra usá-la também, sem mudar comportamento.
- **Validado:** `build`/`lint`/`test` (36/36); Playwright real contra o remoto — CSV baixado de
  verdade, número de linhas de dado bate com o total do filtro (não só a página), formatação
  (vírgula decimal, escape de campo com vírgula) correta.
- **Gate do `cyber_chief`:** não se aplica (só frontend, mesma query já revisada em
  `useLancamentosLista`, sem `.range()`).

### 2026-07-22 — Botão "Baixar ZIP" (Documentos Fiscais) + catálogo de modelos Gemini — `developer` (via Claude)

- **O que foi feito:** `DocumentosFiscaisPage.tsx` agora nasce com ano/mês do mês corrente já
  selecionados (botão de ZIP não era bug de lógica — só nascia desabilitado até o usuário
  escolher os dois filtros manualmente, lido como "não está ativo"). Catálogo de modelos Gemini
  (`src/lib/llmCatalog.ts`) atualizado a pedido de JP.
- **Achado real (mesma classe do incidente de 2026-07-21):** `gemini-2.5-flash-lite` (pedido
  como novo padrão) está MORTO — confirmado com upload real de documento via
  `classificar-documento` contra o Supabase remoto, erro idêntico ao de antes ("no longer
  available to new users"). Removido do catálogo; `gemini-3.5-flash-lite` (segunda opção
  pedida) testado com sucesso (extração real correta) e virou o novo padrão em seu lugar.
  Migrations `20260722190000` (troca original) + `20260722200000` (correção).
- **Validado:** `build`/`lint`/`test` (36/36); Playwright real contra o remoto — download de ZIP
  de verdade (~100KB, documento real dentro), upload real de documento com o novo modelo padrão
  extraindo campos corretos, tela "Modelo de IA" confirmada sem a entrada morta. Ver
  `.agents/memory/log/2026-07-22-zip-botao-e-catalogo-gemini.md`.
- **Gate do `cyber_chief`:** não se aplica (frontend + constante + UPDATE simples, mesmo padrão
  do incidente de 2026-07-21).

### 2026-07-22 — Detalhe do Lote: transferir/retirar animal + incluir animais — `developer` (via Claude)

- **O que foi feito:** hooks novos `useAtualizarLoteDoAnimal`/`useAdicionarAnimaisAoLote`
  (`src/hooks/useAnimais.ts`) — sem migration nova, RLS/trigger da Fase 2 já cobriam.
  `MudarLoteDialog` (Select único: outro lote ou "Sem lote", mesmo gesto pra retirar/transferir,
  confirmado com JP) e `AdicionarAnimaisDialog` (busca por identificação + checklist, inclusive
  animais que já têm outro lote — decisão confirmada com JP de permitir "roubar" pro lote atual).
- **Bug real corrigido:** `MudarLoteDialog` reusava `LoteSelectField` (depende de
  `FormControl`/`useFormContext` do react-hook-form), mas o dialog só usa `useState` — quebrava
  com erro de contexto nulo ao abrir. Corrigido com `Select` plano.
- **Validado:** `build`/`lint`/`test` (36/36); Playwright real contra o remoto (incluir, mover
  entre lotes, reverter, dado de teste removido); mobile 390px sem overflow. Ver
  `.agents/memory/log/2026-07-22-lote-detalhe-gestao-animais.md`.
- **Gate do `cyber_chief`:** não se aplica (sem migration nova).

### 2026-07-22 — Multi-fazenda Fase B: tela Equipe (membros, convites, promoção, remoção) — `developer` (via Claude)

- **O que foi feito:** `/app/configuracoes/equipe` deixa de ser placeholder. RPCs novas
  `listar_membros_fazenda()` e `remover_membro()` (admin-only, mesmo arcabouço de
  `promover_papel` do ADR-0002 — checagem imperativa de admin, guarda "nunca zero admins" com
  `for update`, autoremoção permitida). Frontend liga pela primeira vez todo o backend de
  convites que já existia desde 2026-07-16 sem UI nenhuma (`criar_convite`/`promover_papel`/
  `cancelar_convite` + Edge Function `enviar-convite`).
- **Bug real corrigido:** `listar_membros_fazenda` nunca funcionava (nem no caminho feliz) —
  ambiguidade entre a coluna de retorno `usuario_id` (implicitamente declarada pelo `RETURNS
  TABLE`) e `usuarios_fazendas.usuario_id` na checagem de admin. Corrigido com migration aditiva,
  qualificando com alias.
- **⚠️ Achado de infraestrutura (não é bug de código, ver seção 4):** `enviar-convite` retorna
  502 por um problema de JWT signing keys do projeto Supabase ao notificar convites por e-mail —
  o convite funciona mecanicamente mesmo assim, só a notificação falha. Precisa de investigação
  de infraestrutura, fora do escopo desta tarefa.
- **Validado:** `build`/`lint`/`test` (36/36); 5 cenários de segurança direto no banco; Playwright
  real (desktop+mobile) confirmando a tela, a criação/aceite automático de convite (achado do
  ADR-0002: e-mail novo pula direto pra "aceito", nunca fica "pendente") — dado de teste removido
  ao final. Ver `.agents/memory/log/2026-07-22-multi-fazenda-fase-b-equipe.md`.
- **Gate do `cyber_chief`:** não rodado como gate formal separado — RPCs seguem o arcabouço já
  revisado no gate do ADR-0002. Recomendado no próximo gate, junto com a investigação de JWT.
- **Multi-fazenda (Fases A+B) completo do ponto de vista de código.**

### 2026-07-22 — Multi-fazenda Fase A: seletor de fazenda + criar fazenda adicional + Configurações — `developer` (via Claude)

- **O que foi feito:** `useFazendaAtual()` reescrito pra suportar de verdade o modelo N:N já
  existente desde a Fase 1/ADR-0002 — antes sempre pegava a fazenda mais antiga do usuário, sem
  seletor. Agora combina `useFazendasDoUsuario()` (lista todos os vínculos) + um Context novo
  (`fazendaSelecionada.tsx`, persistido em localStorage por usuário) — MESMO shape de retorno,
  os 19 call sites existentes continuam funcionando sem mudança. `FazendaSwitcher` novo,
  sempre visível no topo do menu (desktop+mobile). RPC nova `criar_fazenda(p_nome)` (security
  definer, já que `fazendas` não tem policy de INSERT) — só quem já é admin em alguma fazenda
  pode criar uma adicional (decisão confirmada com JP). Tela `/app/configuracoes` deixou de ser
  placeholder: dados da fazenda (nome), meus dados (nome do usuário, e-mail read-only), lista
  "Minhas Fazendas" + botão de criar.
- **Achado de RLS corrigido:** `fazendas_update_vinculada` (Fase 1) autorizava qualquer papel,
  inclusive financeiro, a editar `nome` — inconsistente com o resto do sistema. Trigger novo
  (`restringir_alteracao_nome_fazenda`) exige admin/membro.
- **Validado:** `build`/`lint`/`test` (36/36); verificação de segurança direta no banco (4
  cenários via `request.jwt.claims`); Playwright real contra o remoto (criação de fazenda,
  auto-seleção, troca refletindo em tela dependente, mobile 390px sem overflow) — dado de teste
  removido ao final. Ver `.agents/memory/log/2026-07-22-multi-fazenda-fase-a.md`.
- **Gate do `cyber_chief`:** não rodado como gate formal separado (guardas seguem os padrões já
  exigidos, verificadas empiricamente) — recomendado incluir no próximo gate.
- **Próximos passos combinados com JP:** Fase B — tela Equipe (listar/convidar/promover/remover
  membros por fazenda; boa parte do backend de convites já existe — `criar_convite`,
  `aceitar_convite`, `promover_papel`, `cancelar_convite`, Edge Function `enviar-convite` — mas
  sem nenhum frontend ainda, e falta RPC/RLS pra listar membros e remover um deles).

### 2026-07-22 — Papel "admin do software" + tela de controle do prompt/schema de OCR — `developer` (via Claude)

- **O que foi feito:** novo nível de permissão `usuarios.papel_sistema` (`usuario` |
  `admin_software`), independente de fazenda — cria a distinção "papel na fazenda"
  (`usuarios_fazendas.papel`) vs. "papel no sistema" (`usuarios.papel_sistema`) pedida por JP.
  Retrofit de `fazendas.llm_provider/llm_model` (Modelo de IA) e tabela nova, global e singleton,
  `configuracao_extracao_lancamentos` (prompt + schema JSON de `classificar-documento`, antes
  hardcoded) — ambas agora só editáveis por admin do software, não mais pelo admin de cada
  fazenda. Tela nova `/app/configuracoes/extracao-ia`; `ConfiguracaoIaPage.tsx` e `AppShell.tsx`
  retrofitados pra bloqueio total (não só leitura) e nav condicional (primeiro item de menu do
  projeto com branching por papel).
- **Achado crítico fechado na mesma tarefa:** sem guarda, qualquer usuário poderia se
  autopromover a `admin_software` via UPDATE direto (`usuarios_update_own` não restringe
  coluna) — fechado estendendo a guarda de imutabilidade já existente desde o gate de
  2026-07-16 (`prevent_usuarios_identity_change()`).
- **Achado real durante a validação:** o backfill original mirou `jp@natux.group`, que não
  existe como usuário cadastrado neste ambiente — corrigido com migration aditiva mirando
  `jp.teste.livestock@gmail.com` (a conta de teste real).
- **Validado:** `build`/`lint`/`test` (36/36) limpos; 6 cenários de RLS/trigger verificados
  direto no banco (autopromoção bloqueada, admin de fazenda bloqueado de editar ambas as
  configs, admin do software consegue editar as duas, leitura liberada a todo `authenticated`);
  Playwright real contra o remoto confirmou as 2 telas funcionando (edição, persistência,
  rejeição de JSON inválido). Caso negativo (nav escondido/bloqueio pra não-admin-do-software)
  não pôde ser testado via Playwright por falta de conta de teste sem confirmação de e-mail
  pendente — risco residual considerado baixo (mesmo padrão condicional já provado no caso
  positivo, fail-closed por padrão). Ver
  `.agents/memory/log/2026-07-22-admin-software-e-configuracao-extracao-ia.md`.
- **Gate do `cyber_chief`:** não rodado como gate formal separado (guardas desenhadas já nos
  padrões exigidos, verificadas empiricamente) — recomendado incluir no escopo do próximo gate.

### 2026-07-22 — Security review (gate Fase 4 completa) — `cyber_chief` (CONSTANTINE, via Claude)

- **O que foi feito:** gate formal cobrindo toda a Fase 4 (17 migrations + 2 Edge Functions),
  pendência acumulada desde o início da fase. Investigação de maior risco (possível IDOR em
  `registrar_saida_animais_individuais()`) confirmou que o trigger `preparar_vinculo_transacao_
  animal` (ADR-0004) já valida integridade cross-fazenda corretamente — sem achado.
- **Veredito:** 🟢 Seguro. Duas observações não bloqueantes (sem trilha de auditoria no DELETE
  de `lancamentos_financeiros`; risco baixo de documento adversarial influenciar texto livre da
  extração por IA). Ver `.agents/memory/log/2026-07-22-cyber_chief-review-fase4-completa.md`.

### 2026-07-22 — Fase 4, Painel Inteligente (item 21) — ÚLTIMO ITEM DA FASE 4 — `developer` (via Claude)

- **O que foi feito:** `/app/rebanho` unifica alertas acionáveis (GTAs pendentes, Declaração
  pendente), cards de saldo atual por espécie, gráfico de evolução do saldo ao longo do ano,
  resumo financeiro do ano e atalhos pras últimas transações/lançamentos — quase tudo
  reaproveitando hooks/RPCs já existentes (`useResumoSaldoAno`, `useFluxoCaixa`,
  `useGtasLista`, `useDeclaracoesLista`, `usePrazoDeclaracao`). Só 2 hooks novos:
  `useEvolucaoSaldoAno` (estende `obter_saldo_rebanho()` com até 12 checkpoints mensais em
  paralelo, sem view/RPC nova) e `useResumoTransacoesAno` (soma simples de
  `transacoes.quantidade_animais`).
- **Achados reais:** uma aparente inconsistência entre SQL direto e a tela foi investigada e
  descartada como falso alarme (mesmo comportamento de `auth.uid()` NULL em sessão `psql` não
  autenticada, já documentado antes); um bug real de flash de mensagem enganosa no alerta de
  Declaração (estado ainda carregando) foi encontrado e corrigido com guarda de `isLoading`.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright
  (desktop+mobile, dado real) confirmou todas as seções, um clique de atalho navegando certo, e
  o gráfico subindo exatamente no mês em que as transações de teste aconteceram.
- **Gate do `cyber_chief`:** não se aplica (sem migration nova).
- **Log:** `.agents/memory/log/2026-07-22-painel-inteligente.md`.
- **Fase 4 completa (itens 15-21 da spec).** Próximo passo natural: gate formal do
  `cyber_chief` cobrindo toda a fase (pendência acumulada, nunca rodado).

### 2026-07-22 — Declaração Anual reestruturada: 1 declaração/ano + itens de espécie — `developer` (via Claude)

- **Contexto:** terceiro e último item da discussão de UX com JP. Correção de modelagem: a
  Declaração Anual é um documento por ano cobrindo todas as espécies, não uma linha por espécie.
- **O que foi feito:** migration `20260722100000_declaracoes_rebanho_itens_por_especie.sql`
  (tabela vazia em produção, confirmado antes — corte limpo): pai (`declaracoes_rebanho`) perde
  `especie_id`/`quantidade_declarada`, ganha `unique(fazenda_id, ano_referencia)`; tabela filha
  nova `declaracoes_rebanho_itens` (espécie×quantidade, RLS via join, DELETE liberado pra
  admin/membro). RPC `criar_declaracao_rebanho()` cria pai+itens atomicamente. `DeclaracaoForm`
  ganhou lista dinâmica via `useFieldArray`; listagem virou 1 linha/ano expansível.
- **Achado real no teste:** bug de pluralização ("animalis" em vez de "animais") — corrigido.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright
  (desktop+mobile) cobrindo criação com 2 espécies, expansão, edição (remover espécie +
  corrigir quantidade), marcar como enviada.
- **Gate do `cyber_chief`:** não rodado — migration real (tabela+RLS+RPC), destacar na próxima
  revisão formal.
- **Log:** `.agents/memory/log/2026-07-22-declaracao-anual-reestruturada.md`.
- **Os 3 itens da discussão de UX com JP estão concluídos.**

### 2026-07-22 — Fase 4, Configurações > Prazos de Declaração (item 20) — `developer` (via Claude)

- **O que foi feito:** `/app/configuracoes/prazos-declaracao` substitui o placeholder. Editor
  de `fazendas.estado` + tabela de `prazos_declaracao_estado` (Novo prazo/Editar via a RPC
  já existente `definir_prazo_declaracao_estado()`, sem migration nova). Removido o editor de
  UF duplicado que vivia embutido na tela de Declarações — agora linka pra cá.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright cadastrou um
  prazo, editou, e confirmou que a tela de Declarações passou a usar o prazo cadastrado em vez
  do fallback padrão RS.
- **Gate do `cyber_chief`:** não se aplica (RPC/tabela já revisadas em 2026-07-20).
- **Log:** `.agents/memory/log/2026-07-22-prazos-declaracao.md`.
- **Próximos passos combinados com JP:** item 21 (Painel Inteligente), último da Fase 4.

### 2026-07-22 — Tela de Lançamento Rápido — `developer` (via Claude)

- **O que foi feito:** `/app/lancamento-rapido` — 2 botões grandes reaproveitando os dialogs já
  existentes (`EntradaSaidaLoteDialog`/`CriarLancamentoDialog`, agora com prop opcional
  `trigger` pra customizar o botão-gatilho sem duplicar lógica). Card de destaque no Dashboard
  (só isso, sem item de menu — decisão explícita de JP).
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright confirmou os
  dois botões abrindo os dialogs corretos, desktop+mobile.
- **Gate do `cyber_chief`:** não se aplica (só frontend/composição).
- **Log:** `.agents/memory/log/2026-07-22-lancamento-rapido.md`.
- **Próximos passos combinados com JP:** reestruturação de schema da Declaração Anual.

### 2026-07-22 — Financeiro reorganizado em abas, fora de "rebanho" — `developer` (via Claude)

- **Contexto:** discussão de UX com JP feita 100% em planejamento antes de qualquer código
  (3 tópicos: reorganização do Financeiro, tela de Lançamento Rápido, reestruturação da
  Declaração Anual) — esta tarefa executa o primeiro.
- **O que foi feito:** `FinanceiroLayout.tsx` (abas via `@base-ui/react/tabs`, cada aba um
  `<Link>` real) agrupa Visão Geral (Fluxo de Caixa) / Transações de Animais / Lançamentos
  Gerais / Documentos Fiscais sob `/app/financeiro` (rotas aninhadas, `router.tsx`). Menu ganhou
  seção de topo própria "Financeiro" (uma entrada), saindo de "Rebanho & Compliance". Saldo de
  Rebanho não entrou no agrupamento (fica em Rebanho & Compliance). 6 links internos corrigidos.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright
  (desktop+mobile) navegando pelas 4 abas, conferindo URLs e dados reais em cada uma, e o link
  de origem de uma transação de animal no Fluxo de Caixa.
- **Gate do `cyber_chief`:** não se aplica (só frontend/rotas).
- **Log:** `.agents/memory/log/2026-07-22-financeiro-reorganizado-em-abas.md`.
- **Próximos passos combinados com JP:** tela de Lançamento Rápido (2 botões, card no
  Dashboard); reestruturação de schema da Declaração Anual (1 declaração/ano + itens de
  espécie/quantidade).

### 2026-07-21 — Fase 4, Módulo Declaração Anual de Rebanho (item 19) — `developer` (via Claude)

- **O que foi feito:** `/app/rebanho/declaracoes` — histórico por espécie/ano, "Nova
  Declaração", "Marcar como enviada" (data de envio + upload PDF/imagem opcional), edição
  restrita a quantidade/data de referência (espécie/ano imutáveis). Schema/bucket já existiam
  desde itens anteriores da Fase 3/14 — nenhuma migration nova nesta tarefa.
- **Achado real:** `fazendas.estado` (necessário pro card de prazo regulatório) nasce NULL pra
  toda fazenda existente — adicionado seletor de UF inline na própria tela.
- **Achado e correção durante o teste:** bug de `Select` não-controlado→controlado no seletor
  de UF (mesma classe de bug já vista antes) — corrigido com sentinela, mesmo padrão já usado
  nos filtros do projeto.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright
  (desktop+mobile, Supabase remoto) cobrindo configurar estado, calcular prazo, criar
  declaração, marcar como enviada com upload real, abrir documento, editar com campos de
  identidade travados.
- **Gate do `cyber_chief`:** NÃO rodado (sem migration nova, mesma pendência acumulada da Fase
  4).
- **Log:** `.agents/memory/log/2026-07-21-declaracao-anual-rebanho.md`.
- **Próximos passos combinados com JP:** item 20 (Configurações/Prazos de Declaração) e item 21
  (Painel Inteligente).

### 2026-07-21 — Correção real: API do Gemini migrou para Interactions API — `developer` (via Claude)

- **O que foi feito:** JP configurou a `GEMINI_API_KEY` de produção (`supabase secrets set`,
  via arquivo temporário isolado pra não expor outras secrets do `.env`); primeira chamada real
  ao Gemini falhou com 404 — a API `generateContent` original foi aposentada pelo Google.
  Confirmado por chamadas HTTP diretas (não suposição, já que isso é posterior ao treino):
  nova API é `v1alpha/interactions`, auth por header `x-goog-api-key`, partes multimodais
  `image`/`document` (PDF), resposta em `steps[]`/`model_output`. `classificar-documento`
  reescrita (`logica.ts`/`index.ts`/`index.test.ts`) e redeployada. Catálogo de modelos
  corrigido (3 dos 5 modelos originalmente pedidos por JP estavam mortos pra chaves novas) +
  migration de default/backfill.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; **primeira validação real e completa do
  ciclo de IA** — Playwright gerou uma nota fiscal sintética real e os 6 campos extraídos
  bateram exatamente com o conteúdo.
- **Gate do `cyber_chief`:** não necessário (mudança de integração externa, sem RLS nova além
  do já protegido pelo trigger existente).
- **Log:** `.agents/memory/log/2026-07-21-correcao-api-gemini-interactions.md`.
- **Próximos passos combinados com JP:** item 19 da spec (Declaração Anual de Rebanho).

### 2026-07-21 — Rascunho de lançamento com validação pendente + exclusão de lançamento — `developer` (via Claude)

- **O que foi feito:** o upload de documento na captura de "Novo Lançamento" agora persiste de
  verdade — cria um rascunho de `lancamentos_financeiros` imediatamente, salva o documento no
  bucket, chama a IA, e só marca `validado_pelo_usuario=true` quando o usuário confirma (ou
  edita e salva) o formulário. Se abandonar antes disso, o rascunho fica no banco com os dados
  da IA, marcado "Não validado" (badge + filtro na lista). Nova policy de DELETE em
  `lancamentos_financeiros` (reversão deliberada da decisão "sem DELETE" original — ver seção
  2) + botão "Excluir lançamento" com dupla confirmação.
- **Migration:** `20260721120000_lancamentos_validado_e_delete.sql`.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright cobrindo os 5
  caminhos (upload com falha real de classificação → rascunho+documento preservados; abandono
  sem confirmar → badge certo na lista; confirmação → badge some; exclusão real; abandono ANTES
  de escolher arquivo → nenhum rascunho criado).
- **Gate do `cyber_chief`:** NÃO rodado — mas esta tarefa reverte uma decisão de segurança
  anterior (permitir DELETE), merece destaque na próxima revisão formal.
- **Log:** `.agents/memory/log/2026-07-21-rascunho-validacao-e-exclusao-lancamento.md`.
- **Próximos passos combinados com JP:** item 19 da spec (Declaração Anual de Rebanho).

### 2026-07-21 — Captura de documento como entrada de "Novo Lançamento" — modal reutilizável — `developer` (via Claude)

- **O que foi feito:** botão "Novo Lançamento" agora abre primeiro `CapturarDocumentoDialog`
  (novo, `src/components/documentos/`) — desktop: um seletor de arquivo (imagem+PDF); mobile:
  Câmera/Galeria/Arquivos separados — e só depois o formulário, pré-preenchido pela extração da
  IA. "Preencher manualmente" sempre disponível (confirmado com JP, upload não é obrigatório).
  Componente deliberadamente genérico/reutilizável — não conhece "lançamento financeiro", só
  devolve um `File` ou sinaliza "pular", pra qualquer entrada de documento futura no app plugar
  sua própria lógica sobre a mesma UI.
- **Refatoração:** `CriarLancamentoDialog.tsx` virou máquina de 2 etapas
  (`captura`/`formulario`); a chamada à Edge Function `classificar-documento` (antes dentro de
  `LancamentoForm`) migrou pra cá. Constantes de tipo/tamanho de arquivo consolidadas em
  `src/lib/arquivoDocumento.ts` (antes duplicadas em `LancamentoForm.tsx` e
  `LancamentoDetailPage.tsx`).
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste real via Playwright (desktop e
  mobile) confirmou a UI certa em cada breakpoint, o "pular" abrindo formulário vazio, e um
  upload real disparando a Edge Function de verdade (erro esperado de `GEMINI_API_KEY` ausente,
  sem travar o fluxo — mesma pendência de infraestrutura já conhecida).
- **Gate do `cyber_chief`:** NÃO rodado (sem migration nova, só reorganização de frontend).
- **Log:** `.agents/memory/log/2026-07-21-captura-documento-novo-lancamento.md`.
- **Próximos passos combinados com JP:** item 19 da spec (Declaração Anual de Rebanho).

### 2026-07-21 — Fase 4, Módulo Financeiro: Fluxo de Caixa consolidado + exportação CSV (item 18, passo 3/3, final) — `developer` (via Claude)

- **O que foi feito:** view `fluxo_caixa_consolidado` (migration
  `20260721110000_fluxo_caixa_consolidado.sql`, `security_invoker=true`) — `UNION ALL` de
  `transacoes` (compra/venda com `valor_nota`) e `lancamentos_financeiros` (excluindo os
  vinculados a `transacao_animal_id`, pra não contar o mesmo dinheiro duas vezes). Tela
  `/app/rebanho/fluxo-caixa` ("Fluxo de Caixa" no menu) — cards de totais, filtros ano/mês/tipo/
  categoria, link de volta pra origem. Exportação CSV client-side (sem Edge Function).
- **Escopo decidido:** só CSV, não `.xlsx` binário (exigiria dependência nova não usada no
  projeto; CSV já abre bem no Excel com BOM UTF-8).
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste funcional real (Playwright,
  Supabase remoto) confirmou a UNION funcionando com dado real pré-existente (venda de animal
  real de R$20.000) e com lançamentos de teste criados na hora, filtros ano/mês/tipo, CSV
  baixado e lido de verdade, link de origem navegando pro lançamento certo. Teste mobile sem
  overflow. Dados de teste limpos via SQL direto ao final.
- **Gate do `cyber_chief`:** NÃO rodado (mesma pendência acumulada da Fase 4 — ver seção 4).
- **Log:** `.agents/memory/log/2026-07-21-fluxo-caixa-consolidado.md`.
- **Módulo Financeiro (item 18) agora completo:** lançamentos + Pago/data pagamento +
  classificação por IA + documentos fiscais/ZIP + fluxo de caixa/CSV.
- **Próximos passos combinados com JP:** Declaração Anual (item 19), Configurações/Prazos de
  Declaração (item 20), Painel Inteligente (item 21).

### 2026-07-21 — Fase 4, Módulo Financeiro: listagem/CRUD de lançamentos (item 18, passo 1/3) — `developer` (via Claude)

- **O que foi feito:** `/app/rebanho/financeiro` (listagem, filtros tipo/categoria/pago/
  período, resumo receitas/despesas, paginação, "Novo Lançamento") +
  `/app/rebanho/financeiro/:id` (detalhe, edição inline, transação de animal vinculada). Papel
  `financeiro` só lê (RLS já bloqueava escrita desde a Fase 3).
- **Campo novo pedido por JP:** "Pago" (Sim/Não) + data do pagamento obrigatória quando Sim —
  migration `20260721070000_lancamentos_financeiros_pago.sql`, mesmo padrão de
  `gtas.status_liberacao`/`data_liberacao`.
- **Validação:** `build`/`lint`/`test` (36/36) limpos, build passou de primeira; teste
  funcional real (Playwright, desktop+mobile, Supabase remoto) com reload de página
  confirmando persistência do campo `pago`.
- **Gate do `cyber_chief`:** NÃO rodado (só frontend, sem migration de RLS nova).
- **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-financeiro-lancamentos.md`.
- **Próximos passos combinados com JP:** classificação assistida por IA de lançamentos
  (Edge Function + Anthropic API, Claude Haiku 4.5 — decisão de planejamento, seção 2/12 da
  spec) e visão consolidada de fluxo de caixa + exportação CSV/Excel.

### 2026-07-21 — Correções pós-entrega do Módulo de GTAs: cardinalidade N, quantidade_animais, liberação por upload, bucket de declarações aceita imagem — `db_sage`+`developer` (via Claude)

- **O que foi feito:** três correções reais pedidas por JP logo após a primeira entrega do
  Módulo de GTAs (ver entrada anterior): (1) `transacoes.gta_id` (1:1 errado) removido —
  `gtas.transacao_id` (muitos-para-um) já modelava certo "uma transação pode ter N GTAs, uma por
  caminhão"; `TransacaoDetailPage` passa a listar todas; (2) `gtas.quantidade_animais` (campo
  novo, fora da spec original); (3) upload de documento de GTA pendente oferece liberação
  imediata (data + confirmação inline).
- **3 migrations novas, todas aplicadas ao remoto:** `20260721040000_gtas_quantidade_animais.sql`,
  `20260721050000_corrige_cardinalidade_transacao_gta.sql`,
  `20260721060000_declaracoes_rebanho_aceita_imagem.sql` (esta última: bucket de Declarações
  também aceita imagem, não só PDF).
- **Achado real corrigido:** `GtaForm` precisou de `key={gta.updated_at}` para remontar depois
  da liberação via upload — sem isso, o form de edição ficava com dado velho.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste funcional real (Playwright,
  desktop, Supabase remoto) confirmou organicamente a cardinalidade N (uma GTA real de sessão
  anterior + uma nova de teste, ambas na mesma transação, ambas aparecendo na lista).
- **Gate do `cyber_chief`:** NÃO rodado (mesma pendência acumulada dos módulos de Transações/
  Saldo/GTAs desta fase).
- **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-gtas.md` (seção de correção) e
  `.agents/memory/log/2026-07-21-storage-buckets-item14.md` (seção de correção, bucket).

### 2026-07-21 — Fase 4, Módulo de GTAs (item 17) — `developer` (via Claude)

- **O que foi feito:** `/app/rebanho/gtas` (listagem, filtros status/espécie/período, paginação,
  "Nova GTA") + `/app/rebanho/gtas/:id` (detalhe, "Ver GTA" só no detalhe conforme spec, upload
  do documento em `gtas-documentos`, edição inline, vínculo opcional a uma transação). `GtaForm`
  compartilhado entre criação e edição.
- **Reaproveitou o achado do Módulo de Transações:** embed `gtas -> transacoes` também precisa do
  hint de constraint (`transacoes!gtas_transacao_id_fkey`, confirmado via `pg_constraint` antes
  de escrever) pela mesma FK circular.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste funcional de ponta a ponta real
  (cadastro + upload + "Ver GTA") desktop+mobile contra o remoto; dado de teste removido ao
  final (SQL direto — `gtas` não tem policy de DELETE pela app, decisão deliberada da Fase 3).
- **Gate do `cyber_chief`:** NÃO rodado (só frontend, sem migration nova).
- **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-gtas.md`.
- **Próximo passo combinado com JP:** Módulo Financeiro (item 18) — **escopo ampliado em
  2026-07-21** (ver seção 2, decisão de planejamento) para incluir classificação assistida por
  IA de lançamentos financeiros: usuário envia imagem/PDF de um documento, sistema pré-preenche
  os campos (valor/data/categoria/contraparte/tipo) via Supabase Edge Function chamando a API
  da Anthropic (Claude Haiku 4.5 — custo estimado <R$10/mês mesmo em uso intenso), usuário
  confirma/edita antes de qualquer gravação em `lancamentos_financeiros`. Sem mudança de schema
  — dado extraído fica só no estado do formulário até confirmação. Ainda não implementado.

### 2026-07-21 — Fase 4, Módulo de Saldo de Rebanho (item 16) — `developer` (via Claude)

- **O que foi feito:** `/app/rebanho/saldo` — seletor de espécie + data de corte + tabela
  agrupamento etário × sexo (Qtd. Registrada/Pendente) + total + "Imprimir Saldo". Zero migration
  nova, 100% reaproveitando `obter_saldo_rebanho()` do item 12.
- **Achado real corrigido:** race condition na seleção padrão de espécie (`useEspecies()`
  resolvia antes de `obter_saldo_rebanho()`, travando em "Abelhas" em vez de "Bovinos") —
  corrigido esperando as duas queries antes de decidir o padrão.
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste visual real (Playwright,
  desktop+mobile, Supabase remoto) reproduziu o bug antes da correção e confirmou o padrão certo
  depois.
- **Gate do `cyber_chief`:** NÃO rodado (só frontend, sem migration nova).
- **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-saldo-rebanho.md`.
- **Próximo passo combinado com JP:** Módulo de GTAs (item 17).

### 2026-07-21 — Fase 4, Módulo de Transações (item 15) — `developer` (via Claude)

- **O que foi feito:** primeiro módulo da Fase 4 (Eixo 2), escolhido por JP na ordem da spec.
  Lista paginada/filtrada (`TransacoesListPage.tsx`) com resumo de saldo início/fim de ano por
  espécie; detalhe individual (`TransacaoDetailPage.tsx`) com doc-tracking progressivo real
  (upload de Nota/Contranota no bucket `transacoes-documentos`, "Ver documento" via signed URL,
  formulário para completar número/valor da nota, peso total, status da GTA e observações a
  qualquer momento). Ver detalhe completo em seção 1 e no log.
- **Achados reais corrigidos:** embed PostgREST `transacoes -> gtas` retornava HTTP 300 Multiple
  Choices por causa da FK circular (corrigido com hint de constraint
  `gtas!transacoes_gta_id_fkey`); reincidência do bug de `useForm({ values })` deixando o Select
  de Status da GTA em branco (corrigido com `useEffect` + `form.reset()`).
- **Validação:** `build`/`lint`/`test` (36/36) limpos; teste visual real (Playwright,
  desktop+mobile, Supabase remoto); teste funcional de ponta a ponta com reload de página
  confirmando persistência real (não só estado do form) + upload real de documento confirmado
  abrindo via signed URL. Dados de teste resetados ao final.
- **Gate do `cyber_chief`:** NÃO rodado nesta tarefa (só frontend, sem migration nova) —
  pendência explícita, ver seção 4.
- **Log:** `.agents/memory/log/2026-07-21-fase4-modulo-transacoes.md`.
- **Próximo passo combinado com JP:** Módulo de Saldo de Rebanho (item 16), depois GTAs (17).

### 2026-07-21 — Item 14 (Storage): 3 buckets, RLS por fazenda — `db_sage`+`cyber_chief` (via Claude)

- **O que foi feito:** terceiro dos 4 próximos passos combinados com JP. Migration
  `20260721030000_fase3_storage_buckets.sql` — buckets `declaracoes-rebanho` (só PDF,
  `financeiro` lê), `gtas-documentos` (PDF/imagem, `financeiro` zero acesso, mesma fronteira de
  `gtas`) e **`transacoes-documentos`** (novo, ADR-0005 D3, `financeiro` lê, mesma fronteira de
  `transacoes`) — para Nota/Contranota. Sem policy de DELETE em nenhum (spec: declarações nunca
  apagáveis; GTA/transações por analogia às tabelas). RLS via
  `(storage.foldername(name))[1]::uuid`, mesmo padrão de multi-tenancy do resto do schema.
- **Validação atípica:** CLI local (2.26.9) não inicializa o serviço `storage-api` — `supabase
  db reset` falha antes mesmo de chegar na migration (schema `storage` não existe localmente,
  pendência conhecida desde a Fase 1). Migration aplicada e validada **direto no remoto**
  (`supabase db push` + chamadas HTTP reais à Storage API com usuários reais via GoTrue):
  upload/download como admin nos 3 buckets; `financeiro` bloqueado em GTA, liberado (só leitura)
  em Declarações/Transações.
- **Gate do `cyber_chief`:** concluído (🟢).
- **Pendência não bloqueante:** 3 arquivos de teste (fake) ficaram nos buckets do remoto —
  Supabase bloqueia `DELETE` direto via SQL em `storage.objects`, limpeza via API exigiria
  `service_role` (não disponível no `.env`). Sem risco real.
- **Log:** `.agents/memory/log/2026-07-21-storage-buckets-item14.md`.
- **Próximo passo combinado com JP:** 4) Fase 4 (telas do Eixo 2) — último da lista.

### 2026-07-21 — Tela de seleção de animal individual para Venda/Óbito/Consumo — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **O que foi feito:** segundo dos 4 próximos passos combinados com JP. RPC nova
  `registrar_saida_animais_individuais()` vincula transacao a animais já existentes via
  `transacoes_animais` (triggers já existentes do ADR-0004/0005 cuidam de status/validação
  cross-fazenda) e calcula o agrupamento etário REAL de cada animal (mais preciso que "Não
  classificado"). Frontend: `EntradaSaidaLoteDialog` virou shell alternando entre
  `EntradaAgregadaForm` (Compra/Nascimento) e `SaidaAnimaisIndividuaisForm` (Venda/Óbito/
  Consumo, novo — checklist de animais já individualizados).
- **Validação:** build/lint/test (36/36) limpos; schema validado com venda de 2 animais
  (agrupamentos calculados corretamente por idade real); teste real de ponta a ponta
  (Playwright, desktop+mobile) vendendo um animal descartável — status "Vendido", categoria
  calculada, dados de teste limpos depois.
- **Gate do `cyber_chief`:** concluído (🟢).
- **Log:** `.agents/memory/log/2026-07-21-selecao-animais-saida-individual.md`.
- **Próximos passos combinados com JP:** 3) item 14 (Storage); 4) Fase 4 (telas do Eixo 2).

### 2026-07-21 — Fluxo de completar animal pendente de individualização — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **O que foi feito:** primeiro dos 4 próximos passos combinados com JP. Trigger novo
  (`20260721010000_inicializa_peso_atual_ao_completar_pendencia.sql`) inicializa
  `peso_atual_kg = peso_inicial_kg` quando um animal pendente tem `peso_inicial_kg` preenchido
  pela primeira vez (mesmo baseline que animal criado normal já tinha) — validado que o guard
  de proteção dos campos calculados (Fase 2) não dispara aqui (só reage a UPDATE que lista
  essas colunas explicitamente) e continua bloqueando falsificação direta. `EditarAnimalDialog`
  ganhou banner de pendência + campos de Data de Nascimento/Peso Inicial. Achado extra: mesmo
  bug de `Select` (Base UI) corrigido em `LoteSelectField` (compartilhado) e no Status deste
  dialog.
- **Validação:** build/lint/test (36/36) limpos; teste real de ponta a ponta (Playwright,
  desktop+mobile, Supabase remoto) completando um animal pendente de verdade — badge some,
  categoria calculada, peso atual inicializado.
- **Gate do `cyber_chief`:** concluído (🟢).
- **Log:** `.agents/memory/log/2026-07-21-completar-animal-pendente.md`.
- **Próximos passos combinados com JP (nesta ordem):** 2) tela de seleção de animal individual
  para Venda/Óbito/Consumo; 3) item 14 (Storage); 4) Fase 4 (telas do Eixo 2).

### 2026-07-20 — Changelog de implementação em especificacao-sistema.md (seção 12 nova) — via Claude

- **O que foi feito:** a pedido de JP ("importante fazer uma v2 da spec?"), em vez de reescrever
  o documento original, foi adicionada uma **seção 12 (Changelog de Implementação)** ao final
  de `especificacao-sistema.md`, cobrindo as divergências/adições reais desde a v2.0: correção
  da faixa etária de Ovino, ADR-0005 (tipo_operacao expandido + docs independentes), ADR-0006
  (animais pendentes de individualização — a mudança mais substancial), "Encerrar Lote"
  (exclusão física + desvinculação de animais), e a diretriz de mobile-first contínuo. Um aviso
  no topo do documento (logo após o título) direciona o leitor à seção 12.
- **Por que changelog em vez de reescrita:** preserva o "porquê" da decisão original vs. a
  evolução real, sem perder histórico — cada entrada referencia o ADR/log completo em vez de
  duplicar conteúdo.
- **Pendência:** nenhuma — documento apenas, sem mudança de schema/código. Seções 1-11
  permanecem intactas.

### 2026-07-20 — Desvincular animais ao arquivar lote + coluna "Lote" (Sim/Não) na lista de Animais — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **O que foi feito:** trigger novo (`20260721000000_lotes_desvincula_animais_ao_arquivar.sql`)
  faz arquivar um lote (ativo true→false) desvincular os animais associados
  (`lote_id = null`), mesmo efeito que excluir já tinha via `on delete set null`. Reativar não
  re-vincula (assimétrico, deliberado). Gate do `cyber_chief` concluído (🟢). Coluna nova "Lote"
  (Sim/Não) em `AnimaisListPage.tsx`, derivada de `lote_id`.
- **Validação:** teste real (lote com 2 animais, arquivado → ambos ficam sem lote); visual
  desktop+mobile confirmando a coluna.
- **Log:** `.agents/memory/log/2026-07-20-desvincula-arquivar-e-coluna-lote.md`.

### 2026-07-20 — "Encerrar Lote" (Arquivar/Excluir com dupla confirmação) — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **O que foi feito:** a pedido de JP, campo de edição de lotes ganhou "Encerrar Lote" com
  escolha entre Arquivar (reversível, existente) e Excluir (novo, permanente, com segunda
  confirmação dedicada mostrando quantos animais ficarão sem lote).
- **Schema:** nova policy `lotes_delete_vinculada` (reabre decisão da Fase 2 que não tinha
  DELETE em `lotes`) — segura porque `animais.lote_id` já usa `on delete set null`. Gate do
  `cyber_chief` concluído (🟢), validado com usuário real: lote com animal excluído → animal
  sobrevive sem lote; `financeiro` bloqueado.
- **Frontend:** `EncerrarLoteDialog.tsx` novo (fluxo de 2 etapas), `useExcluirLote()` novo,
  `LotesListPage`/`LoteDetailPage` atualizados (detalhe navega de volta pra lista ao excluir).
  Validado visualmente em desktop+mobile.
- **Logs:** `.agents/memory/log/2026-07-20-developer-encerrar-lote.md` e
  `.agents/memory/log/2026-07-20-cyber_chief-review-lotes-delete.md`.

### 2026-07-20 — Frontend ADR-0006: badge "Pendente" na lista de Animais — `developer` (RYAN, via Claude)

- **O que foi feito:** tipos atualizados (`data_nascimento`/`peso_inicial_kg`/`categoria`/
  `idade_meses` agora nullable) + função `animalPendenteIndividualizacao()`; badge "Pendente"
  (âmbar) na lista de Animais ao lado do status; `AnimalDetailPage`/`LoteDetailPage` tratam
  `categoria`/`idade` nulos sem quebrar; Dashboard exclui pendentes do gráfico de categoria (evita
  barra "null") com nota de contagem.
- **Validação:** `build`/`lint`/`test` limpos; teste visual real (Playwright, desktop+mobile)
  contra o Supabase remoto — compra real de 5 Bovinos criada via RPC, os 5 animais
  (`COMPRA-2026-07-20-001`..`005`) aparecem imediatamente na lista com badge "Pendente",
  categoria/peso em "—", em ambas as resoluções.
- **Log:** `.agents/memory/log/2026-07-20-developer-frontend-adr0006.md`.
- **Pendências:** fluxo de completar um animal pendente (`EditarAnimalDialog` estendido para
  coletar `data_nascimento`/`peso_inicial_kg`) ainda não implementado; tela de seleção de
  animal individual para Venda/Óbito/Consumo (ADR-0004) ainda não construída.

### 2026-07-20 — ADR-0006: animais pendentes de individualização a partir de Entradas de Lote — `architect`+`db_sage`+`cyber_chief` (via Claude)

- **Motivação:** JP revisou a premissa do ADR-0005 (nascimento/compra sem vínculo individual) —
  animais que entram por lote (Compra/Nascimento/Entrada de Pastoreio) devem aparecer
  IMEDIATAMENTE na lista de Animais, com identificação automática, pendentes de
  individualização até completar dados reais.
- **Decisões confirmadas por JP:** só as 3 entradas criam animais pendentes (saídas continuam
  agindo sobre animais já existentes, mecanismo do ADR-0004 ainda sem tela); `data_nascimento`/
  `peso_inicial_kg` ficam `NULL` até "Individualizar Animal" completar (não um valor estimado);
  identificação = `{TIPO}-{AAAA-MM-DD}-{NNN}`, sequencial por fazenda+tipo+data.
- **Schema** (`20260720230000_adr0006_animais_pendentes.sql`): `animais.data_nascimento`/
  `peso_inicial_kg` viram nullable; `calcular_categoria_animal()` corrigida para retornar `NULL`
  explicitamente em vez de fabricar `'Boi'`/`'Vaca'` para idade desconhecida (achado próprio da
  tarefa); `registrar_entrada_saida_lote()` (ADR-0005) estendida para criar N linhas em
  `animais` nas 3 entradas.
- **Validado localmente:** sequência contínua entre 2 compras no mesmo dia (001-005, depois
  006-007, sem colisão); venda confirmada sem criar linha nova; categoria/idade retornam `NULL`
  corretamente (não fabricadas).
- **Gate do `cyber_chief` CONCLUÍDO (🟢) no mesmo dia** — achado de correção (não autorização)
  na categoria fabricada, corrigido antes mesmo do gate (antecipado pela própria `db_sage`).
- **Logs:** `.agents/memory/log/2026-07-20-db_sage...` (ADR-0006 não teve log próprio de
  db_sage separado — ver commit da migration), `.agents/memory/log/2026-07-20-cyber_chief-review-adr0006.md`.
- **Pendências:** indicador visual de "pendente" na lista de Animais (categoria/peso em branco
  não é sinal suficiente) — próxima tarefa; fluxo de completar um animal pendente via
  `EditarAnimalDialog` (hoje só edita identificação/lote/status, não data_nascimento/peso) ainda
  não implementado.

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
