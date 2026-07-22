import { useState } from "react"
import { PencilIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAtualizarDeclaracao } from "@/hooks/useDeclaracoesRebanho"
import { DeclaracaoForm } from "@/pages/declaracoes/DeclaracaoForm"
import type { DeclaracaoComEspecie } from "@/lib/types/declaracoes"
import type { DeclaracaoRebanhoFormValues } from "@/lib/validations/declaracoes"

/**
 * Correção de uma declaração já cadastrada — só quantidade/data de
 * referência são editáveis (espécie/ano ficam desabilitados no formulário
 * compartilhado, `bloquearIdentidade`).
 */
export function EditarDeclaracaoDialog({ declaracao }: { declaracao: DeclaracaoComEspecie }) {
  const [open, setOpen] = useState(false)
  const atualizarDeclaracao = useAtualizarDeclaracao(declaracao.id)

  const defaultValues: DeclaracaoRebanhoFormValues = {
    especie_id: declaracao.especie_id,
    ano_referencia: declaracao.ano_referencia,
    data_declaracao: declaracao.data_declaracao,
    quantidade_declarada: declaracao.quantidade_declarada,
  }

  async function onSubmit(values: DeclaracaoRebanhoFormValues) {
    try {
      await atualizarDeclaracao.mutateAsync({
        data_declaracao: values.data_declaracao,
        quantidade_declarada: values.quantidade_declarada,
      })
      toast.success("Declaração atualizada com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar declaração.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon />
        Editar
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar declaração</DialogTitle>
        </DialogHeader>
        {open && (
          <DeclaracaoForm
            defaultValues={defaultValues}
            bloquearIdentidade
            onSubmit={onSubmit}
            submitLabel="Salvar alterações"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
