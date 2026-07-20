[ADR-0005]
Título: Expansão de `tipo_operacao` (Nascimento/Óbito/Consumo), rastreamento independente de
GTA/Nota/Contranota, classificação parcial de saldo (sexo sem faixa etária) e renomeação de
UX de Animais ("Individualizar Animal" + "Entradas e Saídas de Animais de Lote")
Data: 2026-07-20
Status: aceito

---

## [CONTEXTO]

Após o Checkpoint de Validação de Saldo do item 12 (seção 10 da spec) ter sido confirmado por
JP, ele trouxe um pedido de produto novo, fora da sequência original da spec: a tela de Animais
não deveria mais ter só o botão "Novo Animal" — precisa de dois botões distintos:

1. **"Individualizar Animal"** (renomeação do botão atual `CriarAnimalDialog`) — cadastro
   individual, mesmas variáveis de hoje, só ajustando o rótulo do campo de peso para
   "Peso de hoje".
2. **"Entradas e Saídas de Animais de Lote"** (novo) — registro AGREGADO e rápido de uma
   movimentação de rebanho, com 5 tipos de operação (Compra/Venda/Nascimento/Óbito/Consumo) e
   campos: Tipo de animal (espécie), Número de animais, quebra por sexo (Machos/Fêmeas, soma =
   Número de animais), Valor financeiro da operação (opcional), Peso total (opcional).

Durante a especificação deste fluxo com JP, várias perguntas de arquitetura precisaram ser
resolvidas antes de `db_sage` poder mexer no schema (as mesmas 3 tabelas já implementadas e
GATEADAS pelo `cyber_chief` nos itens 11 e 12 desta mesma fase — `transacoes`,
`transacoes_detalhe`, e a função/views de saldo):

1. Os 5 tipos de operação substituem ou se somam aos 4 já existentes
   (`compra`/`venda`/`entrada_pastoreio`/`saida_pastoreio`)?
2. Nascimento/Óbito/Consumo devem acionar o mesmo mecanismo de `transacoes_animais` que Venda já
   aciona hoje (ADR-0004), atualizando `animais.status`?
3. Como tratar o fato de que essa tela rápida **não pede faixa etária** (só sexo) — o saldo
   calculado no item 12 depende de `transacoes_detalhe.agrupamento_etario_id`, hoje `NOT NULL`?
4. Como rastrear GTA/Nota/Contranota de forma independente, dado que JP descreveu um fluxo onde
   o usuário pode salvar a operação com **zero documentos** (só quantidade de animais + a outra
   parte) e completar a documentação progressivamente, ao longo de horas ou dias, sem que isso
   trave o saldo já atualizado?

Referências lidas: `especificacao-sistema.md` seção 3.2 (schema de `transacoes`/
`transacoes_detalhe`), seção 5.2 (módulo Entradas e Saídas); ADR-0004 (mecanismo de
`transacoes_animais`, D1-D6); migration `20260720133000_fase3_gtas_transacoes.sql` (schema
atual de `transacoes`/`gtas`); migration `20260720200000_fase3_saldo_rebanho.sql` (função
`obter_saldo_rebanho()`, já validada contra os prints reais de Bovino/Ovino); conversa completa
com JP nesta sessão (2026-07-20), onde cada decisão abaixo foi confirmada explicitamente por
ele antes de ser fechada aqui.

## [DECISÃO]

### D1 — `tipo_operacao` ganha 3 valores novos, ADITIVAMENTE

`transacoes.tipo_operacao` passa de 4 para 7 valores: `compra`, `venda`, `entrada_pastoreio`,
`saida_pastoreio`, `nascimento`, `obito`, `consumo`. Pastoreio **continua existindo** como
conceito separado (JP confirmado explicitamente) — não é substituído pelos 3 novos.
`transacoes_animais.tipo_operacao_transacao` (a cópia denormalizada imutável do ADR-0004 D1)
ganha o mesmo CHECK expandido, para continuar aceitando qualquer valor válido de
`transacoes.tipo_operacao` no momento do INSERT.

