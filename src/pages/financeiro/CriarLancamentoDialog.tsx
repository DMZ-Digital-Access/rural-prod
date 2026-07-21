import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CapturarDocumentoDialog } from "@/components/documentos/CapturarDocumentoDialog"
import { useCriarLancamento } from "@/hooks/useLancamentosFinanceiros"
import { LancamentoForm } from "@/pages/financeiro/LancamentoForm"
import { supabase } from "@/lib/supabase"
import { arquivoParaBase64 } from "@/lib/arquivoDocumento"
import type { LancamentoFinanceiroFormValues } from "@/lib/validations/financeiro"
import type { TipoLancamento } from "@/lib/types/financeiro"

const hojeISO = () => new Date().toISOString().slice(0, 10)

const valoresIniciaisPadrao: LancamentoFinanceiroFormValues = {
  tipo: "despesa",
  categoria: "",
  descricao: "",
  data_lancamento: hojeISO(),
  valor: undefined as unknown as number,
  numero_nota: "",
  contraparte: "",
  transacao_animal_id: null,
  pago: false,
  data_pagamento: null,
}

type CamposExtraidos = {
  tipo: TipoLancamento
  categoria: string | null
  descricao: string | null
  data_lancamento: string | null
  valor: number | null
  numero_nota: string | null
  contraparte: string | null
}

type Etapa = "captura" | "formulario"

export function CriarLancamentoDialog({ fazendaId }: { fazendaId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>("captura")
  const [extraindo, setExtraindo] = useState(false)
  const [valoresIniciais, setValoresIniciais] =
    useState<LancamentoFinanceiroFormValues>(valoresIniciaisPadrao)
  const criarLancamento = useCriarLancamento(fazendaId)

  function abrirDialog() {
    setValoresIniciais(valoresIniciaisPadrao)
    setEtapa("captura")
    setOpen(true)
  }

  async function handleArquivoSelecionado(arquivo: File) {
    if (!fazendaId) return

    setExtraindo(true)
    try {
      const base64 = await arquivoParaBase64(arquivo)
      const { data, error } = await supabase.functions.invoke("classificar-documento", {
        body: { fazenda_id: fazendaId, mime_type: arquivo.type, arquivo_base64: base64 },
      })

      if (error) {
        let mensagem = error.message
        try {
          const contexto = (error as { context?: Response }).context
          const corpo = await contexto?.clone().json()
          if (corpo?.error) mensagem = corpo.error
        } catch {
          // sem corpo JSON legível — mantém error.message
        }
        throw new Error(mensagem)
      }

      const campos = data.campos as CamposExtraidos
      setValoresIniciais((atual) => ({
        ...atual,
        tipo: campos.tipo,
        categoria: campos.categoria ?? atual.categoria,
        descricao: campos.descricao ?? atual.descricao,
        data_lancamento: campos.data_lancamento ?? atual.data_lancamento,
        valor: campos.valor ?? atual.valor,
        numero_nota: campos.numero_nota ?? atual.numero_nota,
        contraparte: campos.contraparte ?? atual.contraparte,
      }))
      toast.success("Documento lido — revise os campos antes de salvar.")
      setEtapa("formulario")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao ler documento.")
    } finally {
      setExtraindo(false)
    }
  }

  function handlePularCaptura() {
    setEtapa("formulario")
  }

  async function onSubmit(values: LancamentoFinanceiroFormValues) {
    try {
      await criarLancamento.mutateAsync(values)
      toast.success("Lançamento cadastrado com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar lançamento.")
    }
  }

  return (
    <>
      <Button onClick={abrirDialog}>
        <PlusIcon />
        Novo Lançamento
      </Button>

      <CapturarDocumentoDialog
        open={open && etapa === "captura"}
        onOpenChange={(v) => {
          if (!v) setOpen(false)
        }}
        titulo="Novo Lançamento"
        descricao="Envie a nota, boleto ou recibo para pré-preencher os campos automaticamente."
        processando={extraindo}
        onArquivoSelecionado={handleArquivoSelecionado}
        onPularCaptura={handlePularCaptura}
      />

      <Dialog
        open={open && etapa === "formulario"}
        onOpenChange={(v) => {
          if (!v) setOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          {open && etapa === "formulario" && (
            <LancamentoForm
              fazendaId={fazendaId}
              defaultValues={valoresIniciais}
              onSubmit={onSubmit}
              submitLabel="Cadastrar lançamento"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
