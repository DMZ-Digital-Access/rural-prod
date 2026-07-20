# Security Review — Fase 3, item 13: lancamentos_financeiros/declaracoes_rebanho/prazos_declaracao_estado — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança obrigatório antes de
  `supabase db push`.
- **Escopo:** `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql`,
  entregue por `db_sage` (SOFIA) no mesmo dia. Lido também
  `.agents/memory/log/2026-07-20-db_sage-schema-fase3-financeiro.md` (raciocínio completo da
  autora) e `especificacao-sistema.md` seções 3.2/4.2/5.3/5.4.

---

## [SECURITY ANALYSIS]

**Componente:** `lancamentos_financeiros`, `declaracoes_rebanho`, `prazos_declaracao_estado` +
`definir_prazo_declaracao_estado()` + `obter_prazo_declaracao_estado()` + `public.fazendas`
(alterada nesta migration).

**Status:** 🟢 Seguro — após correção aplicada nesta migration (ver abaixo). Sem essa correção,
teria sido 🟡/🔴 (ver justificativa da decisão central).

---

## DECISÃO CENTRAL: opção (a) — BLOQUEAR e CORRIGIR, não (b) documentar e aceitar

A tarefa pedia para decidir entre aceitar o limite documentado por `db_sage` (mitigação só por
auditoria) ou bloquear a migration até uma correção real. **Decisão: (a) — implementada
diretamente nesta mesma migration**, não devolvida para outro agente.

### Por que não aceitei a opção (b)

O argumento de `db_sage` para tratar o risco como baixo — "é dado regulatório público, pior caso
é um prazo errado detectável e corrigível" — é válido para o dado em si (confidencialidade não é
o problema; não há segredo nem fraude financeira direta). Mas a análise de superfície de ataque
estava incompleta em dois pontos que mudam a gravidade real:

1. **"vínculo operacional em qualquer fazenda" não é uma barreira significativa.** Pelo ADR-0001
   (provisionamento de conta), todo signup novo cria automaticamente uma fazenda própria com
   `papel='admin'`. Ou seja, a checagem (i) da função não filtra "administradores privilegiados"
   — filtra apenas usuários vinculados **exclusivamente** como `financeiro` (convidados sem
   fazenda própria, um cenário minoritário). Na prática, **qualquer pessoa que se cadastra no
   sistema** — incluindo um concorrente da fazenda-alvo, sem nenhum vínculo real com ela —
   ganha automaticamente a permissão de chamar `definir_prazo_declaracao_estado('RS', ...)` e
   sobrescrever o prazo que todas as fazendas gaúchas enxergam.
2. **A superfície de ataque é a RPC, não a UI.** Nenhuma tela desta fase (Configurações, item 20)
   consome a função ainda — mas isso não reduz o risco: `grant execute ... to authenticated`
   deixa a função alcançável por qualquer client autenticado via chamada direta à API do
   Supabase (`supabase.rpc('definir_prazo_declaracao_estado', ...)`), sem depender de nenhum
   botão existir no frontend. Gates de segurança de migration têm que assumir a API como
   superfície já exposta, independente do estado do frontend.

Combinando os dois pontos: o cenário real não é "um admin mal-intencionado de uma fazenda
legítima no Paraná", é "qualquer visitante que cria uma conta grátis pode, com uma única chamada
de API, alterar dado que TODAS as fazendas de um estado (potencialmente centenas, alheias a esse
usuário) usam para saber se estão em dia com uma obrigação regulatória". Isso é sabotagem
plausível contra terceiros sem nenhuma relação com o atacante — categoria de risco que **não**
é proporcional a "aceitar com auditoria como mitigação", porque auditoria só resolve
*atribuição pós-fato*, não *prevenção*, e o custo de prevenir aqui era baixo.

### Por que a correção era barata o suficiente para não justificar aceitar o risco