### D2 — Extensão do mecanismo de `transacoes_animais` (ADR-0004 D2) para Óbito e Consumo; Nascimento fica FORA desse mecanismo

`aplicar_status_animal_apos_vinculo()` (ADR-0004 D2, hoje só reage a `'venda'` → `status =
'venda'`) ganha dois novos ramos no mesmo `CASE`:
- `'obito'` → `status = 'morte'` (valor já existente no domínio de `animais.status` desde a
  Fase 2 — nenhuma mudança de schema em `animais` necessária).
- `'consumo'` → `status = 'baixa'` (JP confirmou explicitamente: consumo usa a categoria
  genérica `baixa` já existente, sem precisar de um status novo).

**Nascimento fica FORA do mecanismo de `transacoes_animais`.** Motivo: o mecanismo do ADR-0004
pressupõe que `animal_id` já existe (a transação está vinculando um animal JÁ cadastrado
individualmente a uma operação). Nascimento é o oposto — o animal **ainda não existe** como
registro individual no momento da transação. Isso é consistente com o que JP já havia
confirmado sobre Compra (seção 5 de `PROJECT_CONTEXT.md`, "Fluxo Compra → Animal individual"):
a entrada afeta o saldo agregado (`transacoes_detalhe`) imediatamente; o cadastro individual
(via "Individualizar Animal") acontece depois, como passo manual separado, sem vínculo
automático de volta à transação de origem. Nascimento segue exatamente o mesmo padrão de
Compra/Entrada de Pastoreio — nenhum trigger novo, nenhuma linha de `transacoes_animais`
esperada para esse tipo de operação hoje.

### D3 — Rastreamento independente de GTA / Nota / Contranota, com upload progressivo

Cada `transacao` pode ser salva com **zero, um, dois ou três** dos documentos (GTA, Nota,
Contranota) desde o início — JP confirmou explicitamente que o cadastro mínimo exige só
`quantidade_animais` e `outra_parte` (D6). O card de cada operação (Fase 4, tela de Transações)
mostra os 3 documentos de forma independente, cada um "presente" ou "pendente", com link de
visualização/download quando presente.

**Schema:**
- **GTA:** nenhuma mudança necessária. `gta_id` (nullable) + `status_gta_transacao` (já
  existente, valores `pendente`/`despendenciada`/`n_a`) já cobrem exatamente "presente" (
  `despendenciada`/`n_a`) vs. "pendente" (`pendente`) — é a mesma coluna que
  `obter_saldo_rebanho()` já usa para a classificação Registrada/Pendente do saldo (item 12,
  **sem mudança nessa lógica** — GTA continua sendo o único critério oficial de
  Registrada/Pendente, JP confirmou isso separadamente e não é reaberto aqui).
- **Nota:** `transacoes` ganha `arquivo_nota_path text` / `arquivo_nota_mime_type text`
  (nullable, mesmo padrão de `gtas.arquivo_path`/`arquivo_mime_type`). `numero_nota` (já
  existente) é mantido como metadado complementar (o número pode ser digitado antes ou depois
  do upload do arquivo). "Nota pendente" = `arquivo_nota_path is null`.
- **Contranota:** `transacoes` ganha `arquivo_contranota_path text` /
  `arquivo_contranota_mime_type text` (nullable). A coluna antiga `tem_contranota` (boolean) é
  **removida** — fica redundante e potencialmente inconsistente com a presença do arquivo
  (`arquivo_contranota_path is null` já responde a mesma pergunta, com mais informação). "
  Contranota pendente" = `arquivo_contranota_path is null`.

**Dependência explícita:** o armazenamento real dos arquivos (buckets de Storage) é o item 14
da spec, ainda não iniciado. Este ADR só prepara o schema (colunas nullable) — upload de
arquivo de verdade fica bloqueado até o item 14 ser implementado. Sem regressão: os campos
ficam `null` até lá, exibindo "pendente" corretamente por default.

### D4 — `peso_total_kg` novo em `transacoes`

Campo opcional (nullable numeric, mesma regra de não-negativo de `valor_nota`) — peso total da
operação, quando o produtor tiver essa informação no momento do lançamento.

