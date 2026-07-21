// ============================================================================
// Edge Function: gerar-zip-lancamentos
//
// Módulo Financeiro (item 18) — tela "Documentos Fiscais". Pedido de JP:
// "devemos ter também uma forma de download de todas as notas dos
// lançamentos do mês (presente ou passado) em zip". Nomes de arquivo dentro
// do ZIP seguem o padrão de `nomeArquivoNoZip()` (logica.ts) — data ISO +
// número sequencial no mês + entrada/saida + categoria, sempre em ordem
// cronológica quando listado por qualquer descompactador.
//
// Contrato de entrada: chamada pelo client autenticado via
//   fetch(`${SUPABASE_URL}/functions/v1/gerar-zip-lancamentos`, {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${accessToken}`, apikey: ANON_KEY },
//     body: JSON.stringify({ fazenda_id, ano, mes }),
//   })
// Resposta é o ZIP binário (Content-Type: application/zip), não JSON — por
// isso o frontend usa `fetch` direto em vez de `supabase.functions.invoke`
// (otimizado para request/response JSON).
//
// Segurança: mesmo padrão de classificar-documento/index.ts — client "do
// usuário" (Authorization repassado), RLS de `fazendas_select_vinculada` e
// `lancamentos_financeiros_select_vinculada` já restringem a leitura à
// fazenda vinculada ao chamador. Sem service_role (só leitura).
//
// Variáveis de ambiente: SUPABASE_URL/SUPABASE_ANON_KEY (injetadas
// automaticamente).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import JSZip from 'npm:jszip@3'
import {
  corsHeadersFor,
  nomeArquivoNoZip,
  ordenarPorDataCrescente,
  validarAnoMes,
  type LancamentoParaZip,
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

    let fazenda_id: unknown
    let ano: unknown
    let mes: unknown
    try {
      const body = await req.json()
      fazenda_id = body?.fazenda_id
      ano = body?.ano
      mes = body?.mes
    } catch {
      return jsonResponse({ error: 'Corpo da requisição inválido (esperado JSON)' }, 400, cors)
    }

    if (typeof fazenda_id !== 'string' || fazenda_id.trim() === '') {
      return jsonResponse({ error: 'fazenda_id é obrigatório' }, 400, cors)
    }
    const erroValidacao = validarAnoMes(ano, mes)
    if (erroValidacao) {
      return jsonResponse({ error: erroValidacao }, 400, cors)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('gerar-zip-lancamentos: variáveis de ambiente do Supabase ausentes')
      return jsonResponse({ error: 'Erro interno de configuração' }, 500, cors)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }

    // ---- Busca os lançamentos do mês com documento anexado. RLS já
    // restringe a `fazenda_id` vinculada ao chamador.
    const anoNum = ano as number
    const mesNum = mes as number
    const mesStr = String(mesNum).padStart(2, '0')
    const ultimoDia = new Date(anoNum, mesNum, 0).getDate()

    const { data: lancamentosData, error: lancamentosError } = await userClient
      .from('lancamentos_financeiros')
      .select('id, data_lancamento, categoria, tipo, arquivo_path')
      .eq('fazenda_id', fazenda_id)
      .gte('data_lancamento', `${anoNum}-${mesStr}-01`)
      .lte('data_lancamento', `${anoNum}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`)
      .not('arquivo_path', 'is', null)

    if (lancamentosError) {
      console.error('gerar-zip-lancamentos: erro ao buscar lançamentos', lancamentosError)
      return jsonResponse({ error: 'Erro ao buscar lançamentos' }, 500, cors)
    }

    const lancamentos = (lancamentosData ?? []) as LancamentoParaZip[]
    if (lancamentos.length === 0) {
      return jsonResponse(
        { error: 'Nenhum documento encontrado para o período selecionado' },
        404,
        cors,
      )
    }

    const ordenados = ordenarPorDataCrescente(lancamentos)

    // ---- Monta o ZIP baixando cada documento do Storage.
    const zip = new JSZip()
    for (let i = 0; i < ordenados.length; i++) {
      const lancamento = ordenados[i]
      const { data: arquivoBlob, error: downloadError } = await userClient.storage
        .from('lancamentos-documentos')
        .download(lancamento.arquivo_path)

      if (downloadError || !arquivoBlob) {
        console.error(
          'gerar-zip-lancamentos: falha ao baixar documento',
          lancamento.arquivo_path,
          downloadError,
        )
        continue // não deixa um documento com falha travar o ZIP inteiro
      }

      const nomeNoZip = nomeArquivoNoZip(lancamento, i + 1)
      zip.file(nomeNoZip, await arquivoBlob.arrayBuffer())
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })

    return new Response(zipBytes, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="documentos-fiscais-${anoNum}-${mesStr}.zip"`,
      },
    })
  } catch (err) {
    console.error('gerar-zip-lancamentos: exceção não tratada', err)
    return jsonResponse({ error: 'Erro interno inesperado' }, 500, cors)
  }
})
