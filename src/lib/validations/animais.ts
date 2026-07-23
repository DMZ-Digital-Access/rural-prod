import { z } from "zod"

// Schemas de validação dos formulários de animal (Fase 2 — Eixo 1, spec
// seção 3.1/4.1). `lote_id` usa o sentinela "nenhum" na UI (o componente
// Select do base-ui não aceita item value=null) — convertido para `null`
// antes de enviar ao Supabase, nunca gravado como string literal.
//
// `peso_atual_kg`, `gmd_medio_kg` e `ultima_pesagem_data` NÃO aparecem em
// nenhum destes schemas: são calculados pelo backend (trigger
// atualizar_animal_apos_pesagem(), ver migration da Fase 2) e o backend
// rejeita qualquer tentativa de setá-los via UPDATE direto — o formulário
// nunca deve tentar enviá-los.

const hojeISO = () => new Date().toISOString().slice(0, 10)

// Edição: identificação/lote/status (Fase 2) + data_nascimento/peso_inicial_kg
// opcionais (ADR-0006) — animal criado por Entradas de Lote nasce com esses
// dois campos nulos ("pendente de individualização"); este mesmo formulário
// de edição é o caminho para completá-los, sem forçar o preenchimento em
// toda edição (ex.: mudar só o lote de um animal ainda pendente continua
// válido). "Individualizar Animal" standalone foi removido em 2026-07-23 —
// todo animal agora nasce de uma transação de Entradas/Saídas de Lote.
//
// idade_meses_aquisicao (2026-07-23): alternativa a digitar data_nascimento
// exata — o componente (EditarAnimalDialog) calcula uma data_nascimento
// aproximada a partir da data da transação de origem menos esses meses,
// antes de enviar. Não é enviado ao backend como campo próprio — é só
// estado de formulário, por isso não precisa de validação de intervalo além
// de não-negativo/inteiro.
export const editarAnimalSchema = z.object({
  identificacao: z.string().trim().min(1, "Informe a identificação do animal"),
  lote_id: z.string().nullable(),
  status: z.enum(["ativo", "venda", "morte", "baixa"], {
    error: "Selecione o status do animal",
  }),
  data_nascimento: z
    .string()
    .refine((v) => v === "" || v <= hojeISO(), "A data de nascimento não pode ser no futuro")
    .nullable(),
  peso_inicial_kg: z
    .number()
    .positive("O peso inicial precisa ser maior que zero")
    .nullable(),
  idade_meses_aquisicao: z
    .number()
    .int("A idade em meses precisa ser inteira")
    .min(0, "A idade em meses não pode ser negativa")
    .nullable(),
})

export type EditarAnimalFormValues = z.infer<typeof editarAnimalSchema>
