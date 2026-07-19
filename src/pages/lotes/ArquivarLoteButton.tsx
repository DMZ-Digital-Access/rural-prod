import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useDefinirLoteAtivo } from "@/hooks/useLotes"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

/**
 * Arquivar/reativar lote (spec seção 5.1). Sempre `UPDATE ativo=<valor>` —
 * não existe policy de DELETE em `lotes` (migration da Fase 2).
 */
export function ArquivarLoteButton({ lote }: { lote: LoteComEstatisticas }) {
  const definirAtivo = useDefinirLoteAtivo(lote.id)

  async function handleClick() {
    try {
      await definirAtivo.mutateAsync(!lote.ativo)
      toast.success(lote.ativo ? "Lote arquivado." : "Lote reativado.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar o lote."
      )
    }
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={lote.ativo ? "Arquivar lote" : "Reativar lote"}
      disabled={definirAtivo.isPending}
      onClick={handleClick}
    >
      {lote.ativo ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
    </Button>
  )
}
