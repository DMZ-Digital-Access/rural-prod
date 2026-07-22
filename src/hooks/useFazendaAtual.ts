import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useFazendaSelecionada } from "@/lib/fazendaSelecionada"

export type FazendaVinculo = {
  fazenda_id: string
  papel: string
  nome: string
}

/**
 * Fazenda "atual" do usuário logado (reescrito 2026-07-22 pro multi-fazenda
 * — ver useFazendasDoUsuario/fazendaSelecionada). Resolve a fazenda
 * SELECIONADA pelo usuário (FazendaSelecionadaProvider, localStorage) contra
 * a lista real de vínculos — se a selecionada não existir mais (ex.:
 * removido de uma fazenda), cai pro vínculo mais antigo, mesmo fallback
 * determinístico de antes desta reescrita.
 *
 * MESMO shape de retorno de antes (`{ data, isLoading, isError, error }`,
 * `data?.fazenda_id`/`data?.papel`) — os 19 call sites existentes continuam
 * funcionando sem nenhuma mudança, só ganham reatividade à troca de
 * fazenda automaticamente (cada hook downstream já é keyed por fazenda_id).
 */
export function useFazendaAtual() {
  const fazendasQuery = useFazendasDoUsuario()
  const { fazendaIdSelecionada } = useFazendaSelecionada()

  const fazendas = fazendasQuery.data ?? []
  const selecionada = fazendas.find((f) => f.fazenda_id === fazendaIdSelecionada)
  const atual: FazendaVinculo | undefined = selecionada ?? fazendas[0]

  return {
    data: atual,
    isLoading: fazendasQuery.isLoading,
    isError: fazendasQuery.isError,
    error: fazendasQuery.error,
  }
}
