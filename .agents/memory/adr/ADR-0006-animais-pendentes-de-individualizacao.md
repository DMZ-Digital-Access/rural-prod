[ADR-0006]
Título: Criação automática de registros individuais pendentes em `animais` a partir de
Entradas de Lote (Compra/Nascimento/Entrada de Pastoreio) — `data_nascimento`/`peso_inicial_kg`
nullable, identificação automática por operação
Data: 2026-07-20
Status: aceito

---

## [CONTEXTO]

O ADR-0005 (mesmo dia) deliberadamente manteve `nascimento` (e `compra`) fora do mecanismo de
`transacoes_animais` — a premissa era que animais entrados por lote não existem individualmente
no sistema até um cadastro manual posterior, sem vínculo automático de volta à transação de
origem.

JP revisou essa premissa: os animais que entram por lote (Compra/Nascimento/Entrada de
Pastoreio) devem aparecer **imediatamente** na lista de Animais, com identificação automática
(ex.: `COMPRA-2026-07-20-001`), marcados como pendentes de individualização, até o usuário
completar os dados reais (data de nascimento, peso) via "Individualizar Animal" — que passa a
ser uma **edição** de um registro já existente, não mais só uma criação do zero.

Confirmado explicitamente por JP nesta sessão:
1. Só as 3 operações de **entrada** (Compra/Nascimento/Entrada de Pastoreio) criam animais
   pendentes automaticamente. Venda/Óbito/Consumo/Saída de Pastoreio agem sobre animais **já
   existentes** (mecanismo de seleção de animal individual do ADR-0004/`transacoes_animais`,
   tela ainda não construída) — não criam registros novos.
2. `data_nascimento` e `peso_inicial_kg` (hoje `NOT NULL` em `animais`, Fase 2) ficam **vazios/
   nulos** no registro pendente, até "Individualizar Animal" completar.
3. Identificação automática: **prefixo do tipo de operação + data + sequencial**, formato
   `{TIPO}-{AAAA-MM-DD}-{NNN}` (ex.: `COMPRA-2026-07-20-001`, `COMPRA-2026-07-20-002`).

## [DECISÃO]

### D1 — `animais.data_nascimento` e `animais.peso_inicial_kg` viram NULLABLE

