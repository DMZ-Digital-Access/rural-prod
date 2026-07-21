# Log — Tela de seleção de animal individual para Venda/Óbito/Consumo — `db_sage`+`cyber_chief`+`developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** segundo dos "próximos passos" combinados com JP — o mecanismo de banco
  (ADR-0004/0005/0006, `transacoes_animais`) já existia, mas faltava a UI para escolher quais
  animais específicos participam de uma venda/óbito/consumo.

## Schema

Nova migration `20260721020000_rpc_registrar_saida_animais_individuais.sql` — RPC
`registrar_saida_animais_individuais()` (SECURITY INVOKER): cria a transacao, insere uma linha
em `transacoes_animais` por animal selecionado (os triggers já existentes cuidam de validar
cross-fazenda e atualizar `animais.status` automaticamente — nenhuma lógica nova precisou ser
escrita para isso), e popula `transacoes_detalhe` com o **agrupamento etário real** de cada
animal (calculado pela idade na data da operação, usando `agrupamentos_etarios` da espécie) —
mais preciso que o "Não classificado" da entrada agregada, porque aqui a `data_nascimento` de
cada animal já é conhecida. Rejeita explicitamente qualquer animal ainda pendente de
individualização.

Gate do `cyber_chief` concluído (🟢) — ver
`.agents/memory/log/2026-07-21-cyber_chief-review-saida-animais-individuais.md`.

## Frontend

- `EntradaSaidaLoteDialog.tsx` reestruturado como shell: seletor de "Tipo de operação"
  compartilhado (fora de qualquer `<Form>`, gerenciado por `useState`) + renderiza
  `EntradaAgregadaForm` (Compra/Nascimento) ou `SaidaAnimaisIndividuaisForm` (Venda/Óbito/
  Consumo) por baixo.
- `SaidaAnimaisIndividuaisForm.tsx` novo — checklist de animais `ativo` e já individualizados
  (pendentes ficam de fora, mesmo padrão da RPC), rótulo de "outra parte" dinâmico, mesmos
  campos opcionais de valor/peso.
- `EntradaAgregadaForm.tsx` novo — extração da lógica que já existia no dialog antigo, sem
  mudança de comportamento.
- `useRegistrarSaidaAnimaisIndividuais()` novo (`hooks/useTransacoes.ts`) — invalida
  `animais`/`lotes` além de `saldo-rebanho`/`transacoes` (o status dos animais muda).

## Validação real executada

- `npm run build`/`lint`/`test` (36/36) — limpos.
- Schema: venda de 2 animais (20 e 30 meses) — `status` de ambos vira `venda`; agrupamentos
  calculados corretamente (`13-24 meses`/`25-36 meses`); tentativa de vender animal pendente
  rejeitada; `financeiro` bloqueado.
- **Teste visual real de ponta a ponta** (Playwright, desktop 1440×900 + mobile 390×844,
  Supabase remoto): checklist mostra só animais individualizados (pendentes corretamente
  ausentes); venda de um animal descartável de teste — status vira "Vendido" (badge azul),
  categoria calculada ("Novilho"), toast de sucesso. Animal/transação de teste removidos depois.

## Mudanças de arquivo

- Novo `supabase/migrations/20260721020000_rpc_registrar_saida_animais_individuais.sql`.
- Novo `.agents/memory/log/2026-07-21-cyber_chief-review-saida-animais-individuais.md`.
- Novo `src/pages/animais/SaidaAnimaisIndividuaisForm.tsx`,
  `src/pages/animais/EntradaAgregadaForm.tsx`.
- Reescrito `src/pages/animais/EntradaSaidaLoteDialog.tsx` (shell).
- Modificado `src/hooks/useTransacoes.ts`, `src/lib/validations/transacoes.ts`.
- Este log + `PROJECT_CONTEXT.md`.

## Pendências

- Nenhuma pendência de segurança. Próximo passo combinado com JP: item 14 (Storage).
