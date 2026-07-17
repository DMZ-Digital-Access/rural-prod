// ============================================================================
// Testes de supabase/functions/enviar-convite/
//
// Nota honesta sobre cobertura (regra do próprio developer: "código sem
// teste é código não terminado", mas também "seja honesto sobre
// estimativas" — não fingir cobertura que não existe):
//
// O handler HTTP completo (`Deno.serve(...)` em index.ts) instancia dois
// clients Supabase reais (`createClient`) e chama métodos de rede
// (`auth.getUser()`, `.from(...).select(...)`, `auth.admin.inviteUserByEmail`).
// Mockar `@supabase/supabase-js` de ponta a ponta (o builder encadeável
// `.from().select().eq().eq().maybeSingle()`, mais o client de auth) exigiria
// reimplementar boa parte da lib ou subir um Supabase local (`supabase
// start` + `supabase functions serve`) para um teste de integração real —
// nenhuma das duas opções está ao alcance deste teste unitário sem
// infraestrutura, e um mock raso do client daria falsa confiança (o teste
// passaria mesmo se a query estivesse semanticamente errada, ex.: coluna
// trocada). Por isso, o handler HTTP em si (index.ts) NÃO está coberto aqui —
// e por isso este arquivo importa de ./logica.ts, nunca de ./index.ts:
// importar index.ts executaria `Deno.serve(...)` como efeito colateral do
// próprio import (o entrypoint precisa chamar Deno.serve no top-level para o
// runtime de Edge Functions reconhecer a função), o que levantaria um
// listener HTTP real durante os testes.
//
// O que ESTÁ coberto: toda a lógica de decisão foi deliberadamente extraída
// para funções puras em logica.ts, sem dependência de rede/client Supabase,
// exatamente para serem testáveis sem infraestrutura — é o que estes testes
// exercitam:
//   - chamadorEhAdminDaFazenda  → cobre o caso "chamador não-admin → 403"
//   - validarConvitePendente    → cobre o caso "convite não-pendente → erro"
//   - montarChamadaInviteUserByEmail → cobre "branch sem conta monta a
//     chamada certa a inviteUserByEmail" (payload, não a chamada de rede em
//     si)
//   - montarUrlAceite / enviarEmailConvite → cobre o branch de e-mail TODO
//
// O caso "convite não encontrado → 404" é uma checagem trivial de
// `!conviteData` no handler de index.ts (não extraída para função pura
// porque não tem lógica de decisão além de "existe ou não") — não coberta
// por teste automatizado por esse motivo; revisão de código cobre esse
// trecho.
//
// Recomendação para o `qa` (Emma): um teste de integração real (Supabase
// local + `supabase functions serve` + chamadas HTTP de fato) é o próximo
// passo natural para cobrir o handler inteiro (index.ts), incluindo os
// status codes HTTP e o CORS — fora do escopo desta tarefa do developer.
// ============================================================================

import {
  chamadorEhAdminDaFazenda,
  validarConvitePendente,
  montarChamadaInviteUserByEmail,
  montarUrlAceite,
  enviarEmailConvite,
  corsHeadersFor,
  type ConviteRow,
} from './logica.ts'
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'

