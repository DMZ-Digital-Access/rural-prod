import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { MovimentoFluxoCaixa } from "@/lib/types/fluxoCaixa"
import type { TipoLancamento } from "@/lib/types/financeiro"

export type FluxoCaixaFiltro = {
  ano: number | null
  mes: number | null
  tipo: TipoLancamento | null
  categoria: string
}

function calcularIntervaloDoFiltro(filtro: FluxoCaixaFiltro): { inicio: string | null; fim: string | null } {
  if (!filtro.ano) return { inicio: null, fim: null }

  if (!filtro.mes) {
    return { inicio: `${filtro.ano}-01-01`, fim: `${filtro.ano}-12-31` }
  }

  const mesFormatado = String(filtro.mes).padStart(2, "0")
  const ultimoDia = new Date(filtro.ano, filtro.mes, 0).getDate()
  return {
    inicio: `${filtro.ano}-${mesFormatado}-01`,
    fim: `${filtro.ano}-${mesFormatado}-${String(ultimoDia).padStart(2, "0")}`,
  }
}

export function useFluxoCaixa(fazendaId: string | undefined, filtro: FluxoCaixaFiltro) {
  return useQuery({
    queryKey: ["fluxo-caixa-consolidado", fazendaId, filtro] as const,
    queryFn: async (): Promise<MovimentoFluxoCaixa[]> => {
      const { inicio, fim } = calcularIntervaloDoFiltro(filtro)

      let query = supabase
        .from("fluxo_caixa_consolidado")
        .select("*")
        .eq("fazenda_id", fazendaId as string)
        .order("data", { ascending: false })

      if (inicio) query = query.gte("data", inicio)
      if (fim) query = query.lte("data", fim)
      if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
      if (filtro.categoria.trim()) query = query.ilike("categoria", `%${filtro.categoria.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      return data as unknown as MovimentoFluxoCaixa[]
    },
    enabled: !!fazendaId,
  })
}
