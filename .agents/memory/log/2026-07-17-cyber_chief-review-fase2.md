# Log — Security Review da Fase 2 (Eixo 1: lotes/animais/pesagens) — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-17
- **Agente responsável:** cyber_chief (CONSTANTINE) — gate de segurança da Fase 2, mesmo papel
  já exercido na Fase 1 e no ADR-0002. Piso mínimo de rigor daqueles dois reviews, não teto.
- **Tipo de tarefa:** Security review formal (RLS/IDOR + auth) de migration ainda não aplicada
  a nenhum banco, com correção direta no arquivo SQL (não migration de correção separada).
- **Escopo:** exclusivamente
  `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` — tabelas
  `lotes`/`animais`/`pesagens`, views `animais_com_detalhes`/`lotes_com_estatisticas`,
  funções `calcular_categoria_animal()`/`registrar_pesagem()`/`atualizar_animal_apos_pesagem()`
  e as triggers de integridade. Nenhum item de Eixo 2 tocado.

## O que foi lido antes da análise

1. `.agents/memory/log/2026-07-17-db_sage-schema-fase2.md` — log da Sofia (db_sage), com 5
   pontos de atenção explícitos para este gate (4 deles listados na tarefa + o "achado próprio"
   de `security_invoker`).
2. `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` — revisado linha a
   linha, versão recebida antes de qualquer correção.
3. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` e
   `2026-07-16-cyber_chief-review-adr0002.md` — meus dois reviews anteriores (padrão de rigor,
   guardas de imutabilidade, mensagens de erro genéricas, checagem NULL-safe).
4. `especificacao-sistema.md`, seções 3.1, 4.1, 5.1 e — decisivamente — **5.4** (papéis de
   usuário): "Usuário Financeiro/Contábil... Acesso restrito a: Painel Financeiro, Declarações
   de Rebanho, Saldo de Animais... **Sem acesso a: manejo individual de animais/lotes/
   pesagens**, GTAs, edição de transações."
5. `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — confirmar que
   `usuarios_fazendas_papel_check` já aceita `'financeiro'` e que `criar_convite()` já permite
   `p_papel = 'financeiro'`, **ambos já aplicados no banco remoto** (per `PROJECT_CONTEXT.md`
   seção 1: as duas migrations da Fase 1 estão `local=remote`). Confirmado: sim, nas duas.
6. `supabase/config.toml` — `[api] schemas = ["public", "graphql_public"]` (pg_catalog NÃO
   exposto via PostgREST/RPC) e `[db.pooler] pool_mode = "transaction"` — usados para avaliar o
   ponto de atenção nº2 (GUC local à transação) contra o vetor de ataque real (client via REST/
   RPC), não contra um vetor teórico de SQL bruto que a arquitetura Supabase não expõe ao
   usuário final.

---

## [SECURITY ANALYSIS]

**Componente:** `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` (tabelas
`lotes`/`animais`/`pesagens`; views `animais_com_detalhes`/`lotes_com_estatisticas`; funções
`calcular_categoria_animal`/`registrar_pesagem`/`atualizar_animal_apos_pesagem`; 4 triggers de
integridade; RLS das 3 tabelas)

**Status (após correções aplicadas nesta revisão):** 🟢 Seguro — liberada para
`supabase db push` do ponto de vista deste gate (decisão de quando aplicar continua
humana/orchestrator).

