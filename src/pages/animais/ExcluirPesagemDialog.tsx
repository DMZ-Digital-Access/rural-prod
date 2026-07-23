import { useState } from "react"
import { TrashIcon } from "lucide-react"
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
import { useExcluirPesagem } from "@/hooks/usePesagens"

/**
 * Excluir um registro do histórico de pesagens (pedido de JP, 2026-07-23 —
 * permitir corrigir um erro de digitação). peso_atual_kg/gmd_medio_kg/
 * ultima_pesagem_data do animal são recalculados automaticamente pelo
 * backend (trigger AFTER DELETE em pesagens, migration
 * 20260723200000_excluir_pesagem.sql).
 */
export function ExcluirPesagemDialog({
  animalId,
  pesagemId,
  descricao,
}: {
  animalId: string
  pesagemId: string
  /** "22/07/2026 — 260,0 kg", usado na confirmação. */
  descricao: string
}) {
  const [open, setOpen] = useState(false)
  const excluirPesagem = useExcluirPesagem(animalId)

  async function handleExcluir() {
    try {
      await excluirPesagem.mutateAsync(pesagemId)
      toast.success("Pesagem excluída.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir pesagem.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Excluir pesagem"
          />
        }
      >
        <TrashIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir esta pesagem?</DialogTitle>
          <DialogDescription>
            {descricao}. Esta ação não pode ser desfeita — o peso atual e o GMD
            do animal serão recalculados a partir do histórico restante.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={excluirPesagem.isPending}
            onClick={handleExcluir}
          >
            {excluirPesagem.isPending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
