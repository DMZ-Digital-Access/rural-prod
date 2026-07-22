import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAdicionarAnimaisAoLote, useAnimais } from "@/hooks/useAnimais"

/**
 * "Incluir animais" no lote (pedido de JP, 2026-07-22) — lista TODOS os
 * animais ativos da fazenda, mesmo os que já têm outro lote (decisão
 * confirmada com JP: selecionar um que já tem lote MOVE ele pra este, sem
 * precisar ir na tela do lote de origem primeiro) — só exclui os que já
 * estão NESTE lote (já aparecem na tabela principal). Ordenado por
 * identificação (já é o `order by` padrão de useAnimais) + campo de busca
 * client-side, mesmo padrão de checklist em div rolável já usado em
 * SaidaAnimaisIndividuaisForm.tsx (Módulo de Transações).
 */
export function AdicionarAnimaisDialog({
  fazendaId,
  loteId,
}: {
  fazendaId: string | undefined
  loteId: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState("")
  const [selecionados, setSelecionados] = useState<string[]>([])
  const animaisQuery = useAnimais(fazendaId)
  const adicionar = useAdicionarAnimaisAoLote(loteId)

  const buscaNormalizada = busca.trim().toLowerCase()
  const animaisDisponiveis = (animaisQuery.data ?? []).filter(
    (a) =>
      a.status === "ativo" &&
      a.lote_id !== loteId &&
      (buscaNormalizada === "" || a.identificacao.toLowerCase().includes(buscaNormalizada))
  )

  function fechar() {
    setOpen(false)
    setBusca("")
    setSelecionados([])
  }

  async function handleAdicionar() {
    try {
      await adicionar.mutateAsync(selecionados)
      toast.success(
        selecionados.length === 1
          ? "Animal incluído no lote."
          : `${selecionados.length} animais incluídos no lote.`
      )
      fechar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao incluir animais no lote.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : fechar())}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            Incluir animais
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incluir animais no lote</DialogTitle>
          <DialogDescription>
            Selecionar um animal que já está em outro lote o move pra este.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="busca-animal">Buscar por identificação</Label>
          <Input
            id="busca-animal"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex.: BR-001"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>
            Animais ({selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"})
          </Label>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-2">
            {animaisQuery.isLoading && (
              <p className="p-2 text-sm text-muted-foreground">Carregando animais…</p>
            )}
            {!animaisQuery.isLoading && animaisDisponiveis.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">
                Nenhum animal disponível para incluir.
              </p>
            )}
            {animaisDisponiveis.map((animal) => {
              const selecionado = selecionados.includes(animal.id)
              return (
                <label
                  key={animal.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selecionado}
                    onChange={(e) => {
                      setSelecionados((atual) =>
                        e.target.checked
                          ? [...atual, animal.id]
                          : atual.filter((id) => id !== animal.id)
                      )
                    }}
                  />
                  <span className="font-medium">{animal.identificacao}</span>
                  <span className="text-muted-foreground">
                    {animal.categoria ?? "—"} ·{" "}
                    {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                    {animal.lote_id ? " · já tem lote" : ""}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAdicionar}
            disabled={adicionar.isPending || selecionados.length === 0}
          >
            {adicionar.isPending ? "Incluindo…" : "Incluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
