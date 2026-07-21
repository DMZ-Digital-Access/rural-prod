import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StatusLiberacaoGta } from "@/lib/types/rebanho"

// Spec seção 6: Pendente = laranja/vermelho (ação que o produtor precisa
// acompanhar), Liberada = verde.
const config: Record<StatusLiberacaoGta, { label: string; className: string }> = {
  pendente: {
    label: "Pendente",
    className:
      "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  },
  liberada: {
    label: "Liberada",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
}

export function StatusLiberacaoGtaBadge({ status }: { status: StatusLiberacaoGta }) {
  const { label, className } = config[status]
  return (
    <Badge variant="outline" className={cn(className)}>
      {label}
    </Badge>
  )
}
