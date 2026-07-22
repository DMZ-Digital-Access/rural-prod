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
import type { DeclaracaoComItens } from "@/lib/types/declaracoes"
import type { DeclaracaoRebanhoFormValues } from "@/lib/validations/declaracoes"

/**
 * Correção de uma declaração já cadastrada — só data de referência e a
 * lista de espécies/quantidades são editáveis (`ano_referencia` fica
 * desabilitado no formulário compartilhado, `bloquearAno`).
 */
export function EditarDeclaracaoDialog({ declaracao }: { declaracao: DeclaracaoComItens }) {
  const [open, setOpen] = useState(false)
  const atualizarDeclaracao = useAtualizarDeclaracao(declaracao.id)

  const defaultValues: DeclaracaoRebanhoFormValues = {
    ano_referencia: declaracao.ano_referencia,
    data_declaracao: declaracao.data_declaracao,
    itens: declaracao.declaracoes_rebanho_itens.map((item) => ({
      especie_id: item.especie_id,
      quantidade_declarada: item.quantidade_declarada,
    })),
  }

  async function onSubmit(values: DeclaracaoRebanhoFormValues) {
    try {
      await atualizarDeclaracao.mutateAsync(values)
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar declaração</DialogTitle>
        </DialogHeader>
        {open && (
          <DeclaracaoForm
            defaultValues={defaultValues}
            bloquearAno
            onSubmit={onSubmit}
            submitLabel="Salvar alterações"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
