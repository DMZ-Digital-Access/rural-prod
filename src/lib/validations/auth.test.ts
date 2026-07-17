import { describe, expect, it } from "vitest"
import { loginSchema, buildSignupSchema } from "./auth"

describe("loginSchema", () => {
  it("aceita email e senha válidos", () => {
    const result = loginSchema.safeParse({
      email: "produtor@fazenda.com",
      password: "qualquer-coisa",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita email inválido", () => {
    const result = loginSchema.safeParse({
      email: "não-é-um-email",
      password: "123456",
    })
    expect(result.success).toBe(false)
  })

  it("rejeita senha vazia", () => {
    const result = loginSchema.safeParse({
      email: "produtor@fazenda.com",
      password: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejeita email vazio", () => {
    const result = loginSchema.safeParse({ email: "", password: "123456" })
    expect(result.success).toBe(false)
  })
})

describe("buildSignupSchema — sem convite (signup cria fazenda nova, ADR-0001)", () => {
  const schema = buildSignupSchema(false)

  it("exige nome_fazenda", () => {
    const result = schema.safeParse({
      nome: "Produtor Teste",
      email: "produtor@fazenda.com",
      password: "senha123",
      nomeFazenda: "",
    })
    expect(result.success).toBe(false)
  })

  it("aceita payload completo e válido", () => {
    const result = schema.safeParse({
      nome: "Produtor Teste",
      email: "produtor@fazenda.com",
      password: "senha123",
      nomeFazenda: "Fazenda Boa Vista",
    })
    expect(result.success).toBe(true)
  })

  it("rejeita senha curta (< 6 caracteres)", () => {
    const result = schema.safeParse({
      nome: "Produtor Teste",
      email: "produtor@fazenda.com",
      password: "123",
      nomeFazenda: "Fazenda Boa Vista",
    })
    expect(result.success).toBe(false)
  })

  it("rejeita nome vazio", () => {
    const result = schema.safeParse({
      nome: "",
      email: "produtor@fazenda.com",
      password: "senha123",
      nomeFazenda: "Fazenda Boa Vista",
    })
    expect(result.success).toBe(false)
  })
})

describe("buildSignupSchema — com convite (ADR-0002 D2, entra em fazenda existente)", () => {
  const schema = buildSignupSchema(true)

  it("NÃO exige nome_fazenda quando há convite", () => {
    const result = schema.safeParse({
      nome: "Contador Convidado",
      email: "contador@escritorio.com",
      password: "senha123",
    })
    expect(result.success).toBe(true)
  })

  it("continua exigindo nome/email/senha mesmo com convite", () => {
    const result = schema.safeParse({
      nome: "",
      email: "contador@escritorio.com",
      password: "senha123",
    })
    expect(result.success).toBe(false)
  })
})
