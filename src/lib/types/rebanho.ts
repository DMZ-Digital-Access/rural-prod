// Tipos espelhando o schema da Fase 2 — Eixo 1 (migration
// 20260717140000_fase2_lotes_animais_pesagens.sql). Mantidos à mão (sem
// geração automática de tipos do Supabase configurada no projeto ainda) —
// qualquer mudança de schema exige atualizar este arquivo manualmente.

export type SexoAnimal = "macho" | "femea"

export type StatusAnimal = "ativo" | "venda" | "morte" | "baixa"

export type CategoriaAnimal =
  | "Bezerro"
  | "Novilho"
  | "Boi"
  | "Bezerra"
  | "Novilha"
  | "Vaca"

/** Linha crua de public.animais. */
export type Animal = {
  id: string
  fazenda_id: string
  lote_id: string | null
  identificacao: string
  data_nascimento: string
  sexo: SexoAnimal
  peso_inicial_kg: number
  peso_atual_kg: number | null
  gmd_medio_kg: number | null
  ultima_pesagem_data: string | null
  ativo: boolean
  status: StatusAnimal
  created_at: string
  updated_at: string
}

/** Linha de public.animais_com_detalhes — SELECT sempre nesta view, nunca em `animais` direto. */
export type AnimalComDetalhes = Animal & {
  idade_dias: number
  idade_meses: number
  categoria: CategoriaAnimal
  ganho_total_kg: number | null
  numero_pesagens: number
}

/** Linha crua de public.lotes. */
export type Lote = {
  id: string
  fazenda_id: string
  nome: string
  descricao: string | null
  data_inicio: string
  data_fim: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

/** Linha de public.lotes_com_estatisticas — SELECT sempre nesta view, nunca em `lotes` direto. */
export type LoteComEstatisticas = Lote & {
  numero_animais_total: number
  numero_animais_ativos: number
  peso_total_kg: number | null
  peso_medio_kg: number | null
  gmd_medio_kg: number | null
}

/** Linha de public.pesagens. */
export type Pesagem = {
  id: string
  animal_id: string
  data_evento: string
  peso_kg: number
  created_at: string
}
