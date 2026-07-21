// Tipos da view public.fluxo_caixa_consolidado (Fase 4, item 18 — spec
// seção 5.2), migration 20260721110000_fluxo_caixa_consolidado.sql.

import type { TipoLancamento } from "@/lib/types/financeiro"

export type OrigemFluxoCaixa = "transacao_animal" | "lancamento_financeiro"

/** Linha crua de public.fluxo_caixa_consolidado. */
export type MovimentoFluxoCaixa = {
  fazenda_id: string
  origem_id: string
  origem: OrigemFluxoCaixa
  data: string
  tipo: TipoLancamento
  categoria: string
  descricao: string | null
  valor: number
}
