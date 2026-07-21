import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TipoOperacaoTransacao } from "@/lib/types/rebanho"

// Seletor colorido por tipo de operação (spec seção 5.2) — verde para
// entradas que ficam na fazenda (compra/nascimento/entrada_pastoreio),
// azul para saídas neutras (venda/saida_pastoreio), vermelho/laranja para
// saídas com perda (obito/consumo) — mesma paleta semântica da spec seção 6.
const config: Record<TipoOperacaoTransacao, { label: string; className: string }> = {
  compra: {
    label: "Compra",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  nascimento: {
    label: "Nascimento",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  entrada_pastoreio: {
    label: "Entrada de Pastoreio",
    className:
      "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  },
  venda: {
    label: "Venda",
    className:
      "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400",
  },
  saida_pastoreio: {
    label: "Saída de Pastoreio",
    className:
      "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400",
  },
  obito: {
    label: "Óbito",
    className:
      "border-red-600/20 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
  },
  consumo: {
    label: "Consumo",
    className:
      "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  },
}

export function TipoOperacaoBadge({ tipo }: { tipo: TipoOperacaoTransacao }) {
  const { label, className } = config[tipo]
  return (
    <Badge variant="outline" className={cn(className)}>
      {label}
    </Badge>
  )
}
