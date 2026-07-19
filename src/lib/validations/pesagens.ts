import { z } from "zod"

// Schema de validação do formulário de registro de pesagem (Fase 2 — Eixo
// 1, spec seção 4.1). O formulário só coleta data + peso; a decisão
// "correção do registro mais recente vs. novo registro histórico" é
// inteiramente do backend (registrar_pesagem(), RPC) — o frontend não tenta
// replicar essa regra aqui.

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const pesagemSchema = z.object({
  data_evento: z
    .string()
    .min(1, "Informe a data da pesagem")
    .refine((v) => v <= hojeISO(), "A data da pesagem não pode ser no futuro"),
  // Sem z.coerce — mesmo motivo documentado em validations/animais.ts
  // (criarAnimalSchema.peso_inicial_kg): o input já entrega number via
  // `valueAsNumber` (ver RegistrarPesagemForm).
  peso_kg: z
    .number({ error: "Informe o peso" })
    .positive("O peso precisa ser maior que zero"),
})

export type PesagemFormValues = z.infer<typeof pesagemSchema>
