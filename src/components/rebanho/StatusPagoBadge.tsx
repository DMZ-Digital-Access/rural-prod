import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Paleta semântica (spec seção 6): verde=positivo (pago), laranja=atenção
// (ainda não pago).
export function StatusPagoBadge({ pago }: { pago: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        pago
          ? "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400"
          : "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
      )}
    >
      {pago ? "Pago" : "Não pago"}
    </Badge>
  )
}