A própria tarefa já apontava o caminho de correção (`fazendas.estado`, nullable) e autorizava
implementá-lo neste mesmo gate. Não havia necessidade de:
- Tornar a coluna obrigatória (explicitamente vedado pela tarefa — fazendas existentes não têm
  esse dado).
- Construir o fluxo de produto "complete seu cadastro" (fora de escopo).
- Quebrar a funcionalidade atual para fazendas sem `estado` preenchido.

Ou seja, dava para fechar a parte estruturalmente corrigível do problema (o mecanismo de
checagem) sem nenhum dos custos que fariam a correção "cara demais para agora" — diferente, por
exemplo, da decisão 1 do cabeçalho (`categoria` como texto livre), onde uma tabela nova de fato
teria custo real (RLS própria, tela de CRUD) sem ganho de integridade proporcional. Aqui o
trade-off era estritamente favorável a corrigir.

---

## CORREÇÕES APLICADAS

### 1. `fazendas.estado` (nova coluna, nullable) + autorização de `definir_prazo_declaracao_estado()` corrigida

- `alter table public.fazendas add column estado text constraint fazendas_estado_uf_check check
  (estado is null or estado ~ '^[A-Z]{2}$');` — seção 1.0 da migration.
- Autorização da função passou de "papel <> financeiro em QUALQUER fazenda" para "papel <>
  financeiro em uma fazenda cujo `estado`, SE preenchido, coincide com o estado do prazo sendo
  editado; fazendas sem `estado` (hoje, 100% do parque) continuam no fallback permissivo antigo".
- **Efeito honesto, documentado no próprio SQL:** para o parque de fazendas existente HOJE, o
  risco não é reduzido — nenhuma fazenda tem `estado` preenchido ainda, então toda fazenda cai no
  fallback e o comportamento é idêntico ao da versão original. O ganho real é estrutural: a partir
  do momento em que qualquer fazenda tiver `estado` preenchido (editável desde já pelo próprio
  admin/membro, mesma policy que já libera edição de `nome`), a validação para ELA fica
  imediatamente correta, sem nenhuma alteração de código futura. Isso é uma melhoria
  genuína de postura, não teatro de segurança — mas não devo, e não vou, reportar isso como "risco
  eliminado". É risco **reduzido estruturalmente para o futuro**, ainda presente para o parque
  atual até que `estado` seja coletado (pendência de produto, não deste gate).
- **Validado por smoke test real** (não só leitura de código) — ver seção de validação abaixo.

### 2. NULL-bypass em `definir_prazo_declaracao_estado()` — achado próprio deste gate, não sinalizado por `db_sage`

Os 4 parâmetros da função tinham checagens de formato que **não tratavam `NULL` explicitamente**:
`if v_estado !~ regex` com `v_estado = NULL` avalia para `NULL`, e `if NULL then ...` é tratado
como falso em PL/pgSQL — a validação era silenciosamente pulada. O mesmo valia para
`p_ano_referencia < 2000`, e a comparação de datas. Isso não abria um bypass de autorização (a
constraint `not null` das colunas da tabela ainda bloqueava a escrita), mas produzia um erro cru
do Postgres (`null value in column "estado" violates not-null constraint`) em vez de uma mensagem
própria — inconsistente com o padrão do projeto de mensagens de erro controladas pela função
(mesmo motivo do achado "oráculo de mensagens de erro" no gate da Fase 2). Corrigido com `is
null` explícito antes de cada validação de formato, com mensagens próprias
(`'estado é obrigatório'`, `'ano_referencia inválido'`, `'data_inicio_prazo e data_fim_prazo são
obrigatórias'`). Validado por smoke test (casos 6-7 abaixo).

### 3. Reordenação de validações

Validação de formato (UF/ano/datas) agora roda **antes** da checagem de autorização — evita gastar
uma query de autorização com um `v_estado` ainda não validado (que seria usado no `WHERE f.estado
= v_estado` da nova checagem). Efeito colateral positivo, não um achado de segurança por si.

---

