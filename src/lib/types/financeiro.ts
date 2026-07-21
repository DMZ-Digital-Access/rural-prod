// Tipos do Módulo Financeiro (Fase 4, item 18 — spec seção 3.2/5.2), schema
// da migration 20260720150000_fase3_financeiro_declaracoes_prazos.sql +
// 20260721070000_lancamentos_financeiros_pago.sql (pago/data_pagamento,
// pedido de JP fora da spec original).

import type { TipoOperacaoTransacao } from "@/lib/types/rebanho"

export type TipoLancamento = "receita" | "despesa"

/** Linha crua de public.lancamentos_financeiros. */
export type LancamentoFinanceiro = {
  id: string
  fazenda_id: string
  tipo: TipoLancamento
  categoria: string
  descricao: string
  data_lancamento: string
  valor: number
  numero_nota: string | null
  contraparte: string | null
  transacao_animal_id: string | null
  // Pedido de JP (2026-07-21), fora da spec original.
  pago: boolean
  data_pagamento: string | null
  // Documento fiscal (nota/boleto/recibo) — pedido de JP (2026-07-21), fora
  // da spec original. Bucket `lancamentos-documentos`, caminho
  // {fazenda_id}/{AAAA-MM do data_lancamento}/{id}.{extensao}.
  arquivo_path: string | null
  arquivo_mime_type: string | null
  // Fluxo de captura de documento por IA (2026-07-21) — false só em
  // rascunhos ainda não confirmados/editados-e-salvos pelo usuário.
  validado_pelo_usuario: boolean
  created_at: string
  updated_at: string
}

/** lancamentos_financeiros + transação vinculada (opcional). */
export type LancamentoComDetalhes = LancamentoFinanceiro & {
  transacoes: { outra_parte: string; tipo_operacao: TipoOperacaoTransacao } | null
}
