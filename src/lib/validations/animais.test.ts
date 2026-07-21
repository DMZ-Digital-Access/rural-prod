import { describe, expect, it } from "vitest"
import { criarAnimalSchema, editarAnimalSchema } from "./animais"

describe("criarAnimalSchema", () => {
  const base = {
    identificacao: "BR-001",
    data_nascimento: "2024-01-15",
    sexo: "macho" as const,
    peso_inicial_kg: 35,
    lote_id: null,
  }

  it("aceita payload completo e válido", () => {
    const result = criarAnimalSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it("aceita lote_id preenchido", () => {
    const result = criarAnimalSchema.safeParse({
      ...base,
      lote_id: "11111111-1111-1111-1111-111111111111",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita identificação vazia", () => {
    const result = criarAnimalSchema.safeParse({ ...base, identificacao: "  " })
    expect(result.success).toBe(false)
  })

  it("rejeita data de nascimento no futuro", () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const result = criarAnimalSchema.safeParse({
      ...base,
      data_nascimento: amanha,
    })
    expect(result.success).toBe(false)
  })

  it("rejeita sexo inválido", () => {
    const result = criarAnimalSchema.safeParse({ ...base, sexo: "outro" })
    expect(result.success).toBe(false)
  })

  it("rejeita peso inicial zero ou negativo", () => {
    expect(criarAnimalSchema.safeParse({ ...base, peso_inicial_kg: 0 }).success).toBe(
      false
    )
    expect(
      criarAnimalSchema.safeParse({ ...base, peso_inicial_kg: -5 }).success
    ).toBe(false)
  })

  it("aceita peso inicial fracionário", () => {
    const result = criarAnimalSchema.safeParse({ ...base, peso_inicial_kg: 40.5 })
    expect(result.success).toBe(true)
  })

  it("rejeita peso inicial vindo como string — o input converte para number via valueAsNumber antes do parse", () => {
    const result = criarAnimalSchema.safeParse({ ...base, peso_inicial_kg: "40.5" })
    expect(result.success).toBe(false)
  })
})

describe("editarAnimalSchema", () => {
  const base = {
    identificacao: "BR-001",
    lote_id: null,
    status: "ativo" as const,
    data_nascimento: "2024-01-15",
    peso_inicial_kg: 35,
  }

  it("aceita animal pendente (data_nascimento/peso_inicial_kg nulos)", () => {
    expect(
      editarAnimalSchema.safeParse({
        ...base,
        data_nascimento: null,
        peso_inicial_kg: null,
      }).success
    ).toBe(true)
  })

  it("aceita payload válido", () => {
    expect(editarAnimalSchema.safeParse(base).success).toBe(true)
  })

  it("aceita todos os status válidos", () => {
    for (const status of ["ativo", "venda", "morte", "baixa"]) {
      expect(editarAnimalSchema.safeParse({ ...base, status }).success).toBe(true)
    }
  })

  it("rejeita status inválido", () => {
    expect(
      editarAnimalSchema.safeParse({ ...base, status: "desconhecido" }).success
    ).toBe(false)
  })

  it("rejeita identificação vazia", () => {
    expect(
      editarAnimalSchema.safeParse({ ...base, identificacao: "" }).success
    ).toBe(false)
  })

  it("não expõe campos calculados no schema", () => {
    expect(Object.keys(editarAnimalSchema.shape)).not.toContain("peso_atual_kg")
    expect(Object.keys(editarAnimalSchema.shape)).not.toContain("gmd_medio_kg")
    expect(Object.keys(editarAnimalSchema.shape)).not.toContain(
      "ultima_pesagem_data"
    )
  })
})
