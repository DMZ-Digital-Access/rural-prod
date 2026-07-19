# Log — Testes pgTAP da Fase 2 (Eixo 1: GMD/pesagens/RLS) — `qa` (Emma)

- **Data:** 2026-07-19
- **Agente responsável:** qa (Emma) — mesmo padrão de rigor da suíte de RLS/RPC da Fase 1/ADR-0002
  (`.agents/memory/log/2026-07-17-qa-testes-fase1-adr0002.md`).
- **Tipo de tarefa:** escrita e **execução real** (não descrição) de testes pgTAP contra o schema
  da Fase 2 (`lotes`/`animais`/`pesagens`), aplicado ao Supabase local via `supabase db reset`.
- **Escopo:** fórmula de GMD (o item mais importante da tarefa, spec seção 9 item 2), regra de
  correção de pesagem (spec seção 4.1), e regressão dos 3 achados do gate `cyber_chief`
  (`.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`).

## O que foi lido antes de escrever qualquer teste

1. `especificacao-sistema.md`, seção 9 item 2 — o débito técnico: GMD do protótipo era média
   simples acumulada (errada); fórmula correta `(peso_atual - peso_inicial) / dias_totais`.
2. `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` linha a linha —
   especialmente `atualizar_animal_apos_pesagem()` (seção 5.1, `dias_totais` usa
   `animais.created_at::date`, não `data_nascimento`; `dias_totais <= 0` → `gmd_medio_kg = NULL`)
   e `registrar_pesagem()` (seção 5.2, regra `abs(data_evento - última) <= 2` dias = UPDATE,
   senão INSERT).
3. `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md` — os 3 achados corrigidos: (1)
   RLS/`registrar_pesagem()` não excluíam `papel='financeiro'`; (2) `inicializar_peso_atual_animal()`
   só protegia contra UPDATE, não INSERT; (3) oráculo de mensagens de erro em `registrar_pesagem()`.
4. `supabase/tests/database/001` a `006` (suíte pgTAP da Fase 1/ADR-0002, escrita por mim mesma)
   — convenção de arquivo (`NNN_descricao.sql`, `begin;...rollback;`, fixtures via `auth.users`
   disparando `handle_new_user()`, sessão simulada via `set_config('request.jwt.claims', ...)` +
   `set local role authenticated`).

## Ambiente

Stack Supabase local já estava rodando (containers de uma tarefa anterior, `docker ps` confirmou
saudável), mas SEM a migration da Fase 2 aplicada. Rodei `supabase db reset` (CLI 2.26.9) — as 3
migrations (`20260716171522`, `20260716183000`, `20260717140000`) foram reaplicadas do zero num
Postgres limpo, sem erro. Não precisei repetir `supabase start -x storage-api -x imgproxy
-x logflare -x vector` porque os containers já estavam de pé com essas exclusões de uma sessão
anterior (`db reset` só reinicia o container do Postgres/dependentes, não recria o `docker compose`
inteiro) — nenhum dos testes desta rodada depende de Storage/Analytics de qualquer forma.

## Testes escritos (continuando a numeração a partir de 007)

1. **`007_gmd_formula_calculo.sql`** (plan 9) — o teste mais importante da rodada:
   - Caso feliz: animal registrado 17 dias atrás, `peso_inicial_kg=220.500`, pesagem de
     `255.750` hoje → `gmd_medio_kg` comparado contra `round((255.750-220.500)/17, 4)`
     calculado na própria query SQL (não um número decorado à mão) — mesma fórmula, não
     reimplementada. Também confirma `peso_atual_kg`/`ultima_pesagem_data` atualizados.
   - **Regressão do bug do protótipo (múltiplas pesagens):** animal registrado 40 dias atrás,
     `peso_inicial=300`. Três pesagens em sequência com variações NÃO uniformes (inclusive uma
     queda de peso no meio: +100kg/10dias, depois -50kg/10dias, depois +30kg/20dias). Depois de
     CADA pesagem, o GMD é comparado contra `(peso_mais_recente - peso_inicial) / dias_desde_criação`
     — a pesagem intermediária B (queda de -50kg) prova que o GMD **ignora completamente** a
     pesagem anterior A (+100kg): se o bug de "média simples acumulada das variações sucessivas"
     tivesse voltado, o GMD depois de B carregaria a mistura das duas variações, o que não
     acontece. Final: GMD = (380-300)/40 = 2.0000, dependente só de peso_inicial + pesagem mais
     recente.
   - `dias_totais = 0` (pesagem no mesmo dia do registro do animal): `lives_ok` confirma que não
     lança exceção, `gmd_medio_kg` vira `NULL` (não erro, não `0`), `peso_atual_kg` ainda atualiza
     normalmente.

