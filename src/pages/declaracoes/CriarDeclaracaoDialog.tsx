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
import { useCriarDeclaracao } from "@/hooks/useDeclaracoesRebanho"
import { DeclaracaoForm } from "@/pages/declaracoes/DeclaracaoForm"
import type { DeclaracaoRebanhoFormValues } from "@/lib/validations/declaracoes"

const anoAtual = () => new Date().getFullYear()

const valoresIniciais: DeclaracaoRebanhoFormValues = {
  especie_id: "",
  ano_referencia: anoAtual(),
  data_declaracao: null,
  quantidade_declarada: undefined as unknown as number,
}

export function CriarDeclaracaoDialog({ fazendaId }: { fazendaId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const criarDeclaracao = useCriarDeclaracao(fazendaId)

  async function onSubmit(values: DeclaracaoRebanhoFormValues) {
    try {
      await criarDeclaracao.mutateAsync(values)
      toast.success("Declaração cadastrada com sucesso.")
      setOpen(false)
    } catch (error) {
      const mensagem =
        error instanceof Error && error.message.includes("duplicate key")
          ? "Já existe uma declaração cadastrada para essa espécie/ano — edite a existente."
          : error instanceof Error
            ? error.message
            : "Erro ao cadastrar declaração."
      toast.error(mensagem)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Nova Declaração
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Declaração</DialogTitle>
        </DialogHeader>
        {open && (
          <DeclaracaoForm
            defaultValues={valoresIniciais}
            onSubmit={onSubmit}
            submitLabel="Cadastrar declaração"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
