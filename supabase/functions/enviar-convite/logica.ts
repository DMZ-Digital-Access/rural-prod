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
 * TODO(devops): placeholder deliberado para o envio de e-mail transacional de
 * convite a quem JÁ TEM CONTA (branch convidado_usuario_id !== null).
 *
 * O provedor de e-mail (Resend, SendGrid, SMTP próprio, etc.) NÃO foi
 * decidido — ADR-0002 D3 marca isso explicitamente como "a definir por
 * devops", e está fora do escopo desta tarefa escolher um (ver
 * .agents/agents/developer.md, "LIMITES DESTA TAREFA"). Este NÃO é um
 * esquecimento: é a decisão consciente de não inventar uma escolha de
 * infraestrutura que não é do developer, mas também não travar a função
 * inteira por causa disso (regra de comportamento do próprio agente: "seja
 * honesto sobre estimativas" / débito técnico visível, não invisível).
 *
 * Por ora: monta a URL de aceite (a aceitação em si sempre acontece via RPC
 * `aceitar_convite(token)`, depois que o usuário loga — nunca por esta
 * função) e apenas loga. Quando o provedor for escolhido, substituir o
 * `console.log` por uma chamada HTTP real e propagar o resultado real do
 * envio para `emailEnviado` na resposta.
 */
export function montarUrlAceite(convite: ConviteRow, appUrl: string | undefined): string {
  const base = appUrl ?? '(APP_URL não configurada)'
  return `${base}/convites/aceitar?token=${convite.token}`
}

export function enviarEmailConvite(convite: ConviteRow, appUrl: string | undefined): string {
  const aceiteUrl = montarUrlAceite(convite, appUrl)
  console.log(
    `[enviar-convite] TODO(devops): provedor de e-mail pendente de decisão. ` +
      `Convite ${convite.id} para ${convite.convidado_email} — URL de aceite: ${aceiteUrl}`,
  )
  return aceiteUrl
}
