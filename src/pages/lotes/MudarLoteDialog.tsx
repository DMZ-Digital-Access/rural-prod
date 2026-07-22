import { useState } from "react"
import { ArrowRightLeftIcon } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAtualizarLoteDoAnimal } from "@/hooks/useAnimais"
import type { AnimalComDetalhes } from "@/lib/types/rebanho"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

const SEM_LOTE = "__sem_lote__"

/**
 * "Retirar do lote" ou "mover pra outro lote" (tela de detalhe do lote,
 * 2026-07-22) — as duas ações do pedido de JP ("transferir de lote e
 * retirar dele, deixando sem lote específico") são o MESMO gesto de
 * produto: escolher o lote de destino de um único `Select` (que já inclui
 * "Sem lote" como opção) e salvar. Select PLANO, não `LoteSelectField`
 * (componentes/rebanho) — aquele depende de `FormControl`/`useFormContext`
 * de react-hook-form (usado nos formulários de criar/editar animal), e este
 * dialog não usa react-hook-form, só `useState` — reusá-lo aqui quebrava
 * com "Cannot destructure property 'getFieldState' of 'useFormContext(...)'
 * as it is null" (achado real durante a validação via Playwright). Sem
 * diálogo de dupla confirmação — é uma correção de dado reversível a
 * qualquer momento pela mesma tela.
 */
export function MudarLoteDialog({
  animal,
  lotes,
}: {
  animal: AnimalComDetalhes
  lotes: LoteComEstatisticas[]
}) {
  const [open, setOpen] = useState(false)
  const [loteId, setLoteId] = useState<string | null>(animal.lote_id)
  const atualizarLote = useAtualizarLoteDoAnimal(animal.id)

  async function handleSalvar() {
    try {
      await atualizarLote.mutateAsync(loteId)
      toast.success(loteId ? "Animal movido de lote." : "Animal retirado do lote.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao mudar o lote do animal.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setLoteId(animal.lote_id)
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Mudar lote">
            <ArrowRightLeftIcon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mudar lote de {animal.identificacao}</DialogTitle>
          <DialogDescription>
            Escolha outro lote pra mover o animal, ou "Sem lote" pra retirá-lo.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={loteId ?? SEM_LOTE}
          onValueChange={(v) => setLoteId(v && v !== SEM_LOTE ? v : null)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione um lote">
              {(v: string) =>
                v === SEM_LOTE
                  ? "Sem lote"
                  : (lotes.find((lote) => lote.id === v)?.nome ?? "Sem lote")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_LOTE}>Sem lote</SelectItem>
            {lotes.map((lote) => (
              <SelectItem key={lote.id} value={lote.id}>
                {lote.nome}
                {!lote.ativo ? " (arquivado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            onClick={handleSalvar}
            disabled={atualizarLote.isPending || loteId === animal.lote_id}
          >
            {atualizarLote.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
