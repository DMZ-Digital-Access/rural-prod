[ADR-0004]
Título: Desenho técnico de `transacoes_animais` (Opção B, Eixo 1 ↔ Eixo 2) — mecanismo de
atualização automática de `animais.status`, fronteira de permissão do papel `financeiro`,
integridade cross-fazenda e reversibilidade
Data: 2026-07-20
Status: aceito

---

## [CONTEXTO]

`especificacao-sistema.md` seção 3.3 registra que JP confirmou, em 2026-07-16, a **Opção B**
de reconciliação entre o Eixo 1 (animal individual) e o Eixo 2 (saldo por espécie): ao
registrar uma transação de venda, o usuário pode vincular quais `animais` cadastrados
individualmente fazem parte daquele lote vendido, e o sistema atualiza `animais.status`
automaticamente para `venda`. A própria seção 3.3 fecha com a frase "`architect` (Alex)
formaliza o ADR correspondente na Fase 3" — isso nunca foi feito. A Fase 3 já começou
(`db_sage` entregou `especies`/`subtipos_especie`/`agrupamentos_etarios` em 2026-07-20, ainda
pendente do gate do `cyber_chief`), e o próximo bloco de schema é exatamente
`gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais` (spec seção 10, item 11). Este
ADR fecha a dívida antes que `db_sage` escreva essa migration.

A spec já decide **O QUE** fazer (Opção B, N:N `transacao_id`↔`animal_id`, atualização
automática de status, vínculo best-effort/não obrigatório) mas não decide **COMO**,
tecnicamente. Cinco pontos ficam sem mecanismo definido, e cada um tem um precedente direto na
migration da Fase 2
(`supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql`) que este ADR usa como
referência de padrão, sem repeti-lo cegamente:

1. **Mecanismo de atualização automática** — trigger? Só para `tipo_operacao = 'venda'`? O que
   acontece com `compra`/`entrada_pastoreio`/`saida_pastoreio`?
2. **Fronteira do papel `financeiro`** — `transacoes_animais` é a única tabela do schema que
   fica literalmente na fronteira entre um eixo ao qual `financeiro` tem algum acesso (Eixo 2,
   `transacoes`) e um eixo ao qual `financeiro` explicitamente não tem acesso nenhum (Eixo 1,
   `animais.status`). O gate do `cyber_chief` na Fase 2
   (`.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md`, achado nº1) já corrigiu uma
   violação real dessa fronteira em `lotes`/`animais`/`pesagens` — este ADR precisa decidir a
   fronteira de `transacoes_animais` a priori, para o `db_sage` não redescobrir o mesmo
   problema por correção reativa.
3. **Integridade cross-fazenda** — mesma classe de risco que `validar_lote_mesma_fazenda()`
   (Fase 2) fecha para `animais.lote_id`: uma transação de uma fazenda não pode linkar um
   animal de outra.
4. **Reversibilidade** — a spec não fala do caso DELETE. Um vínculo criado por engano precisa
   poder ser desfeito sem deixar o animal "preso" num status incorreto.
5. **Revenda** — um animal já `status='venda'`/`'morte'`/`'baixa'` pode ser vinculado a uma
   NOVA transação de venda?

Referências lidas: spec seções 3.2 (schema de `gtas`/`transacoes`/`transacoes_detalhe`, fora do
escopo de redesenho deste ADR — só consultadas porque `transacoes_animais` referencia
`transacoes`), 3.3 (a decisão de Opção B em si) e 4.1 (regra de status mutuamente exclusivo:
`ativo`/`venda`/`morte`/`baixa`); seção 5.4 (fronteira de acesso do papel `financeiro`); a
migration da Fase 2 completa (padrões de trigger de integridade, guardas de imutabilidade,
mensagens de erro genéricas); e o log do gate do `cyber_chief` na Fase 2 (achado nº1, a
violação real da fronteira de `financeiro` que motiva a decisão D2 abaixo).

## [DECISÃO]

### D1 — Colunas de `transacoes_animais` além do N:N básico

