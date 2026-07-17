# Log — Schema da Fase 2 (Eixo 1: lotes/animais/pesagens) — `db_sage` (SOFIA)

- **Data:** 2026-07-17
- **Agente responsável:** db_sage (SOFIA) — modelagem de banco da Fase 2, spec seção 10,
  itens 8-9.
- **Tipo de tarefa:** Migration SQL nova (schema + views + funções + RLS), ainda não aplicada
  a nenhum banco.
- **Escopo:** exclusivamente
  `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` — tabelas `lotes`,
  `animais`, `pesagens`. Nenhuma tabela da Fase 1 (`usuarios`/`fazendas`/`usuarios_fazendas`/
  `convites`) tocada. Nenhum item de Eixo 2 (GTAs/transações/saldo) implementado.

## O que foi lido antes da modelagem

1. `especificacao-sistema.md`, seções 3.1 (schema do MVP), 4.1 (regras de negócio já
   validadas) e 9, item 2 (débito técnico da fórmula de GMD).
2. `supabase/migrations/20260716171522_fase1_usuarios_fazendas.sql` — padrões a repetir:
   `trigger_set_updated_at()` reaproveitado, `search_path = ''`, RLS explícita, comentários SQL
   extensos, CHECK sobre `text` em vez de enum.
3. `supabase/migrations/20260716183000_adr0002_convites_papeis.sql` — padrão de "escrita
   exclusivamente via função SECURITY DEFINER, zero policy declarativa de INSERT/UPDATE" usado
   para dados sensíveis de autorização (`usuarios_fazendas`/`convites`); generalizei o mesmo
   padrão para `pesagens` (não é dado de autorização, mas tem uma regra de decisão
   pré-comando que RLS declarativa não expressa).
4. `.agents/memory/log/2026-07-16-cyber_chief-review-fase1.md` — padrão de rigor esperado:
   guardas de imutabilidade de coluna via trigger (RLS não escopa coluna), atenção a IDOR
   cross-tenant.

## O que foi feito

Migration única, aditiva sobre as duas migrations da Fase 1, com:

1. **Tabelas** `lotes`, `animais`, `pesagens` — campos conforme spec seção 3.1, com FKs,
   índices em toda FK, `trigger_set_updated_at()` em `lotes`/`animais` (não em `pesagens` —
   decisão documentada no próprio arquivo). Adições de modelagem não explícitas na spec, mas
   decisão desta migration: `unique (fazenda_id, identificacao)` em `animais`; CHECKs de
   domínio (`sexo`, `status`, pesos > 0, datas não-futuras, `data_fim >= data_inicio`).

2. **Categorização automática** — `public.calcular_categoria_animal(idade_meses integer, sexo
   text) returns text`, `language sql immutable`. Recebe idade JÁ CALCULADA (não
   `data_nascimento`), para ser genuinamente pura — quem depende de `current_date` fica isolado
   na view. Único lugar onde a regra de faixas etárias vive.

3. **View `animais_com_detalhes`** — idade (dias e meses), categoria, `ganho_total_kg`,
   `numero_pesagens` (subquery agregada, não correlacionada linha a linha).

4. **View `lotes_com_estatisticas`** — `numero_animais_total` (histórico, qualquer status),
   `numero_animais_ativos`/`peso_total_kg`/`peso_medio_kg`/`gmd_medio_kg` (só `status='ativo'
   AND ativo=true`, via `FILTER (WHERE ...)` num único `GROUP BY`).

5. **`public.registrar_pesagem(p_animal_id, p_data_evento, p_peso_kg) RETURNS uuid`** —
   `SECURITY DEFINER`, autorização checada explicitamente no corpo (padrão ADR-0002), `SELECT
   ... FOR UPDATE` no animal para serializar chamadas concorrentes (mesma classe de corrida já
   fechada em `promover_papel()`). Decide UPDATE (correção, ≤ 2 dias) vs. INSERT (novo
   histórico); delega o recálculo de `animais` ao trigger `atualizar_animal_apos_pesagem()`
   (AFTER INSERT OR UPDATE ON pesagens) — não duplica a fórmula de GMD dentro da própria RPC.

6. **RLS** nas 3 tabelas — `lotes`/`animais` com policies declarativas normais de
   SELECT/INSERT/UPDATE escopadas por `fazenda_id IN (usuarios_fazendas do chamador)`;
   `pesagens` com **só SELECT declarativo**, zero INSERT/UPDATE/DELETE — toda escrita
   exclusivamente via `registrar_pesagem()`.

## Decisões de design (resumo — detalhe completo no cabeçalho do arquivo SQL)

- **Mecanismo de escrita de `pesagens`:** função-only (nenhuma policy declarativa de
  INSERT/UPDATE), generalizando o padrão do ADR-0002. Motivo: a decisão "correção vs. novo
  registro" depende de um SELECT anterior ao comando SQL, e o recálculo de `animais` é regra de
  negócio, não side-effect opcional — um INSERT/UPDATE direto contornaria as duas.
