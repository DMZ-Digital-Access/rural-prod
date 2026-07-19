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

const dataNascimentoSchema = z
  .string()
  .min(1, "Informe a data de nascimento")
  .refine((v) => v <= hojeISO(), "A data de nascimento não pode ser no futuro")

export const criarAnimalSchema = z.object({
  identificacao: z.string().trim().min(1, "Informe a identificação do animal"),
  data_nascimento: dataNascimentoSchema,
  sexo: z.enum(["macho", "femea"], {
    error: "Selecione o sexo do animal",
  }),
  // Não usa z.coerce: o input HTML (type="number") já converte para number
  // via `valueAsNumber` antes de chegar ao react-hook-form (ver
  // CriarAnimalDialog) — coerce aqui criaria um schema cujo tipo de entrada
  // (string/unknown) diverge do tipo de saída (number), o que quebra a
  // inferência de tipos do zodResolver com react-hook-form (Resolver<Input,
  // _, Output> vs. useForm<Output>).
  peso_inicial_kg: z
    .number({ error: "Informe o peso inicial" })
    .positive("O peso inicial precisa ser maior que zero"),
  lote_id: z.string().nullable(),
})

export type CriarAnimalFormValues = z.infer<typeof criarAnimalSchema>

// Edição: nunca inclui peso_inicial_kg/data_nascimento/sexo — spec desta
// tarefa restringe edição a nome(identificação)/lote/status.
export const editarAnimalSchema = z.object({
  identificacao: z.string().trim().min(1, "Informe a identificação do animal"),
  lote_id: z.string().nullable(),
  status: z.enum(["ativo", "venda", "morte", "baixa"], {
    error: "Selecione o status do animal",
  }),
})

export type EditarAnimalFormValues = z.infer<typeof editarAnimalSchema>
