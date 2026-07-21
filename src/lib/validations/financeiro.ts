import { z } from "zod"

// Cadastro/edição de lançamento financeiro (spec seção 5.2, "Módulo
// Financeiro"). `data_pagamento` obrigatória quando `pago = true` — mesma
// regra já aplicada em banco (constraint
// lancamentos_financeiros_data_pagamento_consistente), repetida aqui para
// feedback imediato no formulário sem depender de round-trip ao servidor.

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const tipoLancamentoSchema = z.enum(["receita", "despesa"])

export const lancamentoFinanceiroSchema = z
  .object({
    tipo: tipoLancamentoSchema,
    categoria: z.string().trim().min(1, "Informe a categoria"),
    descricao: z.string().trim().min(1, "Informe a descrição"),
    data_lancamento: z
      .string()
      .min(1, "Informe a data do lançamento")
      .refine((v) => v <= hojeISO(), "A data não pode ser no futuro"),
    valor: z
      .number({ error: "Informe o valor" })
      .positive("O valor precisa ser maior que zero"),
    numero_nota: z.string().trim(),
    contraparte: z.string().trim(),
    transacao_animal_id: z.string().nullable(),
    pago: z.boolean(),
    data_pagamento: z
      .string()
      .nullable()
      .refine((v) => !v || v <= hojeISO(), "A data de pagamento não pode ser no futuro"),
  })
  .refine((v) => !v.pago || !!v.data_pagamento, {
    message: "Informe a data do pagamento",
    path: ["data_pagamento"],
  })

export type LancamentoFinanceiroFormValues = z.infer<typeof lancamentoFinanceiroSchema>