## RESTANTE DA MIGRATION — revisado linha a linha, sem outros achados

- **As 3 fronteiras de `financeiro`:** `lancamentos_financeiros` e `declaracoes_rebanho` = SELECT
  liberado, zero INSERT/UPDATE/DELETE, conferido policy a policy contra spec 5.4 — correto.
  `prazos_declaracao_estado` = SELECT aberto a qualquer `authenticated` sem filtro de papel —
  justificado (tela de Declarações, que `financeiro` acessa, precisa do prazo vigente); ZERO
  policy de escrita — correto, e reforçado pela correção acima.
- **`usuarios_fazendas.papel` é `not null`** desde a Fase 1 — a comparação `papel <> 'financeiro'`
  não tem o vetor de bypass via `NULL` do achado crítico do gate do ADR-0002 (coluna diferente,
  schema garante não-nulo). Confirmado, sem achado.
- **Upsert por `(estado, ano_referencia)`:** `on conflict ... do update ... returning * into
  v_row` — forma correta (bug de `returning p into v_row` já identificado e corrigido pela
  própria `db_sage` antes deste gate, ver log dela). Sem achado adicional.
- **`categoria` texto livre** (decisão 1 do cabeçalho): revisado — mesmo padrão já aceito para
  `descricao`/`contraparte`/`observacoes` em tabelas anteriores (texto livre sem sanitização
  server-side é responsabilidade de escaping no frontend, não uma lacuna de schema). Sem achado.
- **Ausência de policy de DELETE:** `lancamentos_financeiros` (decisão própria, justificada por
  exportação contábil) e `declaracoes_rebanho` (decisão já dada pela spec, item 9 seção 9) —
  distinção correta, sem achado.
- **`atualizado_por_usuario_id ... on delete set null`:** correto — perder o usuário que fez a
  última edição não deveria apagar o prazo em si (auditoria degrada graciosamente, não em
  cascata).
- **`especie_id on delete restrict`** em `declaracoes_rebanho`: consistente com o padrão já
  revisado na migration anterior (catálogo→dado regulatório real, nunca cascade).
- **`obter_prazo_declaracao_estado()`:** `SECURITY INVOKER` (default), `STABLE`, só faz SELECT —
  já respeita a RLS de `prazos_declaracao_estado`. NULL em `p_estado`/`p_ano_referencia` produz
  uma linha com todos os campos `NULL` (sem erro) — aceitável para uma função de leitura pura,
  sem side effect; não é um achado de segurança (não expõe nada sensível, é dado público mesmo
  no caminho feliz).

---

## VERIFICAÇÃO DE DADOS

- **Criptografia em repouso:** sim (gerenciado pelo Supabase/infra, não alterado por esta
  migration).
- **Criptografia em trânsito:** sim (TLS via Supabase, não alterado por esta migration).
- **RLS / Controle de acesso:** validado. Todas as 3 tabelas com RLS habilitado; as 7 policies
  esperadas confirmadas (3 em `lancamentos_financeiros`, 3 em `declaracoes_rebanho`, 1 em
  `prazos_declaracao_estado`); escrita de `prazos_declaracao_estado` corretamente restrita a uma
  única função `SECURITY DEFINER` com autorização agora sensível a `fazendas.estado`.

---

## VALIDAÇÃO REAL EXECUTADA (local, não remota)

`supabase db reset` aplicou as 6 migrations (incluindo a corrigida) sem erro de sintaxe/constraint.

Smoke test funcional real via `docker exec ... psql`, sessões `authenticated` simuladas por
`set_config('request.jwt.claims', ...)` + `set local role authenticated` (não superuser
bypassando RLS), dentro de uma transação com `rollback` final — nenhum dado de teste ficou no
banco:

1. `fazendas.estado` existe, `is_nullable='YES'`, `data_type='text'` — confirmado.
2. `fazendas_estado_uf_check` = `CHECK (((estado IS NULL) OR (estado ~ '^[A-Z]{2}$'::text)))` —
   confirmado.
