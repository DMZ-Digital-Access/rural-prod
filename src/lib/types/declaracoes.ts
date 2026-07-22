// Tipos do Módulo Declaração Anual de Rebanho (item 19 — spec seção 3.2/5.2),
// schema reestruturado em 2026-07-22 (migration
// 20260722100000_declaracoes_rebanho_itens_por_especie.sql): uma
// declaração por (fazenda, ano) — o documento real entregue à Secretaria —
// com o detalhamento de espécie/quantidade em `declaracoes_rebanho_itens`.

export type StatusDeclaracao = "pendente" | "enviado"

/** Linha crua de public.declaracoes_rebanho (o documento). */
export type DeclaracaoRebanho = {
  id: string
  fazenda_id: string
  ano_referencia: number
  data_declaracao: string | null
  status: StatusDeclaracao
  data_envio: string | null
  arquivo_pdf_path: string | null
  created_at: string
  updated_at: string
}

/** Linha crua de public.declaracoes_rebanho_itens (espécie × quantidade). */
export type ItemDeclaracaoRebanho = {
  id: string
  declaracao_id: string
  especie_id: string
  quantidade_declarada: number
  created_at: string
  updated_at: string
}

/** Item + espécie embutida (nome, pra exibição). */
export type ItemDeclaracaoComEspecie = ItemDeclaracaoRebanho & {
  especies: { nome: string }
}

/** declaracoes_rebanho + seus itens (espécie × quantidade). */
export type DeclaracaoComItens = DeclaracaoRebanho & {
  declaracoes_rebanho_itens: ItemDeclaracaoComEspecie[]
}

/** Retorno de obter_prazo_declaracao_estado() — spec seção 4.2. */
export type PrazoDeclaracao = {
  data_inicio_prazo: string | null
  data_fim_prazo: string | null
  origem: "cadastrado" | "padrao_rs" | null
}
