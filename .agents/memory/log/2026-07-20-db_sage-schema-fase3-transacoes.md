# Log — Schema da Fase 3, item 11 (Eixo 2: gtas/transacoes/transacoes_detalhe/transacoes_animais) — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — modelagem de banco da Fase 3, spec seção 10, item
  11 (SOMENTE este item — saldo de rebanho, `lancamentos_financeiros`, `declaracoes_rebanho`,
  `prazos_declaracao_estado` e buckets de Storage são tarefas seguintes da mesma fase, fora do
  escopo aqui).
- **Tipo de tarefa:** Migration SQL nova (schema + índices + triggers + RLS), validada
  localmente (`supabase db reset` + smoke tests manuais via `psql`/Docker), **ainda não
  aplicada a nenhum banco remoto** — `supabase db push` é decisão humana/orchestrator, gate
  completo do `cyber_chief` obrigatório antes (diferente da migration anterior de catálogos,
  esta tem `fazenda_id`/dados sensíveis reais).
- **Escopo:** exclusivamente
  `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql` — tabelas `gtas`,
  `transacoes`, `transacoes_detalhe`, `transacoes_animais`. Nenhuma tabela de fase anterior
  tocada. `transacoes_animais` implementa **integralmente** o ADR-0004 (D1-D6), sem reabrir
  nenhuma decisão.

## O que foi lido antes da modelagem

1. `especificacao-sistema.md`, seção 3.2 (schema fechado de `gtas`/`transacoes`/
   `transacoes_detalhe`, sem ambiguidade a resolver) e seção 5.4 (fronteira de acesso do papel
   `financeiro`: "sem acesso a... GTAs, edição de transações").
2. `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md` — schema e mecanismo completos
   de `transacoes_animais` (D1-D6), incluindo a "nota de dependência" que o ADR deixou em
   aberto para esta tarefa decidir: a RLS de `transacoes`/`transacoes_detalhe` para o papel
   `financeiro`.
3. `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` e
   `20260716183000_adr0002_convites_papeis.sql` — padrões já revisados pelo `cyber_chief`
   (`search_path = ''`, `trigger_set_updated_at()` reaproveitado, RLS com papel explícito,
   mensagens de erro genéricas, `prevent_fazenda_id_change()` reaproveitado).
4. `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql` — migration anterior
   da mesma fase, para manter consistência de estilo e decidir onde DIVERGIR dela
   conscientemente (ver decisão 3 abaixo).

## O que foi feito

Migration única, aditiva sobre as 4 migrations anteriores:

1. **Referência circular `gtas.transacao_id` ↔ `transacoes.gta_id`** — resolvida por ordem de
   criação: `transacoes` criada primeiro com `gta_id` como coluna simples (sem FK, que aponta
   para frente); `gtas` criada em seguida já com a FK completa para `transacoes`; por fim
   `ALTER TABLE transacoes ADD CONSTRAINT transacoes_gta_id_fkey` fecha o lado que faltava.
2. **Integridade cruzada `gtas`↔`transacoes`** — além da FK, dois triggers `BEFORE INSERT OR
   UPDATE` novos (`validar_gta_transacao_mesma_fazenda()` em `gtas`,
   `validar_transacao_gta_mesma_fazenda()` em `transacoes`) garantem que o vínculo bidirecional,
   quando preenchido, só liga registros da MESMA `fazenda_id` — mesma classe de proteção que
   `validar_lote_mesma_fazenda()` (Fase 2) já aplica a `animais.lote_id`. Não fazia parte da
   spec nem do ADR-0004 (que só cobre `transacoes_animais`) — decisão própria desta migration,
   pelo mesmo princípio de integridade referencial que motivou D4 do ADR-0004.
3. **`especie_id`/`agrupamento_etario_id` usam `on delete restrict`, não `cascade`** —
   divergência deliberada do padrão da migration anterior (`agrupamentos_etarios.especie_id
   on delete cascade`). Lá é catálogo→catálogo (aceitável cascatear). Aqui é catálogo→dado
   transacional real (GTA/transação/detalhe têm valor regulatório/fiscal) — cascatear a exclusão
   de uma espécie do catálogo até apagar histórico de transações do produtor seria destrutivo e
   silencioso, mesmo sendo hoje um cenário improvável (`especies` só é escrita via migration).
4. **`transacoes_animais`** — implementado literalmente conforme ADR-0004 D1-D6: coluna
   `tipo_operacao_transacao` denormalizada e imutável (D1); trigger `BEFORE INSERT`
   (`preparar_vinculo_transacao_animal()`) valida cross-fazenda e popula a denormalização (D2 +
   D4); trigger `AFTER INSERT` (`aplicar_status_animal_apos_vinculo()`) aplica
   `animais.status = 'venda'` só quando `tipo_operacao_transacao = 'venda'` (D2); trigger
   `AFTER DELETE` (`reverter_status_animal_apos_desvinculo()`) reverte com as duas guardas de D5
   (idempotência: só se `status` ainda for `'venda'`; coexistência: só se não houver outro
   vínculo de venda remanescente); todos os três `SECURITY INVOKER`, sem elevação de privilégio
   (D2); sem trava de revenda (D6, deliberado). `unique(transacao_id, animal_id)` é decisão
   própria desta migration (dedup óbvia, não parte do ADR).
5. **RLS — três fronteiras distintas para `financeiro` na mesma migration:**
   - `gtas`: **zero acesso** (nem SELECT) — spec 5.4 lista GTAs explicitamente na lista de "sem
     acesso".
   - `transacoes`/`transacoes_detalhe`: **SELECT permitido**, **zero INSERT/UPDATE/DELETE** —
     decisão que fecha a "nota de dependência" do ADR-0004 (D3), exatamente na direção que o
     ADR já antecipava como a mais consistente com a spec 5.4 ("edição de transações" negada,
     não a leitura).
   - `transacoes_animais`: **zero acesso** (nem SELECT) — ADR-0004 D3, implementado sem desvio.