- **Fonte de `dias_totais` no GMD:** `animais.created_at::date` (data de registro do animal no
  sistema), **não** `data_nascimento`. `peso_inicial_kg` é capturado na criação do animal, que
  pode já ser adulto — usar `data_nascimento` infla o denominador com anos anteriores ao
  acompanhamento, sub-relatando o GMD real do período medido. `dias_totais <= 0` →
  `gmd_medio_kg = NULL` (não erro, não `0` — `0` afirmaria "ganho confirmado zero", diferente de
  "dados insuficientes").
- **Métricas de `lotes_com_estatisticas`:** total histórico + (ativos, peso total, peso médio,
  GMD médio simples) só sobre animais `status='ativo' AND ativo`. GMD médio **não ponderado**
  por dias — mesmo trade-off "simples primeiro, otimizar depois" já usado pela spec para o
  saldo do Eixo 2.
- **Achado próprio, corrigido nesta mesma migration (não uma vulnerabilidade externa a
  reportar, mas um risco que eu mesma preveni ao modelar):** views sem `security_invoker = true`
  rodam com o privilégio de quem as criou (dono das tabelas, isento de RLS) — sem essa opção
  (Postgres 15+), `animais_com_detalhes`/`lotes_com_estatisticas` vazariam dados de TODAS as
  fazendas para qualquer usuário autenticado, um IDOR real apesar de RLS correta nas tabelas
  base. Ambas as views desta migration já nascem com `security_invoker = true`.
- **Dois achados de integridade que também tratei preventivamente (não pedidos explicitamente
  pela tarefa, mas dentro do princípio "vazamento entre fazendas é inaceitável" que a tarefa
  pediu para levar a sério):**
  1. `animais.lote_id` só pode apontar para um lote da MESMA `fazenda_id` (trigger
     `validar_lote_mesma_fazenda()`) — sem isso, um animal poderia poluir
     `lotes_com_estatisticas` de outra fazenda.
  2. `animais.peso_atual_kg`/`gmd_medio_kg`/`ultima_pesagem_data` são campos calculados; a
     policy de UPDATE de `animais` (escopada por `fazenda_id`, não por coluna — limitação do
     Postgres) permitiria ao próprio dono da fazenda falsificar esses valores via UPDATE direto,
     sem nunca ter registrado uma pesagem real. Bloqueado por trigger com uma flag de sessão
     local à transação (`rural_prod.recalculo_pesagem`), liberada só pelo próprio trigger de
     recálculo. Não é IDOR cross-tenant, é falsificação de dado dentro da própria fazenda —
     documentado como tal.

## Atenção especial pedida ao `cyber_chief` no próximo gate

1. **`security_invoker = true` nas duas views** — confirmar que a versão do Postgres do projeto
   Supabase (remoto) é 15+ e realmente honra essa opção; se por algum motivo não honrar, é o
   achado mais crítico possível desta migration (IDOR cross-tenant via view).
2. **A flag de sessão `rural_prod.recalculo_pesagem`** (guarda de `prevent_animais_campos_
   calculados_change()`) — mecanismo que não existia em nenhuma migration anterior deste
   projeto; vale revisão extra por ser um padrão novo (GUC local à transação como "flag de
   confiança"), incluindo se `is_local = true` realmente não escapa em cenários de connection
   pooling do Supabase (PgBouncer em modo transaction, que é o default do pooler gerenciado).
3. **`registrar_pesagem()` é `SECURITY DEFINER`** com autorização checada no corpo — mesmo
   padrão já aprovado no ADR-0002, mas nova instância, vale conferir a checagem
   `usuarios_fazendas` isoladamente.
4. **Ausência de restrição por `status` do animal em `registrar_pesagem()`** — a função permite
   registrar pesagem em animal com `status` `venda`/`morte`/`baixa` (não bloqueado
   deliberadamente, poderia ser usado para registrar peso final no momento da baixa) — decisão
   consciente de não restringir, mas vale confirmar se é o comportamento desejado antes de o
   `developer` construir a tela.
5. **`peso_inicial_kg` continua editável via `animais_update_vinculada`** sem re-disparar
   recálculo de GMD — se um usuário corrigir `peso_inicial_kg` depois de já existirem pesagens,
   `gmd_medio_kg` só é recalculado na PRÓXIMA pesagem, não imediatamente. Limitação conhecida,
   não implementada nesta migration (fora do pedido explícito da tarefa) — registrar como débito
   técnico menor se o produto exigir consistência imediata.

## Mudanças de arquivo

- Novo `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql`.
- Este log.
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, mais atualização das seções 1 e 4.

## Pendências / próximos passos

- Gate obrigatório do `cyber_chief` antes de `supabase db push` (ver atenção especial acima).
- Depois do gate: `developer` constrói as telas de Animais/Lotes (spec seção 10, item 9);
  `qa` escreve testes automatizados priorizando a fórmula de GMD e a regra de correção de
  pesagem (spec seção 9, item 5).
- `supabase db push` não executado — decisão humana/orchestrator, fora do escopo desta tarefa.