Ambas as colunas perdem o `NOT NULL` (mantendo os `CHECK`s existentes — `peso_inicial_kg > 0`
quando preenchido, `data_nascimento <= current_date` quando preenchida — reescritos para
`is null or ...`). Um animal é considerado **"pendente de individualização"** quando
`data_nascimento is null or peso_inicial_kg is null` — sem coluna de status nova (derivado, não
duplicado; os dois campos são preenchidos juntos pelo mesmo formulário de "Individualizar
Animal", então não há necessidade prática de um flag independente).

### D2 — `calcular_categoria_animal()` e `animais_com_detalhes` ficam NULL-safe

`idade_dias`/`idade_meses`/`ganho_total_kg` já propagam `NULL` automaticamente por aritmética
(Postgres: qualquer operação com `NULL` retorna `NULL`) quando `data_nascimento`/
`peso_inicial_kg` são nulos — **sem mudança necessária** nessas expressões. **Achado que exige
correção:** `calcular_categoria_animal(p_idade_meses, p_sexo)` tem uma função `CASE` cujas
condições (`p_idade_meses < 8`, `<= 24`) avaliam para `NULL` (nem verdadeiro nem falso) quando
`p_idade_meses` é `NULL` — o Postgres cai no `ELSE`, retornando incorretamente `'Boi'`/`'Vaca'`
(categoria de animal adulto) para um animal cuja idade é **desconhecida**, não necessariamente
adulta. A função ganha uma checagem explícita `when p_idade_meses is null then null` como
primeiro `when` do `CASE`, retornando `categoria = NULL` (exibido como "—"/"Pendente" no
frontend) em vez de uma categoria adulta fabricada.

### D3 — Identificação automática: `{TIPO}-{AAAA-MM-DD}-{NNN}`, sequencial por fazenda+tipo+data

Sequência calculada dentro da própria função de registro (D4), contando quantos `animais` já
existem para aquela `fazenda_id` com `identificacao` começando em `{TIPO}-{AAAA-MM-DD}-` e
continuando a partir daí — **não reinicia em `001` se uma segunda operação do mesmo tipo
acontecer no mesmo dia** (evita colisão com o `unique(fazenda_id, identificacao)` já existente).
`NNN` com 3 dígitos (`lpad(..., 3, '0')`); se uma única fazenda registrar mais de 999 animais do
mesmo tipo no mesmo dia (cenário não plausível no volume da spec, seção 6), a
`unique(fazenda_id, identificacao)` falha explicitamente — falha segura, não dado corrompido.

### D4 — `registrar_entrada_saida_lote()` (ADR-0005) estendida

Quando `p_tipo_operacao in ('compra', 'nascimento', 'entrada_pastoreio')`, a função, após criar
`transacoes`/`transacoes_detalhe` (inalterado), cria **N linhas em `animais`** (N =
`quantidade_machos + quantidade_femeas`) — uma por animal, com `sexo` correto (machos primeiro,
depois fêmeas), `identificacao` conforme D3, `data_nascimento`/`peso_inicial_kg` NULL,
`lote_id` NULL, `status = 'ativo'` (default já existente). Para os demais tipos de operação
(`venda`/`saida_pastoreio`/`obito`/`consumo`), **nenhuma linha de `animais` é criada** — o
comportamento already existente do ADR-0004 (seleção de animal já existente) permanece a
referência para quando essa tela for construída.

**Por que dentro da mesma função, não um trigger em `transacoes`/`transacoes_detalhe`:** a
criação de N animais depende diretamente de `quantidade_machos`/`quantidade_femeas`, que só
existem como parâmetros da chamada RPC, não como colunas persistidas em nenhuma tabela (a soma
vira `transacoes.quantidade_animais`, mas a quebra por sexo vira 1-2 linhas de
`transacoes_detalhe`, sem uma linha por ANIMAL individual) — um trigger teria que reconstruir
essa informação a partir de `transacoes_detalhe`, adicionando complexidade sem necessidade; a
função já tem os números certos em mãos no momento da chamada.

## [ALTERNATIVAS CONSIDERADAS]

**Para D1 (nullable vs. sentinela):**

Alternativa 1 (ESCOLHIDA) — `NULL` explícito nos dois campos até completar.

Alternativa 2 — Usar um valor sentinela (ex.: `data_nascimento = data_operacao`,
`peso_inicial_kg = peso_total_kg / quantidade` quando informado, ou `0`) — REJEITADA. Um valor
estimado que "parece" um dado real é mais perigoso que `NULL` explícito: um `peso_inicial_kg`
fabricado alimentaria cálculo de GMD com um número que ninguém mediu, sem nenhum sinal visual de
que é uma estimativa, não uma medição. `NULL` é honesto sobre o que ainda não se sabe — mesmo
princípio já usado no restante do schema (`peso_atual_kg`/`gmd_medio_kg` nulos até a primeira
pesagem real, Fase 2).

**Para D3 (identificação):**

Alternativa 1 — Sequencial simples por fazenda (`animal001`, `animal002`, ...) — REJEITADA por
JP (queria rastreabilidade de qual operação originou o animal).

Alternativa 2 (ESCOLHIDA) — Prefixo do tipo de operação + data + sequencial.

## [CONSEQUÊNCIAS]

**Positivas:**
- Fecha o ciclo Eixo 2 (aggregate) → Eixo 1 (individual) sem exigir um passo manual de "criar do
  zero" — o usuário só *completa* dados de um registro que já existe e já conta no saldo/nas
  listagens.
- `identificacao` rastreável à operação de origem, útil para auditoria/conferência.

**Negativas / trade-offs aceitos:**
- Reabre schema da Fase 2 (`animais` já gateado há dias) — novo gate do `cyber_chief` necessário,
  com atenção a `calcular_categoria_animal()` (D2) especificamente, já que é o tipo de bug que
  não vaza dado mas corrompe silenciosamente uma categorização exibida ao usuário.
- `EditarAnimalDialog`/fluxo de "Individualizar Animal" precisam de ajuste de UX para o caso
  "completar pendência" vs. "editar animal já completo" — fora do escopo deste ADR (nota de
  implementação para `developer`).

**Riscos a monitorar:**
- Se o volume de animais pendentes crescer sem individualização (mesmo risco já registrado para
  "Não classificado" no saldo, ADR-0005) — sinal de processo que a UI deveria alertar.

## [CRITÉRIOS DE REVISÃO]

Esta decisão deve ser revisada se:
1. A tela de seleção de animal individual para Venda/Óbito/Consumo (ADR-0004, ainda não
   construída) precisar, na prática, também oferecer "criar um novo animal na hora" — hoje esse
   fluxo assume que o animal já existe.
2. O volume real de `{TIPO}-{DATA}-{NNN}` colidir por fazenda ultrapassar 999/dia — precisaria de
   mais dígitos no sequencial (mudança cosmética, não estrutural).
