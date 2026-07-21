// Compressão client-side de imagem antes do upload (pedido de JP: "o ideal
// com relação ao tratamento de arquivos seria compactar o tamanho do
// arquivo antes de salvar no bucket"). Redesenha a imagem num <canvas> e
// reexporta como JPEG com qualidade reduzida — reduz bastante o tamanho de
// fotos de celular sem perda perceptível de legibilidade para leitura de
// documento.
//
// PDF NÃO é comprimido aqui, deliberadamente: recompressão de PDF exige
// biblioteca especializada (recodificar imagens/fontes embutidas) e risco
// real de corromper ou degradar um documento com valor fiscal/de
// auditoria — risco desproporcional pra um ganho de espaço que, em geral,
// já é menor num PDF de scanner/emissor do que numa foto de celular.
// HEIC/HEIF também não são comprimidos (suporte inconsistente de
// `createImageBitmap` para esse formato entre navegadores) — sobem como
// vieram, o bucket já aceita o formato original.

const LARGURA_MAXIMA_PADRAO = 2000
const QUALIDADE_JPEG_PADRAO = 0.8

export async function comprimirArquivoSeImagem(
  arquivo: File,
  opcoes: { larguraMaxima?: number; qualidade?: number } = {}
): Promise<File> {
  const larguraMaxima = opcoes.larguraMaxima ?? LARGURA_MAXIMA_PADRAO
  const qualidade = opcoes.qualidade ?? QUALIDADE_JPEG_PADRAO

  const naoComprimir =
    !arquivo.type.startsWith("image/") ||
    arquivo.type === "image/heic" ||
    arquivo.type === "image/heif"
  if (naoComprimir) return arquivo

  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, larguraMaxima / bitmap.width)
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const canvas = document.createElement("canvas")
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext("2d")
    if (!ctx) return arquivo

    ctx.drawImage(bitmap, 0, 0, largura, altura)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", qualidade)
    )
    if (!blob || blob.size >= arquivo.size) return arquivo

    const novoNome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], novoNome, { type: "image/jpeg" })
  } catch {
    // Falha ao decodificar/comprimir (formato incomum, navegador sem
    // suporte) — envia o arquivo original em vez de bloquear o upload.
    return arquivo
  }
}
