// Utilitário compartilhado de exportação CSV — extraído de
// FluxoCaixaPage.tsx (2026-07-22) pra ser reaproveitado também em
// Lançamentos Gerais, evitando duplicar a lógica de escape/BOM.

// Escapa vírgula/aspas/quebra de linha por RFC 4180 — mínimo necessário para
// abrir corretamente no Excel/Sheets sem quebrar colunas.
function campoCsv(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export function gerarConteudoCsv(cabecalho: string[], linhas: string[][]): string {
  return [cabecalho, ...linhas].map((linha) => linha.map(campoCsv).join(";")).join("\r\n")
}

export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  // BOM UTF-8 — sem ele o Excel (pt-BR) abre acentos corrompidos.
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}
