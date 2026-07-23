import { useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeftIcon, FileTextIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useAbrirDocumentoGta,
  useAtualizarGta,
  useGta,
  useUploadDocumentoGta,
} from "@/hooks/useGtas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusLiberacaoGtaBadge } from "@/components/rebanho/StatusLiberacaoGtaBadge"
import { TipoOperacaoBadge } from "@/components/rebanho/TipoOperacaoBadge"
import { GtaForm } from "@/pages/gtas/GtaForm"
import type { Gta } from "@/lib/types/rebanho"
import type { GtaFormValues } from "@/lib/validations/gtas"
import { formatNumero } from "@/lib/format"

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function paraFormValues(gta: Gta): GtaFormValues {
  return {
    numero_gta: gta.numero_gta,
    municipio_origem: gta.municipio_origem,
    origem: gta.origem,
    municipio_destino: gta.municipio_destino,
    destino: gta.destino,
    especie_id: gta.especie_id,
    quantidade_animais: gta.quantidade_animais ?? (undefined as unknown as number),
    status_liberacao: gta.status_liberacao,
    data_liberacao: gta.data_liberacao,
    transacao_id: gta.transacao_id,
  }
}

export function GtaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const gtaQuery = useGta(id)
  const atualizarGta = useAtualizarGta(id ?? "")
  const uploadDocumento = useUploadDocumentoGta(fazenda?.fazenda_id, id ?? "")
  const abrirDocumento = useAbrirDocumentoGta()
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pedido de JP: ao enviar o documento de uma GTA ainda pendente, oferecer
  // marcar como liberada na hora, em vez de exigir abrir "Editar GTA" à
  // parte — o documento chegando é, na prática, o sinal de liberação.
  const [confirmarLiberacao, setConfirmarLiberacao] = useState(false)
  const [dataLiberacaoConfirm, setDataLiberacaoConfirm] = useState(hojeISO())
  const [confirmandoLiberacao, setConfirmandoLiberacao] = useState(false)

  const gta = gtaQuery.data

  async function onSubmit(values: GtaFormValues) {
    try {
      await atualizarGta.mutateAsync(values)
      toast.success("GTA atualizada com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar GTA.")
    }
  }

  async function handleUpload(arquivo: File) {
    setEnviando(true)
    try {
      await uploadDocumento.mutateAsync(arquivo)
      toast.success("Documento enviado com sucesso.")
      if (gta && gta.status_liberacao === "pendente") {
        setDataLiberacaoConfirm(hojeISO())
        setConfirmarLiberacao(true)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar documento.")
    } finally {
      setEnviando(false)
    }
  }

  async function confirmarLiberacaoAgora() {
    if (!gta) return
    setConfirmandoLiberacao(true)
    try {
      await atualizarGta.mutateAsync({
        ...paraFormValues(gta),
        status_liberacao: "liberada",
        data_liberacao: dataLiberacaoConfirm,
      })
      toast.success("GTA marcada como liberada.")
      setConfirmarLiberacao(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao liberar GTA.")
    } finally {
      setConfirmandoLiberacao(false)
    }
  }

  if (somenteLeitura) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to="/app/rebanho/gtas"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Voltar para GTAs
        </Link>
        <p className="text-sm text-muted-foreground">
          O papel financeiro não tem acesso a este módulo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/app/rebanho/gtas"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para GTAs
      </Link>

      {gtaQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando GTA…</p>
      )}

      {gtaQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar GTA:{" "}
          {gtaQuery.error instanceof Error ? gtaQuery.error.message : "erro desconhecido"}
        </p>
      )}

      {gta && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold">{gta.numero_gta}</h1>
            <StatusLiberacaoGtaBadge status={gta.status_liberacao} />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Espécie</p>
              <p className="font-medium">{gta.especies?.nome ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nº de animais</p>
              <p className="font-medium">
                {gta.quantidade_animais === null ? "—" : formatNumero(gta.quantidade_animais)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data de liberação</p>
              <p className="font-medium">{formatData(gta.data_liberacao)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Origem</p>
              <p className="font-medium">
                {gta.origem} ({gta.municipio_origem})
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Destino</p>
              <p className="font-medium">
                {gta.destino} ({gta.municipio_destino})
              </p>
            </div>
          </div>

          {gta.transacoes && (
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <span className="text-muted-foreground">Transação vinculada:</span>
              <TipoOperacaoBadge tipo={gta.transacoes.tipo_operacao} />
              <span>{gta.transacoes.outra_parte}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium">Documento original</span>
            <div className="flex flex-wrap gap-2">
              {gta.arquivo_path && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={abrirDocumento.isPending}
                  onClick={async () => {
                    try {
                      const url = await abrirDocumento.mutateAsync(gta.arquivo_path as string)
                      window.open(url, "_blank", "noopener,noreferrer")
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Erro ao abrir documento."
                      )
                    }
                  }}
                >
                  <FileTextIcon />
                  Ver GTA
                </Button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0]
                  if (arquivo) handleUpload(arquivo)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviando}
                onClick={() => inputRef.current?.click()}
              >
                <UploadIcon />
                {enviando ? "Enviando…" : gta.arquivo_path ? "Substituir" : "Enviar"}
              </Button>
            </div>
          </div>

          {confirmarLiberacao && (
            <div className="flex flex-col gap-3 rounded-lg border border-green-600/20 bg-green-600/10 p-3 dark:border-green-500/30 dark:bg-green-500/15 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Documento enviado — marcar esta GTA como liberada agora?
                </p>
                <div className="grid gap-1.5">
                  <Label>Data de liberação</Label>
                  <Input
                    type="date"
                    max={hojeISO()}
                    value={dataLiberacaoConfirm}
                    onChange={(e) => setDataLiberacaoConfirm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmarLiberacao(false)}
                >
                  Manter pendente
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={confirmandoLiberacao}
                  onClick={confirmarLiberacaoAgora}
                >
                  {confirmandoLiberacao ? "Liberando…" : "Marcar como liberada"}
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border p-4">
            <p className="mb-3 text-sm font-medium">Editar GTA</p>
            <GtaForm
              // `key` força remontar o form (RHF reinicia do zero) sempre
              // que o dado no servidor mudar de verdade (updated_at) — sem
              // isso, confirmar a liberação pelo card acima atualiza o
              // banco mas o form "Editar GTA" continua mostrando os valores
              // antigos (Pendente/data vazia), porque `defaultValues` só é
              // lido no primeiro mount do react-hook-form.
              key={gta.updated_at}
              fazendaId={fazenda?.fazenda_id}
              defaultValues={paraFormValues(gta)}
              onSubmit={onSubmit}
              submitLabel="Salvar alterações"
            />
          </div>
        </>
      )}
    </div>
  )
}
