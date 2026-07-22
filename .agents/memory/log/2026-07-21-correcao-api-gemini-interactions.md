# Log — Correção real: API do Gemini migrou para Interactions API — `developer` (via Claude)

- **Data:** 2026-07-21
- **Motivação:** JP configurou a `GEMINI_API_KEY` de produção no `.env` e pediu para ativá-la.
  Ao configurar o secret (`supabase secrets set`) e testar de verdade contra a Edge Function
  `classificar-documento` (deployada desde a tarefa anterior, nunca exercitada de ponta a ponta
  por falta de chave até agora), a chamada real ao Gemini falhou com **404** — não por falta de
  chave, mas porque a API usada na implementação original (`generateContent`) está sendo
  **aposentada pelo Google**.

## Achado (via chamadas HTTP reais, não suposição)

- `POST .../v1beta/models/{model}:generateContent?key=...` retorna 404 pra QUALQUER modelo
  testado (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` e variantes) com a mensagem
  do próprio Google: *"This model ... is no longer available to new users/available. ... We
  recommend you to use the Interactions API"*.
- A API vigente é a **Interactions API**: `POST .../v1alpha/interactions`. Contrato
  confirmado por testes reais (PowerShell, chamando a API de produção diretamente):
  - Autenticação: header **`x-goog-api-key`** (não mais `?key=` na query string).
  - Corpo: `{ model, input: [...partes], response_format: [...] }`.
  - Partes multimodais por `type`: **`"image"`** para os MIME types de imagem (`image/png`,
    `image/jpeg`, `image/webp`, `image/heic`, `image/heif`) e **`"document"`** para PDF —
    `type: "image"` com `mime_type: "application/pdf"` é rejeitado com 400 (validado
    empiricamente testando as 3 variantes `image`/`file`/`document`; só `document` funciona).
  - Resposta: `{ status, steps: [...] }` — o texto gerado fica no passo com
    `type === "model_output"` (pode haver um passo `"thought"` antes, ignorado), em
    `content[0].text` (ainda uma STRING JSON a parsear).
  - Saída estruturada (JSON Schema) continua funcionando via `response_format: [{type:"text",
    mime_type:"application/json", schema:{...}}]`, mesmo formato de schema de antes
    (`type`/`properties`/`enum`/`nullable`/`required`, agora em minúsculas: `"object"`/
    `"string"`/`"number"` em vez de `"OBJECT"`/`"STRING"`/`"NUMBER"` — também confirmado
    funcionando, não é obrigatório mas mantido em minúsculas por consistência com o resto do
    payload).
- **Catálogo de modelos também precisou de correção:** `gemini-2.5-pro`, `gemini-2.5-flash` e
  `gemini-3-pro-preview` (os 3 originalmente listados/pedidos por JP que ainda estavam no
  catálogo) retornam 404 "no longer available" pra esta chave — removidos de
  `src/lib/llmCatalog.ts`. `gemini-3.5-flash` e `gemini-3.1-pro-preview` (também pedidos por JP)
  **continuam funcionando**, mantidos. `gemini-3.6-flash` (não pedido originalmente, mas
  confirmado funcionando e é o "flash" padrão recomendado pela documentação atual do Gemini)
  adicionado como novo modelo recomendado/padrão.

## O que foi feito

1. **`GEMINI_API_KEY` configurada via `supabase secrets set --env-file`** (usando um arquivo
   temporário só com essa variável, nunca a chave completa do `.env` — evita expor
   `GITHUB_PAT`/`SUPABASE_DB_PASSWORD`/outras secrets locais como secrets da Edge Function).
2. **`supabase/functions/classificar-documento/logica.ts`** — `montarChamadaGemini()` reescrita
   pra nova URL/body (sem mais receber a API key como parâmetro — ela vira um header, montado
   por `index.ts`); `extrairCamposDaResposta()` reescrita pra ler `steps[]`/`model_output` em
   vez de `candidates[]`; `GEMINI_RESPONSE_SCHEMA` com tipos em minúsculas; nova função
   `extrairMensagemDeErro()` pra ler `error.message` do corpo de erro do Gemini e devolver uma
   mensagem útil ao frontend em vez de só o status HTTP cru.
3. **`index.ts`** — chamada fetch agora envia `x-goog-api-key` como header; erro do Gemini
   agora tenta extrair a mensagem real antes de cair no fallback genérico.
4. **`index.test.ts`** reescrito pro novo shape (`steps`/`model_output`, `type: "document"` pra
   PDF, testes novos de `extrairMensagemDeErro`) — **ainda não executado** (sem Deno CLI no
   Windows), mas a lógica testada aqui foi validada contra a API real via PowerShell antes de
   escrever o código, não é suposição.
5. **Migration `20260721130000_fazendas_llm_modelo_gemini_atualizado.sql`** — `DEFAULT` de
   `fazendas.llm_model` trocado de `gemini-2.5-flash` (morto) para `gemini-3.6-flash`
   (confirmado funcionando); backfill das 3 fazendas existentes que ainda estavam no default
   morto (nenhuma tinha escolhido esse modelo deliberadamente).
6. **`src/lib/llmCatalog.ts`** corrigido (ver achado acima).
7. Deploy real: `supabase functions deploy classificar-documento`.

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- **Chamadas HTTP diretas e reais contra a API do Gemini** (PowerShell, antes de escrever
  qualquer código) confirmaram cada detalhe do novo contrato: endpoint, header de auth, `type`
  de multimodal (`image` vs `document`), formato da resposta, schema estruturado — nenhum
  detalhe foi assumido por suposição/treino (que está desatualizado nisso).
- **Teste real de ponta a ponta via Playwright, contra a function deployada de verdade:**
  gerada uma imagem sintética de nota fiscal (renderizando um HTML de teste e tirando
  screenshot via Playwright — não um pixel em branco), upload real pelo fluxo de "Novo
  Lançamento", classificação real pelo Gemini via a function corrigida. **Todos os 6 campos
  extraídos bateram exatamente com o conteúdo da nota de teste:** categoria "Insumos", descrição
  "Ração para bovinos de corte — 40 sacos", número da nota "4821", contraparte "Cooperativa
  Agropecuária Vale Verde Ltda", data "2026-06-15" (convertida de "15/06/2026"), valor "3.480,00"
  (de "R$ 3.480,00"). Zero erros de console. Esta é a primeira validação real e completa do
  ciclo de classificação por IA desde que a feature foi construída — antes só era possível
  validar o caminho de falha (chave ausente).
- Dados de teste (2 rascunhos criados durante a investigação) removidos do banco ao final via
  SQL direto.

## Gate do `cyber_chief`

Não rodado — mudança é só de implementação (endpoint/formato de chamada externa), sem
alteração de RLS/policy nova além da já registrada na migration do backfill (só `ALTER COLUMN
DEFAULT` + `UPDATE` protegido pelo trigger já existente).

## Próximos passos combinados com JP

Item 19 da spec (Declaração Anual de Rebanho).
