import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CapturarDocumentoDialog } from "@/components/documentos/CapturarDocumentoDialog"
import {
  useAplicarCamposExtraidos,
  useAtualizarLancamento,
  useCriarLancamento,
  useCriarLancamentoRascunho,
} from "@/hooks/useLancamentosFinanceiros"
import { LancamentoForm } from "@/pages/financeiro/LancamentoForm"
import { supabase } from "@/lib/supabase"
import { arquivoParaBase64 } from "@/lib/arquivoDocumento"
import { uploadDocumentoLancamento } from "@/lib/uploadDocumentoLancamento"
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

// Mesmo shape inserido por `useCriarLancamentoRascunho` — usado como
// defaultValues do formulário enquanto a extração da IA ainda não voltou
// (ou se ela falhar), pra refletir exatamente o que já está gravado no banco.
const valoresPlaceholderRascunho: LancamentoFinanceiroFormValues = {
  tipo: "despesa",
  categoria: "(processando documento)",
  descricao: "Aguardando leitura automática do documento enviado.",
  data_lancamento: hojeISO(),
  valor: 0.01,
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
  const [draftId, setDraftId] = useState<string | null>(null)
  const [valoresIniciais, setValoresIniciais] =
    useState<LancamentoFinanceiroFormValues>(valoresIniciaisPadrao)

  const criarLancamento = useCriarLancamento(fazendaId)
  const criarRascunho = useCriarLancamentoRascunho(fazendaId)
  const aplicarCamposExtraidos = useAplicarCamposExtraidos()
  const atualizarRascunho = useAtualizarLancamento(draftId ?? "")

  function abrirDialog() {
    setDraftId(null)
    setValoresIniciais(valoresIniciaisPadrao)
    setEtapa("captura")
    setOpen(true)
  }

  async function handleArquivoSelecionado(arquivo: File) {
    if (!fazendaId) return

    setExtraindo(true)
    let novoDraftId: string | null = null
    try {
      // 1. Rascunho imediato — garante que o documento sempre tenha uma
      // linha real pra apontar, mesmo que o usuário abandone a tela antes
      // de confirmar (pedido de JP, 2026-07-21).
      const rascunho = await criarRascunho.mutateAsync()
      novoDraftId = rascunho.id
      setDraftId(novoDraftId)
      setValoresIniciais(valoresPlaceholderRascunho)

      // 2. Salva o documento no bucket ANTES de chamar a IA.
      try {
        await uploadDocumentoLancamento(fazendaId, novoDraftId, hojeISO(), arquivo)
      } catch (uploadError) {
        // Upload falhou — sem documento persistido, o rascunho vazio não
        // serve de nada. Remove e propaga o erro (fluxo volta pra captura).
        await supabase.from("lancamentos_financeiros").delete().eq("id", novoDraftId)
        setDraftId(null)
        throw uploadError
      }

      // 3. Classificação por IA — pré-preenche o rascunho já existente.
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
        const camposParaGravar = {
          tipo: campos.tipo,
          ...(campos.categoria ? { categoria: campos.categoria } : {}),
          ...(campos.descricao ? { descricao: campos.descricao } : {}),
          ...(campos.data_lancamento ? { data_lancamento: campos.data_lancamento } : {}),
          ...(campos.valor !== null ? { valor: campos.valor } : {}),
          ...(campos.numero_nota ? { numero_nota: campos.numero_nota } : {}),
          ...(campos.contraparte ? { contraparte: campos.contraparte } : {}),
        }
        await aplicarCamposExtraidos.mutateAsync({ id: novoDraftId, campos: camposParaGravar })

        setValoresIniciais((atual) => ({ ...atual, ...camposParaGravar }))
        toast.success("Documento lido — revise os campos antes de confirmar.")
      } catch (classifyError) {
        // Documento já está salvo — não desfaz o rascunho, só avisa que a
        // leitura automática falhou e os campos precisam ser preenchidos
        // à mão (o formulário já abre com o documento anexado).
        toast.error(
          (classifyError instanceof Error
            ? classifyError.message
            : "Erro ao ler documento automaticamente.") +
            " O documento foi salvo — preencha os campos manualmente."
        )
      }

      setEtapa("formulario")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao processar documento.")
    } finally {
      setExtraindo(false)
    }
  }

  function handlePularCaptura() {
    setDraftId(null)
    setValoresIniciais(valoresIniciaisPadrao)
    setEtapa("formulario")
  }

  async function onSubmit(values: LancamentoFinanceiroFormValues) {
    try {
      if (draftId) {
        await atualizarRascunho.mutateAsync(values)
        toast.success("Lançamento confirmado com sucesso.")
      } else {
        await criarLancamento.mutateAsync(values)
        toast.success("Lançamento cadastrado com sucesso.")
      }
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar lançamento.")
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
          if (extraindo) return
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
              submitLabel={draftId ? "Confirmar lançamento" : "Cadastrar lançamento"}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
