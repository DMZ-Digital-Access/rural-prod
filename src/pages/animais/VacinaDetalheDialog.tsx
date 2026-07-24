import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { VacinacaoAnimal } from "@/hooks/useVacinacoes"

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

/**
 * Detalhe de uma vacina/medicamento aplicado (Controle Sanitário, página de
 * detalhe do animal, pedido de JP 2026-07-24) — data, tipo, enfermidade
 * tratada (só preenchida em "Outras vacinas ou medicamentos"), quem
 * registrou e observações.
 */
export function VacinaDetalheDialog({ vacinacao }: { vacinacao: VacinacaoAnimal }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between px-2 py-1.5 text-left font-normal"
          />
        }
      >
        <span className="text-sm">{vacinacao.tipo_vacina}</span>
        <span className="text-xs text-muted-foreground">
          {formatData(vacinacao.data_aplicacao)}
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{vacinacao.tipo_vacina}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Data de aplicação</dt>
            <dd className="mt-1 text-sm">{formatData(vacinacao.data_aplicacao)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Registrado por</dt>
            <dd className="mt-1 text-sm">{vacinacao.usuario_nome}</dd>
          </div>
          {vacinacao.enfermidade_tratada && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Enfermidade tratada</dt>
              <dd className="mt-1 text-sm">{vacinacao.enfermidade_tratada}</dd>
            </div>
          )}
          {vacinacao.observacoes && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Observações</dt>
              <dd className="mt-1 text-sm">{vacinacao.observacoes}</dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
