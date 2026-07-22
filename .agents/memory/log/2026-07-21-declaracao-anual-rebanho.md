# Log — Fase 4, Módulo Declaração Anual de Rebanho (item 19) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** próximo item da spec (seção 5.2/10) após o Módulo Financeiro completo —
  histórico de declarações à Secretaria Estadual de Agricultura, por espécie/ano, com upload de
  comprovante e indicador do prazo regulatório vigente.

## O que foi feito

1. **`/app/rebanho/declaracoes`** (substitui o placeholder, nav "Declarações" já existia) —
   listagem de `declaracoes_rebanho` (schema já existente desde a migration
   `20260720150000_fase3_financeiro_declaracoes_prazos.sql`, bucket `declaracoes-rebanho` já
   existente desde o item 14), filtros espécie/ano, "Nova Declaração".
2. **Regra de imutabilidade da identidade:** `especie_id`/`ano_referencia` só são graváveis na
   criação — o formulário de edição os mostra desabilitados (correção de uma declaração é da
   quantidade/data de referência, nunca "mudar de espécie/ano", que violaria o
   `unique(fazenda_id, especie_id, ano_referencia)` do banco). Só reforçado na UI, sem trigger
   novo no banco (mesmo nível de proteção que outros campos "identidade" não centrais no
   projeto — risco baixo, não é dado sensível).
3. **"Marcar como enviada"** (`MarcarComoEnviadaDialog.tsx`) — data de envio + upload opcional
   de PDF/imagem (bucket já aceita ambos desde a correção de JP, migration
   `20260721060000`). Caminho `{fazenda_id}/{declaracao_id}.{extensao}` — uma declaração tem no
   máximo um arquivo, `upsert:true` permite substituir depois.
4. **Card de prazo regulatório** — usa `obter_prazo_declaracao_estado()` (já existente) contra
   `fazendas.estado`. **Achado real:** essa coluna nasce `NULL` pra toda fazenda existente (sem
   fluxo de "complete seu cadastro" no produto) — sem ela, o prazo nunca pode ser calculado.
   Adicionado um seletor de UF inline no próprio card (só pra quem não é `financeiro`), usando a
   policy já existente de `fazendas_update_vinculada` (mesmo nível de `nome`, nenhuma mudança de
   RLS). Estado calculado a partir da janela (antes do início / dentro do prazo / prazo
   encerrado) — 3 estados visuais como pedido na spec seção 4.2, mas sem cruzar com o status de
   declaração por espécie (esse cruzamento é do Painel Inteligente, item 21, fora de escopo
   aqui).
5. **Sem exclusão** — nenhuma policy de DELETE nova (decisão já dada pela spec, item 9 da seção
   9: "declarações anuais nunca devem ser apagáveis pelo usuário").

## Achado e correção durante o teste

- Playwright pegou um aviso real de console: **Base UI "changing the uncontrolled value state
  of Select to be controlled"** no seletor de UF do card de prazo — `value={ufSelecionada ??
  undefined}` começava `undefined` (não controlado) e virava uma string após a seleção
  (controlado). Mesma classe de bug já vista antes no projeto com `Select`/`useForm`. Corrigido
  com o mesmo padrão de sentinela já usado nos filtros do projeto (`SEM_UF = "__nenhuma__"`
  como valor inicial, sempre definido). Reproduzido e confirmado corrigido de verdade (rodou o
  fluxo completo antes com o aviso presente, depois sem).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, build passou de primeira.
- **Teste funcional real via Playwright, desktop+mobile, Supabase remoto:** confirmou o card
  "estado não configurado", configurou o estado (RS) de verdade, confirmou o prazo calculado
  (01/04–30/06/2026, "padrão RS", corretamente marcado "Prazo encerrado" já que a data do
  sistema, 2026-07-21, está depois de 30/06), criou uma declaração real, confirmou badge
  "Pendente", marcou como enviada com upload real de um PDF de teste, confirmou badge "Enviado"
  + "Ver" abrindo o documento de verdade (signed URL real), confirmou que o formulário de edição
  trava espécie (desabilitada) e permite corrigir só a quantidade. Mobile (390px) sem overflow
  horizontal. Dados de teste (1 declaração) removidos ao final via SQL direto — o estado "RS" da
  fazenda foi mantido (configuração real válida, não é dado de teste).

## Gate do `cyber_chief`

Não rodado — mesma pendência acumulada da Fase 4 (ver seção 4 do PROJECT_CONTEXT.md). Sem
migration nova nesta tarefa (schema/bucket/RLS já existiam desde itens anteriores).

## Próximos passos combinados com JP

Item 20 (Configurações/Prazos de Declaração — ainda placeholder) e item 21 (Painel
Inteligente), últimos dois módulos da Fase 4.
