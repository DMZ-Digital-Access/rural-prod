/**
 * Formatação numérica padrão do app (pedido de JP, 2026-07-23): separador de
 * milhar "." e decimal "," em todo número exibido em tela (ex.: 10.000,00).
 * `casasDecimais` default 0 cobre contagens (animais, lotes, pesagens); kg/
 * GMD passam 1 explicitamente. Valores monetários já usam
 * `toLocaleString("pt-BR", { style: "currency", ... })` direto nos
 * componentes — mesmo separador, então não passam por aqui.
 */
export function formatNumero(valor: number, casasDecimais = 0): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  })
}
