# Log — ADR-0004: desenho técnico de `transacoes_animais` (Opção B) — `architect` (ALEX, via Claude)

- **Data:** 2026-07-20
- **Agente responsável:** architect (ALEX), squad DMZ.
- **Tipo de tarefa:** formalização de ADR (dívida de processo), sem implementação de código/SQL.
- **Escopo:** exclusivamente o desenho técnico da tabela de vínculo `transacoes_animais`
  (spec seção 3.3, Opção B) — mecanismo de atualização automática de `animais.status`,
  fronteira de permissão do papel `financeiro`, integridade cross-fazenda e reversibilidade.
  `gtas`/`transacoes`/`transacoes_detalhe` **não foram redesenhadas** — schema já fechado pela
  spec (seção 3.2), fora de escopo desta tarefa; foram lidas só como contexto porque
  `transacoes_animais` referencia `transacoes`.

## Por que esta tarefa existia

Em 2026-07-16, JP confirmou a Opção B de reconciliação Eixo 1 ↔ Eixo 2 (vínculo automático
transação↔animal, em vez da Opção A desacoplada). `especificacao-sistema.md` seção 3.3 foi
atualizada na hora, terminando com "`architect` (Alex) formaliza o ADR correspondente na Fase
3" — isso nunca aconteceu. `PROJECT_CONTEXT.md` seção 2 registrava essa promessa desde então. A
Fase 3 começou em 2026-07-20 (catálogos `especies`/`subtipos_especie`/`agrupamentos_etarios`
entregues por `db_sage`, ainda no gate do `cyber_chief`), e o próximo bloco de schema da mesma
fase é exatamente `gtas`/`transacoes`/`transacoes_detalhe`/`transacoes_animais` (spec seção 10,
item 11) — hora certa de fechar a dívida antes de `db_sage` escrever essa migration.

## O que foi lido antes da decisão

1. `especificacao-sistema.md` seção 3.3 (a decisão de Opção B já registrada, incluindo o
   desenho conceitual de `transacoes_animais` e a natureza best-effort/não obrigatória do
   vínculo), seção 3.2 (schema já fechado de `gtas`/`transacoes`/`transacoes_detalhe`, só para
   contexto de referência), seção 4.1 (regra de status mutuamente exclusivo do animal
   individual) e seção 5.4 (fronteira de acesso do papel Financeiro/Contábil).
2. `supabase/migrations/20260717140000_fase2_lotes_animais_pesagens.sql` — schema de `animais`
   já aplicado (`status`, `fazenda_id`) e os padrões de trigger de integridade da Fase 2
   (`validar_lote_mesma_fazenda()`, `prevent_fazenda_id_change()`, guarda de campos calculados)
   usados como referência de padrão de projeto, não copiados cegamente.
3. `.agents/memory/log/2026-07-17-cyber_chief-review-fase2.md` — achado nº1 (RLS de
   `lotes`/`animais`/`pesagens` não excluía `financeiro`, violando spec seção 5.4) — usado como
   o precedente direto que motivou reavaliar a fronteira de permissão para `transacoes_animais`
   com critério próprio, não repetição automática.
4. `.agents/memory/PROJECT_CONTEXT.md` (seções 1, 2 e 4) — para localizar a promessa pendente
   de 2026-07-16 e o estado atual da Fase 3.

## As 5 decisões tomadas

1. **Mecanismo:** dois triggers `SECURITY INVOKER` em `transacoes_animais` — `BEFORE INSERT`
   valida mesma fazenda (D4) e denormaliza `tipo_operacao_transacao` (coluna nova, cópia
   imutável do `tipo_operacao` da transação no momento do vínculo — decisão D1, motivada por
   evitar depender de reconsultar `transacoes` num `DELETE` em cascata futuro); `AFTER INSERT`
   aplica `animais.status = 'venda'` **só quando** `tipo_operacao_transacao = 'venda'` — para
   `compra`/`entrada_pastoreio`/`saida_pastoreio`, o vínculo é permitido e gravado sem efeito
   colateral. `SECURITY INVOKER`, não `SECURITY DEFINER`: quem pode inserir em
   `transacoes_animais` (`admin`/`membro`) já tem `UPDATE` direto em `animais.status` via a
   policy da Fase 2 — nenhuma elevação de privilégio é necessária, reduzindo a superfície de
   revisão de segurança.
2. **Fronteira `financeiro`:** zero acesso (nem `SELECT`) para `papel = 'financeiro'` em
   `transacoes_animais`, por dois motivos independentes: (a) a spec seção 5.4 já nega a
   `financeiro` "edição de transações" — a premissa "financeiro tem acesso a `transacoes`,
   logo..." do enunciado da tarefa não se sustenta, porque `financeiro` não deveria ter escrita
   em `transacoes` também (nota de dependência registrada para `db_sage`, não decidida aqui,
   pois está fora do escopo desta tarefa); (b) mesmo que a leitura de `transacoes` seja liberada
   no futuro, `animal_id` é dado de manejo individual (Eixo 1), a mesma categoria que a Fase 2
   já nega a `financeiro` sem exceção. Reavaliado com critério próprio (não copiado da Fase 2
   sem reanálise), documentado como tal no ADR.
