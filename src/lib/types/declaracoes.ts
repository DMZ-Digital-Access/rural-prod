// Tipos do Módulo Declaração Anual de Rebanho (item 19 — spec seção 3.2/5.2),
// schema de public.declaracoes_rebanho (migration
// 20260720150000_fase3_financeiro_declaracoes_prazos.sql).

export type StatusDeclaracao = "pendente" | "enviado"

/** Linha crua de public.declaracoes_rebanho. */
export type DeclaracaoRebanho = {
  id: string
  fazenda_id: string
  especie_id: string
  ano_referencia: number
  data_declaracao: string | null
  quantidade_declarada: number
  status: StatusDeclaracao
  data_envio: string | null
  arquivo_pdf_path: string | null
  created_at: string
  updated_at: string
}

/** declaracoes_rebanho + espécie embutida (nome, pra exibição). */
export type DeclaracaoComEspecie = DeclaracaoRebanho & {
  especies: { nome: string }
}

/** Retorno de obter_prazo_declaracao_estado() — spec seção 4.2. */
export type PrazoDeclaracao = {
  data_inicio_prazo: string | null
  data_fim_prazo: string | null
  origem: "cadastrado" | "padrao_rs" | null
}
