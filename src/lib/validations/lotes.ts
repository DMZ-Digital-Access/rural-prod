import { z } from "zod"

// Schema de validação do formulário de lote (Fase 2 — Eixo 1, spec seção
// 3.1). Mesmo schema serve para criação e edição — os únicos campos
// editáveis (nome/descrição/data_inicio/data_fim) são os mesmos nos dois
// fluxos; `ativo` (arquivar/reativar) é uma ação separada (UPDATE direto de
// um único campo), não passa por este formulário.

export const loteSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome do lote"),
    descricao: z.string().trim().optional(),
    data_inicio: z.string().min(1, "Informe a data de início"),
    data_fim: z.string().optional(),
  })
  .refine(
    (v) => !v.data_fim || v.data_fim.length === 0 || v.data_fim >= v.data_inicio,
    {
      message: "A data de fim não pode ser anterior à data de início",
      path: ["data_fim"],
    }
  )

export type LoteFormValues = z.infer<typeof loteSchema>
