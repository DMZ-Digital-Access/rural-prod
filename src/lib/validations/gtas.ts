import { z } from "zod"

// Cadastro/edição de GTA (spec seção 5.2, "Módulo: GTAs", item 11 da seção
// 10 para o schema). `data_liberacao` obrigatória quando status_liberacao =
// liberada — mesma regra já aplicada em banco (constraint
// gtas_data_liberacao_consistente), repetida aqui para feedback imediato no
// formulário sem depender de round-trip ao servidor.

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const gtaSchema = z
  .object({
    numero_gta: z.string().trim().min(1, "Informe o número da GTA"),
    municipio_origem: z.string().trim().min(1, "Informe o município de origem"),
    origem: z.string().trim().min(1, "Informe a propriedade de origem"),
    municipio_destino: z.string().trim().min(1, "Informe o município de destino"),
    destino: z.string().trim().min(1, "Informe a propriedade de destino"),
    especie_id: z.string().min(1, "Selecione a espécie"),
    quantidade_animais: z
      .number({ error: "Informe a quantidade de animais" })
      .int("A quantidade de animais precisa ser inteira")
      .positive("A quantidade de animais precisa ser maior que zero"),
    status_liberacao: z.enum(["pendente", "liberada"]),
    data_liberacao: z
      .string()
      .nullable()
      .refine((v) => !v || v <= hojeISO(), "A data de liberação não pode ser no futuro"),
    transacao_id: z.string().nullable(),
  })
  .refine((v) => v.status_liberacao !== "liberada" || !!v.data_liberacao, {
    message: "Informe a data de liberação",
    path: ["data_liberacao"],
  })

export type GtaFormValues = z.infer<typeof gtaSchema>
