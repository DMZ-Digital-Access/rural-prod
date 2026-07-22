// ============================================================================
// Testes de supabase/functions/classificar-documento/
//
// Mesma nota honesta de cobertura de enviar-convite/index.test.ts: o handler
// HTTP completo (Deno.serve em index.ts) instancia um client Supabase real e
// chama auth.getUser()/.from(...).select(...) — não coberto aqui pelos
// mesmos motivos (mock raso daria falsa confiança; integração real exigiria
// `supabase functions serve`). Este arquivo importa só de ./logica.ts.
//
// Honestidade adicional: estes testes NÃO foram executados nesta sessão —
// o ambiente de desenvolvimento (Windows, PowerShell) não tem o Deno CLI
// instalado (`deno --version` não encontrado). Escritos seguindo exatamente
// o padrão de enviar-convite/index.test.ts para quando o CLI estiver
// disponível (CI, ou máquina com Deno). Diferente da primeira versão deste
// arquivo, porém, a lógica de `montarChamadaGemini`/`extrairCamposDaResposta`
// testada aqui FOI validada de verdade contra a API real do Gemini via
// chamadas HTTP diretas (PowerShell) em 2026-07-21, ao configurar a
// GEMINI_API_KEY de produção — ver
// `.agents/memory/log/2026-07-21-correcao-api-gemini-interactions.md`.
// ============================================================================

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  extrairCamposDaResposta,
  extrairMensagemDeErro,
  mimeTypeValido,
  montarChamadaGemini,
} from './logica.ts'

Deno.test('mimeTypeValido aceita PDF e os formatos de imagem do bucket', () => {
  assertEquals(mimeTypeValido('application/pdf'), true)
  assertEquals(mimeTypeValido('image/jpeg'), true)
  assertEquals(mimeTypeValido('image/heic'), true)
  assertEquals(mimeTypeValido('text/plain'), false)
  assertEquals(mimeTypeValido(''), false)
})

Deno.test('montarChamadaGemini monta a URL da Interactions API e o body com input/response_format', () => {
  const chamada = montarChamadaGemini('gemini-3.6-flash', 'image/jpeg', 'YWJj')

  assertEquals(chamada.url, 'https://generativelanguage.googleapis.com/v1alpha/interactions')

  const body = chamada.body as { model: string; input: Record<string, unknown>[] }
  assertEquals(body.model, 'gemini-3.6-flash')
  assertEquals(body.input[0], { type: 'image', mime_type: 'image/jpeg', data: 'YWJj' })
})

Deno.test('montarChamadaGemini usa type "document" para PDF, não "image"', () => {
  const chamada = montarChamadaGemini('gemini-3.6-flash', 'application/pdf', 'YWJj')
  const body = chamada.body as { input: Record<string, unknown>[] }
  assertEquals(body.input[0], { type: 'document', mime_type: 'application/pdf', data: 'YWJj' })
})

Deno.test('extrairCamposDaResposta lê o JSON do passo model_output', () => {
  const respostaCrua = {
    status: 'completed',
    steps: [
      { type: 'thought' },
      {
        type: 'model_output',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tipo: 'despesa',
              categoria: 'Insumos',
              descricao: 'Ração para gado',
              data_lancamento: '2026-07-20',
              valor: 1500.5,
              numero_nota: 'NF-123',
              contraparte: 'Fornecedor XYZ',
            }),
          },
        ],
      },
    ],
  }

  const resultado = extrairCamposDaResposta(respostaCrua)
  assertEquals(resultado.ok, true)
  if (resultado.ok) {
    assertEquals(resultado.campos.tipo, 'despesa')
    assertEquals(resultado.campos.valor, 1500.5)
    assertEquals(resultado.campos.numero_nota, 'NF-123')
  }
})

Deno.test('extrairCamposDaResposta trata campos ausentes/vazios como null, não inventa valor', () => {
  const respostaCrua = {
    status: 'completed',
    steps: [
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ tipo: 'receita' }) }] },
    ],
  }

  const resultado = extrairCamposDaResposta(respostaCrua)
  assertEquals(resultado.ok, true)
  if (resultado.ok) {
    assertEquals(resultado.campos.categoria, null)
    assertEquals(resultado.campos.valor, null)
  }
})

Deno.test('extrairCamposDaResposta retorna erro quando tipo é inválido/ausente', () => {
  const respostaCrua = {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({}) }] }],
  }
  const resultado = extrairCamposDaResposta(respostaCrua)
  assertEquals(resultado.ok, false)
})

Deno.test('extrairCamposDaResposta retorna erro quando status não é completed', () => {
  const resultado = extrairCamposDaResposta({ status: 'failed', steps: [] })
  assertEquals(resultado.ok, false)
})

Deno.test('extrairCamposDaResposta retorna erro quando não há passo model_output', () => {
  const resultado = extrairCamposDaResposta({ status: 'completed', steps: [{ type: 'thought' }] })
  assertEquals(resultado.ok, false)
})

Deno.test('extrairMensagemDeErro lê error.message do corpo de erro da API', () => {
  const corpo = JSON.stringify({ error: { message: 'Model not found.', code: 'not_found' } })
  assertEquals(extrairMensagemDeErro(corpo), 'Model not found.')
})

Deno.test('extrairMensagemDeErro retorna null se o corpo não for o formato esperado', () => {
  assertEquals(extrairMensagemDeErro('não é json'), null)
  assertEquals(extrairMensagemDeErro('{}'), null)
})
