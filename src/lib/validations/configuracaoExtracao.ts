import { z } from "zod"

// Tela /app/configuracoes/extracao-ia (admin do software) — prompt é texto
// livre; schema_json é editado como JSON livre (decisão de JP: editor de
// JSON cru, não um construtor de campos) — só validamos que é JSON válido e
// um objeto (não array/null/primitivo), já que é isso que a Interactions API
// do Gemini espera em `response_format[0].schema`. Não validamos as chaves
// internas: um admin pode legitimamente adicionar/remover/renomear campos
// (ver comentário de schema_json na migration 20260722130000 — campos que
// não batem com o parsing fixo do Edge Function simplesmente voltam null,
// nunca quebram a extração).
export const configuracaoExtracaoSchema = z.object({
  prompt_extracao: z.string().min(1, "Informe o prompt de extração"),
  schema_json_texto: z.string().min(1, "Informe o schema JSON").refine(
    (texto) => {
      try {
        const parsed = JSON.parse(texto)
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      } catch {
        return false
      }
    },
    { message: "Schema precisa ser um JSON válido representando um objeto" }
  ),
})

export type ConfiguracaoExtracaoFormValues = z.infer<typeof configuracaoExtracaoSchema>
