# Log — Security review Fase 3, item 12: saldo_rebanho_movimentos/obter_saldo_rebanho/saldo_rebanho — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-20
- **Agente responsável:** cyber_chief (Constantine) — gate de segurança formal de
  `supabase/migrations/20260720200000_fase3_saldo_rebanho.sql`, entregue pela `db_sage` no
  mesmo dia.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push` (decisão de aplicar continua
  humana/orchestrator).

## [SECURITY ANALYSIS]

- **Componente:** view `saldo_rebanho_movimentos`, função `obter_saldo_rebanho(date)`, view de
  conveniência `saldo_rebanho` — primeiro objeto calculado (não tabela) do Eixo 2, consome dado
  de `transacoes`/`transacoes_detalhe` já protegido por RLS.
- **Status:** 🟢 Seguro.

## Ponto 1 — `security_invoker = true` nas duas views

**Confirmado presente e funcionando.** Sem essa opção, as views rodariam com o privilégio de
quem as criou (dono das tabelas, isento de RLS), vazando saldo de TODAS as fazendas para
qualquer `authenticated` — mesma classe de risco já revisada e fechada na Fase 2
(`animais_com_detalhes`/`lotes_com_estatisticas`). Validado por teste real: `anon` chamando
`obter_saldo_rebanho()` (que depende da view por trás) retorna **0 linhas**; um usuário
`authenticated` vinculado a uma fazenda enxerga só a própria.

## Ponto 2 — decisão de design mais importante da migration: classificar registrada/pendente via `transacoes.status_gta_transacao`, não via JOIN em `gtas.status_liberacao`

**Avaliação: decisão correta, evitou um bug de correção (não de autorização) antes mesmo de
existir.** `gtas` tem RLS que exclui `financeiro` por completo (zero SELECT). Se a view
dependesse de um LEFT JOIN em `gtas`, um usuário `financeiro` (RLS aplicada via
`security_invoker`) veria sempre `null` do lado de `gtas` — toda movimentação cairia
silenciosamente em "registrada", produzindo um saldo DIFERENTE (e errado) do que admin/membro
veem para a MESMA fazenda. Isso não seria uma fuga de dado (não é vazamento de autorização),
mas quebraria a premissa de fonte única de verdade do módulo — categoria de bug sutil que só
apareceria em produção quando um contador/financeiro consultasse o saldo.

**Validado por teste real, não só leitura de código:** montado um cenário com fazenda
compartilhada por um usuário `admin` e um usuário `financeiro` (vínculo `usuarios_fazendas`
inserido diretamente, teste local) — os dois leem `obter_saldo_rebanho()` e enxergam
EXATAMENTE os mesmos números (100 registrada / 10 pendente) para a mesma combinação
espécie/agrupamento/sexo, mesmo com `financeiro` tendo 0 linhas visíveis em `select count(*)
from gtas` direto. Confirma que a escolha de usar `status_gta_transacao` (que `financeiro` TEM
acesso via SELECT em `transacoes`) em vez de `gtas.status_liberacao` fecha esse vetor
estruturalmente, não por sorte.

## Ponto 3 — "espinha" completa (fazenda × espécie × agrupamento × sexo) via CTE + LEFT JOIN

**Sem achado.** A CTE `fazendas_do_usuario` usa o mesmo padrão já revisado dezenas de vezes
neste projeto (`select fazenda_id from usuarios_fazendas where usuario_id = auth.uid()`) —
escopo correto por RLS transitiva de `usuarios_fazendas`. O cross join com `especies`/
`agrupamentos_etarios`/sexo não introduz nenhum dado sensível (mesmo catálogo de leitura aberta
já revisado no gate do item 10) — só gera a grade de combinações possíveis, sem nenhuma
informação de negócio antes do LEFT JOIN em `saldo_rebanho_movimentos`.

## Restante da migration — revisado, sem achados adicionais

- Função `obter_saldo_rebanho()`: `SECURITY INVOKER` explícito (sem elevação), `set search_path
  = ''`, `language sql stable` — todos os padrões já exigidos em funções anteriores deste
  projeto.
- `saldo_rebanho_movimentos`: não expõe nenhuma coluna de `gtas` (evita até a tentação de um
  consumidor futuro reintroduzir o vetor do Ponto 2 sem querer).
- Nenhuma tabela nova, nenhuma policy nova necessária — os três objetos são só leitura,
  compostos inteiramente sobre RLS já existente e já gated (transacoes/transacoes_detalhe, Fase
  3 item 11; agrupamentos_etarios/especies, Fase 3 item 10; usuarios_fazendas, Fase 1).

## [VERIFICAÇÃO DE DADOS]

- Criptografia em repouso/trânsito: sim (infra gerenciada, sem mudança).
- RLS / Controle de acesso: **validado** — smoke test real via `docker exec`/`psql` e um
  usuário real criado via GoTrue local (`/auth/v1/signup`, exercitando o trigger de
  provisionamento de verdade, não um insert direto simulando o usuário): (1) `anon` vê 0 linhas;
  (2) usuário sem nenhuma fazenda vinculada não aparece (implícito, CTE vazia); (3) usuário de
  uma fazenda não vê dado de outra fazenda (`usuario2_isolamento`: 8 linhas de espinha, mas
  todas com total 0 — sem enxergar a venda pendente da fazenda 1); (4) `financeiro` e `admin` da
  MESMA fazenda veem números idênticos, apesar de `financeiro` não enxergar `gtas` — a decisão
  central do design (Ponto 2) confirmada na prática, não só na intenção.

## [NOTAS DO CONSTANTINE]

- "Se essa view tivesse dependido de `gtas` para classificar pendente/registrada, `financeiro`
  veria um saldo incorreto sem nenhum erro, sem nenhum log — o pior tipo de bug de segurança
  adjacente: não vaza dado, mas corrompe silenciosamente a confiança no número que o produtor
  usa pra declarar ao Estado."
- Esta é a primeira migration do Eixo 2 que é só leitura (nenhuma tabela nova, nenhuma policy de
  escrita) — superfície de ataque pequena por natureza, mas o Ponto 2 mostra que "só leitura"
  não significa "sem risco de design".

## Validação de CORREÇÃO (não é escopo formal do gate de segurança, mas registrado por
## completar o Checkpoint de Validação de Saldo da spec)

Reproduzidos os dois prints reais de referência fornecidos por JP em 2026-07-20
(`Bovinos/Ovino-saldo-atual.png`) inserindo transações equivalentes localmente:
- **Ovino:** 4/4 combinações agrupamento×sexo batem exatamente (8/0, 19/0, 1/0, 37/0).
- **Bovino:** 8/8 combinações batem exatamente, incluindo os totais **201 registrada / 184
  pendente** — idênticos ao print.

## Mudanças de arquivo

- Nenhuma mudança em `supabase/migrations/20260720200000_fase3_saldo_rebanho.sql` — aprovada
  como está.
- Novo `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-saldo.md` (este log).
- `PROJECT_CONTEXT.md` — nova entrada + seções 1/4.

## Pendências

- **Checkpoint de Validação de Saldo (gate elevado, não é este gate técnico):** apresentar a
  comparação lado a lado (prints reais × números calculados) para **JP confirmar
  explicitamente** antes de considerar o item 12 fechado e avançar para a Fase 4 — regra
  específica de `multi-agent-workflow.md`, diferente da aprovação técnica de rotina.
- Limite honesto já documentado no cabeçalho da migration: `transacoes_detalhe` é opcional
  (spec) — transações históricas reais que só têm `observações` em texto livre (vários exemplos
  no print "Controle de entradas e saídas" de JP) não entram no saldo calculado até serem
  estruturadas. Não é um achado de segurança, é uma limitação de dado de entrada.
- `supabase db push` não executado — decisão humana/orchestrator, fora do escopo deste gate.
