// ============================================================================
// Lógica pura de supabase/functions/gerar-zip-lancamentos/ — mesma separação
// de enviar-convite/ e classificar-documento/ (index.ts chama Deno.serve no
// top-level; lógica sem rede vive aqui, testável sem infraestrutura).
//
// Tela "Documentos Fiscais" (Módulo Financeiro) — pedido de JP: "devemos ter
// também uma forma de download de todas as notas dos lançamentos do mês
// (presente ou passado) em zip".
// ============================================================================

export interface IntervaloDoMes {
  dataInicio: string
  dataFim: string
}

/** Calcula o intervalo [primeiro dia, último dia] do mês/ano informado, no formato YYYY-MM-DD. */
export function calcularIntervaloDoMes(ano: number, mes: number): IntervaloDoMes {
  const mesStr = String(mes).padStart(2, '0')
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return {
    dataInicio: `${ano}-${mesStr}-01`,
    dataFim: `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

export function validarAnoMes(ano: unknown, mes: unknown): string | null {
  if (typeof ano !== 'number' || !Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return 'ano inválido'
  }
  if (typeof mes !== 'number' || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return 'mes inválido (esperado 1-12)'
  }
  return null
}

export interface LancamentoParaZip {
  id: string
  data_lancamento: string
  categoria: string
  tipo: 'receita' | 'despesa'
  arquivo_path: string
}

// Marcas diacríticas combinantes (U+0300-U+036F) — usado depois de
// normalize('NFD') para remover acento de forma segura, sem depender de
// digitar o caractere acentuado literal num regex (frágil de copiar/colar
// corretamente entre editores/encodings).
const REGEX_MARCAS_DIACRITICAS = /[̀-ͯ]/g

function sanitizarCategoria(categoria: string): string {
  return categoria
    .normalize('NFD')
    .replace(REGEX_MARCAS_DIACRITICAS, '')
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Ordena por data crescente — critério de desempate (mesma data) por `id`,
 * só para a numeração sequencial ser determinística entre chamadas.
 */
export function ordenarPorDataCrescente<T extends { data_lancamento: string; id: string }>(
  lancamentos: T[],
): T[] {
  return [...lancamentos].sort((a, b) => {
    const porData = a.data_lancamento.localeCompare(b.data_lancamento)
    return porData !== 0 ? porData : a.id.localeCompare(b.id)
  })
}

/**
 * Nome do arquivo dentro do ZIP — pedido de JP: "um padrao que identifique
 * o mes, o numero do lancamento no mes, entrada/saida, em um formato que
 * fique sempre em ordem crescente de data quando baixado em zip".
 *
 * Formato: {AAAA-MM-DD}_{NNN}_{entrada|saida}_{categoria}.{extensao}
 * — começar pela data ISO garante ordenação alfabética = ordenação
 * cronológica em qualquer visualizador de arquivos/ZIP; `indiceNoMes`
 * (1-based, sobre a lista já ordenada por `ordenarPorDataCrescente`) é o
 * "número do lançamento no mês" pedido; `entrada`/`saida` substitui
 * receita/despesa por um rótulo mais próximo do vocabulário de fluxo de
 * caixa que JP usou no pedido.
 */
export function nomeArquivoNoZip(lancamento: LancamentoParaZip, indiceNoMes: number): string {
  const extensao = lancamento.arquivo_path.split('.').pop() || 'bin'
  const numeroSequencial = String(indiceNoMes).padStart(3, '0')
  const tipoAbreviado = lancamento.tipo === 'receita' ? 'entrada' : 'saida'
  const categoriaSegura = sanitizarCategoria(lancamento.categoria) || 'documento'
  return `${lancamento.data_lancamento}_${numeroSequencial}_${tipoAbreviado}_${categoriaSegura}.${extensao}`
}

export function corsHeadersFor(appUrl: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': appUrl ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
