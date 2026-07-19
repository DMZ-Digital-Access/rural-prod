import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StatusAnimal } from "@/lib/types/rebanho"

// Paleta semântica (spec seção 6): verde=positivo/ativo, laranja=atenção,
// vermelho=crítico, azul=informação. `venda` é tratada como "informação"
// (transação neutra, não um problema), `morte` como crítico, `baixa` como
// atenção (saída do rebanho por outro motivo que não venda).
const statusConfig: Record<StatusAnimal, { label: string; className: string }> = {
  ativo: {
    label: "Ativo",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  venda: {
    label: "Vendido",
    className:
      "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400",
  },
  morte: {
    label: "Morte",
    className:
      "border-red-600/20 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
  },
  baixa: {
    label: "Baixa",
    className:
      "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  },
}

export function StatusAnimalBadge({ status }: { status: StatusAnimal }) {
  const config = statusConfig[status]
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
