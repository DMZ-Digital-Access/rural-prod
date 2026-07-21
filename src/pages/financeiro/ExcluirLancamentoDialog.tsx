import { useState } from "react"
import { Trash2Icon } from "lucide-react"
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
import { useExcluirLancamento } from "@/hooks/useLancamentosFinanceiros"

/**
 * Exclusão de lançamento — pedido de JP (2026-07-21): reversão deliberada da
 * decisão original de nunca permitir DELETE, pra corrigir validação por
 * engano ou com erro (inclusive rascunhos mal lidos pela IA). Confirmação
 * dedicada, mesmo padrão já usado em "Encerrar Lote". O documento fiscal
 * eventualmente anexado no bucket NÃO é apagado junto — só a linha.
 */
export function ExcluirLancamentoDialog({
  lancamentoId,
  aoExcluir,
}: {
  lancamentoId: string
  aoExcluir: () => void
}) {
  const [open, setOpen] = useState(false)
  const excluirLancamento = useExcluirLancamento(lancamentoId)

  async function handleExcluir() {
    try {
      await excluirLancamento.mutateAsync()
      toast.success("Lançamento excluído.")
      setOpen(false)
      aoExcluir()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir lançamento.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2Icon />
        Excluir lançamento
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir lançamento permanentemente?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Se houver um documento fiscal anexado, ele
            permanece guardado no armazenamento — só o lançamento em si é removido.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={excluirLancamento.isPending}
            onClick={handleExcluir}
          >
            {excluirLancamento.isPending ? "Excluindo…" : "Excluir permanentemente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
