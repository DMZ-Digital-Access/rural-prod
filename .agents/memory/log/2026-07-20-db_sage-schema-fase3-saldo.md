# Log — Schema Fase 3, item 12: saldo de rebanho (view calculada) — `db_sage` (SOFIA)

- **Data:** 2026-07-20
- **Agente responsável:** db_sage (SOFIA) — item 12 da seção 10 da spec, desbloqueado no mesmo
  dia pelos prints reais de referência que JP forneceu (`Bovinos/Ovino-saldo-atual.png`,
  `Controle-entradas-saidas.png`, `Declaracoes-de-animais.png`, GTAs).

## O que foi feito

Migration nova `supabase/migrations/20260720200000_fase3_saldo_rebanho.sql`, aditiva, com 3
objetos, todos só-leitura (nenhuma tabela nova):

1. `public.saldo_rebanho_movimentos` (view, `security_invoker=true`) — um registro por linha de
   `transacoes_detalhe`, com quantidade já sinalizada (+ compra/entrada_pastoreio, -
   venda/saida_pastoreio) e classificação `registrada`/`pendente`.
2. `public.obter_saldo_rebanho(p_data_referencia date default current_date)` (função STABLE,
   SECURITY INVOKER, `search_path=''`) — agrega (1) até a data informada, contra a "espinha"
   completa de fazenda×espécie×agrupamento×sexo (replica os zeros visíveis no print, não só as
   combinações com movimento real).
3. `public.saldo_rebanho` (view de conveniência, `security_invoker=true`) — nome literal usado
   pela spec seção 3.2, cobre o caso "saldo de hoje" chamando a função com `current_date`.

## Decisão mais importante: classificar pendente/registrada via `status_gta_transacao`, não via `gtas`

`transacoes.status_gta_transacao` já existe (Fase 3 item 11) e reflete o status da GTA
diretamente na própria transação — usar essa coluna em vez de um JOIN em `gtas.status_liberacao`
evita que o resultado dependa da RLS de `gtas` (que exclui `financeiro` por completo). Ver
detalhamento completo no cabeçalho da migration e no gate do `cyber_chief` (mesma data) — a
alternativa (join em `gtas`) teria produzido saldo ERRADO para `financeiro` sem nenhum erro
visível, um bug de correção mascarado de RLS "correta".

## Ambiguidade resolvida com JP durante a implementação

Ao testar o cenário de uma venda com GTA pendente, a soma assinada gerou um número **negativo**
em `qtd_pendente` (-10 para uma venda pendente de 10 animais) — nenhum dos prints de referência
mostra esse caso específico (só mostram entradas pendentes). Perguntado a JP: confirmou que
"pendente" se aplica **simetricamente a entrada e saída** — "pendente é quando ainda não tem no
sistema a GTA referente àquela transação, seja a entrada ou a saída de animal(is)". Isso valida
a implementação simétrica já escrita (nenhuma mudança de código foi necessária, só a
confirmação).

## Validação real executada (local, não remota)

`supabase db reset` aplicou as 8 migrations sem erro. Usuários de teste reais criados via
GoTrue local (`/auth/v1/signup`, exercitando o trigger `handle_new_user()` de verdade, não
inserção direta simulando o usuário):

- **Reprodução exata do print de Ovino:** 4/4 combinações agrupamento×sexo batem (8/0, 19/0,
  1/0, 37/0).
- **Reprodução exata do print de Bovino:** 8/8 combinações batem, incluindo os totais **201
  registrada / 184 pendente**.
- **Isolamento cross-fazenda:** usuário de uma fazenda diferente não enxerga nenhum dado da
  fazenda de teste (espinha vazia de movimento, totais 0).
- **`financeiro` vs. `admin` na mesma fazenda:** números idênticos (100/10), confirmando que a
  decisão de não depender de `gtas` funciona na prática.
- **`anon`:** 0 linhas.

## Limite honesto documentado

`transacoes_detalhe` é opcional (spec) — uma transação real que só tem `observações` em texto
livre (vários exemplos no print `Controle-entradas-saidas.png` de JP, ex.: "Todos machos" sem
quebra por faixa etária) não entra no saldo calculado até ser estruturada. Não é um bug desta
migration, é a consequência já documentada pela própria spec de tornar `transacoes_detalhe`
recomendado, não obrigatório.

## Mudanças de arquivo

- Novo `supabase/migrations/20260720200000_fase3_saldo_rebanho.sql`.
- Este log; log do gate do `cyber_chief`
  (`.agents/memory/log/2026-07-20-cyber_chief-review-fase3-saldo.md`); `PROJECT_CONTEXT.md`
  (seções 1, 4, 5).

## Pendências

- Gate do `cyber_chief`: **CONCLUÍDO no mesmo dia, 🟢, sem correção necessária** (ver log
  próprio).
- **Checkpoint de Validação de Saldo** (gate elevado da spec, distinto da aprovação técnica de
  rotina): apresentar a comparação lado a lado a JP para confirmação explícita antes de avançar
  para a Fase 4 — feito na mesma sessão, ver `PROJECT_CONTEXT.md`.
- `supabase db push` não executado nesta entrada — decisão humana/orchestrator.
