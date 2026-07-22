# Log — Declaração Anual reestruturada: 1 declaração/ano + itens de espécie — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** terceiro e último item da discussão de UX com JP. O desenho original (item 19,
  construído em 2026-07-21) modelava `declaracoes_rebanho` como uma linha por (fazenda, espécie,
  ano) — cada espécie tinha seu próprio status/data de envio/PDF. JP apontou a correção: a
  Declaração Anual de Rebanho é entregue como **um único documento por ano**, contemplando todas
  as espécies dentro dele — o desenho antigo faria o usuário "enviar" e anexar o mesmo
  comprovante uma vez por espécie, errado.

## O que foi feito

1. **Migration `20260722100000_declaracoes_rebanho_itens_por_especie.sql`** — confirmado que a
   tabela estava vazia em produção antes de qualquer alteração (migração limpa, sem dado a
   preservar). `declaracoes_rebanho` (pai) perde `especie_id`/`quantidade_declarada`, ganha
   `unique(fazenda_id, ano_referencia)` (era `unique(fazenda_id, especie_id, ano_referencia)`).
   Tabela filha nova `declaracoes_rebanho_itens` (`declaracao_id` FK cascade, `especie_id` FK
   restrict, `quantidade_declarada`, `unique(declaracao_id, especie_id)`) — RLS mirrorando a
   fronteira do pai (financeiro só SELECT, admin/membro escreve) via `EXISTS` join em
   `declaracao_id` (a filha não tem `fazenda_id` direto). **DELETE liberado nos itens** pra
   admin/membro (remover uma espécie do detalhamento é diferente de apagar a declaração
   inteira, que continua proibida no pai).
2. **RPC `criar_declaracao_rebanho(p_fazenda_id, p_ano_referencia, p_data_declaracao, p_itens
   jsonb)`** — cria o pai + N itens numa única chamada atômica (cada RPC via PostgREST já roda
   numa transação própria). `SECURITY INVOKER` — os 2 INSERTs continuam sujeitos à RLS de quem
   chamou, sem elevação de privilégio (mesmo princípio de mínimo privilégio de toda função deste
   projeto que não precisa de `SECURITY DEFINER`).
3. **Tipos/validação (`declaracoes.ts`)** — `DeclaracaoRebanho` (pai) + `ItemDeclaracaoRebanho`/
   `DeclaracaoComItens` (com itens embutidos via `.select("*, declaracoes_rebanho_itens(*,
   especies(nome))")`). Schema zod com `itens: z.array(...).min(1)` + `.refine()` rejeitando
   espécie duplicada na mesma declaração.
4. **`DeclaracaoForm.tsx`** — `ano_referencia`/`data_declaracao` no topo (ano trava na edição,
   `bloquearAno`) + lista dinâmica de linhas espécie×quantidade via `useFieldArray` (react-hook-
   form), botão "Adicionar espécie", lixeira por linha (desabilitada quando só resta 1 — o zod
   exige pelo menos 1 espécie).
5. **`useAtualizarDeclaracao`** — `upsert` (via `onConflict: "declaracao_id,especie_id"`) cobre
   espécie nova/quantidade alterada numa chamada só; um `delete` separado remove as espécies que
   saíram da lista. Não é atômico entre as 2-3 chamadas (diferente da criação, que precisa ser
   tudo-ou-nada) — uma edição parcial é recuperável reabrindo o formulário.
6. **`DeclaracoesRebanhoPage.tsx`** — 1 linha por ano na tabela principal (espécies + total de
   animais resumidos), botão de expandir/recolher (estado local, sem componente novo de UI) que
   revela o detalhamento espécie × quantidade numa linha adicional. Filtro de espécie removido
   da tela (não fazia mais sentido — a declaração não é "de uma espécie só").

## Achado real durante o teste (bug de pluralização, não de dado)

O card resumido mostrou **"190 animalis"** em vez de "190 animais" — bug de digitação no
sufixo (`"animal" + (total===1 ? "" : "is")` produz "animalis", não "animais", porque o plural
de "animal" muda o radical, não é só sufixo). Corrigido trocando pra um ternário de palavra
inteira (`totalAnimais === 1 ? "animal" : "animais"`). Reproduzido e confirmado corrigido
rodando o mesmo teste antes/depois da correção.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, build passou de primeira (só a correção do
  bug de pluralização exigiu um segundo build, ainda limpo).
- **Teste funcional real via Playwright, desktop+mobile, Supabase remoto:** criou uma
  declaração real com 2 espécies (Bovinos 150, Ovinos 40), confirmou a linha resumida ("2
  espécies — 190 animais"), expandiu e confirmou o detalhamento de cada espécie, editou
  removendo Ovinos e corrigindo Bovinos pra 160 (confirmou `ano_referencia` desabilitado no
  formulário de edição), confirmou a lista atualizada ("1 espécie — 160 animais"), marcou como
  enviada e confirmou o badge "Enviado". Mobile (390px) sem overflow horizontal, formulário
  com campos dinâmicos legível. Zero erros de console em toda a sequência. Dados de teste
  removidos ao final via SQL direto (cascade automático dos itens).

## Gate do `cyber_chief`

Não rodado — mesma pendência acumulada da Fase 4, mas esta é uma migration real (nova tabela +
RLS + RPC) que merece atenção na próxima revisão formal, junto com as demais pendências já
registradas.

## Próximos passos combinados com JP

Os 3 itens da discussão de UX estão concluídos (Financeiro em abas, Lançamento Rápido,
Declaração Anual reestruturada). Retomar a spec: item 20 (Configurações/Prazos de Declaração,
ainda placeholder) e item 21 (Painel Inteligente).
