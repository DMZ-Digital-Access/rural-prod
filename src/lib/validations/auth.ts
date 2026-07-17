import { z } from "zod"

// Schemas de validação dos formulários de autenticação (Fase 1).
// Mantidos separados dos componentes de página de propósito: são a parte
// testável sem infraestrutura de componente (ver
// src/lib/validations/auth.test.ts e o log da tarefa sobre a lacuna de
// cobertura de componente).

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail").email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe sua senha"),
})

export type LoginFormValues = z.infer<typeof loginSchema>

// Base do formulário de signup: nome/email/senha são sempre obrigatórios.
// `nomeFazenda` é opcional por padrão aqui — quem decide se é obrigatório é
// `buildSignupSchema`, conforme a presença (ou não) de um convite pendente
// na URL (ADR-0002, seção D2: signup com convite não cria fazenda nova, não
// deve pedir nome_fazenda ao usuário).
const signupBaseSchema = z.object({
  nome: z.string().trim().min(1, "Informe seu nome"),
  email: z.string().trim().min(1, "Informe seu e-mail").email("Informe um e-mail válido"),
  password: z
    .string()
    .min(6, "A senha precisa ter pelo menos 6 caracteres"),
  nomeFazenda: z.string().trim().optional(),
})

export type SignupFormValues = z.infer<typeof signupBaseSchema>

/**
 * Monta o schema de signup conforme o contexto:
 * - `temConvite = true` (há `?convite=<token>` na URL, ADR-0002 D2): o
 *   usuário está entrando numa fazenda existente, `nomeFazenda` não é
 *   pedido nem obrigatório.
 * - `temConvite = false`: signup cria fazenda nova (ADR-0001), `nomeFazenda`
 *   é obrigatório.
 */
export function buildSignupSchema(temConvite: boolean) {
  if (temConvite) {
    return signupBaseSchema
  }

  return signupBaseSchema.extend({
    nomeFazenda: z.string().trim().min(1, "Informe o nome da fazenda"),
  })
}
