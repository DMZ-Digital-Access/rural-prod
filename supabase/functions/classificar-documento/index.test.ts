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
// disponível (CI, ou máquina com Deno). Revisão de código cobriu a lógica
// no lugar da execução real.
// ============================================================================

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  extrairCamposDaResposta,
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

Deno.test('montarChamadaGemini monta a URL com a key na query string e o body com inline_data', () => {
  const chamada = montarChamadaGemini('gemini-2.5-flash', 'chave-123', 'image/jpeg', 'YWJj')

  assertEquals(
    chamada.url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=chave-123',
  )

  const contents = chamada.body.contents as Array<{ parts: unknown[] }>
  const parts = contents[0].parts as Array<Record<string, unknown>>
  assertEquals(parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'YWJj' } })
})

Deno.test('extrairCamposDaResposta lê o JSON de candidates[0].content.parts[0].text', () => {
  const respostaCrua = {
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            {
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
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [{ text: JSON.stringify({ tipo: 'receita' }) }],
        },
      },
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
    candidates: [
      { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({}) }] } },
    ],
  }
  const resultado = extrairCamposDaResposta(respostaCrua)
  assertEquals(resultado.ok, false)
})

Deno.test('extrairCamposDaResposta retorna erro quando finishReason não é STOP', () => {
  const respostaCrua = {
    candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: '{}' }] } }],
  }
  const resultado = extrairCamposDaResposta(respostaCrua)
  assertEquals(resultado.ok, false)
})

Deno.test('extrairCamposDaResposta retorna erro quando candidates está vazio', () => {
  const resultado = extrairCamposDaResposta({ candidates: [] })
  assertEquals(resultado.ok, false)
})
