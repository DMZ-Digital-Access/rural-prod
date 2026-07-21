# Log — Fase 4, Módulo de Transações (item 15) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** primeiro dos 4 próximos passos combinados com JP após ADR-0006/Storage — JP
  escolheu escopar a Fase 4 (6 módulos) "um módulo por vez, começando por Transações, ordem da
  spec".

## O que foi feito

Duas rotas novas, substituindo o `PlaceholderPage` de `/app/rebanho/transacoes`:

- `/app/rebanho/transacoes` (`TransacoesListPage.tsx`) — resumo de saldo início/fim de ano por
  espécie (reaproveita `obter_saldo_rebanho()`, item 12, chamado nas datas 31/12 do ano anterior
  e 31/12 do ano selecionado ou hoje), filtros (ano/espécie/tipo de operação/contraparte) e
  tabela paginada (20/página) — spec seção 5.2 e 6 (paginação/filtros são requisito crítico para
  Transações/GTAs).
- `/app/rebanho/transacoes/:id` (`TransacaoDetailPage.tsx`) — detalhe com sexo/faixa etária
  (`transacoes_detalhe`), GTA vinculada (ou "Sem GTA vinculada"), badges Presente/Pendente para
  Nota e Contranota com upload real para o bucket `transacoes-documentos` (item 14) e "Ver
  documento" via signed URL, e formulário para completar dados a qualquer momento (número/valor
  da nota, peso total, status da GTA, observações) — implementa o fluxo de doc-tracking
  progressivo que JP descreveu em detalhe na sessão anterior (usuário pode salvar a operação só
  com número de animais e partes, completar documentos depois, o saldo já reflete o lançamento
  desde o início).

Novos arquivos: `src/components/rebanho/TipoOperacaoBadge.tsx`, `StatusGtaBadge.tsx`,
`src/pages/rebanho/TransacoesListPage.tsx`, `TransacaoDetailPage.tsx`. Hooks novos em
`src/hooks/useTransacoes.ts`: `useTransacoesLista`, `useTransacao`, `useTransacaoDetalhe`,
`useAtualizarTransacao`, `useUploadDocumentoTransacao`, `useAbrirDocumentoTransacao`,
`useResumoSaldoAno`. Schema novo em `src/lib/validations/transacoes.ts`:
`atualizarTransacaoSchema`. Rotas em `src/router.tsx`.

Papel `financeiro`: a tela renderiza normalmente (RLS já permite SELECT em `transacoes` para esse
papel desde a Fase 3), mas o formulário de completar dados e os botões de upload ficam
escondidos (`somenteLeitura = papel === "financeiro"`) — decisão de UX, não de segurança (a RLS
já bloqueia a escrita mesmo se o botão aparecesse).

## Achados reais durante o teste visual (não hipotéticos — reproduzidos e corrigidos)

1. **HTTP 300 Multiple Choices no embed `transacoes -> gtas`.** A referência circular deliberada
   `transacoes.gta_id <-> gtas.transacao_id` (migration do item 11, decisão 1 do cabeçalho) dá ao
   PostgREST duas FKs candidatas para resolver `gtas(numero_gta, status_liberacao)` dentro do
   `select` de `transacoes` — sem hint, ele responde 300 em vez de dados, e a tela ficava presa em
   "Carregando transações…" para sempre, **sem nenhum erro no console do navegador** (só visível
   inspecionando a resposta de rede). Corrigido com
   `gtas!transacoes_gta_id_fkey(numero_gta, status_liberacao)` no `select`. Documentado em
   `PROJECT_CONTEXT.md` seção 4 como nota técnica para o Módulo de GTAs (item 17), que vai
   precisar do embed no sentido inverso.
