import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Transacao } from "@/lib/types/rebanho"

// Paleta semântica (spec seção 6): Pendente = laranja/vermelho, Liberada/
// despendenciada = verde, N/A = cinza.
const config: Record<Transacao["status_gta_transacao"], { label: string; className: string }> = {
  despendenciada: {
    label: "GTA em dia",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  pendente: {
    label: "GTA pendente",
    className:
      "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  },
  n_a: {
    label: "GTA N/A",
    className: "border-border bg-muted text-muted-foreground",
  },
}

export function StatusGtaBadge({ status }: { status: Transacao["status_gta_transacao"] }) {
  const { label, className } = config[status]
  return (
    <Badge variant="outline" className={cn(className)}>
      {label}
    </Badge>
  )
}
