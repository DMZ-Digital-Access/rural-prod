// ============================================================================
// Edge Function: classificar-documento
//
// Módulo Financeiro (item 18) — especificacao-sistema.md seção 12,
// "Planejado: classificação assistida por IA de lançamentos financeiros".
// Pedido de JP: usuário envia imagem/PDF de um documento (nota, boleto,
// recibo), a function pré-preenche os campos de um lançamento financeiro —
// NUNCA grava nada no banco. O INSERT em lancamentos_financeiros continua
// sendo feito pelo client depois que o usuário revisa/edita e confirma
// (useCriarLancamento, já existente).
//
// Contrato de entrada: chamada pelo client autenticado via
//   supabase.functions.invoke('classificar-documento', {
//     body: { fazenda_id, mime_type, arquivo_base64 }
//   })
//
// Só Gemini tem chamada de API real nesta primeira entrega (pedido de JP:
// "constroi a edge function usando gemini como padrao" — por isso o
// DEFAULT de fazendas.llm_provider também virou 'gemini', migration
// 20260721090000). Se a fazenda estiver configurada para Anthropic/OpenAI
// (tela /app/configuracoes/ia), a function retorna erro claro em vez de
// falhar silenciosamente ou usar o provedor errado.
//
// Segurança: fazenda_id vem do corpo da requisição (controlado pelo
// client), mas NUNCA é confiado sozinho — o client Supabase usado para
// consultar `fazendas` é o client "do usuário" (Authorization repassado),
// então a RLS de `fazendas_select_vinculada` (Fase 1) já garante que só
// fazendas vinculadas ao chamador são lidas; um fazenda_id de outra
// fazenda simplesmente não retorna linha (mesmo padrão de defesa que
// enviar-convite usa para convite_id/vinculo).
//
// Variáveis de ambiente:
//   - SUPABASE_URL, SUPABASE_ANON_KEY: injetadas automaticamente.
//   - GEMINI_API_KEY: NÃO injetada automaticamente — precisa de
//     `supabase secrets set GEMINI_API_KEY=...` (ação humana pendente,
//     mesma situação do RESEND_API_KEY em ADR-0003: ninguém gerou a chave
//     ainda). Sem ela, a function retorna 500 com mensagem clara em vez de
//     tentar a chamada e falhar de forma confusa.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeadersFor,
  extrairCamposDaResposta,
  mimeTypeValido,
  montarChamadaGemini,
  TAMANHO_MAXIMO_BASE64,
} from './logica.ts'

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  const APP_URL = Deno.env.get('APP_URL')
  const cors = corsHeadersFor(APP_URL)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Método não permitido' }, 405, cors)
    }

    // ---- 0. Corpo da requisição.
    let fazenda_id: unknown
    let mime_type: unknown
    let arquivo_base64: unknown
    try {
      const body = await req.json()
      fazenda_id = body?.fazenda_id
      mime_type = body?.mime_type
      arquivo_base64 = body?.arquivo_base64
    } catch {
      return jsonResponse({ error: 'Corpo da requisição inválido (esperado JSON)' }, 400, cors)
    }

    if (typeof fazenda_id !== 'string' || fazenda_id.trim() === '') {
      return jsonResponse({ error: 'fazenda_id é obrigatório' }, 400, cors)
    }
    if (typeof mime_type !== 'string' || !mimeTypeValido(mime_type)) {
      return jsonResponse(
        { error: 'mime_type inválido — aceito: PDF ou imagem (JPEG/PNG/WebP/HEIC/HEIF)' },
        400,
        cors,
      )
    }
    if (typeof arquivo_base64 !== 'string' || arquivo_base64.trim() === '') {
      return jsonResponse({ error: 'arquivo_base64 é obrigatório' }, 400, cors)
    }
    if (arquivo_base64.length > TAMANHO_MAXIMO_BASE64) {
      return jsonResponse({ error: 'Arquivo excede o tamanho máximo permitido (10MB)' }, 400, cors)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('classificar-documento: variáveis de ambiente do Supabase ausentes no runtime')
      return jsonResponse({ error: 'Erro interno de configuração' }, 500, cors)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }

    // ---- 1. Client "do usuário" — mesmo padrão de enviar-convite/index.ts:
    // RLS de `fazendas` já restringe a leitura seguinte à fazenda vinculada
    // ao chamador, sem precisar de service_role nesta function (só leitura,
    // nenhuma escrita privilegiada).
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }

    // ---- 2. Configuração de IA da fazenda — RLS garante que só retorna
    // linha se o chamador estiver vinculado (fazendas_select_vinculada).
    const { data: fazendaData, error: fazendaError } = await userClient
      .from('fazendas')
      .select('llm_provider, llm_model')
      .eq('id', fazenda_id)
      .maybeSingle()

    if (fazendaError) {
      console.error('classificar-documento: erro ao buscar fazenda', fazendaError)
      return jsonResponse({ error: 'Erro ao buscar configuração da fazenda' }, 500, cors)
    }
    if (!fazendaData) {
      return jsonResponse({ error: 'Fazenda não encontrada ou sem vínculo' }, 404, cors)
    }

    // ---- 3. Só Gemini implementado nesta entrega (ver cabeçalho do arquivo).
    if (fazendaData.llm_provider !== 'gemini') {
      return jsonResponse(
        {
          error:
            `Provedor "${fazendaData.llm_provider}" ainda não implementado — só Gemini ` +
            'está disponível hoje. Troque o provedor em Configurações > Modelo de IA.',
        },
        400,
        cors,
      )
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      console.error('classificar-documento: GEMINI_API_KEY não configurada no runtime')
      return jsonResponse(
        {
          error:
            'Chave de API do Gemini não configurada no servidor (GEMINI_API_KEY ausente) — ' +
            'ação pendente do time de infraestrutura.',
        },
        500,
        cors,
      )
    }

    // ---- 4. Chamada real ao Gemini.
    const chamada = montarChamadaGemini(
      fazendaData.llm_model,
      GEMINI_API_KEY,
      mime_type,
      arquivo_base64,
    )

    let geminiResponse: Response
    try {
      geminiResponse = await fetch(chamada.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chamada.body),
      })
    } catch (err) {
      console.error('classificar-documento: exceção ao chamar Gemini', err)
      return jsonResponse({ error: 'Falha de rede ao chamar o Gemini' }, 502, cors)
    }

    if (!geminiResponse.ok) {
      const corpoErro = await geminiResponse.text()
      console.error('classificar-documento: Gemini retornou erro', geminiResponse.status, corpoErro)
      return jsonResponse(
        { error: `Gemini retornou erro (${geminiResponse.status})` },
        502,
        cors,
      )
    }

    const geminiJson = await geminiResponse.json()
    const resultado = extrairCamposDaResposta(geminiJson)

    if (!resultado.ok) {
      console.error('classificar-documento: falha ao extrair campos', resultado.error)
      return jsonResponse({ error: resultado.error }, 502, cors)
    }

    return jsonResponse({ success: true, campos: resultado.campos }, 200, cors)
  } catch (err) {
    console.error('classificar-documento: exceção não tratada', err)
    return jsonResponse({ error: 'Erro interno inesperado' }, 500, cors)
  }
})
