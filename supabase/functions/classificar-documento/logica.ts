// ============================================================================
// Lógica pura de supabase/functions/classificar-documento/ (Módulo
// Financeiro, item 18 — especificacao-sistema.md seção 12, "Planejado:
// classificação assistida por IA de lançamentos financeiros").
//
// Mesma separação de logica.ts/index.ts já usada em enviar-convite/ (ver
// comentário de topo daquele arquivo): index.ts chama `Deno.serve(...)` no
// top-level, então importar index.ts em teste levantaria um listener HTTP
// real como efeito colateral. Toda a lógica sem rede/client Supabase vive
// aqui, testável sem infraestrutura.
//
// Escopo desta primeira entrega: SÓ Gemini tem chamada de API real (pedido
// de JP: "constroi a edge function usando gemini como padrao"). Anthropic/
// OpenAI existem no catálogo da tela de Configurações
// (src/lib/llmCatalog.ts) mas ainda não têm implementação aqui — index.ts
// retorna erro claro se `llm_provider` da fazenda for outro que não
// 'gemini'.
//
// ATUALIZAÇÃO (2026-07-21, achado real ao configurar a GEMINI_API_KEY):
// a API `generateContent` (`v1beta/models/{model}:generateContent?key=...`)
// usada na implementação original desta function está sendo APOSENTADA pelo
// Google — toda chamada real feita com a chave de produção retornou 404
// ("This model ... is no longer available to new users... use the
// Interactions API"). Confirmado via chamadas HTTP reais e diretas contra
// `generativelanguage.googleapis.com` (não documentação/treino, que está
// desatualizado nisso): a API vigente hoje é a **Interactions API**
// (`POST https://generativelanguage.googleapis.com/v1alpha/interactions`),
// com um contrato bem diferente:
//   - Autenticação: header `x-goog-api-key` (NÃO mais `?key=` na query
//     string).
//   - Corpo: `{ model, input: [...partes], response_format: [...] }` em vez
//     de `{ contents: [{parts:[...]}], generationConfig: {...} }`.
//   - Partes multimodais usam `type` explícito por categoria de mídia —
//     `"image"` para os MIME types de imagem suportados (`image/png`,
//     `image/jpeg`, `image/webp`, `image/heic`, `image/heif` — os mesmos já
//     aceitos por este projeto) e **`"document"` para PDF**
//     (`application/pdf`) — usar `type: "image"` com `mime_type:
//     "application/pdf"` é rejeitado com 400 pela API (validado
//     empiricamente).
//   - Resposta: `{ status, steps: [...] }` em vez de `{ candidates: [...] }`
//     — o texto gerado vem no PRIMEIRO passo com `type === "model_output"`
//     (pode haver um passo `"thought"` antes dele, que deve ser ignorado),
//     em `content[0].text` (ainda uma STRING JSON a ser parseada, mesmo
//     princípio de antes).
// Ver `.agents/memory/log/2026-07-21-correcao-api-gemini-interactions.md`
// para o histórico completo da investigação e os testes reais que
// confirmaram cada detalhe do novo contrato.
// ============================================================================

export const MIME_TYPES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export function mimeTypeValido(mime: string): boolean {
  return (MIME_TYPES_PERMITIDOS as readonly string[]).includes(mime)
}

// Limite alinhado ao bucket transacoes-documentos (item 14, 10MB) — o
// arquivo chega em base64 (≈1.37x o tamanho original), então o limite da
// STRING base64 é maior que o limite do arquivo em si.
export const TAMANHO_MAXIMO_ARQUIVO_BYTES = 10 * 1024 * 1024
export const TAMANHO_MAXIMO_BASE64 = Math.ceil(TAMANHO_MAXIMO_ARQUIVO_BYTES * 1.37)

export function corsHeadersFor(appUrl: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': appUrl ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/**
 * Prompt de extração — pede exatamente os campos de
 * `lancamentos_financeiros` (src/lib/validations/financeiro.ts). Pede null
 * explícito quando o modelo não tiver confiança, em vez de "inventar" um
 * valor — o usuário sempre revisa antes de salvar (nenhuma gravação
 * automática, ver especificacao-sistema.md seção 12).
 */
export const PROMPT_EXTRACAO_LANCAMENTO = `Você está lendo um documento financeiro de uma fazenda (nota fiscal, boleto, recibo ou comprovante). Extraia os dados para preencher um lançamento financeiro e devolva APENAS o JSON pedido pelo schema, sem texto adicional.

Campos:
- tipo: "receita" se o documento representa dinheiro entrando (venda, recebimento), "despesa" se representa dinheiro saindo (compra, pagamento a fornecedor). Na dúvida, use "despesa" (caso mais comum para notas de insumos/serviços).
- categoria: categoria curta do gasto/receita (ex.: "Insumos", "Combustível", "Manutenção", "Mão de obra", "Impostos", "Venda de produção"). Se não conseguir identificar, retorne null.
- descricao: descrição curta do que foi comprado/vendido/pago. Se não conseguir identificar, retorne null.
- data_lancamento: data do documento no formato YYYY-MM-DD. Se não conseguir identificar com confiança, retorne null.
- valor: valor total do documento, número puro (sem símbolo de moeda, sem separador de milhar — ex.: 1500.50). Se não conseguir identificar, retorne null.
- numero_nota: número da nota/documento, se houver. Se não houver ou não conseguir ler, retorne null.
- contraparte: nome do fornecedor (se despesa) ou cliente (se receita). Se não conseguir identificar, retorne null.

Nunca invente um valor em que não tenha confiança — prefira retornar null, o usuário vai revisar e completar manualmente.`

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['receita', 'despesa'] },
    categoria: { type: 'string', nullable: true },
    descricao: { type: 'string', nullable: true },
    data_lancamento: { type: 'string', nullable: true },
    valor: { type: 'number', nullable: true },
    numero_nota: { type: 'string', nullable: true },
    contraparte: { type: 'string', nullable: true },
  },
  required: ['tipo'],
} as const

