import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useFazendaSelecionada } from "@/lib/fazendaSelecionada"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAPEL_LABELS: Record<string, string> = {
  admin: "Admin",
  membro: "Membro",
  financeiro: "Financeiro",
}

/**
 * Seletor de fazenda atual (multi-fazenda, 2026-07-22) — sempre visível no
 * topo do menu (desktop e mobile, via SidebarNav). Com 1 fazenda só, mostra
 * o nome sem dropdown (nada a trocar). Trocar aqui reflete automaticamente
 * em toda tela que usa useFazendaAtual() — cada hook downstream já é keyed
 * por fazenda_id, então a troca invalida/refaz as queries sozinha.
 */
export function FazendaSwitcher() {
  const fazendasQuery = useFazendasDoUsuario()
  const { data: fazendaAtual } = useFazendaAtual()
  const { selecionarFazenda } = useFazendaSelecionada()

  const fazendas = fazendasQuery.data ?? []

  if (fazendasQuery.isLoading) {
    return <div className="px-2 text-sm text-muted-foreground">Carregando…</div>
  }

  if (fazendas.length <= 1) {
    return (
      <div className="truncate px-2 text-sm font-medium text-foreground">
        {fazendaAtual?.nome ?? "—"}
      </div>
    )
  }

  return (
    <Select
      value={fazendaAtual?.fazenda_id}
      onValueChange={(v) => v && selecionarFazenda(v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {() => fazendaAtual?.nome ?? "Selecione a fazenda"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {fazendas.map((f) => (
          <SelectItem key={f.fazenda_id} value={f.fazenda_id}>
            {f.nome} — {PAPEL_LABELS[f.papel] ?? f.papel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
