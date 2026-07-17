// ============================================================================
// Edge Function: enviar-convite
//
// ADR-0002 D3 (.agents/memory/adr/ADR-0002-convites-e-papeis-admin.md) —
// componente que envia o convite gerado por public.criar_convite() (RPC
// Postgres, schema em supabase/migrations/20260716183000_adr0002_convites_papeis.sql).
//
// Contrato de entrada: chamada pelo client autenticado via
//   supabase.functions.invoke('enviar-convite', { body: { convite_id } })
// DEPOIS que o client já chamou criar_convite() com sucesso.
//
// Regra de segurança central desta função (por isso o comentário longo):
// NUNCA confiar em fazenda_id/papel/qualquer outro dado vindo do corpo da
// requisição além de `convite_id`. O corpo é controlado pelo client — a
// única fonte da verdade é o banco. Toda decisão de autorização é revalidada
// aqui a partir do convite lido do banco (passo 3) e do vínculo
// usuarios_fazendas do chamador (passo 4), nunca a partir do payload.
// Mesma cautela que o ADR-0001 já registrou para esta classe de superfície
// (Edge Function com service_role) e que o ADR-0002 exige explicitamente
// para esta função.
//
// A lógica de decisão (validação de convite, checagem de admin, montagem da
// chamada de invite/URL de aceite) vive em ./logica.ts, sem nenhuma
// dependência de rede/client Supabase — ver comentário de topo daquele
// arquivo para o motivo (testabilidade sem side effect de Deno.serve).
//
// Variáveis de ambiente:
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: injetadas
//     automaticamente pelo runtime de Edge Functions do Supabase — não
//     precisam de `supabase secrets set` manual.
//   - APP_URL: NÃO injetada automaticamente. Precisa ser configurada via
//     `supabase secrets set APP_URL=https://app.dominio.com` (decisão de
//     devops/deploy — ver ADR-0003, .agents/memory/adr/
//     ADR-0003-provedor-email-transacional.md). Usada para:
//       (a) redirectTo do e-mail nativo de convite (admin.inviteUserByEmail);
//       (b) montar a URL de aceite no e-mail transacional (Resend/fallback,
//           ver enviarEmailConvite/montarChamadaResend em logica.ts);
//       (c) o Access-Control-Allow-Origin do CORS, quando definida — ver
//           corsHeadersFor() em logica.ts.
//     Se ausente, a função ainda funciona (cai em comportamento mais
//     permissivo/menos preciso em vez de falhar), porque travar todo o envio
//     de convite por uma variável de configuração de UX seria
//     desproporcional — mas isso deve ser corrigido antes de produção.
//   - RESEND_API_KEY: NÃO injetada automaticamente, e OPCIONAL (feature-gated
//     — ver ADR-0003). Ausente hoje porque ninguém criou a conta Resend
//     ainda. Quando presente, o branch de e-mail transacional (convidado já
//     tem conta) chama a API REST da Resend de verdade; quando ausente,
//     cai no fallback seguro pré-existente (loga a URL, `emailEnviado:
//     false`) — nunca quebra por falta desta env var.
//   - RESEND_FROM_EMAIL: opcional. Endereço "From:" usado na chamada à
//     Resend. Default: 'Livestock Control <onboarding@resend.dev>' (sender de
//     sandbox da própria Resend, funciona sem domínio verificado, mas com
//     limitações — ver ADR-0003 para quando/como trocar por um domínio
//     verificado do produto).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  chamadorEhAdminDaFazenda,
  corsHeadersFor,
  enviarEmailConvite,
  montarChamadaInviteUserByEmail,
  montarChamadaResend,
  validarConvitePendente,
  type ConviteRow,
  type VinculoRow,
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

  // CORREÇÃO cyber_chief (gate ADR-0002): o fallback de CORS para '*' quando
  // APP_URL está ausente foi avaliado e mantido (não é vetor de CSRF nesta
  // função — autenticação é via header Authorization/Bearer, nunca cookie,
  // então um site de terceiro não consegue "andar de carona" na sessão do
  // usuário só por causa do CORS aberto). Mas isso não deve valer em
  // produção silenciosamente — este warning torna a ausência de APP_URL
  // visível nos logs da function a cada request, para não passar
  // despercebido até alguém notar em produção.
  if (!APP_URL) {
    console.warn(
      'enviar-convite: APP_URL não configurada — CORS caindo para "*" e ' +
        'redirectTo/URL de aceite ausentes. Configurar `supabase secrets ' +
        'set APP_URL=...` antes de expor este endpoint em produção.',
    )
  }

  const cors = corsHeadersFor(APP_URL)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  // Requisito 8: nunca deixar uma exceção não tratada estourar sem response —
  // todo o corpo do handler roda dentro deste try/catch.
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Método não permitido' }, 405, cors)
    }

    // ---- 0. Único parâmetro de entrada relevante: convite_id. Qualquer
    // outro campo do corpo é ignorado deliberadamente (ver comentário de
    // topo do arquivo).
    let convite_id: unknown
    try {
      const body = await req.json()
      convite_id = body?.convite_id
    } catch {
      return jsonResponse({ error: 'Corpo da requisição inválido (esperado JSON)' }, 400, cors)
    }

    if (typeof convite_id !== 'string' || convite_id.trim() === '') {
      return jsonResponse({ error: 'convite_id é obrigatório' }, 400, cors)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('enviar-convite: variáveis de ambiente do Supabase ausentes no runtime')
      return jsonResponse({ error: 'Erro interno de configuração' }, 500, cors)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }

    // ---- 1. Client "do usuário": criado com o JWT repassado automaticamente
    // pelo supabase-js no header Authorization quando o client chama
    // functions.invoke(). Usamos o client oficial para auth.getUser() —
    // NUNCA decodificamos o JWT manualmente, o client valida assinatura e
    // expiração contra o GoTrue.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Não autenticado' }, 401, cors)
    }
    const callerId = userData.user.id

    // ---- 2. Client "service_role": para as operações privilegiadas (ler
    // convites sem depender de RLS, chamar a Admin API).
    // SUPABASE_SERVICE_ROLE_KEY é injetada automaticamente pelo runtime de
    // Edge Functions.
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ---- 3. Buscar o convite pelo id via service_role.
    const { data: conviteData, error: conviteError } = await serviceClient
      .from('convites')
      .select('*')
      .eq('id', convite_id)
      .maybeSingle()

    if (conviteError) {
      console.error('enviar-convite: erro ao buscar convite', conviteError)
      return jsonResponse({ error: 'Erro ao buscar convite' }, 500, cors)
    }

    if (!conviteData) {
      return jsonResponse({ error: 'Convite não encontrado' }, 404, cors)
    }

    const convite = conviteData as ConviteRow

    // ---- 4. REVALIDAR A PERMISSÃO DO CHAMADOR — ponto de segurança mais
    // importante desta função, não pular. Consulta usuarios_fazendas via
    // client service_role (RLS não aplicaria a este client de qualquer
    // forma, já que service_role bypassa RLS por padrão, mas a checagem é
    // feita explicitamente no código, nunca assumida — mesma disciplina que
    // as 4 funções SECURITY DEFINER do ADR-0002 aplicam em Postgres).
    const { data: vinculoData, error: vinculoError } = await serviceClient
      .from('usuarios_fazendas')
      .select('papel')
      .eq('usuario_id', callerId)
      .eq('fazenda_id', convite.fazenda_id)
      .maybeSingle()

    if (vinculoError) {
      console.error('enviar-convite: erro ao validar permissão do chamador', vinculoError)
      return jsonResponse({ error: 'Erro ao validar permissão' }, 500, cors)
    }

    const vinculo = vinculoData as VinculoRow | null

    if (!chamadorEhAdminDaFazenda(vinculo)) {
      return jsonResponse(
        { error: 'Apenas admins da fazenda podem (re)enviar este convite' },
        403,
        cors,
      )
    }

    // ---- 5. Convite precisa estar pendente (não reenviar aceito/cancelado).
    const validacao = validarConvitePendente(convite)
    if (!validacao.ok) {
      return jsonResponse({ error: validacao.error }, validacao.status, cors)
    }

    // ---- 6. Branch pelo convidado_usuario_id.
    if (convite.convidado_usuario_id === null) {
      // Pessoa sem conta: a Admin API cria a linha em auth.users (dispara
      // handle_new_user(), que lê convite_token de raw_user_meta_data — ver
      // migration 20260716183000_adr0002_convites_papeis.sql) e envia o
      // e-mail de convite nativo do Supabase Auth.
      const { email, options } = montarChamadaInviteUserByEmail(convite, APP_URL)

      const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
        email,
        options,
      )

      if (inviteError) {
        console.error('enviar-convite: inviteUserByEmail falhou', inviteError)
        return jsonResponse(
          { error: `Falha ao enviar convite por e-mail: ${inviteError.message}` },
          502,
          cors,
        )
      }

      return jsonResponse(
        { success: true, canal: 'admin.inviteUserByEmail', emailEnviado: true },
        200,
        cors,
      )
    }

    // Pessoa já tem conta: envia e-mail transacional via Resend (ADR-0003)
    // quando RESEND_API_KEY está configurada. Nunca falha a função por causa
    // deste branch — o convite já foi processado com sucesso nos passos
    // acima, só o canal de notificação pode ficar pendente.
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    if (RESEND_API_KEY) {
      const remetente = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Livestock Control <onboarding@resend.dev>'
      const chamada = montarChamadaResend(convite, APP_URL, remetente)

      try {
        const resendResponse = await fetch(chamada.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chamada.body),
        })

        if (resendResponse.ok) {
          return jsonResponse({ success: true, canal: 'resend', emailEnviado: true }, 200, cors)
        }

        const erroResend = await resendResponse.text()
        console.error(
          'enviar-convite: Resend retornou erro',
          resendResponse.status,
          erroResend,
        )
        // Não retorna aqui de propósito — cai no fallback abaixo, mesma
        // filosofia do branch original (convite já válido, só o canal de
        // notificação falhou).
      } catch (err) {
        console.error('enviar-convite: exceção ao chamar Resend', err)
      }
    }

    const aceiteUrl = enviarEmailConvite(convite, APP_URL)

    return jsonResponse(
      {
        success: true,
        canal: 'email_transacional_pendente',
        emailEnviado: false,
        motivo: RESEND_API_KEY
          ? 'Resend retornou erro ao enviar — ver logs da function'
          : 'RESEND_API_KEY não configurada (ver ADR-0003, devops decide quando criar a conta)',
        aceiteUrl,
      },
      200,
      cors,
    )
  } catch (err) {
    // Rede de segurança final: qualquer exceção não prevista (ex.: erro de
    // parsing inesperado, falha de rede não tratada por acima) ainda vira
    // uma resposta JSON, nunca um crash sem corpo.
    console.error('enviar-convite: exceção não tratada', err)
    return jsonResponse({ error: 'Erro interno inesperado' }, 500, cors)
  }
})