2. **`008_registrar_pesagem_regra_correcao.sql`** (plan 12) — regra `abs(data_evento - última) <= 2`
   dias:
   - Passo 1: primeira pesagem sempre INSERT.
   - Passo 2 (1 dia de distância): `registrar_pesagem()` retorna o MESMO `id`; `pesagens` continua
     com 1 linha; `data_evento`/`peso_kg` do registro existente são sobrescritos; GMD recalcula em
     cima do valor CORRIGIDO (não do valor antigo).
   - Passo 3 (6 dias de distância, fora da janela): `id` DIFERENTE, `pesagens` ganha uma 2ª linha,
     GMD baseado na nova pesagem mais recente.
   - Passo 4 (exatamente 2 dias — limite inclusivo do `<=`): confirmado que ainda é UPDATE (mesmo
     `id` da pesagem 3, `pesagens` continua com 2 linhas) — cobre o limite exato da regra, não só
     os casos "claramente dentro"/"claramente fora".

3. **`009_rls_regressao_papel_financeiro.sql`** (plan 7) — regressão achado nº1 do gate: usuário
   com `papel='financeiro'` vinculado à fazenda-alvo (que já tem lote/animal/pesagem reais
   cadastrados por um admin) tenta SELECT em `lotes`/`animais`/`pesagens` (retorna vazio, não
   erro), INSERT em `lotes`/`animais` (falha `42501`), UPDATE em um lote existente (0 linhas
   afetadas, RLS filtra silenciosamente), e `registrar_pesagem()` (rejeitada com a mensagem
   genérica unificada do achado nº3).

4. **`010_animais_insert_campos_calculados_regressao.sql`** (plan 4) — regressão achado nº2:
   INSERT em `animais` com `peso_atual_kg=999`/`gmd_medio_kg=5.5`/`ultima_pesagem_data='2020-01-01'`
   explícitos não lança erro (`lives_ok` — não é checagem de permissão), mas os 3 campos nascem
   sobrescritos (`peso_atual_kg=peso_inicial_kg`, os outros dois `NULL`), confirmando que
   `inicializar_peso_atual_animal()` ignora incondicionalmente o que o client tentou inserir.

5. **`011_vazamento_entre_fazendas_lotes_animais.sql`** (plan 6) — vazamento entre fazendas: admin
   de uma fazenda B não enxerga (SELECT vazio) lote/animal da fazenda A, não consegue INSERT direto
   de animal sob `fazenda_id=A` (`42501`), e nenhum dos dois admins consegue associar (`UPDATE
   lote_id`) um animal da própria fazenda a um lote da OUTRA fazenda — `validar_lote_mesma_fazenda()`
   rejeita nas duas direções (A→B e B→A), com o `lote_id` do animal permanecendo inalterado depois
   da tentativa bloqueada.

## Resultado da execução real

