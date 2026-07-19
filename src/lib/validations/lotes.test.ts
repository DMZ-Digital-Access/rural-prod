import { describe, expect, it } from "vitest"
import { loteSchema } from "./lotes"

describe("loteSchema", () => {
  it("aceita payload mínimo válido (só nome + data_inicio)", () => {
    const result = loteSchema.safeParse({
      nome: "Lote A",
      data_inicio: "2026-01-01",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita nome vazio", () => {
    const result = loteSchema.safeParse({ nome: "  ", data_inicio: "2026-01-01" })
    expect(result.success).toBe(false)
  })

  it("rejeita data_inicio vazia", () => {
    const result = loteSchema.safeParse({ nome: "Lote A", data_inicio: "" })
    expect(result.success).toBe(false)
  })

  it("aceita data_fim posterior à data_inicio", () => {
    const result = loteSchema.safeParse({
      nome: "Lote A",
      data_inicio: "2026-01-01",
      data_fim: "2026-06-01",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita data_fim anterior à data_inicio", () => {
    const result = loteSchema.safeParse({
      nome: "Lote A",
      data_inicio: "2026-06-01",
      data_fim: "2026-01-01",
    })
    expect(result.success).toBe(false)
  })

  it("aceita data_fim igual à data_inicio", () => {
    const result = loteSchema.safeParse({
      nome: "Lote A",
      data_inicio: "2026-01-01",
      data_fim: "2026-01-01",
    })
    expect(result.success).toBe(true)
  })

  it("aceita descrição opcional ausente", () => {
    const result = loteSchema.safeParse({
      nome: "Lote A",
      data_inicio: "2026-01-01",
    })
    expect(result.success).toBe(true)
  })
})
