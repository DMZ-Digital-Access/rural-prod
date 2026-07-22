import { z } from "zod"

const anoAtual = () => new Date().getFullYear()
const hojeISO = () => new Date().toISOString().slice(0, 10)

// Cadastro/edição de declaração anual de rebanho (spec seção 3.2/5.2).
// especie_id/ano_referencia só são graváveis na criação — o formulário de
// edição os mostra desabilitados (a correção de uma declaração já existente
// é da quantidade/data de referência, nunca de "mudar de espécie/ano", que
// violaria o unique(fazenda_id, especie_id, ano_referencia) do banco).
export const declaracaoRebanhoSchema = z.object({
  especie_id: z.string().min(1, "Selecione a espécie"),
  ano_referencia: z
    .number({ error: "Informe o ano de referência" })
    .int()
    .min(2000, "Ano inválido")
    .max(anoAtual() + 1, "Ano não pode ser muito no futuro"),
  data_declaracao: z.string().nullable(),
  quantidade_declarada: z
    .number({ error: "Informe a quantidade declarada" })
    .int("Quantidade precisa ser um número inteiro")
    .min(0, "Quantidade não pode ser negativa"),
})

export type DeclaracaoRebanhoFormValues = z.infer<typeof declaracaoRebanhoSchema>

// "Marcar como enviada" (spec seção 5.2) — data de envio obrigatória, não
// pode ser futura; upload do PDF/imagem é opcional aqui (tratado fora do
// zod, mesmo padrão dos outros fluxos de documento do projeto).
export const marcarComoEnviadaSchema = z.object({
  data_envio: z
    .string()
    .min(1, "Informe a data de envio")
    .refine((v) => v <= hojeISO(), "A data de envio não pode ser no futuro"),
})

export type MarcarComoEnviadaFormValues = z.infer<typeof marcarComoEnviadaSchema>