export interface ChamadaGemini {
  url: string
  body: Record<string, unknown>
}

// MIME types de imagem aceitos pela parte `type: "image"` da Interactions
// API — os mesmos 5 formatos de imagem já aceitos pelo bucket/whitelist do
// projeto (tudo que não é PDF, aqui, é imagem).
function tipoDaParte(mimeType: string): 'image' | 'document' {
  return mimeType === 'application/pdf' ? 'document' : 'image'
}

/**
 * Monta a chamada REST para a Interactions API do Gemini
 * (`v1alpha/interactions` — ver nota de atualização no cabeçalho deste
 * arquivo). A API key NÃO vai mais na URL — vai no header `x-goog-api-key`,
 * montado por quem chama esta função (`index.ts`), não aqui, porque headers
 * de autenticação não fazem parte do "corpo" que esta função pura testa.
 */
export function montarChamadaGemini(
  model: string,
  mimeType: string,
  base64Data: string,
): ChamadaGemini {
  return {
    url: 'https://generativelanguage.googleapis.com/v1alpha/interactions',
    body: {
      model,
      input: [
        { type: tipoDaParte(mimeType), mime_type: mimeType, data: base64Data },
        { type: 'text', text: PROMPT_EXTRACAO_LANCAMENTO },
      ],
      response_format: [
        { type: 'text', mime_type: 'application/json', schema: GEMINI_RESPONSE_SCHEMA },
      ],
    },
  }
}

export interface CamposExtraidosLancamento {
  tipo: 'receita' | 'despesa'
  categoria: string | null
  descricao: string | null
  data_lancamento: string | null
  valor: number | null
  numero_nota: string | null
  contraparte: string | null
}

export type ResultadoExtracao =
  | { ok: true; campos: CamposExtraidosLancamento }
  | { ok: false; error: string }

/**
 * Extrai e valida os campos a partir da resposta crua da Interactions API
 * (`{ status, steps: [...] }` — ver nota de atualização no cabeçalho deste
 * arquivo). O texto gerado vem no passo com `type === "model_output"`
 * (pode haver um passo `"thought"` antes, ignorado aqui), dentro de
 * `content[0].text` — ainda uma STRING JSON a ser parseada (a API não
 * devolve um objeto aninhado ali). Função pura — recebe o corpo já
 * decodificado de `response.json()`.
 */
export function extrairCamposDaResposta(respostaGemini: unknown): ResultadoExtracao {
  const resposta = respostaGemini as { status?: string; steps?: unknown[] } | undefined

  if (resposta?.status && resposta.status !== 'completed') {
    return { ok: false, error: `Gemini não completou a geração (status: ${resposta.status}).` }
  }

  const passos = (resposta?.steps ?? []) as {
    type?: string
    content?: { type?: string; text?: string }[]
  }[]

  const passoSaida = passos.find((p) => p.type === 'model_output')
  if (!passoSaida) {
    return { ok: false, error: 'Gemini não retornou nenhum resultado (sem passo model_output).' }
  }

  const textoJson = passoSaida.content?.find((c) => c.type === 'text')?.text
  if (!textoJson) {
    return { ok: false, error: 'Gemini não retornou texto no formato esperado.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textoJson)
  } catch {
    return { ok: false, error: 'Resposta do Gemini não é um JSON válido.' }
  }

  const obj = parsed as Record<string, unknown>
  if (obj.tipo !== 'receita' && obj.tipo !== 'despesa') {
    return { ok: false, error: 'Campo "tipo" ausente ou inválido na resposta do Gemini.' }
  }

  const paraTextoOuNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v : null
  const paraNumeroOuNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null

  return {
    ok: true,
    campos: {
      tipo: obj.tipo,
      categoria: paraTextoOuNull(obj.categoria),
      descricao: paraTextoOuNull(obj.descricao),
      data_lancamento: paraTextoOuNull(obj.data_lancamento),
      valor: paraNumeroOuNull(obj.valor),
      numero_nota: paraTextoOuNull(obj.numero_nota),
      contraparte: paraTextoOuNull(obj.contraparte),
    },
  }
}

/**
 * Extrai a mensagem de erro legível do corpo de erro da Interactions API
 * (`{ error: { message, code } }`) — usada por index.ts pra devolver um
 * erro útil ao frontend em vez de só o status HTTP cru.
 */
export function extrairMensagemDeErro(corpoErro: string): string | null {
  try {
    const parsed = JSON.parse(corpoErro) as { error?: { message?: string } }
    return typeof parsed.error?.message === 'string' ? parsed.error.message : null
  } catch {
    return null
  }
}
