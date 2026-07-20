# Log — Schema da Fase 3, item 13 (lancamentos_financeiros/declaracoes_rebanho/prazos_declaracao_estado) — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — modelagem de banco da Fase 3, spec seção 10, item
  13 (SOMENTE este item — a view de saldo de rebanho, item 12, e os buckets de Storage, item 14,
  são tarefas seguintes/paralelas, fora do escopo aqui).
- **Tipo de tarefa:** Migration SQL nova (schema + funções + RLS), validada localmente
  (`supabase db reset` + smoke test funcional real com pgTAP contra RLS de sessões
  `authenticated` simuladas), **ainda não aplicada a nenhum banco remoto** — `supabase db push`
  é decisão humana/orchestrator, gate completo do `cyber_chief` obrigatório antes.
- **Escopo:** exclusivamente
  `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql` — tabelas
  `lancamentos_financeiros`, `declaracoes_rebanho`, `prazos_declaracao_estado`, funções
  `definir_prazo_declaracao_estado()` e `obter_prazo_declaracao_estado()`. Nenhuma tabela de
  fase anterior tocada.

## O que foi lido antes da modelagem

1. `especificacao-sistema.md`, seção 3.2 (schema das 3 tabelas), 4.2 (regra de fallback RS
   01/04-30/06), 5.3 (Configurações — prazos editáveis, categorias financeiras) e 5.4 (fronteira
   de acesso do papel `financeiro`: "Painel Financeiro, Declarações de Rebanho, Saldo de
   Animais").
2. `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` (migration anterior da mesma
   fase) — padrões já revisados pelo `cyber_chief`: `search_path=''`, `trigger_set_updated_at()`
   e `prevent_fazenda_id_change()` reaproveitados, RLS com `papel <> 'financeiro'` explícito,
   `on delete restrict` para FK catálogo→transacional, comentários extensos.
3. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — confirmado que `fazendas`
   **não tem coluna de UF/estado** (só `id`, `usuario_id`, `nome`, timestamps) — achado crítico
   para a decisão de `prazos_declaracao_estado` (ver abaixo).
4. `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — padrão de função
   `SECURITY DEFINER` com `revoke all ... from public` + `grant execute ... to authenticated`
   explícito, e confirmação de que `usuarios_fazendas.papel` é `not null` desde a Fase 1
   (`check (papel in ('admin','membro','financeiro'))`).

## Decisões tomadas (as duas que a tarefa pediu para decidir com critério)

### 1. `lancamentos_financeiros.categoria` = texto livre

A spec deixa em aberto se vira "enum fixo ou tabela configurável". Decidido: **texto livre, sem
CHECK e sem tabela nova**. Um CHECK travando nos 7 exemplos da spec contradiria a própria
premissa de "não fixo"; uma tabela `categorias_financeiras` normalizada é mais "correta" em
tese, mas cara agora (RLS própria, tela de CRUD que a spec só lista como item futuro de
Configurações) sem ganho real de integridade — "categoria" não é referenciada por nenhuma outra
tabela, diferente de `especies`. Trade-off documentado no cabeçalho da migration (decisão 1); se
o cliente pedir customização de categorias no futuro, é uma migração aditiva simples.

### 2. `prazos_declaracao_estado` — a decisão mais importante desta tarefa

**Mantida GLOBAL** (sem `fazenda_id`, exatamente como a spec seção 3.2 lista as colunas) — é
dado publicado pelo órgão estadual, o mesmo para toda fazenda na mesma UF/ano; uma linha por
fazenda criaria divergência garantida no primeiro UPDATE feito por qualquer uma delas, e o
problema real não é "de quem é a linha", é "quem pode escrever nela".

**A escrita NUNCA passa por RLS declarativa.** Zero policy de INSERT/UPDATE/DELETE para
`authenticated`/`anon` na tabela (mesmo default-deny já usado em
`usuarios`/`fazendas`/`usuarios_fazendas`/`convites`, ADR-0001/ADR-0002) — toda escrita passa
exclusivamente pela função nova `definir_prazo_declaracao_estado()` (`SECURITY DEFINER`), que:

1. Exige que o chamador tenha `papel <> 'financeiro'` em pelo menos uma fazenda (barra usuários
   puramente `financeiro`, que a spec 5.4 já nega acesso a Configurações).
2. Valida formato de UF (regex `^[A-Z]{2}$`) e consistência de datas (`fim > início`) antes de
   gravar qualquer coisa.
3. Faz upsert por `(estado, ano_referencia)` — cadastra ou sobrescreve, nunca duplica.
4. Grava uma coluna nova, `atualizado_por_usuario_id` (não prevista na spec, decisão desta
   migration) — trilha de auditoria de quem fez a última escrita.

**Limite honesto, documentado extensivamente no cabeçalho da migration (decisão 2) e repetido
aqui para o gate do `cyber_chief`:** a checagem (1) **não valida** que a fazenda do chamador
esteja de fato no estado sendo editado, porque `fazendas` não tem coluna de UF hoje (achado da
leitura da migration da Fase 1, item 3 acima). Ou seja, um admin de uma fazenda no Paraná
**ainda consegue**, tecnicamente, chamar `definir_prazo_declaracao_estado('RS', ...)` e alterar
o prazo que afeta todas as fazendas gaúchas — a mitigação entregue aqui não fecha esse buraco
por completo, ela: (a) reduz a superfície de ataque de "qualquer request autenticado" para "só
quem tem vínculo operacional em pelo menos uma fazenda"; (b) torna toda escrita auditável
(quem/quando); (c) concentra o ponto de checagem em um único lugar, então quando uma migração
futura adicionar `fazendas.estado`, a correção é cirúrgica (só essa função), não uma reescrita
de política espalhada. Rejeitei a alternativa "uma linha por fazenda" pelo motivo já explicado
acima (viola a própria natureza do dado, que é publicado por estado, não por produtor).

### 3. Fallback do padrão RS sem seed anual (spec seção 4.2)

A tabela nasce **vazia** (nenhum INSERT de seed) — semear uma linha por ano indefinidamente não
faz sentido. Função nova `obter_prazo_declaracao_estado(estado, ano)` resolve em tempo de
leitura: se existir linha cadastrada, retorna ela (`origem='cadastrado'`); senão, para
`estado='RS'`, calcula `01/abril–30/junho` do ano pedido via `make_date()` (nunca hardcoded como
string de data fixa, `origem='padrao_rs'`); para qualquer outro estado sem cadastro, retorna
`NULL`/`origem=null` — só o RS foi validado com o cliente, não há padrão a assumir para os
demais. `LANGUAGE SQL STABLE`, sem `SECURITY DEFINER` (só faz SELECT, já respeita a RLS aberta
da própria tabela).

## Outras decisões (menores, documentadas no cabeçalho da migration)

- `especie_id` em `declaracoes_rebanho` usa `on delete restrict`, mesmo raciocínio já aplicado a
  `gtas`/`transacoes` (catálogo→dado regulatório real, nunca cascade).
- `lancamentos_financeiros.transacao_animal_id` referencia `transacoes` (não
  `transacoes_animais`) — nome do campo na spec é `transacao_animal_id`, mas o destino da FK é
  explicitamente `transacoes` (permite marcar "já coberto por uma transação de compra/venda").
- Fronteira de `financeiro`: SELECT liberado em `lancamentos_financeiros` e `declaracoes_rebanho`
  (spec 5.4 lista os dois módulos explicitamente), zero INSERT/UPDATE/DELETE — mesmo padrão já
  usado em `transacoes`/`transacoes_detalhe` na migration anterior. Em `prazos_declaracao_estado`
  o SELECT é aberto sem filtro de papel (justificado pela dependência real: a tela de Declarações,
  que `financeiro` acessa, precisa exibir o prazo vigente).
- Sem policy de DELETE em `lancamentos_financeiros` (decisão própria — Módulo Financeiro exporta
  para contabilidade externa por período, DELETE client-side arriscaria invalidar um período já
  exportado; correção via UPDATE) nem em `declaracoes_rebanho` (decisão **já dada pela spec**,
  item 9 da seção 9: "declarações anuais nunca devem ser apagáveis pelo usuário").
- `unique(fazenda_id, especie_id, ano_referencia)` em `declaracoes_rebanho` — uma declaração por
  espécie/ano por fazenda; correção é via UPDATE da própria linha.

## Bug encontrado e corrigido durante a validação local (não chegou a ir para o gate do cyber_chief)

Durante o smoke test, `definir_prazo_declaracao_estado()` falhava com
`invalid input syntax for type uuid` sempre que executada. Causa: a versão inicial usava
`insert into ... as p (...) ... on conflict (...) do update set ... returning p into v_row;`
(referenciando o alias `p` do INSERT diretamente na cláusula `RETURNING`, para popular a
variável composta `v_row`). Isolei o bug com um repro mínimo fora da função — `returning p into
v_row` faz o Postgres tentar converter a linha inteira para `uuid` (provável interação entre o
alias do INSERT e `ON CONFLICT DO UPDATE`, não documentada). Troquei para `returning * into
v_row` (sem referenciar o alias), que funciona corretamente e é a forma idiomática documentada
pelo PL/pgSQL para popular uma variável de registro a partir de `RETURNING`. Removi o `as p` do
INSERT (não é mais necessário, não é referenciado em nenhum outro lugar da função). Achado
registrado aqui porque é o tipo de armadilha de sintaxe que outro agente pode repetir ao
escrever `INSERT ... ON CONFLICT DO UPDATE ... RETURNING ... INTO` em uma função futura.

## Validação real executada (local, não remota)

- `supabase db reset` aplicou as 6 migrations do zero sem erro de sintaxe/constraint, em duas
  rodadas (a primeira expôs o bug de `RETURNING`, corrigido antes de prosseguir).
- `pg_policies` confirmou as 7 policies esperadas (3 em `lancamentos_financeiros`, 3 em
  `declaracoes_rebanho`, 1 em `prazos_declaracao_estado` — só SELECT, zero escrita).
- **Smoke test funcional real com pgTAP** (`plan(11)`, todas as 11 asserções passaram),
  simulando sessões `authenticated` reais via `set_config('request.jwt.claims', ...)` +
  `set local role authenticated` (não superuser bypassando RLS — validação real de policy, não
  só de trigger):
  1. `definir_prazo_declaracao_estado()` faz upsert correto por `(estado, ano_referencia)` —
     duas chamadas para RS/2026 resultam em exatamente 1 linha, com os valores da SEGUNDA
     chamada.
  2. UF inválida (`'XYZ'`) rejeitada com a mensagem exata esperada.
  3. Datas invertidas (`fim < início`) rejeitadas com a mensagem exata esperada.
  4. Admin: UPDATE **direto** (client, não via função) em `prazos_declaracao_estado` afeta 0
     linhas — confirmado via `GET DIAGNOSTICS ROW_COUNT`, não erro (RLS sem policy de UPDATE
     filtra a linha silenciosamente, mesma semântica documentada para `lotes`/`animais` na
     suíte pgTAP da Fase 2 — não lança `42501` como INSERT faz, importante diferença de
     comportamento que corrigi no próprio script de teste no meio da validação).
  5. `financeiro` (vínculo ÚNICO, sem fazenda própria — cenário real de convite, ADR-0002):
     SELECT em `lancamentos_financeiros`/`declaracoes_rebanho` da fazenda vinculada retorna a
     linha; leitura de `obter_prazo_declaracao_estado('RS', 2026)` funciona.
  6. `financeiro`: INSERT em `lancamentos_financeiros`/`declaracoes_rebanho` bloqueado por RLS
     (`42501`, mensagem padrão do Postgres confirmada literalmente).
  7. `financeiro`: `definir_prazo_declaracao_estado()` rejeitada com "sem permissão para editar
     prazos de declaração" — **confirmado por teste real, não só leitura do código**, incluindo
     a correção de um bug do PRÓPRIO script de teste (a primeira versão do smoke test dava
     ACIDENTALMENTE ao usuário financeiro uma fazenda própria extra via `handle_new_user()`
     sem `convite_token`, o que o fazia passar na checagem — corrigido explicitando o `DELETE`
     do vínculo `dono` auto-criado antes de vincular como `financeiro`, replicando o efeito real
     de `aceitar_convite()`). Ver seção "Bug encontrado" para o outro achado de sintaxe.
  8. `financeiro`: UPDATE direto em `prazos_declaracao_estado` também afeta 0 linhas.
  9. `obter_prazo_declaracao_estado('RS', 2099)` sem cadastro retorna o padrão calculado
     (`2099-04-01`/`2099-06-30`, `origem='padrao_rs'`); `obter_prazo_declaracao_estado('PR',
     2099)` sem cadastro retorna tudo `NULL`.
- Rollback confirmado ao final — `count(*)` de todas as tabelas envolvidas e dos usuários de
  teste voltou a 0, nenhum dado de smoke test ficou no banco.
- **Não executado** (fora do escopo desta tarefa, fica para `qa`): suíte pgTAP formal
  persistida em `supabase/tests/database/`; `supabase db push` para o remoto (decisão
  humana/orchestrator).

## Mudanças de arquivo

- Novo `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, mais atualização das seções 1 e 4.

## Pendências / próximos passos

- **Gate obrigatório do `cyber_chief`** antes de `supabase db push` — atenção especial pedida a:
  1. A decisão de `prazos_declaracao_estado` (limite honesto documentado acima e no cabeçalho da
     migration) — confirmar que a mitigação via função `SECURITY DEFINER` + auditoria é
     proporcional ao risco, e que o limite (sem `fazendas.estado`) está claramente sinalizado
     como pendência arquitetural, não escondido.
  2. A decisão de `categoria` como texto livre em `lancamentos_financeiros` — sem CHECK,
     confirmar que isso não abre um vetor de abuso (texto livre sempre tem risco de conteúdo
     malformado/malicioso armazenado, mas sem execução — mesmo padrão já aceito para
     `descricao`/`outra_parte`/`observacoes` em `transacoes`).
  3. `atualizado_por_usuario_id` — confirmar que `on delete set null` é o comportamento certo
     (perder o usuário que fez a última edição não deveria apagar o prazo em si).
  4. Ausência de policy de DELETE em `lancamentos_financeiros` (decisão própria, não pedida
     explicitamente pela spec) vs. `declaracoes_rebanho` (decisão já dada pela spec) — confirmar
     que a distinção está correta.
- Depois do gate: view de saldo de rebanho (item 12, bloqueada por falta dos prints de
  referência — pendência conhecida, não iniciada), buckets de Storage `gtas-documentos`/
  `declaracoes-rebanho` (item 14) — itens seguintes da mesma fase, não iniciados aqui.
- Pendência arquitetural nova, registrada para `architect`/`db_sage` decidirem numa fase futura:
  adicionar `fazendas.estado` (UF) ao schema, para permitir fechar de vez a validação de
  autorização de `definir_prazo_declaracao_estado()` (hoje só verifica vínculo operacional em
  QUALQUER fazenda, não na fazenda do estado certo).
- `supabase db push` não executado — decisão humana/orchestrator, fora do escopo desta tarefa.