function conviteBase(overrides: Partial<ConviteRow> = {}): ConviteRow {
  return {
    id: 'convite-1',
    fazenda_id: 'fazenda-1',
    convidado_email: 'novo@exemplo.com',
    convidado_usuario_id: null,
    papel_oferecido: 'membro',
    convidado_por: 'admin-1',
    token: 'token-abc-123',
    status: 'pendente',
    expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    accepted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// chamadorEhAdminDaFazenda — cobre "chamador não-admin recebe 403"
// ---------------------------------------------------------------------------

Deno.test('chamadorEhAdminDaFazenda: retorna false quando o chamador não tem vínculo com a fazenda', () => {
  assertEquals(chamadorEhAdminDaFazenda(null), false)
})

Deno.test('chamadorEhAdminDaFazenda: retorna false quando o chamador é membro (não admin)', () => {
  assertEquals(chamadorEhAdminDaFazenda({ papel: 'membro' }), false)
})

Deno.test('chamadorEhAdminDaFazenda: retorna false quando o chamador é financeiro (não admin)', () => {
  assertEquals(chamadorEhAdminDaFazenda({ papel: 'financeiro' }), false)
})

Deno.test('chamadorEhAdminDaFazenda: retorna true quando o chamador é admin', () => {
  assertEquals(chamadorEhAdminDaFazenda({ papel: 'admin' }), true)
})

// ---------------------------------------------------------------------------
// validarConvitePendente — cobre "convite não-pendente recebe erro"
// ---------------------------------------------------------------------------

Deno.test('validarConvitePendente: aceita convite com status pendente', () => {
  const resultado = validarConvitePendente(conviteBase({ status: 'pendente' }))
  assertEquals(resultado.ok, true)
})

Deno.test('validarConvitePendente: rejeita convite já aceito', () => {
  const resultado = validarConvitePendente(conviteBase({ status: 'aceito' }))
  assertEquals(resultado.ok, false)
  if (!resultado.ok) {
    assertEquals(resultado.status, 409)
    assertMatch(resultado.error, /aceito/)
  }
})

Deno.test('validarConvitePendente: rejeita convite cancelado', () => {
  const resultado = validarConvitePendente(conviteBase({ status: 'cancelado' }))
  assertEquals(resultado.ok, false)
  if (!resultado.ok) {
    assertEquals(resultado.status, 409)
    assertMatch(resultado.error, /cancelado/)
  }
})

// ---------------------------------------------------------------------------
// montarChamadaInviteUserByEmail — cobre "branch sem conta monta a chamada
// certa a inviteUserByEmail"
// ---------------------------------------------------------------------------

Deno.test('montarChamadaInviteUserByEmail: usa o e-mail e o token corretos do convite, com redirectTo quando APP_URL definida', () => {
  const convite = conviteBase({
    convidado_email: 'pessoa@fazenda.com',
    token: 'token-xyz',
  })

  const chamada = montarChamadaInviteUserByEmail(convite, 'https://app.exemplo.com')

  assertEquals(chamada.email, 'pessoa@fazenda.com')
  assertEquals(chamada.options.data, { convite_token: 'token-xyz' })
  assertEquals(chamada.options.redirectTo, 'https://app.exemplo.com/convites/aceitar')
})

Deno.test('montarChamadaInviteUserByEmail: redirectTo fica undefined quando APP_URL não está configurada', () => {
  const convite = conviteBase()
  const chamada = montarChamadaInviteUserByEmail(convite, undefined)
  assertEquals(chamada.options.redirectTo, undefined)
})

// ---------------------------------------------------------------------------
// montarUrlAceite / enviarEmailConvite — cobre o branch de e-mail
// transacional pendente (TODO devops)
// ---------------------------------------------------------------------------

Deno.test('montarUrlAceite: monta a URL de aceite com o token do convite', () => {
  const convite = conviteBase({ token: 'token-abc' })
  const url = montarUrlAceite(convite, 'https://app.exemplo.com')
  assertEquals(url, 'https://app.exemplo.com/convites/aceitar?token=token-abc')
})

Deno.test('montarUrlAceite: usa placeholder quando APP_URL não está configurada, sem lançar exceção', () => {
  const convite = conviteBase({ token: 'token-abc' })
  const url = montarUrlAceite(convite, undefined)
  assertMatch(url, /token=token-abc$/)
})

Deno.test('enviarEmailConvite: não lança exceção quando chamado (branch TODO deliberado, nunca falha a função)', () => {
  const convite = conviteBase({ convidado_usuario_id: 'usuario-existente-1' })
  const url = enviarEmailConvite(convite, 'https://app.exemplo.com')
  assertEquals(url, `https://app.exemplo.com/convites/aceitar?token=${convite.token}`)
})

// ---------------------------------------------------------------------------
// corsHeadersFor — cobre CORS/preflight
// ---------------------------------------------------------------------------

Deno.test('corsHeadersFor: usa APP_URL como Allow-Origin quando definida', () => {
  const headers = corsHeadersFor('https://app.exemplo.com')
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://app.exemplo.com')
})

Deno.test('corsHeadersFor: cai para "*" quando APP_URL não está definida', () => {
  const headers = corsHeadersFor(undefined)
  assertEquals(headers['Access-Control-Allow-Origin'], '*')
})
