# Log — Fase 4, Módulo de GTAs (item 17) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** terceiro módulo da Fase 4, seguindo a ordem da spec (Transações → Saldo de
  Rebanho → **GTAs** → Financeiro → Declarações → Configurações/prazos → Painel Inteligente).

## O que foi feito

Duas rotas novas, substituindo o `PlaceholderPage` de `/app/rebanho/gtas`:

- `/app/rebanho/gtas` (`GtasListPage.tsx`) — listagem com colunas nº GTA, status, espécie,
  município/propriedade de origem e destino; filtros por status (pendente/liberada), espécie e
  período (data de liberação); paginação (20/página); botão "Nova GTA" abrindo
  `CriarGtaDialog.tsx`.
- `/app/rebanho/gtas/:id` (`GtaDetailPage.tsx`) — todos os campos da GTA, transação vinculada
  (se houver), botão **"Ver GTA"** só dentro do detalhe (nunca na listagem, conforme
  recomendação explícita da spec seção 5.2 para não poluir a tabela nem gerar cliques
  acidentais), upload do documento original (bucket `gtas-documentos`, item 14) e formulário de
  edição inline (reaproveita o mesmo `GtaForm.tsx` da criação).

Novos arquivos: `src/lib/validations/gtas.ts` (`gtaSchema` — `data_liberacao` obrigatória
quando `status_liberacao = liberada`, mesma regra já garantida em banco pela constraint
`gtas_data_liberacao_consistente`, repetida no frontend só para feedback imediato);
`src/hooks/useGtas.ts` (`useGtasLista`, `useGta`, `useTransacoesParaVincular`, `useCriarGta`,
`useAtualizarGta`, `useUploadDocumentoGta`, `useAbrirDocumentoGta`);
`src/components/rebanho/StatusLiberacaoGtaBadge.tsx`; `src/pages/gtas/GtaForm.tsx` (formulário
único compartilhado entre criação em Dialog e edição inline no detalhe — só é montado depois que
os dados da GTA já carregaram no caso de edição, evitando de propósito o bug de
`useForm({ values })` já visto duas vezes antes nesta Fase); `CriarGtaDialog.tsx`,
`GtasListPage.tsx`, `GtaDetailPage.tsx`.