**Status antes das correções (como recebido):** 🟡 Seguro com Observações — nenhum vazamento
cross-tenant (a modelagem da Sofia já fechou essa classe de risco corretamente, ver "Pontos
revisados sem achado" abaixo), mas um achado de severidade Alta que eu não deixaria passar para
aplicação sem correção (achado nº1, abaixo) porque ele já é **exercitável hoje**, não latente
atrás de uma constraint que ainda não existe (diferente do achado equivalente da Fase 1).

---

### [VULNERABILIDADES IDENTIFICADAS]

**1. RLS de `lotes`/`animais`/`pesagens` e autorização de `registrar_pesagem()` — violação de
menor privilégio: papel `financeiro` tinha acesso total de manejo (CWE-863, Broken Access
Control por ausência de checagem de papel)**

- **Impacto:** Alto | **Probabilidade:** Média — não é hipotética nem depende de uma
  configuração futura ser ligada (diferente do achado crítico do ADR-0002): o papel
  `financeiro` já é um valor válido em `usuarios_fazendas_papel_check` e `criar_convite()` já
  aceita `p_papel = 'financeiro'`, **ambos já aplicados no banco remoto** (Fase 1 concluída).
  Qualquer admin de qualquer fazenda pode convidar um usuário `financeiro` agora, com a Edge
  Function `enviar-convite` já deployada. Só depende de um admin efetivamente fazer esse convite
  — não de uma mudança de schema/config adicional.
- **Classificação:** STRIDE = Elevation of Privilege (dentro do próprio tenant — não cruza
  fazenda, mas cruza a fronteira de papel que o produto define). OWASP A01 Broken Access
  Control, CWE-863 (Incorrect Authorization — a policy verificava "está vinculado à fazenda?",
  não "está vinculado E tem o papel certo?").
- **Achado:** as policies `lotes_select/insert/update_vinculada`, `animais_select/insert/
  update_vinculada` e `pesagens_select_vinculada`, e a checagem de autorização dentro de
  `registrar_pesagem()`, escopavam exclusivamente por `fazenda_id in (usuarios_fazendas do
  chamador)` — sem checar `papel`. `especificacao-sistema.md` seção 5.4 é textualmente
  inequívoca: o papel Financeiro/Contábil tem "Sem acesso a: manejo individual de
  animais/lotes/pesagens" — nem escrita, nem leitura (o "Acesso restrito a" que a mesma frase
  concede é só Painel Financeiro/Declarações/Saldo, todos Eixo 2). Sem a correção, um usuário
  `financeiro` de uma fazenda conseguiria ler, criar e editar lotes/animais e registrar
  pesagens da própria fazenda — exatamente o oposto do perfil "consulta/leitura, não operação"
  que é a justificativa de existir desse papel (spec 5.4: "sem... acesso a informações
  operacionais irrelevantes para o trabalho deles").
- **DREAD:** Damage médio-alto (escrita/leitura de dados operacionais de manejo por um perfil
  desenhado para não ter nenhuma) / Reproducibility alta, uma vez que exista um vínculo
  `financeiro` / Exploitability alta (nenhuma ferramenta especial, um `PATCH`/`POST` comum via
  PostgREST) / Affected users: qualquer fazenda que já tenha ou venha a ter um usuário
  `financeiro` vinculado / Discoverability média (exige ler as policies, mas nenhuma ofuscação
  as protegia).
- **Por que não classifiquei como 🔴 antes da correção:** o impacto fica contido dentro do
  próprio tenant (um `financeiro` não acessa dados de OUTRA fazenda — não é o mesmo tipo de
  falha binária "qualquer sessão sem e-mail vira admin de qualquer fazenda" do achado crítico
  do ADR-0002) e depende de uma ação administrativa real (convidar alguém como `financeiro`)
  ainda não confirmada como já ocorrida em produção. Mas é uma violação de controle de acesso
  real, hoje, não uma bomba-relógio atrás de uma constraint — por isso 🟡 e não simplesmente
  "observação para depois".
- **Mitigação aplicada:** todas as 7 policies de RLS das 3 tabelas (`lotes` ×3, `animais` ×3,
  `pesagens` ×1) e a checagem de autorização de `registrar_pesagem()` passam a exigir
  `papel <> 'financeiro'` no subselect de `usuarios_fazendas`, tanto em `USING` quanto em
  `WITH CHECK`. Cobre SELECT também (não só INSERT/UPDATE) — a spec nega qualquer acesso, não
  só escrita.

**2. `inicializar_peso_atual_animal()` — campos calculados falsificáveis via INSERT (guarda de
imutabilidade cobria só UPDATE)**

- **Impacto:** Médio (falsificação de dado dentro do próprio tenant, não cross-fazenda) |
  **Probabilidade:** Alta — qualquer usuário com permissão de INSERT em `animais` (hoje
  admin/membro) já consegue, sem nenhuma condição especial.
- **Classificação:** STRIDE = Tampering. Mesma classe de achado que a própria migration já
  documentava como inaceitável na decisão 4 do cabeçalho ("um usuário vinculado à própria
  fazenda poderia falsificar peso_atual_kg... a guarda de trigger fecha essa lacuna") — só que
  a guarda existente (`prevent_animais_campos_calculados_change()`, seção 3.4) dispara em
  `before update of peso_atual_kg, gmd_medio_kg, ultima_pesagem_data`, e a versão original de
  `inicializar_peso_atual_animal()` (seção 3.3, `before insert`) só copiava `peso_inicial_kg`
  para `peso_atual_kg` **quando o client não enviava peso_atual_kg explicitamente**, e não
  tocava em `gmd_medio_kg`/`ultima_pesagem_data` de forma alguma.
- **Achado:** um `INSERT INTO animais (..., peso_atual_kg, gmd_medio_kg, ultima_pesagem_data)
  VALUES (..., 999, 5.5, '2020-01-01')` passava sem nenhuma checagem — o animal nascia no
  sistema já com um "histórico de pesagens" e um GMD que nunca existiram, exatamente a métrica
  que é o objeto do débito técnico que esta fase corrige (spec seção 9, item 2). A guarda de
  UPDATE nunca é acionada porque a linha nunca teve um valor anterior para comparar — o
  problema é estrutural ao INSERT, não ao UPDATE.
- **Mitigação aplicada:** `inicializar_peso_atual_animal()` reescrita para forçar
  incondicionalmente `peso_atual_kg := peso_inicial_kg`, `gmd_medio_kg := null`,
  `ultima_pesagem_data := null` no `BEFORE INSERT`, ignorando qualquer valor enviado pelo
  client para essas 3 colunas. Não há cenário de produto legítimo em que um animal recém-criado
  já tenha uma pesagem real associada (pesagem é sempre um evento posterior, via
  `registrar_pesagem()`), então sobrescrever incondicionalmente não quebra nenhum caso de uso.

**3. `registrar_pesagem()` — mensagens de erro distintas para "animal não existe" vs. "existe
mas sem permissão" (oráculo de enumeração, achado menor)**

- **Impacto:** Baixo | **Probabilidade:** Baixa (`animal_id` é `uuid` gerado por
  `gen_random_uuid()`, não adivinhável — o oráculo só é útil a quem já possui um UUID válido de
  outra fazenda por algum outro meio).
- **Classificação:** STRIDE = Information Disclosure (baixo alcance). Inconsistente com o
  padrão que a própria migration já usa em `validar_lote_mesma_fazenda()` ("mensagem de erro
  deliberadamente genérica — não revela se o lote existe em outra fazenda").
- **Achado:** a versão original distinguia `raise exception 'Animal não encontrado'` (id
  inexistente) de `raise exception 'Usuário não tem vínculo com a fazenda deste animal'` (id
  existe, sem permissão) — um chamador autenticado em QUALQUER fazenda conseguiria, por
  tentativa e erro, descobrir se um dado `animal_id` existe em alguma fazenda do sistema
  (mesmo sem conseguir agir sobre ele), só pela mensagem de erro recebida.
- **Mitigação aplicada:** unificada em uma única mensagem genérica ("Animal não encontrado ou
  você não tem permissão para registrar pesagem nele") para os dois casos, mesmo padrão já
  usado no trigger de lote.

---

### [PONTOS DE ATENÇÃO ESPECIAL DA SOFIA — AVALIADOS]

**1. `security_invoker = true` nas duas views — lógica confirmada correta.** Com
`security_invoker = true` (Postgres 15+, sintaxe confirmada suportada no Postgres 17.6 deste
projeto — `supabase/config.toml`, `[db] major_version = 17`), a view executa com o privilégio
de quem a CONSULTA, não de quem a criou — isso significa que as policies de RLS de
`public.animais`/`public.pesagens` são avaliadas contra `auth.uid()` do chamador real em toda
consulta às views, exatamente como se ele tivesse consultado a tabela base diretamente. Revisei
as duas views linha a linha: nenhuma delas chama função `SECURITY DEFINER` nem depende de
qualquer caminho que reintroduza um bypass de RLS por fora — `calcular_categoria_animal()` é
uma função pura sem acesso a tabela nenhuma, e os `LEFT JOIN`s de ambas as views são consultas
diretas às tabelas base, sujeitas à mesma RLS. Confirmado: **RLS das tabelas base se propaga
corretamente** para quem consulta a view. Nenhum achado.

**2. GUC local à transação `rural_prod.recalculo_pesagem` — robusto contra o vetor de ataque
real deste projeto.** Avaliei dois cenários: (a) **pooler em modo transaction** — `set_config`
com `is_local = true` e o `UPDATE` subsequente em `animais` acontecem dentro da MESMA função
PL/pgSQL (`atualizar_animal_apos_pesagem()`), disparada por um trigger `AFTER` da mesma
transação que já está em andamento (a de `registrar_pesagem()`) — sob PgBouncer/pooler Supabase
em modo transaction, a conexão de backend só é potencialmente trocada ENTRE transações, nunca
no meio de uma; como as duas operações vivem na mesma transação, a flag nunca "escapa" antes de
ser usada. Não há bypass por pooling. (b) **Chamada direta de `set_config` por um client
malicioso** — verifiquei `supabase/config.toml`: `[api] schemas = ["public", "graphql_public"]`
— `pg_catalog` (onde vive `set_config`) NÃO está entre os schemas expostos pelo PostgREST, então
não existe endpoint `/rest/v1/rpc/set_config` alcançável por um usuário autenticado via API REST
(único canal de acesso de um usuário final da aplicação — não há acesso a SQL bruto). Mesmo que
existisse, `is_local = true` limitaria o efeito à transação do próprio request, que é curta e
isolada por chamada no fluxo padrão de PostgREST — uma segunda chamada HTTP não herdaria a flag.
Concluo: mecanismo é robusto para a superfície de ataque real (client via REST/RPC). Registro
como observação não-bloqueante: esta garantia depende de uma premissa de configuração da API
(`db-schemas`/`api.schemas` não expor `pg_catalog` nem qualquer schema com acesso a `set_config`)
— se um agente futuro expuser um schema adicional ou criar uma função `SECURITY DEFINER` que
repasse `set_config` arbitrariamente para o client, essa garantia deixa de valer. Não é uma
vulnerabilidade desta migration, é uma dependência implícita que vale documentar.

**3. `registrar_pesagem()` — autorização revisada linha a linha.** Confirmado: `for update` na
linha do animal antes de qualquer decisão (serializa corretamente chamadas concorrentes, mesmo
padrão de `promover_papel()` do ADR-0002); a checagem de vínculo usa `auth.uid()` (claim
validado pelo GoTrue, nunca uma query manual a `auth.users`); `search_path = ''` +
`revoke all from public` + `grant execute to authenticated` (nunca `anon`) presentes e
corretos. Único problema real encontrado foi a ausência da checagem de papel (achado nº1,
corrigido) e o oráculo de mensagens (achado nº3, corrigido) — o resto do desenho está correto.

**4. Pesagem não bloqueada para animal vendido/morto/baixado — confirmado como decisão de
produto, não achado de segurança.** `registrar_pesagem()` não checa `animais.status`
deliberadamente (documentado no log da Sofia). Do ponto de vista de segurança, isso não abre
nenhum acesso indevido — é o MESMO usuário autorizado da MESMA fazenda registrando peso em um
animal que ele já tinha permissão de gerenciar antes da baixa. Não bloqueante para este gate;
confirmo a recomendação da Sofia de validar com `developer`/produto antes da tela.

**5. `peso_inicial_kg` editável sem recálculo imediato de GMD — confirmado como débito técnico
de produto, não achado de segurança.** A edição passa pela mesma policy de UPDATE de `animais`
(agora também restrita por papel, achado nº1) e não toca nos 3 campos calculados protegidos —
não é um caminho de falsificação, só uma inconsistência temporária de exibição até a próxima
pesagem. Sem risco de segurança; mantenho como recomendação de produto, não bloqueante.

---

### [OUTROS PONTOS REVISADOS — SEM ACHADO]

- **`validar_lote_mesma_fazenda()`:** a checagem impede corretamente associar um animal a um
  lote de outra fazenda — `SECURITY INVOKER` (sem elevação), o `SELECT` já respeita a RLS de
  `lotes` do chamador, e a comparação explícita `v_fazenda_lote is distinct from new.fazenda_id`
  fecha a lacuna mesmo que a RLS de `lotes` mudasse no futuro. Mensagem de erro genérica
  (usada como referência para a correção do achado nº3). Trigger cobre `insert or update of
  lote_id, fazenda_id` — escopo correto.
- **`prevent_fazenda_id_change()`:** cobre exatamente os 3 campos certos (`id`, `fazenda_id`,
  `created_at`) em `lotes` e `animais`, defesa em profundidade consistente com a Fase 1. Ordem
  de execução dos triggers `BEFORE UPDATE` em `animais` (`prevent_identity_change` antes de
  `validar_lote_mesma_fazenda`, alfabético por nome) confirma que `fazenda_id` nunca muda antes
  da validação de `lote_id` rodar — sem janela de inconsistência.
- **Índices/constraints:** `unique (fazenda_id, identificacao)` em `animais` — escopado por
  tenant corretamente (não é unique global, o que seria um vazamento de informação sutil ao
  rejeitar duplicidade entre fazendas diferentes). CHECKs de domínio (`sexo`, `status`, pesos
  `> 0`, datas não-futuras, `data_fim >= data_inicio`) presentes e corretos. FKs com `on delete
  cascade`/`set null` apropriados, sem policy de DELETE para client em nenhuma das 3 tabelas
  (RLS default-deny cobre). Nenhuma constraint ausente identificada que abra brecha de
  segurança (ausência de índice, quando notada, é performance, não segurança — fora do escopo
  deste gate).
- **Roles usados nas policies (`to authenticated`, nunca `anon`):** correto nas 7 policies.
- **`grant`/`revoke` de `registrar_pesagem()`:** `revoke all from public` + `grant execute to
  authenticated` presentes. Funções trigger (`prevent_fazenda_id_change`,
  `validar_lote_mesma_fazenda`, `inicializar_peso_atual_animal`,
  `prevent_animais_campos_calculados_change`, `atualizar_animal_apos_pesagem`) não têm
  grant/revoke explícito — correto, Postgres impede chamar função `returns trigger` fora de
  contexto de trigger independentemente de privilégio de EXECUTE, mesmo padrão já aceito nos
  dois reviews anteriores para `handle_new_user()`/`trigger_set_updated_at()`.
- **`calcular_categoria_animal()` sem `revoke`/grant explícito:** aceitável — função pura,
  `IMMUTABLE`, sem acesso a tabela nenhuma, execução pública não representa risco.
- **SQL injection:** nenhum SQL dinâmico/`EXECUTE` em toda a migration; todos os parâmetros são
  tipados (`uuid`/`date`/`numeric`) e passados por bind, nunca concatenados.

---

### [VERIFICAÇÃO DE DADOS]

- **Criptografia em repouso:** sim (padrão Supabase/Postgres gerenciado, não alterado por esta
  migration).
- **Criptografia em trânsito:** sim (padrão Supabase — TLS obrigatório).
- **RLS / Controle de acesso:** válido, após correções. Antes das correções: válido contra
  vazamento CROSS-TENANT (a modelagem da Sofia já fechava essa classe corretamente — views com
  `security_invoker`, `validar_lote_mesma_fazenda()`, guardas de imutabilidade), mas
  **inválido** contra a fronteira de papel DENTRO do próprio tenant — o papel `financeiro`, já
  ativo em produção, tinha acesso de manejo completo que a spec nega explicitamente. Depois das
  correções: as 3 tabelas + a RPC de escrita agora respeitam tanto a fronteira de tenant
  (fazenda) quanto a fronteira de papel (financeiro excluído), e os 3 campos calculados de
  `animais` estão protegidos contra falsificação tanto no INSERT quanto no UPDATE.

---

### [NOTAS DO CONSTANTINE]

- "A Sofia fechou a classe de risco mais óbvia (vazamento entre fazendas) com rigor real — RLS,
  `security_invoker`, validação de lote cruzado, tudo isso estava certo desde o recebimento. O
  que ela não tinha como saber sem reler a seção 5.4 da spec é que o ADR-0002 já trouxe o papel
  `financeiro` para o presente, não para o roadmap — e uma migration que assume 'qualquer papel
  vinculado pode gerenciar' está certa para admin/membro e errada para financeiro, hoje, não
  daqui a duas fases."
- "Se não corrigíssemos o achado nº1 agora, o primeiro admin que convidasse um contador para
  'só ver o financeiro' estaria, sem saber, dando a essa pessoa permissão de editar peso e
  status de cada animal da fazenda. Isso não é um bug de UI que se esconde com uma tab
  escondida — é RLS, é a camada que deveria ser a última linha de defesa."
- "O achado nº2 (INSERT falsificando campos calculados) é o mesmo princípio que já reconheci na
  Fase 1 para colunas de identidade: uma guarda que só cobre UPDATE não cobre o dado, cobre um
  evento. Se o dado nasce errado, a guarda de UPDATE nunca tem a chance de discordar dele."
- "Nada aqui é vazamento cross-tenant — por isso 🟡 e não 🔴. Mas 'não vaza para fora' não é a
  mesma barra que 'respeita os limites que o próprio produto desenhou para dentro'. As duas
  precisam ser verdadeiras."

---

## Correções aplicadas

Todas diretamente em
`supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` (migration ainda não
aplicada a nenhum banco — editada diretamente, sem migration de correção separada):

1. **7 policies de RLS** (`lotes_select/insert/update_vinculada`,
   `animais_select/insert/update_vinculada`, `pesagens_select_vinculada`) — adicionado
   `papel <> 'financeiro'` ao subselect de `usuarios_fazendas`, em `USING` e `WITH CHECK`
   (achado nº1).
2. **`registrar_pesagem()`** — checagem de autorização passa a exigir `papel <> 'financeiro'`
   além do vínculo de fazenda (achado nº1); mensagens de "animal não encontrado" e "sem
   permissão" unificadas em uma única mensagem genérica (achado nº3).
3. **`inicializar_peso_atual_animal()`** — reescrita para forçar incondicionalmente
   `peso_atual_kg = peso_inicial_kg`, `gmd_medio_kg = null`, `ultima_pesagem_data = null` no
   `BEFORE INSERT`, fechando a falsificação de campos calculados via INSERT (achado nº2).
4. **Comentários de cabeçalho da migration e das seções 6.1/6.2/6.3** atualizados com o
   raciocínio completo de cada correção e link para este log; "Revisão de segurança: PENDENTE"
   → "CONCLUÍDA".

Nenhuma tabela, view, fórmula de GMD ou regra de correção de pesagem foi alterada em
comportamento — todas as correções fecham um caminho de acesso/falsificação que nunca deveria
ter sido alcançável pelo desenho de produto documentado na própria spec, sem remover nenhuma
capacidade legítima de admin/membro.

## Pendências / próximos passos (não bloqueantes para este gate)

- **`qa` (Emma):** ao escrever os testes de RLS/RPC desta fase (spec seção 9, item 5), incluir
  casos explícitos para os 3 achados corrigidos aqui: (a) usuário com `papel='financeiro'`
  vinculado a uma fazenda não consegue SELECT/INSERT/UPDATE em `lotes`/`animais`, não consegue
  SELECT em `pesagens`, e `registrar_pesagem()` rejeita a chamada; (b) INSERT direto em
  `animais` com `peso_atual_kg`/`gmd_medio_kg`/`ultima_pesagem_data` explícitos é ignorado (os
  3 campos nascem `peso_inicial_kg`/`null`/`null` independente do que o client enviar); (c)
  `registrar_pesagem()` com `animal_id` inexistente e com `animal_id` de outra fazenda retornam
  a mesma mensagem de erro.
- **`developer`/produto:** confirmar antes de construir as telas (spec seção 10, item 9) se um
  usuário `financeiro` deve ver ALGUMA tela de Eixo 1 (ex.: um dashboard read-only), já que a
  correção aplicada aqui segue a leitura mais estrita da spec 5.4 ("sem acesso", não "acesso
  restrito a leitura") — se o produto quiser um meio-termo (leitura sim, escrita não), é uma
  migration nova revisitando as policies de SELECT especificamente, não uma reversão desta.
  Continuam válidas as duas confirmações de produto já pedidas pela Sofia (pesagem em animal
  vendido/morto/baixado; recálculo imediato de GMD ao editar `peso_inicial_kg`).
- **Migration liberada para aplicação** (`supabase db push`) do ponto de vista deste gate —
  decisão de quando aplicar continua sendo humana/orchestrator, fora do escopo desta revisão.

## Mudanças de arquivo

- `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` — editado (ver
  "Correções aplicadas" acima). Nenhum outro arquivo de migration tocado.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, seções 1 e 4
  atualizadas.
