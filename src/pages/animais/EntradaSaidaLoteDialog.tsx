import { useState } from "react"
import { ArrowRightLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EntradaAgregadaForm } from "@/pages/animais/EntradaAgregadaForm"
import { SaidaAnimaisIndividuaisForm } from "@/pages/animais/SaidaAnimaisIndividuaisForm"
import type { TipoOperacaoTransacao } from "@/lib/types/rebanho"

type TipoOperacaoLote = Extract<
  TipoOperacaoTransacao,
  "compra" | "venda" | "nascimento" | "obito" | "consumo"
>

const tipoOperacaoLabels: Record<TipoOperacaoLote, string> = {
  compra: "Compra",
  venda: "Venda",
  nascimento: "Nascimento",
  obito: "Óbito",
  consumo: "Consumo",
}

const tiposSaidaIndividual = new Set<TipoOperacaoLote>(["venda", "obito", "consumo"])

/**
 * "Entradas e Saídas de Animais de Lote" (ADR-0005/0006) — um único dialog,
 * dois formulários por trás do mesmo seletor de "Tipo de operação":
 * - Compra/Nascimento: lançamento agregado, cria animais pendentes de
 *   individualização automaticamente (EntradaAgregadaForm).
 * - Venda/Óbito/Consumo: o usuário escolhe quais animais JÁ EXISTENTES
 *   participam da operação (SaidaAnimaisIndividuaisForm) — agrupamento
 *   etário/sexo calculados automaticamente pelo backend a partir de cada
 *   animal selecionado.
 */
export function EntradaSaidaLoteDialog({
  fazendaId,
}: {
  fazendaId: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacaoLote>("compra")

  function fechar() {
    setOpen(false)
    setTipoOperacao("compra")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTipoOperacao("compra")
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <ArrowRightLeftIcon />
            Entradas e Saídas de Animais de Lote
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entradas e Saídas de Animais de Lote</DialogTitle>
          <DialogDescription>
            Lançamento agregado — afeta o saldo de rebanho imediatamente, mesmo
            sem GTA, nota ou contranota. Os animais de Compra/Nascimento podem
            ser individualizados depois em "Individualizar Animal".
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label>Tipo de operação</Label>
          <Select
            value={tipoOperacao}
            onValueChange={(v) => setTipoOperacao(v as TipoOperacaoLote)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value: TipoOperacaoLote) => tipoOperacaoLabels[value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(tipoOperacaoLabels) as TipoOperacaoLote[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipoOperacaoLabels[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tiposSaidaIndividual.has(tipoOperacao) ? (
          <SaidaAnimaisIndividuaisForm
            fazendaId={fazendaId}
            tipoOperacao={tipoOperacao as "venda" | "obito" | "consumo"}
            onSuccess={fechar}
          />
        ) : (
          <EntradaAgregadaForm
            fazendaId={fazendaId}
            tipoOperacao={tipoOperacao as "compra" | "nascimento"}
            onSuccess={fechar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
