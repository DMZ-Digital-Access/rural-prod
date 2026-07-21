// Constantes/util compartilhadas por qualquer fluxo de upload de documento
// (nota/boleto/recibo, GTA, declaração etc.) — mesma whitelist de MIME
// aceita pela Edge Function `classificar-documento` e pelos buckets de
// Storage do item 14.

export const TIPOS_ARQUIVO_DOCUMENTO_ACEITOS =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"

export const TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES = 10 * 1024 * 1024

export function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const resultado = reader.result as string
      resolve(resultado.split(",")[1] ?? "")
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(arquivo)
  })
}