```
supabase test db
./database/001_rls_insert_default_deny.sql ..................... ok
./database/002_rls_update_colunas_imutaveis.sql ................ ok
./database/003_rls_usuarios_fazendas_sem_update.sql ............ ok
./database/004_aceitar_convite_regressao_null_email.sql ........ ok
./database/005_handle_new_user_regressao_null_email.sql ........ ok
./database/006_promover_papel_guarda_sequencial.sql ............ ok
./database/007_gmd_formula_calculo.sql ......................... ok
./database/008_registrar_pesagem_regra_correcao.sql ............ ok
./database/009_rls_regressao_papel_financeiro.sql .............. ok
./database/010_animais_insert_campos_calculados_regressao.sql .. ok
./database/011_vazamento_entre_fazendas_lotes_animais.sql ...... ok
Files=11, Tests=63,  1 wallclock secs
Result: PASS
```

**63/63 asserções passaram** (25 pré-existentes da Fase 1/ADR-0002 + **38 novas desta rodada**:
9+12+7+4+6). Suíte completa rodada DUAS vezes em sequência (não só uma) para confirmar ausência de
flakiness — resultado idêntico nas duas execuções.

## Achados de tooling durante a escrita (não são achados de produto/segurança)

- `INSERT ... RETURNING` não pode ser usado como subquery direta em `FROM` (`from (insert ...) x`)
  — só é válido dentro de uma CTE (`with ins as (insert ... returning ...) select ... from ins`).
  Corrigido nos 3 pontos do arquivo 007 onde eu tinha escrito errado na primeira versão.
- Uma `WITH` com statement de escrita (`update ... returning`) não pode estar aninhada dentro de
  uma subquery escalar passada como argumento de `is()` — precisa estar no nível mais externo do
  próprio comando (`with upd as (update ...) select is((select count(*) from upd), 0, ...)`).
  Corrigido no arquivo 009 (teste de UPDATE-sem-efeito do financeiro).
- Como os testes escrevem em `t_ids` (temp table) DEPOIS de assumir a sessão `authenticated` (não
  só antes, diferente da convenção anterior onde os ids eram todos capturados como postgres antes
  de trocar de role), precisei `grant select, insert` (não só `select`) em todos os arquivos novos.

## O que NÃO foi testado (honestidade de cobertura)

- `lotes_com_estatisticas`/`animais_com_detalhes` (as duas views) não têm teste pgTAP dedicado
  nesta rodada — os testes escritos validam as tabelas base diretamente. As views foram revisadas
  linha a linha pelo `cyber_chief` (`security_invoker=true`) e são consultas simples sem lógica de
  negócio nova além de agregação/categoria; risco residual baixo, mas é uma lacuna de cobertura
  real, não uma alegação de "testado".
- `calcular_categoria_animal()` (função pura de categorização) não tem teste unitário dedicado —
  fora do escopo desta tarefa (focada em GMD/correção/regressões de segurança), mas é uma lacuna
  barata de fechar numa próxima rodada.
- Teste de concorrência real (duas sessões `psql` simultâneas) para `registrar_pesagem()` — o
  `for update` na linha do animal foi revisado pelo `cyber_chief` e é o mesmo padrão já testado
  com concorrência real para `promover_papel()` na Fase 1
  (`supabase/tests/manual/promover_papel-concorrencia.ps1`), mas não repeti esse teste
  especificamente para `registrar_pesagem()` nesta rodada — pendência não bloqueante.
- Nenhum teste de UI/frontend nesta rodada (fora do escopo desta tarefa, que era especificamente
  pgTAP/banco).

## Mudanças de arquivo

- Novos `supabase/tests/database/007_gmd_formula_calculo.sql` a
  `011_vazamento_entre_fazendas_lotes_animais.sql`.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, seção 1 e seção 4
  atualizadas (pendência "GMD/RLS da Fase 2 não testado" removida — testada e passando).

## Nota de processo (regra do próprio agente)

Este teste NÃO aprova a Fase 2 para produção — só confirma, com execução real, que a fórmula de
GMD, a regra de correção de pesagem e as 3 correções do gate de segurança se comportam como
documentado no schema. Decisão de aprovação continua sendo do usuário.
