import { supabase } from "@/lib/supabase"
import { comprimirArquivoSeImagem } from "@/lib/comprimirImagem"

/**
 * Envia o documento fiscal (nota/boleto/recibo) de um lançamento pro bucket
 * `lancamentos-documentos` e grava `arquivo_path`/`arquivo_mime_type` na
 * linha. Caminho `{fazenda_id}/{AAAA-MM do data_lancamento}/{lancamento_id}.
 * {extensao}` — "mês da nota", não mês do upload. Imagem é comprimida antes
 * do envio; PDF sobe sem alteração.
 *
 * Função pura (não é hook) — usada tanto pelo hook `useUploadDocumentoLancamento`
 * (upload de um lançamento já existente, tela de detalhe) quanto pelo fluxo
 * de captura de "Novo Lançamento" (upload logo após criar o rascunho, antes
 * de chamar a IA), que precisa chamá-la fora do ciclo de vida de componente.
 */
export async function uploadDocumentoLancamento(
  fazendaId: string,
  lancamentoId: string,
  dataLancamento: string,
  arquivoOriginal: File
): Promise<{ caminho: string; mimeType: string }> {
  const arquivo = await comprimirArquivoSeImagem(arquivoOriginal)
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "bin"
  const mesDaNota = dataLancamento.slice(0, 7) // "AAAA-MM-DD" -> "AAAA-MM"
  const caminho = `${fazendaId}/${mesDaNota}/${lancamentoId}.${extensao}`

  const { error: uploadError } = await supabase.storage
    .from("lancamentos-documentos")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from("lancamentos_financeiros")
    .update({ arquivo_path: caminho, arquivo_mime_type: arquivo.type })
    .eq("id", lancamentoId)
  if (updateError) throw updateError

  return { caminho, mimeType: arquivo.type }
}