Além de `id`, `transacao_id` (FK → `transacoes`) e `animal_id` (FK → `animais`) já previstos
pela spec, `transacoes_animais` ganha uma coluna adicional decidida por este ADR:
**`tipo_operacao_transacao`** (mesmo domínio enum de `transacoes.tipo_operacao`) — uma cópia
**imutável, capturada no momento do INSERT** do `tipo_operacao` da transação vinculada.

Motivo: o mecanismo de reversibilidade (D4) precisa saber, no momento de um futuro `DELETE`, se
a transação que está sendo desvinculada era uma `venda` — mas se esse `DELETE` for consequência
de um `ON DELETE CASCADE` disparado pela exclusão da própria `transacoes` (linha pai), o RI
(referential integrity) do Postgres já terá removido/estará no processo de remover a linha pai
**antes** de o trigger de `transacoes_animais` poder consultá-la de volta — uma nova consulta a
`transacoes.tipo_operacao` nesse instante pode retornar "não encontrado" de forma não
determinística, dependendo da ordem interna de cascata. Denormalizar a cópia no momento do
INSERT (quando a linha pai certamente existe e está sendo referenciada) remove essa dependência
de ordem de execução por completo — o trigger de `DELETE` nunca precisa reconsultar `transacoes`.

### D2 — Mecanismo de atualização automática de `animais.status`

Dois triggers em `transacoes_animais`, ambos `SECURITY INVOKER` (sem elevação de privilégio —
ver justificativa em D3, a autorização de quem pode inserir/deletar já garante que o chamador
tem permissão direta de `UPDATE` em `animais.status`):

1. **`BEFORE INSERT`** (`preparar_vinculo_transacao_animal()`): valida que `transacao_id` e
   `animal_id` pertencem à mesma `fazenda_id` (D4) e popula
   `NEW.tipo_operacao_transacao := (select tipo_operacao from transacoes where id =
   NEW.transacao_id)`.
2. **`AFTER INSERT`** (`aplicar_status_animal_apos_vinculo()`): se
   `NEW.tipo_operacao_transacao = 'venda'`, executa `UPDATE animais SET status = 'venda' WHERE
   id = NEW.animal_id`. Para os demais valores (`compra`, `entrada_pastoreio`,
   `saida_pastoreio`), o vínculo é gravado normalmente e o trigger não faz nada — **sem efeito
   colateral em `animais.status`**.

**Por que permitir o vínculo para transações que não são venda, em vez de rejeitar no
INSERT:** a spec descreve o caso de uso primário (venda) mas modela `transacoes_animais` como
uma tabela de vínculo genérica, e já qualifica o vínculo inteiro como "best-effort, não
obrigatório" — não há necessidade de negócio hoje que justifique uma restrição ativa por
`tipo_operacao` no INSERT, e essa restrição fecharia a porta sem ganho claro para casos futuros
plausíveis (ex.: linkar um `animal_id` recém-cadastrado a uma `compra` para registrar a origem
individual de um animal específico). Restringir depois — se um caso de uso indevido aparecer —
é uma migration aditiva simples (`CHECK`/trigger de INSERT adicional); abrir depois de já ter
fechado é o caminho mais caro. Segue o mesmo princípio "começar simples, restringir só quando
houver problema real" já usado pela spec para o saldo de rebanho (view vs. materializado,
seção 7) e por este mesmo squad no Eixo 1 (`registrar_pesagem()` não bloqueia pesagem em animal
vendido/morto/baixado, confirmado pelo `cyber_chief` como decisão de produto deliberada, não
uma omissão).