### D5 — Sexo sem faixa etária: `transacoes_detalhe.agrupamento_etario_id` relaxado para NULLABLE + "Não classificado" no saldo

A tela de "Entradas e Saídas de Animais de Lote" pede quantidade por sexo (Machos/Fêmeas, soma
= Número de animais) mas **não** pede faixa etária — JP confirmou que "idade de animais" (que
aparece no detalhe da operação) é um campo livre/descritivo, sem vínculo com o catálogo
`agrupamentos_etarios`.

**Decisão:** `transacoes_detalhe.agrupamento_etario_id` deixa de ser `NOT NULL`. Uma operação
lançada por essa tela cria 1-2 linhas de `transacoes_detalhe` (uma por sexo com quantidade > 0)
com `agrupamento_etario_id = null`. `saldo_rebanho_movimentos`/`obter_saldo_rebanho()` (item 12)
são estendidos para tratar `agrupamento_etario_id is null` como uma faixa sintética **"Não
classificado"** — aparece como mais uma linha por espécie/sexo no resultado da função, ao lado
das faixas regulatórias reais, em vez de ser descartada silenciosamente. Quando o animal for
posteriormente individualizado (idade real conhecida via data de nascimento), o saldo dessa
espécie passa a refletir a faixa correta — mecanismo exato de transição fica para o `developer`
desenhar na Fase 4 (fora de escopo deste ADR).

