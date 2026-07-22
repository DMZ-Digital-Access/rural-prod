import { useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeftIcon, FileTextIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useAtualizarLancamento,
  useLancamento,
} from "@/hooks/useLancamentosFinanceiros"
import {
  useAbrirDocumentoLancamento,
  useUploadDocumentoLancamento,
} from "@/hooks/useDocumentosFiscais"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TipoLancamentoBadge } from "@/components/rebanho/TipoLancamentoBadge"
import { StatusPagoBadge } from "@/components/rebanho/StatusPagoBadge"
import { ValidacaoBadge } from "@/components/rebanho/ValidacaoBadge"
import { TipoOperacaoBadge } from "@/components/rebanho/TipoOperacaoBadge"
import { LancamentoForm } from "@/pages/financeiro/LancamentoForm"
import { ExcluirLancamentoDialog } from "@/pages/financeiro/ExcluirLancamentoDialog"
import { TIPOS_ARQUIVO_DOCUMENTO_ACEITOS } from "@/lib/arquivoDocumento"
import type { LancamentoFinanceiroFormValues } from "@/lib/validations/financeiro"
import type { LancamentoComDetalhes } from "@/lib/types/financeiro"

function DocumentoFiscalField({
  lancamentoId,
  fazendaId,
  dataLancamento,
  caminho,
  somenteLeitura,
}: {
  lancamentoId: string
  fazendaId: string | undefined
  dataLancamento: string
  caminho: string | null
  somenteLeitura: boolean
}) {
  const abrirDocumento = useAbrirDocumentoLancamento()
  const uploadDocumento = useUploadDocumentoLancamento(fazendaId, lancamentoId, dataLancamento)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(arquivo: File) {
    setEnviando(true)
    try {
      await uploadDocumento.mutateAsync(arquivo)
      toast.success("Documento enviado com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar documento.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Documento fiscal</span>
        <Badge
          variant="outline"
          className={
            caminho
              ? "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400"
              : "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
          }
        >
          {caminho ? "Presente" : "Pendente"}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {caminho && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={abrirDocumento.isPending}
            onClick={async () => {
              try {
                const url = await abrirDocumento.mutateAsync(caminho)
                window.open(url, "_blank", "noopener,noreferrer")
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Erro ao abrir documento."
                )
              }
            }}
          >
            <FileTextIcon />
            Ver documento
          </Button>
        )}
        {!somenteLeitura && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={TIPOS_ARQUIVO_DOCUMENTO_ACEITOS}
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
              {enviando ? "Enviando…" : caminho ? "Substituir" : "Enviar"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function formatMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function paraFormValues(lancamento: LancamentoComDetalhes): LancamentoFinanceiroFormValues {
  return {
    tipo: lancamento.tipo,
    categoria: lancamento.categoria,
    descricao: lancamento.descricao,
    data_lancamento: lancamento.data_lancamento,
    valor: lancamento.valor,
    numero_nota: lancamento.numero_nota ?? "",
    contraparte: lancamento.contraparte ?? "",
    transacao_animal_id: lancamento.transacao_animal_id,
    pago: lancamento.pago,
    data_pagamento: lancamento.data_pagamento,
  }
}

export function LancamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const lancamentoQuery = useLancamento(id)
  const atualizarLancamento = useAtualizarLancamento(id ?? "")

  const lancamento = lancamentoQuery.data

  async function onSubmit(values: LancamentoFinanceiroFormValues) {
    try {
      await atualizarLancamento.mutateAsync(values)
      toast.success("Lançamento atualizado com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar lançamento.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/app/financeiro/lancamentos"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para Financeiro
      </Link>

      {lancamentoQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando lançamento…</p>
      )}

      {lancamentoQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar lançamento:{" "}
          {lancamentoQuery.error instanceof Error
            ? lancamentoQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {lancamento && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <TipoLancamentoBadge tipo={lancamento.tipo} />
              <ValidacaoBadge validado={lancamento.validado_pelo_usuario} />
              <h1 className="text-2xl font-semibold">{lancamento.categoria}</h1>
            </div>
            <div className="flex items-center gap-2">
              <StatusPagoBadge pago={lancamento.pago} />
              {!somenteLeitura && (
                <ExcluirLancamentoDialog
                  lancamentoId={lancamento.id}
                  aoExcluir={() => navigate("/app/financeiro/lancamentos")}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Data do lançamento</p>
              <p className="font-medium">{formatData(lancamento.data_lancamento)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="font-medium">{formatMoeda(lancamento.valor)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data do pagamento</p>
              <p className="font-medium">{formatData(lancamento.data_pagamento)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contraparte</p>
              <p className="font-medium">{lancamento.contraparte ?? "—"}</p>
            </div>
          </div>

          {lancamento.transacoes && (
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <span className="text-muted-foreground">Transação de animal vinculada:</span>
              <TipoOperacaoBadge tipo={lancamento.transacoes.tipo_operacao} />
              <span>{lancamento.transacoes.outra_parte}</span>
            </div>
          )}

          <DocumentoFiscalField
            lancamentoId={lancamento.id}
            fazendaId={fazenda?.fazenda_id}
            dataLancamento={lancamento.data_lancamento}
            caminho={lancamento.arquivo_path}
            somenteLeitura={somenteLeitura}
          />

          {!somenteLeitura && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm font-medium">Editar lançamento</p>
              <LancamentoForm
                key={lancamento.updated_at}
                fazendaId={fazenda?.fazenda_id}
                defaultValues={paraFormValues(lancamento)}
                onSubmit={onSubmit}
                submitLabel="Salvar alterações"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
