# Log — Fase 4, Configurações > Prazos de Declaração (item 20) — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** próximo item da spec (seção 5.3) após concluir a discussão de UX — tela pra
  visualizar/editar `prazos_declaracao_estado`, substituindo o placeholder.

## O que foi feito

1. **Hooks novos (`useEstadoFazenda.ts`)** — `usePrazosDoEstado(estado)` (lista os prazos já
   cadastrados formalmente pra um estado) e `useDefinirPrazoDeclaracao()` (chama a RPC
   `definir_prazo_declaracao_estado()`, já existente desde a Fase 3 — nenhuma migration nova
   nesta tarefa). A RPC já faz upsert por (estado, ano_referencia), então a mesma chamada serve
   pra cadastrar um ano novo ou corrigir um já cadastrado.
2. **`DefinirPrazoDialog.tsx`** (novo) — formulário compartilhado criar/editar; `ano_referencia`
   trava na edição (mesma razão de sempre: mudar o ano miraria o upsert numa linha diferente,
   não corrigiria a atual).
3. **`PrazosDeclaracaoPage.tsx`** (nova, substitui o placeholder em
   `/app/configuracoes/prazos-declaracao`) — editor de `fazendas.estado` (UF) no topo + tabela
   de prazos cadastrados pro estado, com "Novo prazo"/"Editar" por linha. Escrita exige papel
   `<> financeiro` (mesma fronteira da RPC — diferente de Modelo de IA, que é exclusivo de
   admin).
4. **Refatoração de limpeza:** a tela de Declarações (item 19) tinha um editor de UF
   duplicado, embutido no card de prazo, criado como solução temporária antes desta tarefa
   existir. Removido de lá — agora só mostra um link "Configure em Configurações > Prazos de
   Declaração" quando o estado não está definido, centralizando a edição num lugar só.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, build passou de primeira.
- **Teste funcional real via Playwright, desktop+mobile, Supabase remoto:** confirmou o estado
  RS já configurado (herdado da tarefa anterior) e "Nenhum prazo cadastrado" (só o fallback
  padrão RS ativo); cadastrou um prazo real pra 2026 (01/05 a 31/08), confirmou na tabela;
  editou corrigindo a data de fim pra 15/09, confirmou `ano_referencia` desabilitado no
  formulário de edição; **navegou pra Declarações e confirmou que o card de prazo passou a
  usar o prazo cadastrado (15/09/2026) em vez do fallback "padrão RS"** — prova de ponta a
  ponta que a RPC e o `obter_prazo_declaracao_estado()` já existente reagem corretamente ao
  cadastro novo. Mobile (390px) sem overflow horizontal. Zero erros de console. Dado de teste
  removido ao final via SQL direto.

## Gate do `cyber_chief`

Não se aplica — nenhuma migration nova, só frontend consumindo uma RPC/tabela já revisadas
(gate do `cyber_chief` de 2026-07-20 já cobriu `definir_prazo_declaracao_estado()`).

## Próximos passos combinados com JP

Item 21 (Painel Inteligente) — último item da Fase 4. Escopo grande (saldo consolidado,
alertas, resumo financeiro, gráfico de evolução do saldo ao longo do ano, atalhos) — vale
alinhar o desenho antes de implementar, principalmente a fonte de dado do gráfico de evolução
temporal (não existe hoje uma view/RPC de série histórica de saldo).
