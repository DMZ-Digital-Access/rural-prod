// ============================================================================
// Lógica pura de supabase/functions/enviar-convite (ADR-0002 D3).
//
// Extraída para um módulo separado de index.ts DE PROPÓSITO: index.ts chama
// `Deno.serve(...)` no top-level (padrão exigido pelo runtime de Edge
// Functions do Supabase para o entrypoint ser reconhecido). Se o teste
// importasse index.ts diretamente, esse import por si só iniciaria um
// listener HTTP real como efeito colateral (Deno.serve roda assim que o
// módulo é avaliado). Mantendo a lógica de decisão aqui, sem nenhuma chamada
// a Deno.serve/createClient, o arquivo de teste (index.test.ts) pode importar
// só isto — sem rede, sem client Supabase, sem servidor sendo levantado.
// ============================================================================

export interface ConviteRow {
  id: string
  fazenda_id: string
  convidado_email: string
  convidado_usuario_id: string | null
  papel_oferecido: string
  convidado_por: string
  token: string
  status: 'pendente' | 'aceito' | 'cancelado'
  expires_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface VinculoRow {
  papel: string
}

// ----------------------------------------------------------------------------
// CORS
//
// A função é chamada do frontend, domínio diferente de *.supabase.co, então
// precisa dos headers de CORS e tratar o preflight OPTIONS. Access-Control-
// Allow-Origin usa APP_URL quando configurada (mais restritivo); cai para
// '*' se ausente, para não travar ambientes de desenvolvimento local — não é
// um problema de CSRF nesta função porque a autenticação é via header
// Authorization (Bearer token), nunca cookie, mas o cyber_chief deve
// confirmar que APP_URL está sempre configurada antes de produção.
// ----------------------------------------------------------------------------

export function corsHeadersFor(appUrl: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': appUrl ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/**
 * Passo 4 do fluxo (o ponto de segurança mais importante da função):
 * o chamador só pode (re)enviar um convite se tiver vínculo `papel = 'admin'`
 * com a `fazenda_id` GRAVADA NO CONVITE (nunca com uma fazenda_id vinda do
 * corpo da requisição — essa nem existe no contrato de entrada, mas o ponto
 * é que mesmo que viesse, seria ignorada).
 */
export function chamadorEhAdminDaFazenda(vinculo: VinculoRow | null): boolean {
  return vinculo !== null && vinculo.papel === 'admin'
}

export type ValidacaoConvite =
  | { ok: true }
  | { ok: false; status: number; error: string }

/** Passo 5: convite precisa existir (já garantido antes de chamar isto) e estar pendente. */
export function validarConvitePendente(convite: ConviteRow): ValidacaoConvite {
  if (convite.status !== 'pendente') {
    return {
      ok: false,
      status: 409,
      error: `Convite não está pendente (status atual: ${convite.status})`,
    }
  }
  return { ok: true }
}

/**
 * Monta os argumentos exatos para `serviceClient.auth.admin.inviteUserByEmail`
 * (branch "pessoa sem conta", convidado_usuario_id === null). Extraído como
 * função pura para poder ser testado sem instanciar um client Supabase real.
 */
export function montarChamadaInviteUserByEmail(convite: ConviteRow, appUrl: string | undefined) {
  return {
    email: convite.convidado_email,
    options: {
      data: { convite_token: convite.token },
      redirectTo: appUrl ? `${appUrl}/convites/aceitar` : undefined,
    },
  }
}

/**
 * Monta a URL de aceite (a aceitação em si sempre acontece via RPC
 * `aceitar_convite(token)`, depois que o usuário loga — nunca por esta
 * função nem pelo e-mail em si, que só carrega o link).
 */
export function montarUrlAceite(convite: ConviteRow, appUrl: string | undefined): string {
  const base = appUrl ?? '(APP_URL não configurada)'
  return `${base}/convites/aceitar?token=${convite.token}`
}

export interface ChamadaResend {
  url: string
  body: {
    from: string
    to: string[]
    subject: string
    html: string
  }
}

/**
 * Provedor de e-mail transacional decidido pelo `devops` (ADR-0003 —
 * .agents/memory/adr/ADR-0003-provedor-email-transacional.md): Resend, pela
 * combinação de API HTTP simples (um único POST JSON, sem SDK Node-específico
 * incompatível com Deno), tier gratuito generoso (3.000 e-mails/mês) e
 * reputação de deliverability adequada para um produto pré-lançamento.
 *
 * Função PURA (sem fetch), mesmo motivo do resto deste arquivo — só monta o
 * payload exato da chamada HTTP; quem efetivamente chama a rede é index.ts,
 * condicionado a `RESEND_API_KEY` estar configurada. Sem essa env var (caso
 * hoje, ninguém criou a conta Resend ainda), index.ts nunca chama esta
 * função — cai direto no fallback de `enviarEmailConvite()` abaixo.
 */
export function montarChamadaResend(
  convite: ConviteRow,
  appUrl: string | undefined,
  remetente: string,
): ChamadaResend {
  const aceiteUrl = montarUrlAceite(convite, appUrl)
  return {
    url: 'https://api.resend.com/emails',
    body: {
      from: remetente,
      to: [convite.convidado_email],
      subject: 'Você foi convidado para uma fazenda no Livestock Control',
      html:
        `<p>Você foi convidado para participar de uma fazenda no Livestock Control, ` +
        `com o papel <strong>${convite.papel_oferecido}</strong>.</p>` +
        `<p><a href="${aceiteUrl}">Clique aqui para ver e aceitar o convite</a></p>` +
        `<p>Se você não reconhece este convite, pode ignorar este e-mail com segurança.</p>`,
    },
  }
}

/**
 * Fallback deliberado para o envio de e-mail transacional de convite a quem
 * JÁ TEM CONTA (branch `convidado_usuario_id !== null`), usado por index.ts
 * sempre que `RESEND_API_KEY` não está configurada (hoje é sempre o caso —
 * ninguém criou a conta Resend ainda) OU quando a chamada real à Resend
 * falha (rede fora do ar, chave inválida, etc.) — nunca falha a função por
 * causa do canal de notificação, o convite já é válido nesse ponto.
 *
 * Monta a URL de aceite e apenas loga — não é um esquecimento, é a mesma
 * filosofia de débito técnico visível que já valia antes de o provedor ser
 * escolhido (ver ADR-0003), agora reduzida à sua função real: fallback
 * seguro, não mais "esperando decisão".
 */
export function enviarEmailConvite(convite: ConviteRow, appUrl: string | undefined): string {
  const aceiteUrl = montarUrlAceite(convite, appUrl)
  console.log(
    `[enviar-convite] Resend não configurada/falhou — fallback de log. ` +
      `Convite ${convite.id} para ${convite.convidado_email} — URL de aceite: ${aceiteUrl}`,
  )
  return aceiteUrl
}
