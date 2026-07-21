# Log — Captura de documento como entrada de "Novo Lançamento" (modal reutilizável) — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** JP pediu que o botão "Novo Lançamento" passasse a abrir primeiro a captura de
  documento — seletor de arquivo no desktop, Câmera/Galeria/Arquivos no mobile — e só depois
  disso o formulário de lançamento (já pré-preenchido pela IA). Pedido explícito de fazer isso
  como uma modal reutilizável, para qualquer entrada de documento futura no app ter o mesmo
  comportamento. Confirmado com JP: mantém a opção "Preencher manualmente" (não torna o upload
  obrigatório) e o seletor de desktop aceita imagem além de PDF (mesma whitelist de sempre).

## O que foi feito

1. **`src/lib/arquivoDocumento.ts`** (novo) — consolida `TIPOS_ARQUIVO_DOCUMENTO_ACEITOS`,
   `TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES` e `arquivoParaBase64()`, antes duplicados em
   `LancamentoForm.tsx` e `LancamentoDetailPage.tsx`.
2. **`src/components/documentos/CapturarDocumentoDialog.tsx`** (novo) — modal genérica,
   independente de domínio (não sabe nada sobre "lançamento" ou classificação por IA, só
   devolve um `File` ou sinaliza "pular"):
   - Mobile (`sm:hidden`): três botões — Câmera (`capture="environment"`, força a câmera
     diretamente), Galeria (`accept="image/*"` sem `capture`), Arquivos (`accept` = whitelist
     completa incluindo PDF, sem `capture` — tende a abrir o app de Arquivos/Drive em vez da
     galeria de fotos).
   - Desktop (`hidden sm:block`): um único botão "Selecionar arquivo", mesma whitelist completa
     (imagem + PDF).
   - "Preencher manualmente" sempre visível, em ambos — chama `onPularCaptura`.
   - Valida tamanho máximo antes de repassar o arquivo pro callback do chamador.
3. **`CriarLancamentoDialog.tsx`** reescrito como máquina de 2 etapas (`captura`/`formulario`):
   abre `CapturarDocumentoDialog` primeiro; ao selecionar arquivo, chama a Edge Function
   `classificar-documento` (lógica que antes vivia dentro de `LancamentoForm`, agora movida pra
   cá porque é específica do domínio financeiro) e, em caso de sucesso, mescla os campos
   extraídos nos valores iniciais e troca pra etapa `formulario` (o `LancamentoForm` só monta
   quando os dados já estão prontos — mesmo padrão já estabelecido no projeto para evitar bug de
   `Select` controlado/não-controlado). Em caso de pular ou de erro na extração, o usuário
   continua no fluxo (captura permanece aberta pra tentar de novo, ou preencher manualmente).
4. `LancamentoForm.tsx` (usado também na edição, em `LancamentoDetailPage.tsx`) mantém seu
   próprio botão "Enviar documento" inline — não removido, é usado tanto no modo edição quanto
   como alternativa se o usuário pular a captura na criação e mudar de ideia depois.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Teste real via Playwright, desktop (1440px):** modal mostra só "Selecionar arquivo" +
  "Preencher manualmente" (Câmera/Galeria/Arquivos ausentes); "Preencher manualmente" abre o
  formulário com campos vazios; upload real de uma imagem de teste disparou a chamada real à
  Edge Function `classificar-documento`, que respondeu com o erro claro e esperado ("Chave de
  API do Gemini não configurada no servidor... ação pendente do time de infraestrutura") — a
  modal de captura **permaneceu aberta** para nova tentativa, exatamente como projetado (fail
  closed, sem travar o fluxo). Mesma pendência de infraestrutura já registrada para
  `classificar-documento` (falta `GEMINI_API_KEY`) — não é um bug novo desta tarefa.
- **Teste real via Playwright, mobile (390px):** modal mostra Câmera/Galeria/Arquivos +
  "Preencher manualmente" (sem o botão de desktop); sem overflow horizontal; "Preencher
  manualmente" abre o formulário normalmente.
- Nenhum erro de console além do 500 esperado da chamada real à Edge Function sem chave
  configurada.

## Gate do `cyber_chief`

Não rodado — nenhuma migration nova, nenhuma mudança de RLS; só frontend reorganizando uma
chamada já existente (`classificar-documento`) atrás de uma UI nova. Mesma pendência acumulada
da Fase 4.

## Próximos passos combinados com JP

Seguir para o item 19 da spec (Declaração Anual de Rebanho).
