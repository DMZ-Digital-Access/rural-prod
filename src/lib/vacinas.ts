/** Catálogo fixo de vacinas/medicamentos anuais por tipo de animal (Dia de
 * Vacinação, pedido de JP, 2026-07-24) — sem tabela no banco, lista pequena
 * e estável o bastante pra viver só no frontend (mesma filosofia de não
 * criar abstração antes de precisar de verdade). Chaves = especies.nome
 * (singular, mesmo valor exato salvo no banco). */
export const VACINAS_POR_ESPECIE: Record<string, string[]> = {
  Bovino: ["Brucelose", "Raiva", "Febre Aftosa", "Clostridioses", "Leptospirose", "IBR", "BVD"],
  Ovino: ["Clostridioses", "Raiva", 'Linfadenite Caseosa ("Mal do Caroço")', "Ectima Contagioso"],
  Equino: ["Tétano", "Raiva", "Encefalomielite", "Influenza equina", "Rinopneumonite"],
  Suíno: [
    "Circovirose",
    "Pneumonia enzoótica",
    "Erisipela",
    "Rinite Atrófica",
    "Parvovirose",
    "Leptospirose",
    "Colibacilose",
    "Doença de Aujeszky",
  ],
  Muar: ["Tétano", "Raiva", "Encefalomielite", "Influenza equina", "Rinopneumonite"],
  Caprino: ["Clostridioses", "Raiva", 'Linfadenite Caseosa ("Mal do Caroço")'],
}

/** Marcador do botão "Outras vacinas ou medicamentos" — sempre o último,
 * em todo tipo de animal. */
export const OUTRAS_VACINAS = "__outras__"

/** União (sem repetir) das vacinas de todas as espécies informadas, na
 * ordem em que aparecem — usado quando mais de um tipo de animal é
 * atendido no mesmo Dia de Vacinação. */
export function vacinasParaEspecies(especieNomes: string[]): string[] {
  const vistas = new Set<string>()
  const resultado: string[] = []
  for (const nome of especieNomes) {
    for (const vacina of VACINAS_POR_ESPECIE[nome] ?? []) {
      if (!vistas.has(vacina)) {
        vistas.add(vacina)
        resultado.push(vacina)
      }
    }
  }
  return resultado
}