**Por que `SECURITY INVOKER`, não `SECURITY DEFINER`:** ao contrário de
`atualizar_animal_apos_pesagem()` (Fase 2), que precisa de `SECURITY DEFINER` porque
`peso_atual_kg`/`gmd_medio_kg`/`ultima_pesagem_data` são protegidos por um guard de trigger
dedicado que só libera mediante uma flag de sessão (`rural_prod.recalculo_pesagem`),
`animais.status` **não tem guard equivalente** — é uma coluna normal, já editável por qualquer
usuário `admin`/`membro` vinculado à fazenda via a policy declarativa de `UPDATE` de `animais`
(Fase 2, `animais_update_vinculada`, que já exclui `financeiro`). Como D3 decide que só
`admin`/`membro` podem inserir em `transacoes_animais` (mesma exclusão de `financeiro`), o
chamador que dispara o `AFTER INSERT` já tem, por si só, permissão de `UPDATE` direto na linha
de `animais` afetada — não há RLS a contornar, então não há motivo para elevar privilégio.
Menos superfície `SECURITY DEFINER` para o `cyber_chief` revisar, mesmo princípio de mínimo
privilégio já cobrado nas revisões anteriores.

### D3 — Fronteira de permissão do papel `financeiro`

`especificacao-sistema.md` seção 5.4 diz, textualmente: papel Financeiro/Contábil tem "Acesso
restrito a: Painel Financeiro, Declarações de Rebanho, Saldo de Animais" e "**Sem acesso a**:
manejo individual de animais/lotes/pesagens, GTAs, **edição de transações** (perfil de
consulta/leitura, não de operação)".