6. **Sem policy de DELETE** em `gtas` (pedido explícito da tarefa), `transacoes` e
   `transacoes_detalhe` (decisão desta migration, por consistência e porque um DELETE de
   `transacoes` teria efeito em cascata sobre `transacoes_animais` — reversão automática de
   `animais.status` — efeito colateral grande demais para expor sem um fluxo de confirmação
   dedicado, fora do escopo aqui). `transacoes_animais` TEM policy de DELETE (decisão já
   fechada pelo ADR-0004 D3/D5, não desta migration).

## Validação real executada (local, não remota)

- `supabase db reset` (stack local Docker já em execução) aplicou as 5 migrations do zero sem
  nenhum erro de sintaxe/constraint.
- `pg_policies` confirmou as 12 policies esperadas (3 em `gtas`, 3 em `transacoes`, 3 em
  `transacoes_detalhe`, 3 em `transacoes_animais` — SELECT/INSERT/DELETE, sem UPDATE).
- **Smoke test funcional manual** (script `do $$ ... $$` via `docker exec`, sempre com
  `rollback` no final, nenhum dado de teste deixado no banco):
  1. Referência circular gtas↔transacoes: cria transação, depois GTA vinculada a ela, depois
     liga a transação de volta na GTA — OK.
  2. `validar_gta_transacao_mesma_fazenda()` rejeita GTA de fazenda A apontando para transação
     de fazenda B — OK.
  3. `preparar_vinculo_transacao_animal()` + `aplicar_status_animal_apos_vinculo()`: vincular
     animal a transação de venda aplica `status = 'venda'` — OK.
  4. `reverter_status_animal_apos_desvinculo()`: `DELETE` do vínculo reverte `status = 'ativo'`
     — OK.
  5. Guarda de coexistência (D5/D6): dois vínculos de venda para o mesmo animal, deletar um não
     reverte o status enquanto o outro existir; deletar o último reverte — OK.
  6. `preparar_vinculo_transacao_animal()` rejeita vínculo cross-fazenda em `transacoes_animais`
     — OK.
  7. `numero_gta` repetido entre fazendas diferentes é aceito; duplicado na MESMA fazenda é
     rejeitado (`unique(fazenda_id, numero_gta)`) — OK.
  8. **Teste extra de cascata** (cenário que a justificativa D1 do ADR-0004 antecipa
     explicitamente): `DELETE` direto na `transacoes` PAI cascateia para `transacoes_animais`
     (`on delete cascade`) e dispara `reverter_status_animal_apos_desvinculo()` sem erro de
     ordenação — a denormalização de `tipo_operacao_transacao` funciona exatamente como o D1 do
     ADR previu, mesmo quando `transacoes` já não existe mais no momento em que o trigger
     `AFTER DELETE` roda. `status` reverte corretamente para `'ativo'`.
- **Não executado** (fora do escopo desta tarefa, fica para `qa`): suíte pgTAP formal com
  `set_config('request.jwt.claims', ...)` simulando sessões `authenticated` reais (o smoke test
  acima rodou como superuser, bypassando RLS deliberadamente — validou os TRIGGERS, não as
  POLICIES em si, que já foram confirmadas por inspeção de `pg_policies`); `supabase db push`
  para o remoto (decisão humana/orchestrator).

## Mudanças de arquivo

- Novo `supabase/migrations/20260720133000_fase3_gtas_transacoes.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, mais atualização das seções 1 e 4.

## Pendências / próximos passos

- **Gate obrigatório do `cyber_chief`** antes de `supabase db push` — atenção especial pedida a:
  1. A fronteira de `financeiro` em TRÊS tabelas com regras DISTINTAS na mesma migration —
     `gtas` (zero), `transacoes`/`transacoes_detalhe` (SELECT only), `transacoes_animais`
     (zero) — maior risco de erro de cópia-e-cola entre policies do que nas migrations
     anteriores (onde a regra era uniforme nas 3 tabelas).
  2. Confirmar que `transacoes_animais` implementa o ADR-0004 sem nenhum desvio (comparação
     linha a linha com D1-D6 recomendada).
  3. A decisão própria desta migration de `on delete restrict` em `especie_id`/
     `agrupamento_etario_id` (divergência deliberada do `on delete cascade` da migration
     anterior) — confirmar que o raciocínio catálogo-vs-transacional é sólido.
  4. Os dois triggers novos de integridade cruzada `gtas`↔`transacoes` (não pedidos
     explicitamente pela spec/ADR, adicionados por iniciativa própria seguindo o princípio de
     integridade referencial) — confirmar que não introduzem nenhuma regressão de UX (ex.: um
     fluxo legítimo de "criar GTA e transação em passos separados, depois linkar" continua
     funcionando, só bloqueia o caso cross-fazenda).
  5. Ausência de policy de DELETE em `transacoes`/`gtas`/`transacoes_detalhe` — decisão própria
     desta migration, não pedida explicitamente pela spec para `transacoes` (a tarefa deixou em
     aberto), vale confirmar que a justificativa (efeito colateral em cascata sobre
     `transacoes_animais`) é suficiente.
- Depois do gate: saldo de rebanho (view), `lancamentos_financeiros`, `declaracoes_rebanho`,
  `prazos_declaracao_estado`, buckets de Storage (`gtas-documentos`, `declaracoes-rebanho`) —
  itens seguintes da mesma fase, não iniciados aqui.
- `supabase db push` não executado — decisão humana/orchestrator, fora do escopo desta tarefa.
