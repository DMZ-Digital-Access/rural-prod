# Log — Security review Fase 3, item 10: especies/subtipos_especie/agrupamentos_etarios — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança formal de
  `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql`, entregue pela `db_sage`
  no mesmo dia (ver `.agents/memory/log/2026-07-20-db_sage-schema-fase3-especies.md`). Único
  item da Fase 3 (dos 3 já escritos: itens 10/11/13) ainda sem gate até esta tarefa.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push` (decisão de aplicar continua
  humana/orchestrator). **Nenhuma correção necessária** — primeira migration da Fase 3 a passar
  pelo gate sem nenhum achado que exigisse mudança de código.

## Escopo do gate

Os 3 pontos de atenção que a própria `db_sage` pediu para este gate (ver seção final do log
dela) + revisão independente linha a linha do restante da migration.

## [SECURITY ANALYSIS]

- **Componente:** `especies` / `subtipos_especie` / `agrupamentos_etarios` (catálogo de
  referência global, primeira tabela do projeto sem `fazenda_id`).
- **Status:** 🟢 Seguro.

## Ponto 1 — RLS de leitura aberta a qualquer `authenticated`, sem filtro de papel

**Avaliação: correta, sem achado.** Diferente de `lotes`/`animais`/`pesagens` (Fase 2), onde
`papel='financeiro'` é excluído por ser dado de manejo individual de Eixo 1 (spec seção 5.4),
aqui a exclusão por papel seria um erro, não uma correção — este catálogo alimenta os módulos
de Eixo 2 (GTA/Transações/Financeiro), aos quais `financeiro` tem acesso explícito. As 3 tabelas
não carregam nenhum dado sensível por fazenda/usuário (nome de espécie, subtipo e faixa etária
são nomenclatura regulatória pública, não dado de negócio de nenhum cliente específico) — não há
ângulo de exposição de dado que a leitura ampla crie. Validado por smoke test real (não só
leitura do SQL): sessão `anon` vê 0 linhas (bloqueada, RLS ativa e sem policy para o papel);
sessão `authenticated` genérica (sem vínculo com nenhuma fazenda, `set local role authenticated`
+ `request.jwt.claims` simulado) vê as 8/9/24 linhas completas nas 3 tabelas — confirma que
mesmo um usuário recém-criado, sem `usuarios_fazendas` nenhum, consegue popular os selects de
formulário de qualquer módulo, como pretendido.

## Ponto 2 — FK composta com MATCH SIMPLE (integridade subtipo↔espécie)

**Avaliação: correta, sem achado.** O entendimento da `db_sage` está certo: MATCH SIMPLE (padrão
do Postgres) não verifica a FK composta quando `subtipo_especie_id` é NULL — comportamento
correto e não abre janela de inconsistência, porque o único dado que a FK protege é "quando HÁ
subtipo, ele pertence à espécie certa"; ausência de subtipo não é um estado que precise de
validação cruzada. Confirmado por teste direto (não só leitura do schema): tentativa de inserir
uma faixa etária de Bovinos apontando para o subtipo "Frango de Corte" (que pertence a Aves) foi
**rejeitada** pela constraint `agrupamentos_etarios_subtipo_mesma_especie` com a mensagem padrão
de violação de FK — o vetor de dado inconsistente que a `db_sage` queria ver descartado está de
fato fechado no nível do schema, não só na intenção do design.

## Ponto 3 — decisões de transcrição (Muares subtipo único; sobreposição Suíno/Aves-Frango)

**Avaliação: não são achados de segurança.** Ambas são decisões de modelagem de dado/produto já
documentadas exaustivamente no cabeçalho da migration e no log da `db_sage`, com a leitura mais
específica disponível (instrução explícita da tarefa) prevalecendo sobre a redação ambígua da
spec. Não criam vetor de bypass de autorização, injeção, nem exposição de dado — ficam como
pendência de modelagem/produto (já registrada em `PROJECT_CONTEXT.md` seção 4), fora do escopo
de um gate de segurança. Nenhuma ação deste gate.

## Restante da migration — revisado linha a linha, sem achados adicionais

- **Escrita (INSERT/UPDATE/DELETE):** zero policy para `authenticated`/`anon` nas 3 tabelas —
  default-deny confirmado por `pg_policies` (exatamente 3 policies no total, todas `SELECT`,
  todas `to {authenticated}` — sem policy órfã ou duplicada) e por smoke test real: `INSERT`
  como `authenticated` rejeitado com `new row violates row-level security policy`; `UPDATE`/
  `DELETE` como `authenticated` afetam 0 linhas (RLS sem policy para o comando = `using (false)`
  implícito, dado não é alterado). Sem regressão possível pela ausência de `anon` nas policies —
  `anon` também não lê nem escreve nada.
- **`especies.ativo` sem filtro na RLS de SELECT:** avaliado como decisão correta, não achado —
  é um soft-disable de UI (popular ou não um select de formulário), não um controle de acesso;
  não há dado sensível a esconder ao deixar espécies inativas visíveis via leitura.
- **Cascatas (`on delete cascade`)** de `especies`→`subtipos_especie`→`agrupamentos_etarios`:
  sem risco de exploração via client (escrita já bloqueada por RLS para qualquer papel); só
  executável por migration/superuser, consistente com a decisão de que este catálogo é
  administrado pelo squad, nunca pela UI.
- **Nenhuma função nova nesta migration** — não se aplica a checagem de `search_path` mutável
  (só reaproveita `trigger_set_updated_at()`, já revisado na Fase 1).
- **Seed:** contagem 8/9/24 confirmada por query real (`docker exec`/`psql`), batendo com o
  reportado pela `db_sage`.

## [VERIFICAÇÃO DE DADOS]

- Criptografia em repouso: sim (herdada da infra gerenciada Supabase, sem dado novo que mude
  essa avaliação).
- Criptografia em trânsito: sim (idem).
- RLS / Controle de acesso: **validado** — smoke test real via `docker exec`/`psql`, sessões
  `anon`/`authenticated` simuladas (`set local role` + `request.jwt.claims`), não superuser.
  Todos os testes rodados dentro de transações com `rollback` (ou abortadas por erro esperado) —
  nenhum dado de teste ficou no banco (`especies` confirmada com 8 linhas ao final, mesma
  contagem do seed).

## [NOTAS DO CONSTANTINE]

- "Se abríssemos a leitura por papel neste catálogo, quebraríamos o próprio financeiro que a
  spec manda deixar entrar em Eixo 2 — a decisão certa aqui era NÃO restringir, e é isso que a
  migration faz."
- Esta é a primeira migration da Fase 3 a sair do gate sem nenhuma correção — reflexo direto de
  ser a mais simples das três (catálogo de leitura, sem função nova, sem lógica de negócio
  mutável) e de a `db_sage` já ter antecipado corretamente os 2 pontos de atenção técnica reais.

## Validação real executada (local, não remota)

`supabase db reset` aplicou as 6 migrations do zero sem erro. Smoke test funcional via `docker
exec`/`psql` (container `supabase_db_rural-prod`), sessões `anon`/`authenticated` simuladas via
`set local role` + `set local request.jwt.claims` (não superuser, dentro de transações com
`rollback`): (1) contagem de seed 8/9/24 confirmada; (2) `anon` vê 0 linhas em `especies`; (3)
`authenticated` sem vínculo de fazenda vê as linhas completas das 3 tabelas; (4) `INSERT` como
`authenticated` rejeitado por RLS; (5) `UPDATE`/`DELETE` como `authenticated` afetam 0 linhas;
(6) `INSERT` de faixa etária cruzando espécie/subtipo incompatível rejeitado pela FK composta;
(7) `pg_policies` confirma exatamente 3 policies, todas SELECT/authenticated, sem policy
sobressalente. 7/7 cenários conferindo o esperado, nenhum dado de teste ficou no banco.

## Mudanças de arquivo

- Nenhuma mudança em `supabase/migrations/20260720120000_fase3_especies_agrupamentos.sql` —
  aprovada como está.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-especies.md` (este log).
- `PROJECT_CONTEXT.md` — nova entrada no topo da seção 5, atualização das seções 1 e 4.

## Pendências

Nenhuma pendência de segurança nova. Com este gate, **as 3 migrations da Fase 3 escritas até
agora (itens 10/11/13) estão todas liberadas para `supabase db push`** — decisão de aplicar ao
remoto continua humana/orchestrator, fora do escopo deste gate. Itens 12 (saldo de rebanho,
bloqueado por prints de referência) e 14 (Storage) seguem não iniciados.
