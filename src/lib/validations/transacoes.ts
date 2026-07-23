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

// Venda/Óbito/Consumo (ADR-0004/0005/0006) — agem sobre animais JÁ
// EXISTENTES, selecionados individualmente (diferente de
// entradaSaidaLoteSchema, que lança contagem agregada sem escolher
// animais específicos). Sem faixa etária/sexo agregados aqui — são
// derivados automaticamente pelo backend a partir de cada animal
// selecionado (registrar_saida_animais_individuais()).
export const tipoOperacaoSaidaIndividualSchema = z.enum(["venda", "obito", "consumo"], {
  error: "Selecione o tipo de operação",
})

export const saidaAnimaisIndividuaisSchema = z.object({
  tipo_operacao: tipoOperacaoSaidaIndividualSchema,
  especie_id: z.string().min(1, "Selecione o tipo de animal"),
  outra_parte: z.string().trim().min(1, "Informe a outra parte da operação"),
  data_operacao: z
    .string()
    .min(1, "Informe a data da operação")
    .refine((v) => v <= hojeISO(), "A data da operação não pode ser no futuro"),
  animal_ids: z.array(z.string()).min(1, "Selecione ao menos um animal"),
  valor_nota: z.number().min(0, "O valor não pode ser negativo").nullable(),
  peso_total_kg: z.number().min(0, "O peso total não pode ser negativo").nullable(),
})

export type SaidaAnimaisIndividuaisFormValues = z.infer<
  typeof saidaAnimaisIndividuaisSchema
>

// Editar uma transação já lançada (Fase 4, Módulo de Transações) — o usuário
// pode salvar a operação com o mínimo (ver
// entradaSaidaLoteSchema/saidaAnimaisIndividuaisSchema) e voltar depois para
// corrigir/completar qualquer campo, conforme os documentos forem chegando.
// `tipo_operacao` é a ÚNICA exceção deliberada, NÃO editável aqui (pedido
// explícito de JP, 2026-07-21): trocar o tipo depois de criado deixaria
// inconsistentes os vínculos já feitos (transacoes_animais para Venda/Óbito/
// Consumo, animais pendentes já criados para Compra/Nascimento/Entrada de
// Pastoreio) com a nova natureza da operação.
export const statusGtaTransacaoSchema = z.enum(["despendenciada", "n_a", "pendente"])

const hojeISOTransacao = () => new Date().toISOString().slice(0, 10)

// quantidade_machos/quantidade_femeas (não mais um `quantidade_animais` solto)
// — achado real, 2026-07-22/23: editar o total direto, sem tocar
// transacoes_detalhe, deixava o número do Painel Inteligente divergir do
// Saldo de Rebanho. atualizar_entrada_saida_lote() recalcula o total como
// machos+fêmeas e ressincroniza transacoes_detalhe atomicamente. Quando a
// transação já está vinculada a animais individuais (transacoes_animais —
// Venda/Óbito/Consumo com seleção individual), esses dois campos são
// somente leitura na UI e ignorados pela RPC (quantidade real vem dos
// vínculos, não de um número solto) — validação de soma > 0 continua
// correta nesse caso porque os campos são preenchidos com os valores reais.
export const atualizarTransacaoSchema = z
  .object({
    outra_parte: z.string().trim().min(1, "Informe a outra parte da operação"),
    data_operacao: z
      .string()
      .min(1, "Informe a data da operação")
      .refine((v) => v <= hojeISOTransacao(), "A data da operação não pode ser no futuro"),
    especie_id: z.string().min(1, "Selecione a espécie"),
    quantidade_machos: z
      .number({ error: "Informe a quantidade de machos" })
      .int("A quantidade de machos precisa ser inteira")
      .min(0, "A quantidade de machos não pode ser negativa"),
    quantidade_femeas: z
      .number({ error: "Informe a quantidade de fêmeas" })
      .int("A quantidade de fêmeas precisa ser inteira")
      .min(0, "A quantidade de fêmeas não pode ser negativa"),
    numero_nota: z.string().trim(),
    valor_nota: z.number().min(0, "O valor não pode ser negativo").nullable(),
    peso_total_kg: z.number().min(0, "O peso total não pode ser negativo").nullable(),
    status_gta_transacao: statusGtaTransacaoSchema,
    observacoes: z.string().trim(),
  })
  .refine((v) => v.quantidade_machos + v.quantidade_femeas > 0, {
    message: "Informe ao menos um animal (machos ou fêmeas)",
    path: ["quantidade_femeas"],
  })

export type AtualizarTransacaoFormValues = z.infer<typeof atualizarTransacaoSchema>
