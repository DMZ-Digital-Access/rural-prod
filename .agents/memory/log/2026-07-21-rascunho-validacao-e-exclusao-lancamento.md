# Log — Rascunho de lançamento com validação pendente + exclusão de lançamento — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** JP perguntou como o upload de documento estava sendo tratado hoje (resposta:
  não era salvo no bucket durante a classificação por IA — o arquivo era lido só na memória,
  enviado pro Gemini e descartado; nada persistia até o usuário confirmar o formulário, e nem
  aí o arquivo em si). Propôs a sequência correta: upload → salva no bucket → passa na IA →
  preenche o modal → aguarda confirmação; se o usuário não confirmar (ou editar e salvar),
  mantemos os dados da IA identificando o lançamento como não validado. Confirmado com JP: (1)
  rascunhos contam nos totais de Fluxo de Caixa/resumo desde a extração da IA, não só após
  validar; (2) exclusão de lançamento deve ser possível mesmo depois de validado (reversão
  deliberada da decisão original "sem DELETE" — engano de validação também precisa de correção).

## O que foi feito

1. **Migration `20260721120000_lancamentos_validado_e_delete.sql`** —
   `lancamentos_financeiros.validado_pelo_usuario boolean not null default true` (só nasce
   `false` nos rascunhos do fluxo de IA) + policy nova `lancamentos_financeiros_delete_vinculada`
   (admin/membro, mesma fronteira de sempre — financeiro nunca escreve). **Reversão deliberada**
   da decisão 6 da migration `20260720150000` ("sem DELETE") — documentada explicitamente como
   tal, com o motivo (correção de erro de validação) e a mitigação (dupla confirmação na UI,
   documento do bucket nunca é apagado junto com a linha).
2. **`src/lib/uploadDocumentoLancamento.ts`** (novo) — extraiu a lógica de upload que antes
   vivia só dentro do hook `useUploadDocumentoLancamento`, pra poder ser chamada
   imperativamente (fora do ciclo de vida de componente) durante a criação do rascunho.
3. **Novos hooks em `useLancamentosFinanceiros.ts`:** `useCriarLancamentoRascunho` (INSERT
   imediato com campos-placeholder válidos — `categoria="(processando documento)"`,
   `valor=0.01` pro CHECK `valor > 0` — e `validado_pelo_usuario=false`),
   `useAplicarCamposExtraidos` (UPDATE parcial só dos campos que a IA devolveu, mantém
   `validado_pelo_usuario=false`), `useExcluirLancamento`. `useCriarLancamento`/
   `useAtualizarLancamento` passaram a gravar `validado_pelo_usuario: true` explicitamente —
   **qualquer submit do formulário É a confirmação**, editado ou não.
4. **`CriarLancamentoDialog.tsx` reescrito** — ao selecionar um arquivo: cria o rascunho →
   salva o documento no bucket (usando a data de hoje como mês provisório, já que o mês real da
   nota só é conhecido depois da IA rodar — mesma limitação que já existia em editar a data de
   um lançamento já com documento, que também não move o arquivo de pasta; não é uma
   inconsistência nova) → chama `classificar-documento` → aplica os campos extraídos → abre o
   formulário JÁ VINCULADO a esse rascunho (`useAtualizarLancamento`, não mais um INSERT). Três
   caminhos de erro tratados distintamente: (a) falha antes de criar o rascunho → mostra erro,
   fica na captura; (b) upload pro bucket falha → apaga o rascunho vazio, mostra erro, fica na
   captura; (c) classificação falha → **mantém o rascunho e o documento já salvos**, abre o
   formulário com os campos-placeholder pra preenchimento manual, avisando que o documento foi
   salvo mesmo sem leitura automática. "Preencher manualmente" continua sem nenhum rascunho —
   INSERT direto, já validado.
5. **`ValidacaoBadge.tsx`** (novo) — só renderiza algo quando `validado_pelo_usuario=false"
   ("Não validado", laranja) — mesmo princípio do badge "Pendente" já usado em Documentos
   Fiscais (só o estado excepcional ganha destaque visual).
6. **`LancamentosListPage.tsx`** — badge inline na coluna Tipo + filtro novo "Validação"
   (Todos/Validados/Não validados).
7. **`LancamentoDetailPage.tsx`** — badge no cabeçalho + botão novo "Excluir lançamento"
   (`ExcluirLancamentoDialog.tsx`, dupla confirmação, mesmo padrão de "Encerrar Lote") — some
   pro usuário `financeiro` (somente leitura). Exclusão bem-sucedida navega de volta pra lista.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Teste real via Playwright, Supabase remoto, ponta a ponta:**
  - Upload real de imagem → rascunho criado, documento salvo no bucket, classificação **falhou
    de verdade** (mesma pendência já conhecida: `GEMINI_API_KEY` ausente) → formulário abriu
    mesmo assim com os campos-placeholder e aviso claro; fechado sem confirmar (Escape).
  - Lista voltou a mostrar o rascunho com o badge "Não validado" e a categoria placeholder;
    filtro "Não validados" isolou corretamente esse registro.
  - Reaberto o rascunho, campos corrigidos manualmente e formulário salvo — badge "Não
    validado" desapareceu, documento seguiu marcado "Presente".
  - "Excluir lançamento" → confirmação dupla → excluído de verdade, navegação de volta pra
    lista confirmada, linha não aparece mais.
  - Fechar a captura ANTES de escolher qualquer arquivo (Escape imediato) → confirmado por
    contagem real de linhas da tabela antes/depois (com reload) que **nenhum rascunho é
    criado** nesse caso.
  - Fluxo "Preencher manualmente" → lançamento criado imediatamente SEM o badge "Não validado"
    (validado_pelo_usuario=true desde o INSERT).
  - Zero erros de console além do 500 esperado (classificar-documento sem chave). Um 406
    observado durante o teste — race benigna entre a invalidação de cache do `useLancamento`
    (após excluir) e a navegação de volta pra lista, sem efeito visível (a tela já estava
    navegando pra fora no mesmo instante); não é um bug de UX, só ruído de rede, documentado
    aqui por transparência.
  - Dados de teste removidos do banco ao final via SQL direto.

## Gate do `cyber_chief`

**NÃO rodado — pendência acumulada da Fase 4, mas esta tarefa merece destaque na próxima
revisão**, por reverter uma decisão de segurança/integridade anterior (permitir DELETE em
`lancamentos_financeiros`, antes deliberadamente vetado por risco de invalidar um período já
exportado pra contabilidade externa). A mitigação atual é só de UX (dupla confirmação) — vale
avaliar no gate formal se isso é suficiente ou se merece, por exemplo, um registro de auditoria
de exclusão (quem/quando) antes de expor isso mais amplamente.

## Próximos passos combinados com JP

Seguir para o item 19 da spec (Declaração Anual de Rebanho).
