# Log — Security review: RPC registrar_saida_animais_individuais() — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-21
- **Migration:** `20260721020000_rpc_registrar_saida_animais_individuais.sql`.
- **Veredito:** 🟢 Seguro. Liberada para `supabase db push`.

## Análise

`SECURITY INVOKER` — mesmo princípio de `registrar_entrada_saida_lote()` (ADR-0005): admin/
membro já tem `INSERT` direto em `transacoes`/`transacoes_detalhe`/`transacoes_animais` via RLS
existente (itens 11/ADR-0004), nenhuma elevação necessária. A validação cross-fazenda entre
`transacao_id` e cada `animal_id` já é feita pelos triggers existentes
(`preparar_vinculo_transacao_animal()`) — esta função não precisou reimplementar nada disso, só
inserir.

**Validação nova, própria desta função:** rejeita explicitamente qualquer `animal_id` com
`data_nascimento is null` (ainda pendente de individualização) antes de qualquer INSERT — decisão
de produto (vender/matar/consumir um animal sem identidade básica não faz sentido), não uma
questão de segurança, mas evita um estado de dado inconsistente (transação registrada
referenciando um animal que nunca teve idade/peso reais).

## [VERIFICAÇÃO DE DADOS]

Validado por teste real (usuário via GoTrue local, sessão `authenticated`):
1. Venda de 2 animais (20 e 30 meses) — `status` de ambos vira `venda`; `transacoes_detalhe`
   calculou corretamente os agrupamentos etários reais (`13-24 meses`/`25-36 meses`) a partir da
   idade na data da operação — mais preciso que o "Não classificado" da tela de entrada
   agregada.
2. Tentativa de vender um animal pendente (sem `data_nascimento`) — rejeitada com mensagem
   própria, nenhuma linha criada.
3. `financeiro` tentando chamar a função — bloqueado pela RLS de `transacoes` (mesma fronteira
   já validada em migrations anteriores).

## Mudanças de arquivo

Nenhuma — aprovada como está.
