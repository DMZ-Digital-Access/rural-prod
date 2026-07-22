import { z } from "zod"

// Mesma regra de nomeFazenda já usada no signup (src/lib/validations/auth.ts,
// buildSignupSchema) — reaproveitada aqui pro dialog de "criar fazenda
// adicional" (multi-fazenda, 2026-07-22).
export const criarFazendaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da fazenda"),
})

export type CriarFazendaFormValues = z.infer<typeof criarFazendaSchema>

export const atualizarNomeFazendaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da fazenda"),
})