3. Admin de fazenda **sem** `estado` preenchido chamando para `RS` → **passou** (fallback
   permissivo preservado, sem regressão de funcionalidade atual).
4. Admin de fazenda **com** `estado='RS'` chamando para `RS` → **passou** (caso correto).
5. Admin de fazenda **com** `estado='RS'` chamando para `PR` → **rejeitado** com "sem permissão
   para editar prazos de declaração" — confirma que a correção efetivamente bloqueia o cenário
   central do risco, para fazendas que já têm `estado` preenchido.
6. `p_estado = NULL` → rejeitado com `'estado é obrigatório'` (não o erro cru de constraint) —
   confirma o fechamento do NULL-bypass.
7. `p_ano_referencia = NULL` → `'ano_referencia inválido'`; `p_data_inicio_prazo = NULL` →
   `'data_inicio_prazo e data_fim_prazo são obrigatórias'` — confirmado.

Script usado: `smoke_test.sql` (scratchpad da sessão, não commitado no repo — cobertura formal
pgTAP fica para `qa`, mesmo padrão dos gates anteriores).

---

## NOTAS DO CONSTANTINE

A modelagem da `db_sage` para este item foi tecnicamente sólida e **honesta** — ela documentou o
limite no cabeçalho da migration antes mesmo de eu pedir, com uma análise de trade-off que eu
concordo em quase tudo, exceto na severidade atribuída ao risco central. Isso não é uma crítica ao
trabalho dela: julgar "essa barreira de autorização é forte o suficiente" exige conhecer o
comportamento de outra parte do sistema (ADR-0001, provisionamento automático de conta) que não
estava no escopo direto da tarefa dela. É exatamente o tipo de lacuna que este gate existe para
pegar — avaliar uma peça de autorização isolada é insuficiente; é preciso avaliar quem
efetivamente consegue chegar até ela.

Vou repetir aqui o que já é padrão neste squad: meu veto é técnico e final em segurança, mas
"vetar" não significa sempre "devolver para outro agente resolver depois". Quando a correção
está dentro do escopo que a própria tarefa já autorizou e o custo é baixo, o gate mais eficiente é
aplicar a correção agora, no mesmo lugar onde o risco foi encontrado, e deixar registrado o porquê
— não empurrar trabalho corretivo para uma iteração futura que pode nunca vir.

**Pendência que registro para o futuro (não bloqueante deste gate):** a correção aplicada aqui
só protege fazendas que **já preencheram** `estado`. Como nenhuma fazenda tem esse dado hoje, o
risco central (qualquer usuário cadastrado podendo alterar o prazo de qualquer estado) **segue
presente na prática, até que exista um fluxo de produto que colete `fazendas.estado`** dos
usuários (novo signup e/ou "complete seu cadastro" para fazendas existentes). Isso não é uma
omissão deste gate — é uma dependência de produto genuína, fora do escopo técnico que eu posso
resolver sozinho. Fica registrado como pendência de segurança monitorada na seção 4 do
`PROJECT_CONTEXT.md`.

**Recomendação para `qa`:** cobertura pgTAP formal do cenário do achado nº1 (fazenda com estado
divergente rejeitada) e do NULL-bypass fechado (achado nº2), nos mesmos moldes do smoke test
manual acima.

**`supabase db push` não executado** — decisão humana/orchestrator, fora do escopo deste gate.

---

## Mudanças de arquivo

- `supabase/migrations/20260720150000_fase3_financeiro_declaracoes_prazos.sql` — editado:
  seção 1.0 nova (`alter table fazendas add column estado`), autorização de
  `definir_prazo_declaracao_estado()` corrigida (estado + NULL-safety), comentários de cabeçalho/
  função/tabela atualizados para refletir a correção.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, veredito 🟢, pendência da
  seção 4 atualizada (não removida — parcialmente mitigada, não resolvida por completo).
