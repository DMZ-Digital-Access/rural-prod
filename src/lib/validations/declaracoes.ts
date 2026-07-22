import { z } from "zod"

const anoAtual = () => new Date().getFullYear()
const hojeISO = () => new Date().toISOString().slice(0, 10)

// Item de espécie × quantidade dentro de uma declaração (schema
// reestruturado 2026-07-22 — uma declaração cobre várias espécies).
export const itemDeclaracaoSchema = z.object({
  especie_id: z.string().min(1, "Selecione a espécie"),
  quantidade_declarada: z
    .number({ error: "Informe a quantidade" })
    .int("Quantidade precisa ser um número inteiro")
    .min(0, "Quantidade não pode ser negativa"),
})

export type ItemDeclaracaoFormValues = z.infer<typeof itemDeclaracaoSchema>

// Cadastro/edição da declaração — ano_referencia só é gravável na criação
// (o formulário de edição o mostra desabilitado, mesmo raciocínio de
// antes: mudar o ano violaria o unique(fazenda_id, ano_referencia) do
// banco, correção é sempre na própria declaração/seus itens).
export const declaracaoRebanhoSchema = z.object({
  ano_referencia: z
    .number({ error: "Informe o ano de referência" })
    .int()
    .min(2000, "Ano inválido")
    .max(anoAtual() + 1, "Ano não pode ser muito no futuro"),
  data_declaracao: z.string().nullable(),
  itens: z
    .array(itemDeclaracaoSchema)
    .min(1, "Inclua ao menos uma espécie com quantidade declarada")
    .refine(
      (itens) => new Set(itens.map((i) => i.especie_id)).size === itens.length,
      { message: "Não repita a mesma espécie mais de uma vez" }
    ),
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
