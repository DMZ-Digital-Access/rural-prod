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
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: ['receita', 'despesa'] },
    categoria: { type: 'STRING', nullable: true },
    descricao: { type: 'STRING', nullable: true },
    data_lancamento: { type: 'STRING', nullable: true },
    valor: { type: 'NUMBER', nullable: true },
    numero_nota: { type: 'STRING', nullable: true },
    contraparte: { type: 'STRING', nullable: true },
  },
  required: ['tipo'],
} as const

export interface ChamadaGemini {
  url: string
  body: Record<string, unknown>
}

/**
 * Monta a chamada REST para `generateContent` do Gemini
 * (generativelanguage.googleapis.com). `apiKey` vai na query string — é
 * assim que a API do Gemini autentica (não é um Bearer header), documentado
 * aqui para não ser "corrigido" por engano numa revisão futura.
 */
export function montarChamadaGemini(
  model: string,
  apiKey: string,
  mimeType: string,
  base64Data: string,
): ChamadaGemini {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    body: {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: PROMPT_EXTRACAO_LANCAMENTO },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
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
 * Extrai e valida os campos a partir da resposta crua do Gemini
 * (`candidates[0].content.parts[0].text` é uma STRING JSON, por causa de
 * `responseMimeType: application/json` — o Gemini não devolve um objeto
 * aninhado ali, devolve o JSON como texto para o chamador fazer o parse).
 * Função pura — recebe o corpo já decodificado de `response.json()`.
 */
export function extrairCamposDaResposta(respostaGemini: unknown): ResultadoExtracao {
  const candidato = (respostaGemini as { candidates?: unknown[] })?.candidates?.[0] as
    | { content?: { parts?: { text?: string }[] }; finishReason?: string }
    | undefined

  if (!candidato) {
    return { ok: false, error: 'Gemini não retornou nenhum resultado (candidates vazio).' }
  }

  if (candidato.finishReason && candidato.finishReason !== 'STOP') {
    return {
      ok: false,
      error: `Gemini interrompeu a geração (finishReason: ${candidato.finishReason}).`,
    }
  }

  const textoJson = candidato.content?.parts?.[0]?.text
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
