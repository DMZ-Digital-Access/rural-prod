import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TipoLancamento } from "@/lib/types/financeiro"

const config: Record<TipoLancamento, { label: string; className: string }> = {
  receita: {
    label: "Receita",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  despesa: {
    label: "Despesa",
    className:
      "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400",
  },
}

export function TipoLancamentoBadge({ tipo }: { tipo: TipoLancamento }) {
  const { label, className } = config[tipo]
  return (
    <Badge variant="outline" className={cn(className)}>
      {label}
    </Badge>
  )
}