Ponto central desta decisão, e resposta à pergunta que a tarefa coloca: a spec **já nega** a
`financeiro` a capacidade de criar/editar `transacoes` ("edição de transações" — não é "leitura
restrita de alguns campos", é ausência de capacidade de operação). Isso significa que o cenário
hipotético levantado — "`financeiro` insere em `transacoes_animais` porque tem acesso a
`transacoes`" — **não deveria surgir em primeiro lugar**, porque `financeiro` nunca deveria ter
permissão de `INSERT`/`UPDATE` em `transacoes` também (mesmo fora do escopo de redesenho deste
ADR, isso é uma implicação que `db_sage` precisa carregar ao desenhar a RLS de `transacoes` —
registrada como nota de dependência abaixo, não decidida aqui). "Painel Financeiro" (o módulo
que consolida `transacoes` + `lancamentos_financeiros` em fluxo de caixa) e "Saldo de Animais"
(a view `saldo_rebanho`, inerentemente somente leitura) são os únicos pontos de contato de
`financeiro` com dados derivados de `transacoes` — sempre leitura agregada, nunca escrita.

Dado isso, a decisão para `transacoes_animais` fica sem ambiguidade, e por **dois** motivos
independentes que se reforçam (não um único que precisaria ser reavaliado se o outro mudar):

- **Motivo 1 (herdado da regra de `transacoes`):** se `financeiro` não pode operar `transacoes`,
  não faz sentido que possa operar `transacoes_animais`, que é estritamente um apêndice de uma
  operação de `transacoes`.
- **Motivo 2 (independente, próprio de `transacoes_animais`):** mesmo se, no futuro, a leitura
  de `transacoes` for liberada para `financeiro` de forma mais ampla, `animal_id` em
  `transacoes_animais` é, por definição, um identificador de manejo individual (Eixo 1) — o
  mesmo tipo de dado que a spec já nega a `financeiro` em `animais`/`lotes`/`pesagens` "sem
  acesso... nem leitura" (confirmado como leitura estrita pelo gate do `cyber_chief` na Fase 2).
  Expor `animal_id` via `transacoes_animais` seria reabrir por uma porta lateral exatamente o
  acesso que a Fase 2 fechou pela porta principal.

**Decisão:** `transacoes_animais` recebe **zero acesso** para `papel = 'financeiro'` — nem
`SELECT`, nem `INSERT`, nem `DELETE`. As policies de `SELECT`/`INSERT`/`DELETE` de
`transacoes_animais` exigem `papel in ('admin', 'membro')` no subselect de
`usuarios_fazendas` vinculado à `fazenda_id` da transação (mesmo padrão sintático de
`papel <> 'financeiro'` já usado nas 7 policies da Fase 2). Sem policy de `UPDATE`: um vínculo é
criado ou removido, nunca editado em lugar — se o vínculo errado for feito, a correção é
`DELETE` + novo `INSERT` (D4 cobre o efeito colateral do `DELETE`), mesmo espírito de
`pesagens` na Fase 2 (correção via caminho específico, não `UPDATE` livre de linha).

**Nota de dependência para `db_sage` (fora do escopo deste ADR, não decidida aqui):** ao
desenhar a RLS de `transacoes`/`transacoes_detalhe`, a leitura mais estrita e consistente com a
seção 5.4 é `financeiro` com `SELECT` permitido (para alimentar Painel Financeiro) mas **zero**
`INSERT`/`UPDATE`/`DELETE`. Isso não é uma decisão deste ADR — `transacoes` está fora de escopo
por instrução explícita da tarefa — mas fica registrado aqui porque é a premissa que sustenta o
Motivo 1 acima; se `db_sage` decidir diferente (ex.: liberar alguma escrita restrita a
`financeiro` em `transacoes`), a fronteira de `transacoes_animais` definida aqui precisa ser
revisitada (ver Critérios de Revisão).

### D4 — Integridade cross-fazenda

Mesmo padrão da Fase 2 (`validar_lote_mesma_fazenda()`): **trigger `BEFORE INSERT`**, não
`CHECK` constraint (uma `CHECK` não pode consultar outra tabela) e não RLS isolada (RLS de
`transacoes_animais` já escopa por fazenda do chamador, mas isso não impede um `admin` da
fazenda A de, por engano ou deliberadamente, tentar vincular uma `transacao_id` da fazenda A a
um `animal_id` da fazenda B se ambos estiverem, de alguma forma, visíveis/acessíveis ao mesmo
chamador — ex.: um usuário com vínculo em duas fazendas). O trigger `BEFORE INSERT`
(`preparar_vinculo_transacao_animal()`, mesma função descrita em D2, que já faz este trabalho
antes de popular `tipo_operacao_transacao`) consulta `fazenda_id` de `transacoes` e de `animais`
para as duas chaves recebidas e rejeita com **mensagem de erro genérica** ("transação ou animal
inválido, ou não pertencem à mesma fazenda") se não coincidirem ou se qualquer um dos dois IDs
não for encontrado — mesmo cuidado de não-oráculo já aplicado em
`validar_lote_mesma_fazenda()` e nas correções do `cyber_chief` em `registrar_pesagem()` (Fase
2, achado nº3). `SECURITY INVOKER`: a consulta a `transacoes`/`animais` já respeita a RLS do
próprio chamador (RLS de `transacoes` — fora de escopo aqui — e a RLS de `animais` da Fase 2,
que já exclui `financeiro`), então uma linha em outra fazenda simplesmente não aparece para o
`SELECT` — dupla proteção sem precisar de privilégio elevado, mesmo raciocínio já documentado
para `validar_lote_mesma_fazenda()`.

### D5 — Reversibilidade (`DELETE` de `transacoes_animais`)

**Trigger `AFTER DELETE`** (`reverter_status_animal_apos_desvinculo()`), `SECURITY INVOKER`.
Regra: se `OLD.tipo_operacao_transacao = 'venda'` **E** `animais.status` do animal afetado
ainda for `'venda'` **E** não existir nenhuma outra linha remanescente em `transacoes_animais`
para o mesmo `animal_id` com `tipo_operacao_transacao = 'venda'` (guarda de coexistência — ver
D6, um animal pode legitimamente estar vinculado a mais de uma venda nesta fase, e desfazer um
vínculo não deve apagar o efeito de outro vínculo de venda que continua válido) — reverte
`UPDATE animais SET status = 'ativo' WHERE id = OLD.animal_id`.

A checagem "`animais.status` ainda é `'venda'`" é uma **guarda de idempotência/não-regressão**:
existe para não sobrescrever um status que foi alterado por um caminho independente depois que
o vínculo foi criado (ex.: um admin marcou o animal como `'morte'` manualmente, via edição
direta em `animais`, num momento posterior ao vínculo de venda) — sem essa guarda, desfazer um
vínculo de venda antigo poderia reverter incorretamente um `'morte'`/`'baixa'` legítimo e mais
recente de volta para `'ativo'`, que é um resultado pior que "não fazer nada" (um vínculo de
transação órfão apontando para um status que já mudou por outro motivo é um estado aceitável de
"a automação já não se aplica mais"; reverter às cegas não é).

**Por que não depender de reconsultar `transacoes.tipo_operacao` no `DELETE`:** ver a
justificativa de D1 — a denormalização em `tipo_operacao_transacao` existe exatamente para que
este trigger nunca precise de uma consulta a `transacoes`, o que o torna correto mesmo quando o
`DELETE` é consequência de um `ON DELETE CASCADE` disparado pela exclusão da própria transação
pai (se `db_sage` decidir permitir `DELETE` em `transacoes` — decisão fora deste ADR).

### D6 — Animal já vendido/morto/baixado vinculado a nova venda

**Sem trava no banco nesta fase.** `INSERT` em `transacoes_animais` para um `animal_id` cujo
`status` já não é `'ativo'` é **permitido**, sem `CHECK`/trigger de bloqueio. O trigger de D2
simplesmente reaplica `status = 'venda'` (efeito idempotente se já era `'venda'`; efeito real —
e potencialmente indesejado — se o status era `'morte'`/`'baixa'`).

Justificativa, seguindo o mesmo padrão de "decisão de produto não bloqueada por trava técnica"
já usado e explicitamente confirmado como aceitável pelo `cyber_chief` no gate da Fase 2
(`registrar_pesagem()` não valida `animais.status` antes de aceitar uma pesagem nova, decisão
documentada como deliberada, não uma omissão de segurança): (1) o vínculo é best-effort e a
correção via `DELETE` (D5) já cobre o caso de engano isolado; (2) uma trava de banco rígida
("animal com status ≠ ativo não pode ser vinculado a nova venda") tem exceções legítimas
plausíveis que a spec não elimina — ex.: correção de um lançamento incorreto de venda anterior
(baixar o vínculo errado e recriar), ou um fluxo de "readquirir" um animal antes marcado como
baixa por engano de cadastro; travar no banco força esses casos a passar por um caminho de
exceção manual (editar `status` de volta para `'ativo'` antes de poder vincular), adicionando
fricção sem benefício de integridade correspondente — o pior cenário (contagem duplicada de uma
venda) já é mitigável no nível de UI/relatório, não é uma corrupção de dado silenciosa e
irreversível.

**Pendência explícita para `developer`:** a tela de seleção de animais no cadastro de transação
(spec seção 5.2, "Módulo Entradas e Saídas") deve **sinalizar visualmente** quando o usuário
seleciona um animal cujo `status` já não é `'ativo'` (aviso não bloqueante, não erro) — mitigação
de UX para o risco aceito aqui, sem exigir mudança de schema se a necessidade de bloqueio real
aparecer depois (ver Critérios de Revisão).

## [ALTERNATIVAS CONSIDERADAS]

**Para D2 (mecanismo de atualização automática):**

Alternativa 1 — Trigger `AFTER INSERT`, efeito condicional a `tipo_operacao = 'venda'` — ESCOLHIDA.
Prós: automação real (o usuário não precisa lembrar de editar `animais.status` manualmente
depois de vincular uma venda), único lugar onde a regra vive (mesmo princípio de
não-duplicação de `calcular_categoria_animal()`/`atualizar_animal_apos_pesagem()` da Fase 2).
Contras: mais uma trigger para o squad manter e revisar.

Alternativa 2 — Aplicação (frontend) chama duas escritas separadas: `INSERT` em
`transacoes_animais` + `UPDATE` em `animais.status` — REJEITADA. Não atômico (janela real entre
as duas chamadas caso a segunda falhe, deixando o vínculo criado sem o efeito de status
correspondente); duplica a regra de negócio em código de aplicação, que teria que ser repetida
em qualquer outro ponto de entrada futuro (ex.: uma eventual importação em lote); mesmo motivo
estrutural que já levou o ADR-0002 a rejeitar alternativas de dois passos client-side para
`aceitar_convite()`.

Alternativa 3 — Restringir `INSERT` em `transacoes_animais` a `tipo_operacao = 'venda'`
(rejeitar vínculo para outros tipos) — REJEITADA (ver justificativa completa em D2). Fecha uma
porta sem ganho de integridade correspondente hoje; mais barato reabrir depois se necessário do
que teria sido fechar depois de já ter permitido.

**Para D3 (fronteira `financeiro`):**

Alternativa 1 — Zero acesso (`SELECT`/`INSERT`/`DELETE`) para `financeiro` em
`transacoes_animais` — ESCOLHIDA. Ver D3 para os dois motivos independentes.

Alternativa 2 — `financeiro` com `SELECT` permitido (mas sem escrita) em `transacoes_animais`,
para consulta agregada no Painel Financeiro — REJEITADA. O Painel Financeiro (spec 5.2) não
precisa de `animal_id` individual para calcular fluxo de caixa — `transacoes.quantidade_animais`
e `valor_nota` já bastam. Conceder `SELECT` só para um caso de uso que não existe hoje reabriria
exposição de dado de manejo individual (Motivo 2 de D3) sem necessidade de produto
correspondente — mesmo raciocínio que levou a Fase 2 a negar `SELECT`, não só escrita, de
`lotes`/`animais`/`pesagens` a `financeiro`.

Alternativa 3 — Herdar a permissão de `transacoes_animais` inteiramente da RLS de `transacoes`
(sem policy própria, delegando a decisão para quando `db_sage` desenhar `transacoes`) —
REJEITADA. Deixaria `transacoes_animais` sem controle de acesso próprio até uma migration
futura decidir por ela — mesmo antipadrão que a Fase 2 já identificou como fonte do achado nº1
do `cyber_chief` (assumir "financeiro tem acesso a X porque tem acesso a Y" sem checagem
explícita). Cada tabela deve declarar sua própria fronteira de acesso, mesmo quando a
conclusão coincide com a de uma tabela relacionada.

**Para D5 (reversibilidade):**

Alternativa 1 — Reverter incondicionalmente para `'ativo'` em qualquer `DELETE` de
`transacoes_animais` vinculado a uma venda, sem checar o status atual nem vínculos
remanescentes — REJEITADA. Risco de sobrescrever um `'morte'`/`'baixa'` legítimo mais recente
(ver D5) e de "desvender" incorretamente um animal que ainda tem outro vínculo de venda válido
coexistindo (ver D6).

Alternativa 2 — Não reverter nada automaticamente; deixar a correção de status sempre manual
(usuário edita `animais.status` de volta depois de desfazer o vínculo) — REJEITADA. Contraria o
espírito de automação que motivou a Opção B inteira (evitar dupla digitação/dupla manutenção
entre os dois módulos) — se a criação do vínculo automatiza a ida para `'venda'`, a remoção
deveria automatizar o caminho de volta no caso simples (sem concorrência com outro vínculo),
não deixar o usuário lembrar manualmente de desfazer os dois lados.

## [CONSEQUÊNCIAS]

**Positivas:**
- Fecha a dívida de processo registrada em `PROJECT_CONTEXT.md` desde 2026-07-16 antes de
  `db_sage` escrever a migration — nenhuma decisão de desenho fica implícita/"óbvia" no código.
- Nenhuma função `SECURITY DEFINER` nova é introduzida — os dois triggers de D2/D4/D5 rodam com
  o privilégio do próprio chamador (`admin`/`membro`), reduzindo a superfície de revisão que o
  `cyber_chief` precisa auditar em profundidade, comparado ao padrão de `SECURITY DEFINER` já
  usado em `registrar_pesagem()`/`aceitar_convite()`/`promover_papel()`.
- A denormalização de `tipo_operacao_transacao` (D1) remove uma classe inteira de bug de
  ordenação (`DELETE` em cascata da linha pai) antes mesmo de ela poder ser escrita, em vez de
  ser descoberta depois em teste ou produção.
- A fronteira de `financeiro` (D3) é decidida de forma explícita e auto-contida na própria
  tabela, seguindo a lição já extraída do achado nº1 do `cyber_chief` na Fase 2 — não repete o
  mesmo tipo de gap que motivou aquela correção reativa.

**Negativas / trade-offs aceitos:**
- D6 aceita um risco de produto conhecido (revenda/duplicidade de vínculo de venda) sem trava
  técnica, na aposta de que a fricção de uma trava rígida custa mais do que o risco residual —
  mitigado só por sinalização de UI, não por integridade de banco. Se o uso real mostrar que
  usuários frequentemente cometem esse erro sem perceber o aviso, a decisão precisa ser
  revisitada (ver Critérios de Revisão).
- Dois triggers novos (`BEFORE INSERT` combinando validação cross-fazenda + denormalização, e
  `AFTER INSERT`/`AFTER DELETE` de efeito colateral em status) — mais superfície de PL/pgSQL
  para o squad manter, mesmo trade-off já aceito em cada fase anterior deste projeto.
- A guarda de coexistência de D5 ("não existe outra linha com `tipo_operacao_transacao =
  'venda'` para o mesmo animal") significa que reverter o status depende de uma consulta
  adicional a `transacoes_animais` a cada `DELETE` — custo desprezível no volume esperado
  (dezenas de transações por fazenda por ano, spec seção 6), mas registrado como escolha
  consciente de correção sobre performance bruta.

**Riscos a monitorar:**
- Se `db_sage`, ao desenhar a RLS de `transacoes`, decidir conceder a `financeiro` alguma forma
  de escrita (contrariando a leitura de "edição de transações" negada pela spec 5.4 assumida
  como premissa no Motivo 1 de D3), a fronteira de `transacoes_animais` definida aqui precisa
  ser reaberta e revisada em conjunto.
- Nenhum mecanismo hoje impede um `admin` de gerar múltiplos vínculos de venda simultâneos para
  o mesmo animal (D6) — se isso se mostrar, na prática, mais fonte de confusão do que a
  simplicidade economiza, a extensão futura é uma migration aditiva (trigger de bloqueio ou
  aviso a nível de aplicação mais forte), não uma reformulação do schema já decidido aqui.

## [CRITÉRIOS DE REVISÃO]

Esta decisão deve ser revisada se:

1. A RLS de `transacoes`/`transacoes_detalhe` (decisão futura de `db_sage`, fora deste ADR)
   conceder a `financeiro` qualquer capacidade de escrita — a premissa do Motivo 1 de D3 deixa
   de valer e a fronteira de `transacoes_animais` precisa ser reavaliada, mesmo que o Motivo 2
   (dado de manejo individual) continue sozinho suficiente para manter a mesma conclusão.
2. O uso real mostrar vínculos de venda duplicados para o mesmo animal como um problema
   recorrente de produto (não hipotético) — nesse ponto, D6 deveria ganhar uma trava real
   (bloqueio ou confirmação obrigatória), não só o aviso de UI hoje proposto.
3. `transacoes` precisar suportar `DELETE` de fato (hoje fora de escopo, mas se `db_sage`
   decidir permitir exclusão de transações lançadas por engano) — validar que o `ON DELETE
   CASCADE` em `transacoes_animais` e a denormalização de `tipo_operacao_transacao` (D1)
   continuam suficientes sob esse novo caso de uso, especialmente se `transacoes` ganhar algum
   fluxo de "correção" que reescreva `tipo_operacao` de uma transação já vinculada a animais
   (hoje a coluna denormalizada assume que `tipo_operacao` de uma transação já vinculada não
   muda depois do vínculo criado — se isso deixar de ser verdade, a denormalização vira uma
   cópia potencialmente desatualizada, e os triggers de D2/D5 precisam ser revisitados).
4. O papel `financeiro` ganhar, em revisão de produto futura, uma visão read-only explícita de
   Eixo 1 (pendência já sinalizada pelo `cyber_chief` no gate da Fase 2, ainda sem confirmação
   de JP) — se isso acontecer, o Motivo 2 de D3 (dado de manejo individual vedado a
   `financeiro`) precisa ser reexaminado à luz da nova decisão de produto.