3. **Cross-fazenda:** mesmo padrão de `validar_lote_mesma_fazenda()` (Fase 2) — trigger `BEFORE
   INSERT`, `SECURITY INVOKER`, mensagem de erro genérica (não-oráculo), não `CHECK` constraint
   (não pode consultar outra tabela) nem RLS isolada.
4. **Reversibilidade:** trigger `AFTER DELETE`, `SECURITY INVOKER` — reverte
   `animais.status = 'ativo'` somente se (a) o vínculo desfeito era de uma venda
   (`OLD.tipo_operacao_transacao = 'venda'`), (b) o status atual do animal ainda é `'venda'`
   (guarda de não-regressão — não sobrescreve um `'morte'`/`'baixa'` legítimo aplicado depois do
   vínculo) e (c) não existe outro vínculo de venda remanescente para o mesmo animal (guarda de
   coexistência, ligada à decisão 5).
5. **Revenda:** sem trava no banco nesta fase — `INSERT` em `transacoes_animais` para um animal
   já `status ≠ 'ativo'` é permitido (o trigger só reaplica/atualiza o status). Mesmo padrão de
   "decisão de produto sem bloqueio técnico" já confirmado como aceitável pelo `cyber_chief` na
   Fase 2 (`registrar_pesagem()` não valida status do animal). Pendência explícita deixada para
   `developer`: sinalização visual (não bloqueante) na tela de seleção de animais quando o
   animal já não está `'ativo'`.

## Trade-offs que `db_sage` precisa saber antes de implementar

- **Coluna nova em `transacoes_animais` não prevista literalmente pela spec:**
  `tipo_operacao_transacao` (denormalizada, imutável, capturada no `BEFORE INSERT`) — necessária
  para os mecanismos de D2 e D4/D5 funcionarem sem depender de ordem de execução de cascata.
  Documentar a razão no comentário SQL da coluna ao implementar.
- **Sem `SECURITY DEFINER` nesta tabela** — os dois triggers rodam com privilégio do chamador.
  Isso só é seguro porque as policies de `INSERT`/`DELETE` de `transacoes_animais` (que
  `db_sage` ainda vai escrever) precisam replicar a mesma exclusão `papel <> 'financeiro'`
  (ou melhor, `papel in ('admin','membro')`) já decidida aqui — se essa policy nascer mais
  permissiva do que o decidido neste ADR, o trigger `SECURITY INVOKER` de D2 herdaria
  silenciosamente a falha (um `financeiro` conseguiria disparar `UPDATE animais.status` por
  tabela, mesmo sem ter `UPDATE` direto em `animais`, se a policy de `transacoes_animais` não
  fosse escrita corretamente). `db_sage` precisa implementar a policy de acordo com D3
  literalmente, não aproximadamente.
- **Nenhuma trava de revenda (D6)** — se `db_sage`/`cyber_chief` acharem esse risco alto demais
  no momento da implementação, é uma conversa a ter antes do gate, não depois — mas a decisão
  registrada aqui é deliberada, não uma omissão.
- **Dependência aberta sobre a RLS de `transacoes` que `db_sage` ainda vai escrever** — a
  fronteira de `financeiro` decidida aqui assume que `transacoes`/`transacoes_detalhe` também
  vão negar escrita a `financeiro` (só leitura). Se `db_sage` decidir diferente, este ADR
  precisa ser revisitado (Critério de Revisão nº1).

## Mudanças de arquivo

- Novo `.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md`.
- Este log.
- `.agents/memory/PROJECT_CONTEXT.md` — nova entrada no topo da seção 5; seção 2 (Decisões)
  ganhou uma linha para o ADR-0004; a menção pendente de "`architect` formaliza ADR na Fase 3"
  na linha de 2026-07-16 da seção 2 foi resolvida (referência atualizada para o ADR-0004
  concluído).

## Pendências / próximos passos (não bloqueantes para este ADR)

- `db_sage`: implementar `transacoes_animais` (schema completo, incluindo `tipo_operacao_transacao`)
  junto com `gtas`/`transacoes`/`transacoes_detalhe` (spec seção 10, item 11), seguindo D1-D6
  deste ADR literalmente para os pontos que ele decide; desenhar a RLS de
  `transacoes`/`transacoes_detalhe` com a premissa de D3 em mente (financeiro: leitura sim,
  escrita não).
- `cyber_chief`: gate de segurança obrigatório antes de `supabase db push`, como em todas as
  fases anteriores — atenção especial pedida à fronteira de `financeiro` (D3) e à ausência de
  `SECURITY DEFINER` nos dois triggers (D2/D4/D5, verificar que a superfície `SECURITY INVOKER`
  realmente não abre brecha, dado que depende inteiramente da policy de `transacoes_animais`
  estar correta).
- `developer`: pendência de UX de D6 (sinalização visual de animal não-ativo na tela de seleção
  de animais do módulo de Transações) quando as telas de Eixo 2 forem implementadas (Fase 4).
