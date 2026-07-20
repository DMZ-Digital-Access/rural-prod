# Log — Schema da Fase 3, item 10 (Eixo 2: catálogos especies/subtipos/agrupamentos_etarios) — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — modelagem de banco da Fase 3, spec seção 10, item
  10 (SOMENTE este item — GTAs/transações/saldo/financeiro/storage são tarefas seguintes da
  mesma fase, fora do escopo aqui).
- **Tipo de tarefa:** Migration SQL nova (schema + seed + índices + RLS), validada localmente
  (`supabase db reset`), ainda **não aplicada a nenhum banco remoto** — `supabase db push` é
  decisão humana/orchestrator, fora do escopo desta tarefa.
- **Escopo:** exclusivamente
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql` — tabelas `especies`,
  `subtipos_especie`, `agrupamentos_etarios`. Nenhuma tabela de fase anterior tocada. Nenhuma
  tabela de Eixo 2 além destas 3 (gtas/transacoes/transacoes_detalhe/transacoes_animais/
  lancamentos_financeiros/declaracoes_rebanho/prazos_declaracao_estado) implementada.

## O que foi lido antes da modelagem

1. `especificacao-sistema.md`, seção 3.2 completa (schema + seed definitivo de
   `especies`/`subtipos_especie`/`agrupamentos_etarios`, já com as 5 pendências originais
   resolvidas em 2026-07-16) e seção 4.2 (motivo do `unidade_idade` configurável por espécie).
2. `.agents/memory/PROJECT_CONTEXT.md` seção 2 (linha das decisões de 2026-07-16 sobre Muares/
   Aves/Suíno/faixas etárias) e seção 4 (pendência residual: subtipos de Aves além de Frango de
   Corte seguem sem faixa, não é bloqueio).
3. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — padrões a repetir:
   `trigger_set_updated_at()` reaproveitado, `search_path = ''` (não se aplicou aqui — nenhuma
   função nova nesta migration, só tabelas/seed/RLS), CHECK sobre `text` em vez de enum,
   comentários SQL extensos, RLS default-deny para escrita.

## O que foi feito

Migration única, aditiva sobre as 3 migrations anteriores:

1. **Tabelas** `especies`, `subtipos_especie`, `agrupamentos_etarios` — SEM `fazenda_id`
   (catálogo de referência global, não multi-tenant — primeira vez neste projeto que uma tabela
   não é escopada por fazenda). Campos exatamente conforme spec seção 3.2.
2. **Integridade subtipo↔espécie via FK composta**, não trigger: `subtipos_especie` ganha
   `unique (id, especie_id)`; `agrupamentos_etarios` referencia
   `(subtipo_especie_id, especie_id) → subtipos_especie(id, especie_id)`. MATCH SIMPLE (default
   do Postgres) não verifica a FK quando `subtipo_especie_id` é NULL — caso normal para
   Bovino/Suíno/Equino/Ovino/Caprino.
3. **Unicidade de `ordem` por grupo** via 2 índices únicos parciais (não 1 UNIQUE simples) —
   NULL não é igual a NULL em UNIQUE do Postgres, um UNIQUE simples sobre
   `(especie_id, subtipo_especie_id, ordem)` não impediria `ordem` duplicado entre linhas de uma
   mesma espécie sem subtipo.
4. **Índice `(especie_id, subtipo_especie_id, ordem)`** cobrindo a consulta principal do módulo
   de Saldo de Rebanho ("todas as faixas de uma espécie/subtipo, em ordem").
5. **Seed completo** — 8 espécies, 9 subtipos, 24 faixas etárias, transcrição literal da spec
   (contagem confirmada por query real após `supabase db reset` local, ver seção de validação
   abaixo).
6. **RLS** — SELECT aberto para qualquer `authenticated` (sem filtro de fazenda, sem filtro de
   papel), zero policy de INSERT/UPDATE/DELETE (default-deny, escrita só via migration/seed).
   Decisão detalhada na seção seguinte.

## Decisão de RLS (resumo — justificativa completa no cabeçalho do SQL, seção 4)

**Quem lê:** qualquer usuário autenticado, sem restrição de fazenda (as 3 tabelas não têm
`fazenda_id` — não há tenant a isolar) e **sem restrição de papel** — diferente de
`lotes`/`animais`/`pesagens` (Fase 2), onde `papel='financeiro'` é bloqueado por ser dado de
manejo individual de Eixo 1 (spec seção 5.4). Aqui não se aplica: este catálogo também
alimenta os módulos de Eixo 2 (GTA/Transações/Financeiro), aos quais `financeiro` explicitamente
TEM acesso — restringir a leitura por papel quebraria os próprios formulários que esse papel
precisa usar (ex.: seletor de espécie de um lançamento financeiro).

**Quem escreve:** ninguém via client. Mesmo padrão default-deny do ADR-0001/ADR-0002 —
`especies`/`subtipos_especie`/`agrupamentos_etarios` são administradas pelo squad via
migration, nunca pela UI do usuário final. Justificativa adicional específica deste caso: o
cadastro de espécies/faixas etárias é regulatório (precisa bater com a nomenclatura do órgão
estadual), não é uma decisão de produto que caiba ao produtor individual alterar.

## Confirmação do seed (contagem real, via `supabase db reset` local + query)

- `especies`: **8** linhas — Bovinos, Suínos, Aves, Equinos, Muares, Ovinos, Caprinos, Abelhas
  (ordem e nomes exatamente como a spec lista o "escopo completo definido pelo cliente").
- `subtipos_especie`: **9** linhas — Aves (Frango de Corte, Matriz, Galinha Poedeira, Peru,
  Codorna, Avestruz — 6), Muares (**Mula/Burro/Jumento, subtipo único** — 1), Abelhas (Apis
  mellifera, Abelhas Nativas Sem Ferrão — 2).
- `agrupamentos_etarios`: **24** linhas — Bovino (4) + Equino (2) + Ovino (2) + Caprino (4) +
  Muar (4, mesmas faixas de Bovino) + Suíno (4, dias) + Aves-Frango de Corte (4, semanas).
  Abelhas e os 5 demais subtipos de Aves **corretamente sem linha** (deliberado, não lacuna —
  ver decisão 6 do cabeçalho do SQL).

## Duas decisões de transcrição que merecem atenção do `cyber_chief`/próximos agentes

1. **Muares — subtipo único "Mula/Burro/Jumento".** A redação da spec seção 3.2 ("Muares: Mula,
   Burro/Jumento (subtipo único...)") é ambígua — poderia ser lida como 2 subtipos ("Mula" e
   "Burro/Jumento") ou 1. Segui a instrução explícita e mais específica desta tarefa
   ("subtipo ÚNICO Mula/Burro/Jumento — confirmado, não separar"): **uma única linha**. Se essa
   leitura estiver errada, é uma migration pequena para corrigir (spec seção 3.2 pode precisar
   de uma nota de esclarecimento também).
2. **Limites sobrepostos de Suíno e Aves-Frango de Corte, transcritos literalmente.** A spec dá
   essas duas faixas com limites que se repetem entre linhas adjacentes (Suíno: 0–30 · 30–70 ·
   70–150 · Mais de 180 — note o **hiato não coberto de 151–179 dias**, a spec pula de "70–150"
   direto para "Mais de 180", não "Mais de 150"; Aves-Frango: 0–1 · 1–6 · 6–8 · Mais de 8, com a
   mesma sobreposição de borda). Isso é DIFERENTE do padrão sem sobreposição usado pelas faixas
   em "meses" (onde a própria spec já escreve 13 depois de 12, não 12 de novo). Transcrevi
   exatamente os números da spec, sem "corrigir" nada — não é erro desta migration, é
   característica do dado de origem (cliente). Fica registrado para quem implementar a função
   de classificação idade→faixa no futuro (`transacoes_detalhe`, fora do escopo desta tarefa):
   precisa decidir o operador de comparação (`>=`/`<`, `>=`/`<=`) e o que fazer com o hiato do
   Suíno — não é decisão de banco, é lógica de classificação a ser escrita depois.

## Validação real executada (local, não remota)

- `supabase db reset` (stack local já em execução) aplicou as 4 migrations do zero
  (`20260716171522`, `20260716183000`, `20260717140000`, `20260720120000`) sem nenhum erro de
  sintaxe/constraint — a nova migration desta tarefa correu limpa.
- Query de contagem confirmou 8/9/24 linhas exatamente como o desenho previa (ver seção acima).
- Query com JOIN completo (`agrupamentos_etarios` × `especies` × `subtipos_especie`, ordenado
  por espécie/ordem) inspecionada linha a linha — confirma que a FK composta associou
  corretamente `subtipo_especie_id` a "Mula/Burro/Jumento" (Muares) e "Frango de Corte" (Aves),
  e que as demais espécies ficaram com `subtipo` NULL.
- `pg_tables`/`pg_policies` confirmaram RLS habilitada nas 3 tabelas com apenas 1 policy de
  SELECT cada (`to authenticated`), zero policy de INSERT/UPDATE/DELETE — default-deny de
  escrita confirmado por inspeção direta do catálogo do Postgres, não só por leitura do SQL.
- **Não executado** (fora do escopo desta tarefa, fica para `qa`): teste pgTAP formal (ex.:
  "INSERT direto do client autenticado falha", "SELECT funciona para qualquer papel incluindo
  financeiro"); `supabase db push` para o remoto (decisão humana/orchestrator).

## Mudanças de arquivo

- Novo `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, mais atualização das seções 1 e 4.

## Pendências / próximos passos

- Gate obrigatório do `cyber_chief` antes de `supabase db push` — atenção especial pedida a:
  (1) a decisão de RLS "leitura aberta a qualquer authenticated, sem filtro de papel" — confirmar
  que não há um ângulo de exposição de dado que eu não tenha considerado (a tabela não parece
  carregar nada sensível, mas vale o segundo par de olhos, mesmo padrão de rigor das fases
  anteriores); (2) a FK composta com MATCH SIMPLE — confirmar que o comportamento "não valida
  quando subtipo_especie_id é NULL" é o entendimento correto e não abre uma janela de
  inconsistência não percebida; (3) as duas decisões de transcrição documentadas acima (Muares
  subtipo único; limites sobrepostos de Suíno/Aves).
- Depois do gate: itens 11-14 da mesma fase (`gtas`, `transacoes` + `transacoes_detalhe` +
  `transacoes_animais`, saldo de rebanho, financeiro, declarações, storage) — tarefas seguintes,
  não iniciadas aqui.
- `supabase db push` não executado — decisão humana/orchestrator, fora do escopo desta tarefa.
