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
  // ADR-0006: nullable — animal criado por Entradas de Lote
  // (Compra/Nascimento/Entrada de Pastoreio) nasce sem esses dados,
  // "pendente de individualização" até completar via Individualizar Animal.
  data_nascimento: string | null
  sexo: SexoAnimal
  peso_inicial_kg: number | null
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
  // ADR-0006: null quando data_nascimento é null (animal pendente) —
  // calcular_categoria_animal() retorna NULL explicitamente, não fabrica
  // uma categoria de adulto.
  idade_dias: number | null
  idade_meses: number | null
  categoria: CategoriaAnimal | null
  ganho_total_kg: number | null
  numero_pesagens: number
}

/** Um animal está pendente de individualização (ADR-0006) quando falta
 *  data de nascimento ou peso inicial — preenchidos juntos por
 *  "Individualizar Animal". */
export function animalPendenteIndividualizacao(animal: Animal): boolean {
  return animal.data_nascimento === null || animal.peso_inicial_kg === null
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

// Tipos do Eixo 2 (Fase 3 — spec seção 3.2/10). Catálogo global, sem
// fazenda_id — ver migration 20260720120000_fase3_especies_agrupamentos.sql.

/** Linha de public.especies. */
export type Especie = {
  id: string
  nome: string
  ativo: boolean
}

/** Tipos de operação de public.transacoes — ADR-0005 D1 (7 valores, 4 originais + 3 novos). */
export type TipoOperacaoTransacao =
  | "compra"
  | "venda"
  | "entrada_pastoreio"
  | "saida_pastoreio"
  | "nascimento"
  | "obito"
  | "consumo"

/** Retorno de public.registrar_entrada_saida_lote() — ADR-0005. */
export type Transacao = {
  id: string
  fazenda_id: string
  tipo_operacao: TipoOperacaoTransacao
  especie_id: string
  outra_parte: string
  data_operacao: string
  numero_nota: string | null
  quantidade_animais: number
  valor_nota: number | null
  // ATENÇÃO: uma transação NÃO tem "a" GTA — pode ter N GTAs vinculadas
  // (uma por caminhão de transporte, ver gtas.transacao_id). O campo
  // transacoes.gta_id (1:1) foi removido em 2026-07-21 por modelar errado
  // essa cardinalidade — nunca reintroduzir.
  status_gta_transacao: "despendenciada" | "n_a" | "pendente"
  arquivo_nota_path: string | null
  arquivo_nota_mime_type: string | null
  arquivo_contranota_path: string | null
  arquivo_contranota_mime_type: string | null
  peso_total_kg: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** transacoes + espécie relacionada — usado pela listagem (Fase 4, item 15). */
export type TransacaoComDetalhes = Transacao & {
  especies: { nome: string } | null
}

export type StatusLiberacaoGta = "pendente" | "liberada"

/** GTA vinculada a uma transação (spec: N GTAs por transação, uma por caminhão). */
export type GtaResumo = {
  id: string
  numero_gta: string
  status_liberacao: StatusLiberacaoGta
}

/** Linha crua de public.gtas — Fase 3, item 11. */
export type Gta = {
  id: string
  fazenda_id: string
  numero_gta: string
  municipio_origem: string
  origem: string
  municipio_destino: string
  destino: string
  especie_id: string
  status_liberacao: StatusLiberacaoGta
  data_liberacao: string | null
  transacao_id: string | null
  arquivo_path: string | null
  arquivo_mime_type: string | null
  // Pedido de JP (2026-07-21), fora da spec original — nullable no banco
  // (histórico antes deste campo existir), exigido pelo formulário.
  quantidade_animais: number | null
  created_at: string
  updated_at: string
}

/** gtas + espécie/transação relacionados — usado pela listagem/detalhe (Fase 4, item 17). */
export type GtaComDetalhes = Gta & {
  especies: { nome: string } | null
  transacoes: { outra_parte: string; tipo_operacao: TipoOperacaoTransacao } | null
}

/** Retorno de public.obter_saldo_rebanho() — Fase 3, item 12. */
export type SaldoRebanhoLinha = {
  fazenda_id: string
  especie_id: string
  especie_nome: string
  agrupamento_etario_id: string | null
  agrupamento_label: string
  sexo: SexoAnimal
  qtd_registrada: number
  qtd_pendente: number
}