**Por que NÃO criar uma linha sintética em `agrupamentos_etarios` em vez disso (alternativa
rejeitada):** `agrupamentos_etarios` é catálogo regulatório, validado linha a linha contra os
prints reais da Secretaria no gate do item 10/12 — inserir uma linha fabricada ("Não
classificado") ali misturaria dado de configuração regulatória com um artefato de UX do nosso
produto. Resolver com `NULL` + tratamento na função de agregação mantém o catálogo puro.

**Nota de implementação para `developer`:** garantir, na tela/RPC de lançamento, que a soma de
`quantidade` das linhas de `transacoes_detalhe` de uma transação bate com
`transacoes.quantidade_animais` é responsabilidade da camada de aplicação (RPC única que insere
`transacao` + linhas de detalhe na mesma transação SQL, validando a soma antes do commit) — uma
`CHECK`/trigger ingênuo por linha não funciona aqui, porque o invariante só é verdadeiro depois
que TODAS as linhas de detalhe da operação existem, não a cada INSERT individual.

### D6 — Cadastro mínimo obrigatório: `quantidade_animais` + `outra_parte`

Já é o schema atual (`quantidade_animais` e `outra_parte` já são `NOT NULL` desde o item 11) —
nenhuma mudança necessária aqui. Confirma-se apenas que **nenhum dos 3 documentos (GTA/Nota/
Contranota) nem os campos opcionais (`valor_nota`, `peso_total_kg`) são exigidos no momento da
criação** — todos já são nullable por schema, e D3 preserva essa característica para os campos
novos.

### D7 — Comprador/Vendedor: mantém `outra_parte` único (sem mudança)

JP confirmou explicitamente manter o campo único `outra_parte` — o sistema já infere o papel
(vendedor numa compra, comprador numa venda) a partir de `tipo_operacao`, sem precisar de dois
campos. Para Nascimento/Óbito/Consumo (que não têm uma "outra parte" comercial no sentido
tradicional), `outra_parte` continua `NOT NULL` no schema atual — o `developer` precisa decidir
um texto de preenchimento sensato na UI para esses 3 tipos (ex.: nome da própria fazenda, ou
texto livre tipo "Nascimento em campo"), não é uma decisão de schema deste ADR.

## [ALTERNATIVAS CONSIDERADAS]

**Para D2 (Nascimento):**

Alternativa 1 — Nascimento também usa `transacoes_animais`, com um mecanismo que CRIA o
`animal_id` automaticamente (INSERT em `animais` disparado pelo trigger) — REJEITADA. Criar um
registro individual completo (identificação, sexo, data de nascimento, peso inicial) a partir de
um lançamento agregado de lote exigiria inventar valores individuais que a tela de "Entradas e
Saídas de Lote" não coleta (ela pede só a contagem agregada) — contradiz o próprio fluxo que JP
descreveu, onde a individualização é sempre um passo manual e posterior via "Individualizar
Animal".

Alternativa 2 (ESCOLHIDA) — Nascimento é tratado como Compra/Entrada de Pastoreio: afeta só o
agregado (`transacoes_detalhe`), sem nenhuma linha de `transacoes_animais`. Consistente com o
fluxo já confirmado por JP para Compra.

**Para D5 (sexo sem faixa etária):**

Alternativa 1 — Linha sintética "Não classificado" dentro de `agrupamentos_etarios` — REJEITADA,
ver justificativa em D5 (mistura catálogo regulatório com artefato de UX).

Alternativa 2 (ESCOLHIDA) — `agrupamento_etario_id` nullable + tratamento na função de
agregação.

Alternativa 3 — Bloquear a tela de "Entradas e Saídas de Lote" de aceitar operação sem faixa
etária, obrigando o usuário a escolher uma faixa mesmo sem saber a idade real — REJEITADA.
Contradiz diretamente o requisito de JP (a tela não pede faixa etária) e forçaria o usuário a
"chutar" um dado que ele não tem no momento do lançamento rápido.

## [CONSEQUÊNCIAS]

**Positivas:**
- Reaproveita 100% do mecanismo de `transacoes_animais` já gated do ADR-0004 para Óbito/Consumo
  — só estende o `CASE`, não reabre nenhuma das 6 decisões originais (D1-D6 do ADR-0004
  continuam válidas).
- `obter_saldo_rebanho()` continua sendo a fonte única de verdade do saldo, mesmo para
  lançamentos parciais (sem faixa etária) — evita um saldo "invisível" para animais só
  parcialmente classificados.
- O rastreamento de documentos fica simétrico e extensível (3 colunas de arquivo com o mesmo
  padrão já usado em `gtas`), preparando o terreno para o item 14 (Storage) sem acoplar a
  decisão de UI (card por operação) a uma implementação de banco ainda inexistente.

**Negativas / trade-offs aceitos:**
- Reabre 2 migrations já GATEADAS pelo `cyber_chief` (itens 11 e 12 desta mesma fase) — exige
  um NOVO gate de segurança sobre as mudanças (colunas novas, constraint relaxada, função de
  saldo estendida), não uma simples continuação.
- `transacoes_detalhe.agrupamento_etario_id` nullable é uma exceção ao padrão "toda FK
  obrigatória é obrigatória" que o resto do schema segue — precisa de comentário SQL explícito
  para não parecer um descuido em revisões futuras.
- A validação "soma de sexo bate com quantidade_animais" fica fora do banco (camada de
  aplicação) — um caminho de escrita direto via API que não passe pela RPC correta poderia, em
  tese, inserir dados inconsistentes. Aceito por ora (mesmo padrão de confiança na RPC já usado
  em outras partes do schema), registrado como risco a monitorar.

**Riscos a monitorar:**
- Se o volume de lançamentos "Não classificado" crescer sem que os animais sejam
  individualizados depois, o saldo por faixa etária real fica cronicamente impreciso — não é um
  bug, mas um sinal de processo do produtor que a UI (Fase 4) deveria tornar visível (ex.: alerta
  de "N animais aguardando individualização").

## [CRITÉRIOS DE REVISÃO]

Esta decisão deve ser revisada se:

1. O item 14 (Storage) definir um padrão de bucket/RLS diferente do já usado por
   `gtas.arquivo_path` — as 2 colunas de arquivo novas (D3) devem seguir esse padrão quando
   implementadas, não o contrário.
2. O volume real de operações "Não classificado" (D5) se mostrar alto o suficiente para exigir
   um relatório/alerta dedicado, não só uma linha a mais no saldo.
3. Alguma operação de Nascimento precisar, no futuro, de vínculo automático com o(s) animal(is)
   nascido(s) — reabriria a Alternativa 1 rejeitada em D2, com desenho novo (provavelmente uma
   tela de "confirmar nascimentos" que cria os `animais` e só então os vincula).
