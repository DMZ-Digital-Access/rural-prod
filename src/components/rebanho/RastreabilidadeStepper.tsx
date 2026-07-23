import { BoxIcon, LogInIcon, LogOutIcon } from "lucide-react"
import type { PeriodoLoteAnimal, SaidaAnimal } from "@/hooks/useAnimais"

function formatData(data: string) {
  return new Date(`${data.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")
}

const saidaLabels: Record<SaidaAnimal["tipo_operacao"], string> = {
  compra: "Comprado",
  venda: "Vendido",
  entrada_pastoreio: "Entrada de pastoreio",
  saida_pastoreio: "Saída de pastoreio",
  nascimento: "Nascido na fazenda",
  obito: "Óbito",
  consumo: "Consumo",
}

type Etapa = {
  label: string
  data: string | null
  detalhe: string | null
  icone: React.ReactNode
}

/**
 * Stepper horizontal de Rastreabilidade do animal (pedido de JP, 2026-07-23,
 * desenho vindo do squad de UX/UI): Entrada → período(s) de Lote → Saída,
 * cada marco com ícone + data + descrição curta. Rola horizontalmente em
 * telas estreitas (mobile-first) em vez de quebrar linha — a ordem
 * cronológica fica mais clara numa sequência única do que empilhada.
 */
export function RastreabilidadeStepper({
  entradaTipo,
  entradaData,
  entradaOutraParte,
  periodosLote,
  saida,
}: {
  entradaTipo: string | null
  entradaData: string | null
  entradaOutraParte: string | null
  periodosLote: PeriodoLoteAnimal[]
  saida: SaidaAnimal | null | undefined
}) {
  const etapas: Etapa[] = []

  etapas.push({
    label: "Entrada",
    data: entradaData,
    detalhe: entradaTipo === "nascimento" ? "Nascido na fazenda" : entradaOutraParte,
    icone: <LogInIcon className="size-4" />,
  })

  for (const periodo of periodosLote) {
    etapas.push({
      label: "Lote atribuído",
      data: periodo.data_inicio,
      detalhe: periodo.lote_nome ?? "Sem lote",
      icone: <BoxIcon className="size-4" />,
    })
  }

  if (saida) {
    etapas.push({
      label: "Saída",
      data: saida.data_operacao,
      detalhe: `${saidaLabels[saida.tipo_operacao]}${
        saida.tipo_operacao === "venda" ? ` — ${saida.outra_parte}` : ""
      }`,
      icone: <LogOutIcon className="size-4" />,
    })
  }

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-2">
      {etapas.map((etapa, i) => (
        <div key={i} className="flex items-start">
          <div className="flex w-28 shrink-0 flex-col items-center gap-1 text-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-foreground/20 bg-card text-muted-foreground">
              {etapa.icone}
            </div>
            <span className="text-xs font-medium">{etapa.label}</span>
            <span className="text-xs text-muted-foreground">
              {etapa.data ? formatData(etapa.data) : "—"}
            </span>
            {etapa.detalhe && (
              <span className="text-xs text-muted-foreground">{etapa.detalhe}</span>
            )}
          </div>
          {i < etapas.length - 1 && (
            <div className="mt-4 h-px w-8 shrink-0 bg-border sm:w-16" />
          )}
        </div>
      ))}
    </div>
  )
}
