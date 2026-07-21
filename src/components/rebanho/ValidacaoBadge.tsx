import { Badge } from "@/components/ui/badge"

/**
 * Só renderiza algo quando o lançamento AINDA NÃO foi validado (rascunho da
 * IA aguardando confirmação, 2026-07-21) — lançamentos validados são o
 * estado normal, sem precisar de destaque visual (mesmo princípio já usado
 * no badge "Pendente" de Documentos Fiscais: só o estado excepcional ganha
 * badge).
 */
export function ValidacaoBadge({ validado }: { validado: boolean }) {
  if (validado) return null

  return (
    <Badge
      variant="outline"
      className="border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
    >
      Não validado
    </Badge>
  )
}