2. **Reincidência do bug de `useForm({ values: ... })`** (já visto e documentado em
   `SaidaAnimaisIndividuaisForm`/`EntradaAgregadaForm`): passar `values` como um objeto que só
   existe depois que a query carrega faz o `Select` (Base UI) trocar de não-controlado para
   controlado, e ele trava sem mostrar o valor selecionado (o campo "Status da GTA" ficava em
   branco mesmo com o dado certo no banco). Corrigido com `useEffect` + `form.reset()` explícito
   assim que `transacao` chega, mesmo padrão já estabelecido.
3. `NumericInput` não repassa `name` (recebe `value`/`onChange`/`onBlur` explicitamente, não
   `{...field}`) — não é bug, é como o componente já funciona desde que foi criado, só anotado
   aqui porque afetou a escrita do teste automatizado (seletor por `name` não funciona nesses
   campos, precisou localizar por estrutura label→input).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos, zero regressão.
- Teste visual real (Playwright, Chromium headless via cache `npx`, desktop 1440×900 e mobile
  390×844, logado contra o Supabase remoto com a conta de teste real `jp.teste.livestock@gmail.com`)
  — lista e detalhe renderizando sem overflow horizontal e zero erros de console em ambos os
  viewports, depois das duas correções acima.
- Teste funcional de ponta a ponta (não só visual): editou número da nota, valor da nota e status
  da GTA de uma transação real, salvou, **recarregou a página** (não só verificou o estado do
  form em memória) e confirmou os 3 valores persistidos no banco; fez upload real de um PDF de
  teste para `transacoes-documentos`, confirmou o badge mudar de "Pendente" para "Presente" e o
  botão "Ver documento" abrir a signed URL de verdade (nova aba, sem erro). Dados de teste
  (número/valor/status/observações/caminho do arquivo da transação usada) resetados ao estado
  original ao final via SQL direto.
- **Pendência não bloqueante:** o arquivo de teste (PDF fake) enviado para
  `transacoes-documentos` durante o teste funcional permanece no bucket — mesma limitação já
  documentada no log do item 14 (Storage bloqueia `DELETE` direto via SQL, limpeza via API
  exigiria `service_role`, não disponível no `.env`). Sem risco real (mesmo padrão já aceito).

## Gate do `cyber_chief`

**Ainda não rodado nesta tarefa.** Nenhuma migration nova foi escrita (só frontend consumindo
RLS já revisada nas migrations da Fase 3/ADR-0005), mas fica registrado como pendência explícita
em `PROJECT_CONTEXT.md` seção 4 — decisão de rodar ou não um gate leve fica com JP/orchestrator.

## Correção posterior: todos os campos editáveis (pedido de JP, 2026-07-21)

Depois da entrega original, JP pediu: "dentro da página de cada operação tenho que poder editar
todos campos inclusive o numero de animais, o nome da outra parte... todos os campos". O form
"Completar dados da operação" só editava numero_nota/valor_nota/peso_total_kg/
status_gta_transacao/observacoes — os campos outra_parte/data_operacao/especie_id/
quantidade_animais eram só leitura.

**Única exceção deliberada, confirmada com JP:** `tipo_operacao` continua NÃO editável —
trocar o tipo depois de criado deixaria inconsistentes os vínculos já feitos
(`transacoes_animais` para Venda/Óbito/Consumo, animais pendentes já criados para Compra/
Nascimento/Entrada de Pastoreio) com a nova natureza da operação.

Renomeado "Completar dados da operação" → "Editar operação" (reflete melhor o escopo agora).
`atualizarTransacaoSchema` e `useAtualizarTransacao` ganharam os 4 campos novos. Sem migration —
todas as colunas já existiam, só não eram editáveis pelo frontend.

**Validação:** `build`/`lint`/`test` (36/36) limpos; teste funcional real (Playwright, Supabase
remoto) editando outra_parte e quantidade_animais, **recarregando a página** para confirmar
persistência real. Dado de teste revertido ao original ao final.

## Próximos passos combinados com JP

Fase 4 continua módulo a módulo — próximo é **Saldo de Rebanho** (item 16), depois GTAs (17),
Financeiro (18), Declaração Anual (19), Configurações/prazos (20), Painel Inteligente (21).
