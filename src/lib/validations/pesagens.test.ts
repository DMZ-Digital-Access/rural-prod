import { describe, expect, it } from "vitest"
import { pesagemSchema } from "./pesagens"

describe("pesagemSchema", () => {
  it("aceita payload válido", () => {
    const result = pesagemSchema.safeParse({
      data_evento: "2026-07-01",
      peso_kg: 180.5,
    })
    expect(result.success).toBe(true)
  })

  it("rejeita peso vindo como string — o input converte para number via valueAsNumber antes do parse", () => {
    const result = pesagemSchema.safeParse({
      data_evento: "2026-07-01",
      peso_kg: "180.5",
    })
    expect(result.success).toBe(false)
  })

  it("rejeita data no futuro", () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const result = pesagemSchema.safeParse({
      data_evento: amanha,
      peso_kg: 180,
    })
    expect(result.success).toBe(false)
  })

  it("rejeita data vazia", () => {
    const result = pesagemSchema.safeParse({ data_evento: "", peso_kg: 180 })
    expect(result.success).toBe(false)
  })

  it("rejeita peso zero ou negativo", () => {
    expect(
      pesagemSchema.safeParse({ data_evento: "2026-07-01", peso_kg: 0 }).success
    ).toBe(false)
    expect(
      pesagemSchema.safeParse({ data_evento: "2026-07-01", peso_kg: -1 }).success
    ).toBe(false)
  })
})
