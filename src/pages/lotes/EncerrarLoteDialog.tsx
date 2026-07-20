import { useState } from "react"
import { XCircleIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useDefinirLoteAtivo, useExcluirLote } from "@/hooks/useLotes"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

type Etapa = "escolha" | "confirmar_exclusao"

/**
 * "Encerrar Lote" — pedido de JP: em vez de um único botão de arquivar, o
 * usuário escolhe entre Arquivar (reversível, ação existente) ou Excluir
 * (permanente, exige uma segunda confirmação dedicada). Arquivar não pede
 * confirmação extra além desta própria escolha — já era reversível via
 * "Reativar" antes desta mudança.
 */
export function EncerrarLoteDialog({
  lote,
  aoExcluir,
}: {
  lote: LoteComEstatisticas
  /** Chamado após excluir com sucesso — ex.: navegar de volta para a
   * listagem quando este dialog é usado na tela de detalhe do lote (que
   * deixaria de existir). Na listagem, não é necessário (a linha
   * simplesmente some ao revalidar). */
  aoExcluir?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>("escolha")
  const definirAtivo = useDefinirLoteAtivo(lote.id)
  const excluirLote = useExcluirLote(lote.id)

  function fechar() {
    setOpen(false)
    setEtapa("escolha")
  }

  async function handleArquivar() {
    try {
      await definirAtivo.mutateAsync(false)
      toast.success("Lote arquivado.")
      fechar()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao arquivar o lote."
      )
    }
  }

  async function handleExcluir() {
    try {
      await excluirLote.mutateAsync()
      toast.success("Lote excluído. Os animais associados ficaram sem lote.")
      fechar()
      aoExcluir?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir o lote.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setEtapa("escolha")
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Encerrar lote">
            <XCircleIcon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        {etapa === "escolha" ? (
          <>
            <DialogHeader>
              <DialogTitle>Encerrar lote "{lote.nome}"</DialogTitle>
              <DialogDescription>
                Arquivar mantém o histórico e pode ser revertido depois em
                "Reativar". Excluir apaga o lote permanentemente — os animais
                associados não são apagados, só ficam sem lote.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={definirAtivo.isPending}
                onClick={handleArquivar}
              >
                {definirAtivo.isPending ? "Arquivando…" : "Arquivar"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setEtapa("confirmar_exclusao")}
              >
                Excluir
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Excluir "{lote.nome}" permanentemente?</DialogTitle>
              <DialogDescription>
                Esta ação não pode ser desfeita. Os{" "}
                {lote.numero_animais_total > 0
                  ? `${lote.numero_animais_total} animal(is) deste lote ficarão`
                  : "eventuais animais deste lote ficariam"}{" "}
                sem lote associado, mas não serão apagados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setEtapa("escolha")}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                disabled={excluirLote.isPending}
                onClick={handleExcluir}
              >
                {excluirLote.isPending ? "Excluindo…" : "Excluir permanentemente"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
