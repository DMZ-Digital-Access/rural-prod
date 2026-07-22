import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export type NivelAlerta = "ok" | "atencao" | "critico" | "indefinido"

// Paleta semântica (spec seção 6): verde=positivo, laranja=atenção,
// vermelho=crítico, cinza=indefinido/sem dado suficiente.
const estilos: Record<NivelAlerta, string> = {
  ok: "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  atencao:
    "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  critico:
    "border-red-600/20 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
  indefinido: "border-border bg-muted text-muted-foreground",
}

/**
 * Card de alerta acionável do Painel Inteligente (item 21, spec seção 5.2)
 * — "o que precisa de ação do produtor deve saltar aos olhos" (spec, nota
 * ao final da seção 5.2). `to` opcional linka pro módulo relevante
 * (GTAs/Declarações).
 */
export function AlertaCard({
  nivel,
  titulo,
  mensagem,
  to,
  icone,
}: {
  nivel: NivelAlerta
  titulo: string
  mensagem: string
  to?: string
  icone?: ReactNode
}) {
  const conteudo = (
    <div className={cn("flex items-start gap-3 rounded-lg border p-4", estilos[nivel])}>
      {icone && <span className="mt-0.5 shrink-0">{icone}</span>}
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-sm opacity-90">{mensagem}</p>
      </div>
    </div>
  )

  if (!to) return conteudo

  return (
    <Link to={to} className="block transition-opacity hover:opacity-80">
      {conteudo}
    </Link>
  )
}
