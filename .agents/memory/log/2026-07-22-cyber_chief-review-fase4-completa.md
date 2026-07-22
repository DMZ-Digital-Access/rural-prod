# Log — Security review (gate Fase 4 completa) — `cyber_chief` (CONSTANTINE, via Claude)

- **Data:** 2026-07-22
- **Motivação:** pendência acumulada durante toda a Fase 4 (ver seção 4 de PROJECT_CONTEXT.md) —
  nenhum dos módulos de Transações, Saldo de Rebanho, GTAs e Financeiro completo (lançamentos,
  Configuração de IA, `classificar-documento`, Documentos Fiscais/ZIP, Fluxo de Caixa,
  Declaração Anual reestruturada, Prazos de Declaração, Painel Inteligente) tinha passado pelo
  gate formal do `cyber_chief`. Pedido explícito de JP para rodar essa revisão formal antes de
  seguir para o próximo recurso.

## Escopo revisado

17 migrations (`20260720210000` → `20260722100000`, tudo construído em cima da base schema já
revisada nos gates de Fase 3) + as 2 Edge Functions novas (`classificar-documento`,
`gerar-zip-lancamentos`) + consistência das fronteiras de papel `financeiro` no frontend.

## Investigação de maior risco: IDOR em `registrar_saida_animais_individuais()`

A RPC aceita `p_animal_ids uuid[]` fornecido pelo chamador e não valida ela mesma que os animais
pertencem a `p_fazenda_id` — o comentário original da migration afirmava que o trigger
`preparar_vinculo_transacao_animal` (ADR-0004) cobria isso. Lida a definição completa do
trigger (`20260720133000_fase3_gtas_transacoes.sql`, seção 3.1): confirma que SIM, o trigger
compara `fazenda_id` de `transacoes` e de `animais` e levanta exceção genérica se divergirem,
antes do INSERT em `transacoes_animais` completar. **Claim original confirmado correto, sem
achado.**

## Achados

Nenhuma vulnerabilidade confirmada. Duas observações de risco aceito, não bloqueantes:

1. **DELETE em `lancamentos_financeiros` sem trilha de auditoria** (migration
   `20260721120000_lancamentos_validado_e_delete.sql`) — reversão deliberada e já documentada da
   decisão original "sem DELETE", pedido explícito de JP, escopo correto (papel <> financeiro),
   documento fiscal no bucket preservado. Falta só uma tabela de histórico/soft-delete caso vire
   necessidade de auditoria contábil/trabalhista no futuro — não bloqueante hoje.
2. **Conteúdo de documento influenciando texto livre da extração por IA** (`classificar-
   documento`) — um documento adversarial poderia tentar injetar instrução no prompt, mas
   `tipo` é restrito por enum no `response_format`, a function nunca grava no banco sozinha (só
   pré-preenche, usuário sempre revisa/confirma) — risco baixo, sem ação necessária.

## Verificação de dados

- `search_path = ''` em 100% das funções novas da fase.
- `security invoker` em toda função/view nova — sem elevação de privilégio desnecessária.
- Fronteira `papel <> financeiro` consistente em todas as tabelas/buckets novos (verificado
  também no frontend — `GtasListPage.tsx` bloqueia a UI com mensagem explícita pra financeiro).
- Config de IA (`fazendas.llm_provider/llm_model`): a policy de UPDATE original de `fazendas`
  (Fase 1) autoriza qualquer papel vinculado — já mitigado desde a migration `20260721080000`
  com o trigger dedicado `restringir_alteracao_config_llm`, confirmado correto nesta revisão.
- Edge Functions: nenhuma usa `service_role` — ambas usam client "do usuário", dependendo
  inteiramente da RLS das tabelas de origem. Validação de entrada (mime type, tamanho, ano/mês,
  JSON) presente nas duas. `gerar-zip-lancamentos` sanitiza nome de categoria antes de usar como
  nome de arquivo (sem risco de path traversal).

## Veredito

🟢 **Seguro.** Gate liberado — nenhum item bloqueia. Fase 4 pode ser considerada tecnicamente
fechada em segurança.

## Nota do Constantine

"A Fase 4 manteve a disciplina que já vínhamos cobrando desde a Fase 1 — toda função nova com
`search_path=''`, toda policy nova respeitando a fronteira de financeiro, e a modelagem de
`transacoes_animais` (ADR-0004) segurando a linha cross-fazenda exatamente onde eu suspeitei que
pudesse vazar. Se amanhã decidirmos que 'apagar lançamento validado' vira motivo de auditoria
trabalhista ou fiscal, a lacuna de trilha de auditoria é onde eu vou pedir a tabela de histórico
— hoje é risco aceito, não risco ignorado."
