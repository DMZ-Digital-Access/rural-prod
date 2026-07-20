import { z } from "zod"

// Schema de validação do formulário "Entradas e Saídas de Animais de Lote"
// (ADR-0005) — só os 5 tipos de operação que passam pela RPC
// registrar_entrada_saida_lote (pastoreio não usa esta tela, ADR-0005 D1).
// Sem faixa etária (ADR-0005 D5, "Não classificado" no saldo) — só sexo,
// com a soma machos+femeas validada contra o total informado.

const hojeISO = () => new Date().toISOString().slice(0, 10)

export const tipoOperacaoLoteSchema = z.enum(
  ["compra", "venda", "nascimento", "obito", "consumo"],
  { error: "Selecione o tipo de operação" }
)

export const entradaSaidaLoteSchema = z
  .object({
    tipo_operacao: tipoOperacaoLoteSchema,
    especie_id: z.string().min(1, "Selecione o tipo de animal"),
    outra_parte: z.string().trim().min(1, "Informe a outra parte da operação"),
    data_operacao: z
      .string()
      .min(1, "Informe a data da operação")
      .refine((v) => v <= hojeISO(), "A data da operação não pode ser no futuro"),
    quantidade_total: z
      .number({ error: "Informe o número de animais" })
      .int("O número de animais precisa ser inteiro")
      .positive("O número de animais precisa ser maior que zero"),
    quantidade_machos: z
      .number({ error: "Informe a quantidade de machos" })
      .int("A quantidade de machos precisa ser inteira")
      .min(0, "A quantidade de machos não pode ser negativa"),
    quantidade_femeas: z
      .number({ error: "Informe a quantidade de fêmeas" })
      .int("A quantidade de fêmeas precisa ser inteira")
      .min(0, "A quantidade de fêmeas não pode ser negativa"),
    valor_nota: z
      .number()
      .min(0, "O valor não pode ser negativo")
      .nullable(),
    peso_total_kg: z
      .number()
      .min(0, "O peso total não pode ser negativo")
      .nullable(),
  })
  .refine((v) => v.quantidade_machos + v.quantidade_femeas === v.quantidade_total, {
    message: "A soma de machos e fêmeas precisa bater com o número total de animais",
    path: ["quantidade_femeas"],
  })

export type EntradaSaidaLoteFormValues = z.infer<typeof entradaSaidaLoteSchema>
