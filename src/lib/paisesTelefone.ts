/** Países pra seletor de código de discagem (Meus dados > Telefone
 * celular, pedido de JP, 2026-07-24) — bandeira (emoji) + sigla + DDI.
 * Brasil primeiro/default, resto em ordem alfabética. */
export type PaisTelefone = {
  sigla: string
  nome: string
  bandeira: string
  ddi: string
}

export const PAISES_TELEFONE: PaisTelefone[] = [
  { sigla: "BR", nome: "Brasil", bandeira: "🇧🇷", ddi: "+55" },
  { sigla: "AR", nome: "Argentina", bandeira: "🇦🇷", ddi: "+54" },
  { sigla: "AU", nome: "Austrália", bandeira: "🇦🇺", ddi: "+61" },
  { sigla: "AT", nome: "Áustria", bandeira: "🇦🇹", ddi: "+43" },
  { sigla: "BE", nome: "Bélgica", bandeira: "🇧🇪", ddi: "+32" },
  { sigla: "BO", nome: "Bolívia", bandeira: "🇧🇴", ddi: "+591" },
  { sigla: "CA", nome: "Canadá", bandeira: "🇨🇦", ddi: "+1" },
  { sigla: "CL", nome: "Chile", bandeira: "🇨🇱", ddi: "+56" },
  { sigla: "CN", nome: "China", bandeira: "🇨🇳", ddi: "+86" },
  { sigla: "CO", nome: "Colômbia", bandeira: "🇨🇴", ddi: "+57" },
  { sigla: "KR", nome: "Coreia do Sul", bandeira: "🇰🇷", ddi: "+82" },
  { sigla: "DK", nome: "Dinamarca", bandeira: "🇩🇰", ddi: "+45" },
  { sigla: "EG", nome: "Egito", bandeira: "🇪🇬", ddi: "+20" },
  { sigla: "ES", nome: "Espanha", bandeira: "🇪🇸", ddi: "+34" },
  { sigla: "US", nome: "Estados Unidos", bandeira: "🇺🇸", ddi: "+1" },
  { sigla: "FR", nome: "França", bandeira: "🇫🇷", ddi: "+33" },
  { sigla: "DE", nome: "Alemanha", bandeira: "🇩🇪", ddi: "+49" },
  { sigla: "GR", nome: "Grécia", bandeira: "🇬🇷", ddi: "+30" },
  { sigla: "NL", nome: "Holanda", bandeira: "🇳🇱", ddi: "+31" },
  { sigla: "IN", nome: "Índia", bandeira: "🇮🇳", ddi: "+91" },
  { sigla: "ID", nome: "Indonésia", bandeira: "🇮🇩", ddi: "+62" },
  { sigla: "IE", nome: "Irlanda", bandeira: "🇮🇪", ddi: "+353" },
  { sigla: "IT", nome: "Itália", bandeira: "🇮🇹", ddi: "+39" },
  { sigla: "JP", nome: "Japão", bandeira: "🇯🇵", ddi: "+81" },
  { sigla: "MX", nome: "México", bandeira: "🇲🇽", ddi: "+52" },
  { sigla: "NO", nome: "Noruega", bandeira: "🇳🇴", ddi: "+47" },
  { sigla: "NZ", nome: "Nova Zelândia", bandeira: "🇳🇿", ddi: "+64" },
  { sigla: "PY", nome: "Paraguai", bandeira: "🇵🇾", ddi: "+595" },
  { sigla: "PE", nome: "Peru", bandeira: "🇵🇪", ddi: "+51" },
  { sigla: "PT", nome: "Portugal", bandeira: "🇵🇹", ddi: "+351" },
  { sigla: "GB", nome: "Reino Unido", bandeira: "🇬🇧", ddi: "+44" },
  { sigla: "RU", nome: "Rússia", bandeira: "🇷🇺", ddi: "+7" },
  { sigla: "CH", nome: "Suíça", bandeira: "🇨🇭", ddi: "+41" },
  { sigla: "SE", nome: "Suécia", bandeira: "🇸🇪", ddi: "+46" },
  { sigla: "UY", nome: "Uruguai", bandeira: "🇺🇾", ddi: "+598" },
  { sigla: "VE", nome: "Venezuela", bandeira: "🇻🇪", ddi: "+58" },
]

/** Formata dígitos (só números) no padrão brasileiro incremental —
 * (DDD) NNNN-NNNN (fixo, 8 dígitos) ou (DDD) NNNNN-NNNN (celular, 9
 * dígitos), conforme o usuário digita. Só faz sentido pro DDI +55; outros
 * países mostram os dígitos crus (cada país tem sua própria máscara, fora
 * de escopo aqui). */
export function formatarTelefoneBr(digitos: string): string {
  const d = digitos.slice(0, 11)
  if (d.length <= 2) return d
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`
}
