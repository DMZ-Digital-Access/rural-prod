import { describe, expect, it } from "vitest"
import { editarAnimalSchema } from "./animais"

describe("editarAnimalSchema", () => {
  const base = {
    identificacao: "BR-001",
    lote_id: null,
    status: "ativo" as const,
    data_nascimento: "2024-01-15",
    peso_inicial_kg: 35,
    idade_meses_aquisicao: null,
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

  it("aceita idade_meses_aquisicao preenchida", () => {
    expect(
      editarAnimalSchema.safeParse({ ...base, idade_meses_aquisicao: 10 }).success
    ).toBe(true)
  })

  it("rejeita idade_meses_aquisicao negativa", () => {
    expect(
      editarAnimalSchema.safeParse({ ...base, idade_meses_aquisicao: -1 }).success
    ).toBe(false)
  })

  it("rejeita idade_meses_aquisicao fracionária", () => {
    expect(
      editarAnimalSchema.safeParse({ ...base, idade_meses_aquisicao: 8.5 }).success
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
