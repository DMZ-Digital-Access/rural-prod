# Log — Security Review da Fase 3, item 11 (gtas/transacoes/transacoes_detalhe/transacoes_animais) — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (CONSTANTINE) — gate de segurança obrigatório antes de
  `supabase db push`, mesmo papel já exercido na Fase 1, no ADR-0002 e na Fase 2. Piso mínimo de
  rigor daqueles três reviews, não teto.
- **Tipo de tarefa:** Security review formal (RLS/IDOR + integridade de trigger) de migration
  ainda não aplicada a nenhum banco, com correção direta no arquivo SQL (não migration de
  correção separada).
- **Escopo:** exclusivamente
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` — tabelas
  `gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais`, as 12 policies de RLS, e as 5
  funções trigger (`validar_gta_transacao_mesma_fazenda`, `validar_transacao_gta_mesma_fazenda`,
  `preparar_vinculo_transacao_animal`, `aplicar_status_animal_apos_vinculo`,
  `reverter_status_animal_apos_desvinculo`). Saldo/financeiro/storage (itens 12-14 da mesma fase)
  fora de escopo, propositalmente não tocados.

## O que foi lido antes da análise

1. `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md` — decisão completa (D1-D6) que
   `transacoes_animais` implementa.
2. `especificacao-sistema.md`, seção 5.4 — fronteira exata do papel `financeiro`: "Acesso
   restrito a: Painel Financeiro, Declarações de Rebanho, Saldo de Animais" / "Sem acesso a:
   manejo individual de animais/lotes/pesagens, GTAs, edição de transações".
3. `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` — revisada linha a linha,
   versão recebida antes de qualquer correção.
4. `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md` e
   `2026-07-16-cyber_chief-review-adr0002.md` — meus dois reviews anteriores mais relevantes
   (bypass de autorização via NULL, TOCTOU em guarda de contagem, RLS não excludente de
   `financeiro`) — usados como checklist de padrões de erro a não deixar se repetir.

---

## [SECURITY ANALYSIS]

**Componente:** `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` (tabelas
`gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais`; 12 policies de RLS; 5 funções
trigger de integridade cruzada e efeito colateral de status)

**Status (após correção aplicada nesta revisão):** 🟢 Seguro — liberada para `supabase db push`
do ponto de vista deste gate (decisão de quando aplicar continua humana/orchestrator).

**Status antes da correção (como recebido):** 🟡 Seguro com Observações — nenhuma das três
fronteiras de `financeiro` estava violada (a Sofia copiou o padrão `papel <> 'financeiro'` da
Fase 2 corretamente nas 9 policies onde deveria excluir o papel, e deixou as 4 policies de
`SELECT` de `transacoes`/`transacoes_detalhe` corretamente abertas), e os dois triggers de
integridade cruzada `gtas`↔`transacoes` estavam corretos e NULL-safe desde o recebimento — mas
um achado de severidade Média (achado nº1, abaixo), uma corrida real na guarda de coexistência
de D5 do ADR-0004, que eu não deixaria passar para aplicação sem correção.

---

### [VULNERABILIDADES IDENTIFICADAS]

**1. `reverter_status_animal_apos_desvinculo()` — condição de corrida (TOCTOU) na guarda de
coexistência de D5, mesma classe de bug já corrigida em `promover_papel()` (ADR-0002) (CWE-367)**

- **Impacto:** Médio (corrupção de estado — `animais.status` fica preso em `'venda'` mesmo
  depois que todos os vínculos de venda do animal foram removidos, exigindo correção manual;
  não é vazamento cross-tenant nem elevação de privilégio, é integridade de dado) |
  **Probabilidade:** Baixa (exige duas chamadas `DELETE` verdadeiramente concorrentes,
  desvinculando dois vínculos de venda DISTINTOS do MESMO animal — cenário que só existe porque
  o próprio ADR-0004 D6 permite, de forma deliberada, um animal estar vinculado a mais de uma
  venda ao mesmo tempo), mas não nula.
- **Classificação:** STRIDE = Tampering / Denial of Service operacional (o dado fica incorreto
  e nenhum caminho de UI o corrige sozinho). CWE-367 (Time-of-Check to Time-of-Use) — a mesma
  classe exata do achado nº2 do gate do ADR-0002 (`promover_papel()`), só que com o efeito
  inverso: lá a corrida fazia a guarda ser PERMISSIVA DEMAIS (as duas chamadas passavam); aqui a
  corrida faz a guarda ser CONSERVADORA DEMAIS (as duas chamadas decidem não reverter).
- **Achado:** a versão original de `reverter_status_animal_apos_desvinculo()` fazia `select
  status into v_status_atual from animais where id = old.animal_id;` (sem lock) e, em seguida,
  `select exists(select 1 from transacoes_animais where animal_id = old.animal_id and
  tipo_operacao_transacao = 'venda')` para decidir se reverte. Sob `READ COMMITTED` (isolamento
  padrão do Postgres), duas transações concorrentes que removem **dois vínculos de venda
  diferentes** do MESMO animal (cenário mínimo: animal com exatamente 2 vínculos de venda
  remanescentes, A e B; uma chamada `DELETE` remove A, outra remove B, simultaneamente) não
  enxergam o `DELETE` uma da outra até o commit — cada uma, ao rodar o `EXISTS`, ainda vê a
  linha da outra (não commitada) como existente, e **ambas decidem não reverter**. Depois que as
  duas commitam, `transacoes_animais` fica sem NENHUM vínculo de venda remanescente para aquele
  animal, mas `animais.status` continua `'venda'` para sempre — o dado nunca se autocorrige,
  porque não existe nenhum terceiro `DELETE` que dispare o trigger de novo. Mesmo padrão de
  MVCC/isolamento que já causou o achado do ADR-0002, mas manifestando o efeito oposto (guarda
  não dispara em vez de guarda disparar demais).
- **DREAD:** Damage médio (dado de status incorreto, sem correção automática — exige `UPDATE`
  manual de um admin ciente do problema) / Reproducibility baixa-média (exige duas chamadas
  `DELETE` verdadeiramente simultâneas, mas não exige nenhum privilégio além do que um
  admin/membro já tem legitimamente) / Exploitability baixa (não é uma vulnerabilidade
  "explorável" por um atacante externo — é uma falha de correção sob uso concorrente legítimo,
  mais perto de um bug de confiabilidade do que de uma brecha de acesso) / Affected users:
  qualquer fazenda que use o recurso de múltiplos vínculos de venda por animal (D6 do ADR-0004)
  e desfaça dois desses vínculos quase ao mesmo tempo / Discoverability baixa (exige entender a
  guarda de coexistência e montar um teste de concorrência real para reproduzir).
- **Por que não classifiquei como 🔴/🟡-bloqueante-crítico:** ao contrário do achado nº1 do
  ADR-0002 (bypass de autorização que dava acesso indevido a QUALQUER fazenda) ou do achado nº1
  da Fase 2 (papel inteiro com acesso de manejo que a spec nega), este achado não abre nenhum
  acesso não autorizado — o pior resultado é um dado operacional (`animais.status`) ficar
  desatualizado dentro do próprio tenant, sempre corrigível por um `UPDATE` manual de quem já
  tinha permissão de fazer esse `UPDATE` de qualquer forma. Mas é uma violação real da garantia
  que o próprio ADR-0004 (D5) promete ("a remoção do vínculo deveria automatizar o caminho de
  volta") e, seguindo o mesmo padrão já registrado no achado nº2 do ADR-0002, uma guarda que só
  funciona no caso sequencial não é uma guarda — corrigi diretamente, sem deixar como
  "observação para depois".
- **Mitigação aplicada:** `select status into v_status_atual from public.animais where id =
  old.animal_id for update;` — o `for update` serializa duas execuções concorrentes deste
  trigger para o MESMO `animal_id`. A segunda transação a obter o lock só prossegue depois do
  commit da primeira, e sua checagem de `EXISTS` seguinte (nova instrução, novo snapshot sob
  `READ COMMITTED`) reflete o estado real pós-commit da primeira — mesmo padrão já usado em
  `registrar_pesagem()` (Fase 2) e no `perform ... for update` de `promover_papel()` (ADR-0002)
  para fechar TOCTOU equivalente. Rastreei a sequência completa com o lock aplicado (ver seção
  "Verificação da correção" abaixo) — o resultado final é sempre correto,
  independentemente de qual transação obtém o lock primeiro.

---

### [VERIFICAÇÃO DA CORREÇÃO — corrida de dois `DELETE`s concorrentes]

Animal X tem exatamente 2 vínculos de venda remanescentes, linha A (transação T1) e linha B
(transação T2). `DELETE` de A e `DELETE` de B disparados em transações concorrentes distintas.

- Transação 1 (deletando A): já removeu A dentro da própria transação (auto-invisível por MVCC).
  Trigger `AFTER DELETE` executa `select status ... for update` — adquire o lock da linha de
  `animais` (nenhuma contenção ainda).
- Transação 2 (deletando B): já removeu B dentro da própria transação. Trigger executa `select
  status ... for update` — **bloqueia**, esperando o lock de Transação 1.
- Transação 1 continua: `EXISTS` não vê o `DELETE` de B (ainda não commitado por Transação 2) →
  linha B aparece como "ainda existente" → Transação 1 **não reverte**. Commita, libera o lock.
- Transação 2 desbloqueia, adquire o lock, e sua consulta `for update` roda como instrução NOVA
  — snapshot atualizado pós-commit de Transação 1. `EXISTS` agora: A já foi commit-deletada por
  Transação 1, B está auto-deletada na própria Transação 2 → nenhuma linha de venda remanescente
  → Transação 2 **reverte** `status = 'ativo'`. Resultado final correto.
- (A ordem inversa — Transação 2 adquire o lock primeiro — chega ao mesmo resultado final por
  simetria: quem obtém o lock por último sempre enxerga o estado real e decide corretamente.)

Sem o `for update`, as duas transações rodavam o `EXISTS` em paralelo, sem lock nem
bloqueio, cada uma vendo a linha da outra como "ainda existente" — **nenhuma** revertia, e o
`status` ficava preso em `'venda'` permanentemente. Com o lock, exatamente uma das duas reverte,
sempre a que enxerga o estado pós-commit real. Confirmado corrigido por análise estática da
sequência de execução (não executei um teste de concorrência real de duas sessões `psql` — essa
verificação fica registrada como recomendação para `qa` nas pendências abaixo, mesmo padrão já
usado no gate do ADR-0002 para a corrida equivalente de `promover_papel()`).

---

### [OUTROS PONTOS REVISADOS — SEM ACHADO]

**As 3 fronteiras de `financeiro` — as 12 (na verdade 13, com a de `INSERT` de
`transacoes_detalhe`) policies de RLS revisadas uma a uma contra a regra correta de cada
tabela:**

- **`gtas` (zero acesso, nem SELECT):** `gtas_select_vinculada`, `gtas_insert_vinculada`,
  `gtas_update_vinculada` (`USING` e `WITH CHECK`) — as 4 checagens usam `papel <> 'financeiro'`
  no subselect de `usuarios_fazendas`. Nenhuma policy de `SELECT` deixa `financeiro` de fora só
  parcialmente — as 3 policies (não 2) excluem o papel corretamente. Sem policy de `DELETE`
  (correto — spec/tarefa não previa exclusão física nesta fase). **Correto, sem desvio.**
- **`transacoes`/`transacoes_detalhe` (SELECT permitido para `financeiro`, zero escrita):**
  `transacoes_select_vinculada` e `transacoes_detalhe_select_vinculada` — **corretamente sem** o
  filtro `papel <> 'financeiro'` (só escopo de fazenda vinculada, qualquer papel). Já
  `transacoes_insert_vinculada`, `transacoes_update_vinculada` (`USING`+`WITH CHECK`),
  `transacoes_detalhe_insert_vinculada` e `transacoes_detalhe_update_vinculada`
  (`USING`+`WITH CHECK`) — todas com `papel <> 'financeiro'` no subselect (direto em
  `usuarios_fazendas` para `transacoes`; via `join` explícito com `transacoes.fazenda_id` para
  `transacoes_detalhe`, mesmo padrão de `pesagens_select_vinculada` da Fase 2, não delegado
  implicitamente à RLS de `transacoes`). Nenhuma das 4 policies de escrita foi copiada por engano
  a partir do padrão aberto de `SELECT` — a checagem de papel está presente em todas. **Correto,
  sem desvio, exatamente a fronteira que a "nota de dependência" do ADR-0004 D3 deixou em aberto
  para esta migration decidir.**
- **`transacoes_animais` (zero acesso, nem SELECT — ADR-0004 D3):**
  `transacoes_animais_select_vinculada`, `transacoes_animais_insert_vinculada`,
  `transacoes_animais_delete_vinculada` — as 3 usam `papel <> 'financeiro'` no subselect via
  `join` com `transacoes.fazenda_id`. Sem policy de `UPDATE` (correto — ADR-0004 D3: vínculo é
  criado ou removido, nunca editado em lugar). **Correto, sem desvio.** Nenhuma das 3 fronteiras
  distintas foi diluída por cópia-e-cola entre tabelas — a preocupação que a própria `db_sage`
  sinalizou (maior risco de erro de cópia nesta migration do que nas anteriores) não se
  concretizou.
- **NULL-safety da checagem `papel <> 'financeiro'`:** confirmado que `usuarios_fazendas.papel`
  é `not null default 'dono'` desde a Fase 1
  (`supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql:219`), com `CHECK` de domínio
  — não há como uma linha de `usuarios_fazendas` ter `papel` nulo, então não existe o mesmo
  vetor de bypass via NULL do achado crítico do ADR-0002 (aquele era em comparação de e-mail,
  coluna de fato nullable de `auth.users`; aqui a coluna comparada nunca é nula por schema).
  Mesmo que fosse nula, a direção do bypass seria SEGURA (`papel <> 'financeiro'` com `papel`
  nulo avalia `NULL`, exclui a linha do subselect, resultando em MENOS acesso, nunca mais).

**Os dois triggers de integridade cruzada `gtas`↔`transacoes` (iniciativa própria da `db_sage`,
fora do escopo original de tarefa) — revisados como código novo, sem assumir correção:**

- `validar_gta_transacao_mesma_fazenda()` / `validar_transacao_gta_mesma_fazenda()`: ambos
  `BEFORE INSERT OR UPDATE OF <fk>, fazenda_id`, `SECURITY INVOKER`, `search_path = ''`. Ambos
  saem cedo (`return new`) quando a FK opcional (`transacao_id`/`gta_id`) é `NULL` — correto,
  GTA avulsa e transação sem GTA são casos válidos por design. Comparação de fazenda usa `is
  distinct from` (NULL-safe por construção, não `<>`) combinada com `if not found` explícito —
  mesmo padrão robusto de `validar_lote_mesma_fazenda()` (Fase 2), sem o bug de comparação
  `<>`/`=` simples que causou o achado crítico do ADR-0002. Mensagem de erro genérica e idêntica
  para "não encontrado" e "fazenda diferente" nos dois lados — sem oráculo de enumeração.
- **Condição de corrida:** avaliada e descartada — `fazenda_id` é imutável em ambas as tabelas
  (`prevent_identity_change` cobre `id`/`fazenda_id`/`created_at` em `gtas` e `transacoes`,
  aplicado antes do trigger de validação por ordem alfabética de nome, mesma garantia já
  confirmada no gate da Fase 2 para `lotes`/`animais`), então não existe janela em que a
  `fazenda_id` de um dos dois lados mude depois que o vínculo cruzado já foi validado — o
  invariante "vínculo só entre mesma fazenda", uma vez estabelecido no `INSERT`/`UPDATE` que
  popula a FK, não pode ser quebrado por uma mudança posterior de `fazenda_id`.
- **Vazamento de informação entre fazendas:** nenhum — ambas as mensagens são genéricas e
  idênticas para os dois casos de falha (não encontrado vs. fazenda diferente), e nenhuma delas
  revela a `fazenda_id` real do outro lado do vínculo.

**Os 3 triggers de `transacoes_animais` — implementação do ADR-0004 conferida linha a linha:**

- `preparar_vinculo_transacao_animal()` (D2+D4, `BEFORE INSERT`): consulta `fazenda_id` +
  `tipo_operacao` de `transacoes` primeiro (`if not found` explícito), depois `fazenda_id` de
  `animais` (`if not found or ... is distinct from ...`), popula
  `new.tipo_operacao_transacao` só depois das duas validações passarem. Mensagem de erro única
  e genérica para os dois `raise exception` — sem oráculo. `SECURITY INVOKER` correto pela
  mesma lógica do ADR (RLS de `transacoes`/`animais` do próprio chamador já filtra
  cross-fazenda antes mesmo da comparação explícita rodar — defesa em profundidade). **Fiel ao
  ADR, sem desvio.**
- `aplicar_status_animal_apos_vinculo()` (D2, `AFTER INSERT`): efeito só para
  `tipo_operacao_transacao = 'venda'`, idempotente (reaplicar `status = 'venda'` várias vezes é
  inofensivo), sem trava de revenda (D6, deliberado). Nenhum problema de concorrência aqui — a
  operação é unconditional/idempotente, não depende de contagem nem de estado anterior, então
  duas execuções concorrentes (dois `INSERT`s de venda para o mesmo animal) convergem para o
  mesmo resultado correto independente de ordem. **Fiel ao ADR, sem desvio.**
- `reverter_status_animal_apos_desvinculo()` (D5, `AFTER DELETE`): guarda de idempotência
  (`status` ainda `'venda'`) e guarda de coexistência (nenhum outro vínculo de venda
  remanescente) implementadas exatamente como o ADR descreve — a guarda de coexistência tinha a
  corrida documentada no achado nº1, agora corrigida. Nunca reconsulta `transacoes` (usa
  `OLD.tipo_operacao_transacao`, a cópia denormalizada de D1) — testado mentalmente contra o
  cenário de `DELETE` em cascata da transação pai (D1 antecipa exatamente esse caso): se
  `animais` também fosse deletado na mesma cascata (hoje inalcançável via client — `animais` não
  tem policy de `DELETE` para nenhum papel, herdado da Fase 2), a consulta `for update` retorna
  `not found` e o trigger sai cedo sem erro — comportamento correto, não um crash.

**Outros pontos:**

- **SQL injection:** nenhum SQL dinâmico/`EXECUTE` em toda a migration; todos os literais são
  tipados e comparados por igualdade/`IN`, nunca concatenados.
- **`search_path = ''` + referências schema-qualificadas:** presente e correto nas 5 funções
  novas.
- **`GRANT`/`REVOKE`:** nenhuma das 5 funções novas precisa de `REVOKE ALL`/`GRANT EXECUTE`
  explícito — todas são `returns trigger`, inalcançáveis por chamada direta independente de
  privilégio de `EXECUTE`, mesmo padrão já aceito nos três gates anteriores para funções de
  trigger equivalentes.
- **Nenhuma função `SECURITY DEFINER` introduzida** — as 5 funções são `SECURITY INVOKER`,
  reduzindo a superfície de revisão em relação a `registrar_pesagem()`/`aceitar_convite()`/
  `promover_papel()` (Fase 1/ADR-0002), consistente com a justificativa do próprio ADR-0004 D2.
- **`especie_id`/`agrupamento_etario_id` com `on delete restrict`:** decisão de modelagem, não
  de segurança — não abre nem fecha nenhum caminho de acesso indevido, só evita perda de dado
  histórico por efeito colateral de limpeza de catálogo. Sem achado.
- **Ausência de policy de `DELETE` em `gtas`/`transacoes`/`transacoes_detalhe`:** avaliei como
  decisão de segurança correta — impede que qualquer client, mesmo admin, dispare a cascata real
  (reversão de status de múltiplos animais via `transacoes_animais` `on delete cascade` +
  trigger D5) sem um fluxo de confirmação dedicado que ainda não existe. Consistente com o
  raciocínio já usado na Fase 2 para `lotes`/`animais`/`pesagens`.
- **Roles usados nas 13 policies (`to authenticated`, nunca `anon`):** correto em todas.
- **`unique(fazenda_id, numero_gta)` em `gtas` e `unique(transacao_id, animal_id)` em
  `transacoes_animais`:** ambas escopadas corretamente (não são `unique` globais que vazariam
  informação de outra fazenda ao rejeitar duplicidade cruzada).

---

### [VERIFICAÇÃO DE DADOS]

- **Criptografia em repouso:** sim (padrão Supabase/Postgres gerenciado, não alterado por esta
  migration).
- **Criptografia em trânsito:** sim (padrão Supabase — TLS obrigatório).
- **RLS / Controle de acesso:** válido, antes e depois da correção — as 3 fronteiras distintas de
  `financeiro` estavam corretas desde o recebimento (nenhuma diluição por cópia-e-cola entre as
  4 tabelas), e a validação cross-fazenda dos dois triggers `gtas`↔`transacoes` e do trigger
  `preparar_vinculo_transacao_animal()` fecha corretamente o vetor de um usuário com vínculo em
  mais de uma fazenda tentar cruzar dados entre elas. O único achado (guarda de coexistência de
  D5) é de integridade de dado sob concorrência, não de controle de acesso — corrigido para
  garantir que a garantia de reversibilidade do ADR-0004 vale também sob uso concorrente real,
  não só no caso sequencial.

---

### [NOTAS DO CONSTANTINE]

- "A Sofia acertou a parte mais arriscada desta migration — as três fronteiras distintas de
  `financeiro` na mesma migration, o cenário que ela mesma sinalizou como maior risco de erro de
  cópia. Não houve diluição nenhuma: cada uma das 13 policies tem exatamente a checagem que a
  tabela correspondente exige, nem uma a mais nem uma a menos."
- "O achado que encontrei não é sobre quem pode acessar o quê — é sobre o que acontece quando
  duas operações legítimas, feitas por gente autorizada, colidem no tempo. `for update` sem essa
  disciplina, uma guarda de contagem/existência só está certa para o caso em que ninguém mais
  está mexendo no mesmo dado no mesmo instante — e um sistema com múltiplos vínculos de venda
  por design (D6 do próprio ADR) é exatamente o tipo de sistema onde isso vai acontecer."
- "Se não corrigíssemos isso agora, o primeiro admin que desvinculasse dois vínculos de venda
  quase ao mesmo tempo teria um animal preso em `status='venda'` sem saber por quê, e sem
  nenhum caminho de UI que o avisasse — um bug silencioso, não um crash, o pior tipo para
  detectar depois."
- "Nenhum dos dois triggers que a Sofia escreveu por iniciativa própria (`gtas`↔`transacoes`)
  tinha o mesmo problema — ambos usam `is distinct from` e saem cedo com NULL, o padrão certo
  desde a primeira linha. O ADR-0004 já veio com a guarda de coexistência desenhada
  explicitamente (D5), e é justamente a peça mais nova/mais específica do desenho que carregava
  o risco mais sutil — coerente com o padrão dos três gates anteriores: o código copiado de um
  padrão já revisado tende a vir certo, o código genuinamente novo é onde vale o escrutínio
  extra."

---

## Correções aplicadas

Todas diretamente em
`supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` (migration ainda não aplicada a
nenhum banco — editada diretamente, sem migration de correção separada):

1. **`reverter_status_animal_apos_desvinculo()`** — `select status ... from public.animais
   where id = old.animal_id` ganhou `for update`, serializando duas execuções concorrentes do
   trigger para o mesmo `animal_id` e fechando a corrida da guarda de coexistência de D5
   (achado nº1). Comentário inline extenso explicando o cenário de corrida e a correção.
2. **`comment on function public.reverter_status_animal_apos_desvinculo()`** — atualizado para
   documentar a correção e apontar para este log.

Nenhuma tabela, policy de RLS, trigger de integridade cruzada `gtas`↔`transacoes`, ou os outros
2 triggers de `transacoes_animais` foram alterados em comportamento — a única mudança é a adição
do lock `for update`, que não altera nenhum resultado do caso sequencial (sem concorrência),
só corrige o caso concorrente.

## Pendências / próximos passos (não bloqueantes para este gate)

- **`qa` (Emma):** ao escrever os testes desta migration, incluir um teste de concorrência real
  (duas sessões `psql`, mesmo padrão já usado para a corrida de `promover_papel()` no gate do
  ADR-0002) que reproduza o cenário exato do achado nº1 — animal com 2 vínculos de venda
  remanescentes, `DELETE` simultâneo dos dois, confirmar que `animais.status` termina `'ativo'`
  (não preso em `'venda'`) depois que ambas as transações commitam. Também recomendo casos
  explícitos para as 3 fronteiras de `financeiro` (SELECT/INSERT/UPDATE bloqueados em `gtas` e
  `transacoes_animais`; SELECT permitido mas escrita bloqueada em `transacoes`/
  `transacoes_detalhe`) e para os dois triggers `gtas`↔`transacoes` (rejeição cross-fazenda nas
  duas direções).
- **Migration liberada para aplicação** (`supabase db push`) do ponto de vista deste gate —
  decisão de quando aplicar continua sendo humana/orchestrator, fora do escopo desta revisão.
- Nenhuma pendência de produto nova identificada por este gate — as pendências de D6 (revenda
  sem trava técnica) e a nota de dependência de D3 já estavam registradas pelo próprio ADR-0004
  e foram fechadas correta e consistentemente por esta migration.

## Mudanças de arquivo

- `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` — editado (ver "Correções
  aplicadas" acima). Nenhum outro arquivo de migration tocado.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, seções 1 e 4
  atualizadas.
