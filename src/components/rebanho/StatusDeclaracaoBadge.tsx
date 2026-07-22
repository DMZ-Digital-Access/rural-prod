import { Badge } from "@/components/ui/badge"
import type { StatusDeclaracao } from "@/lib/types/declaracoes"

// Paleta semântica (spec seção 6): verde=positivo (enviado), laranja=atenção
// (pendente) — mesmo princípio de StatusPagoBadge.
export function StatusDeclaracaoBadge({ status }: { status: StatusDeclaracao }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "enviado"
          ? "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400"
          : "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
      }
    >
      {status === "enviado" ? "Enviado" : "Pendente"}
    </Badge>
  )
}
