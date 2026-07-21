import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useCriarLancamento } from "@/hooks/useLancamentosFinanceiros"
import { LancamentoForm } from "@/pages/financeiro/LancamentoForm"
import type { LancamentoFinanceiroFormValues } from "@/lib/validations/financeiro"

const hojeISO = () => new Date().toISOString().slice(0, 10)

const valoresIniciais: LancamentoFinanceiroFormValues = {
  tipo: "despesa",
  categoria: "",
  descricao: "",
  data_lancamento: hojeISO(),
  valor: undefined as unknown as number,
  numero_nota: "",
  contraparte: "",
  transacao_animal_id: null,
  pago: false,
  data_pagamento: null,
}

export function CriarLancamentoDialog({ fazendaId }: { fazendaId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const criarLancamento = useCriarLancamento(fazendaId)

  async function onSubmit(values: LancamentoFinanceiroFormValues) {
    try {
      await criarLancamento.mutateAsync(values)
      toast.success("Lançamento cadastrado com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar lançamento.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Novo Lançamento
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        {open && (
          <LancamentoForm
            fazendaId={fazendaId}
            defaultValues={valoresIniciais}
            onSubmit={onSubmit}
            submitLabel="Cadastrar lançamento"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