Vínculo opcional a uma transação (spec: "Cadastro/edição de GTA, com vínculo opcional a uma
transação") implementado com um Select das últimas 100 transações da fazenda
(`outra_parte` + data), não uma busca — suficiente para o volume esperado, sem
autocomplete/busca textual nesta primeira entrega.

**Papel `financeiro`:** bloqueado explicitamente na UI (mensagem "O papel financeiro não tem
acesso a este módulo" em vez de mostrar uma lista vazia) — spec seção 5.4 lista "GTAs" na fronteira
de zero acesso, e a RLS já bloqueia toda leitura desde a Fase 3; aqui só se evita a experiência
confusa de uma tela de filtros sobre uma lista sempre vazia sem explicação.

## Reaproveitamento do achado técnico do Módulo de Transações

O embed PostgREST `gtas -> transacoes` (para mostrar a transação vinculada no detalhe) usa o
mesmo cuidado já documentado no Módulo de Transações: FK circular deliberada entre as duas
tabelas exige o hint de constraint. Do lado de `gtas`, o nome é `gtas_transacao_id_fkey`
(confirmado via `pg_constraint` direto no banco antes de escrever o código, para não repetir o
erro de tentar sem hint) —
`transacoes!gtas_transacao_id_fkey(outra_parte, tipo_operacao)` no `select`.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Teste visual + funcional real de ponta a ponta (Playwright, desktop 1440×900 + mobile
  390×844, Supabase remoto, conta de teste real): cadastrou uma GTA de teste completa (todos os
  campos), confirmou aparecer na listagem com badge "Pendente"; abriu o detalhe; fez upload real
  de um PDF de teste para `gtas-documentos`; confirmou "Ver GTA" abrindo a signed URL de verdade
  (nova aba, sem erro). Zero erros de console em nenhum viewport, nenhuma etapa.
- GTA de teste **removida do banco ao final** (via SQL direto, `service_role`/superuser — a
  tabela não tem policy de DELETE pela app, decisão deliberada da migration do item 11; a
  limpeza usa acesso direto ao Postgres, não a API pública). O arquivo de teste no bucket
  `gtas-documentos` permanece (mesma limitação já documentada nos logs anteriores do item 14:
  sem `service_role` no `.env` para limpar via Storage API, sem risco real).

## Gate do `cyber_chief`

Não rodado nesta tarefa (só frontend — RLS de `gtas`/`gtas-documentos` já revisada na Fase 3).

## Correção real de modelagem, feita no meio da tarefa (pedido de JP)

Depois da primeira entrega (acima), JP corrigiu um pressuposto de negócio errado: **"as GTAs são
feitas uma para cada caminhão que transporta a carga. então em uma transação pode existir 1 nota
e 1 contranota mas mais de 1 GTA relacionada à mesma operação"**. A migration original do item 11
(`20260720133000_fase3_gtas_transacoes.sql`) desenhou um vínculo CIRCULAR 1:1
(`transacoes.gta_id` <-> `gtas.transacao_id`) — errado, pois uma transação pode ter N GTAs.

**Correção aplicada (migration `20260721050000_corrige_cardinalidade_transacao_gta.sql`):**
removido só o lado 1:1 que sobrava (`transacoes.gta_id` + seu trigger/FK/índice) —
`gtas.transacao_id` (muitos-para-um: várias GTAs apontando para a mesma transação) já era
exatamente a modelagem certa, sem precisar de tabela de junção nova. Confirmado ANTES de escrever
a migration que `transacoes.gta_id` estava 0/2 preenchido em produção — remoção sem perda de
dado. Efeito colateral bom: o embed PostgREST `transacoes -> gtas` deixou de ser ambíguo (só resta
uma FK entre as duas tabelas) — o hint de constraint que o Módulo de Transações já usava
deixou de ser estritamente necessário (mas foi mantido como documentação).

**Mudanças de frontend correspondentes:**
- `TransacaoComDetalhes` perdeu o campo `gtas` (objeto único); `TransacaoDetailPage.tsx` agora
  usa `useGtasDaTransacao(id)` (novo hook, consulta `gtas` por `transacao_id`) e mostra uma
  **lista** de badges/links "GTAs vinculadas (uma por caminhão de transporte)".
- Adicionado `gtas.quantidade_animais` (migration `20260721040000_gtas_quantidade_animais.sql`,
  nullable — 1 GTA real já existia em produção antes deste campo, "AC-871811"), campo novo em
  `GtaForm.tsx`, obrigatório no zod a partir de agora.
- Fluxo pedido por JP: ao enviar o documento de uma GTA pendente, `GtaDetailPage.tsx` oferece
  inline "marcar como liberada agora?" com campo de data (default hoje) — documento chegando é,
  na prática, o sinal de liberação. Botão "Manter pendente" descarta sem alterar nada.
- **Achado corrigido durante o teste desta correção:** `GtaForm` é remontado via `key={gta.
  updated_at}` no `GtaDetailPage` — sem isso, confirmar a liberação pelo card acima atualiza o
  banco mas o form "Editar GTA" continuava mostrando os valores antigos (Pendente/data vazia),
  porque `defaultValues` do react-hook-form só é lido no primeiro mount.

**Validação da correção:** `build`/`lint`/`test` (36/36) limpos; teste funcional real
(Playwright, desktop, Supabase remoto) cadastrando uma 2ª GTA de teste vinculada à MESMA
transação que já tinha a GTA real "AC-871811" — confirmou organicamente que a tela de detalhe da
transação mostra as DUAS GTAs vinculadas simultaneamente (prova real da cardinalidade N,
não just teórica); confirmou também o prompt de liberação aparecendo após upload e o form de
edição refletindo o novo status imediatamente depois de confirmar. Dado de teste removido ao
final.

## Próximos passos combinados com JP

Próximo módulo: Financeiro (item 18).
