import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useCriarGta } from "@/hooks/useGtas"
import { GtaForm } from "@/pages/gtas/GtaForm"
import type { GtaFormValues } from "@/lib/validations/gtas"

const valoresIniciais: GtaFormValues = {
  numero_gta: "",
  municipio_origem: "",
  origem: "",
  municipio_destino: "",
  destino: "",
  especie_id: "",
  quantidade_animais: undefined as unknown as number,
  status_liberacao: "pendente",
  data_liberacao: null,
  transacao_id: null,
}

export function CriarGtaDialog({ fazendaId }: { fazendaId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const criarGta = useCriarGta(fazendaId)

  async function onSubmit(values: GtaFormValues) {
    try {
      await criarGta.mutateAsync(values)
      toast.success("GTA cadastrada com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar GTA.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Nova GTA
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova GTA</DialogTitle>
          <DialogDescription>
            O documento original (PDF ou imagem) pode ser enviado depois, na tela de detalhes.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <GtaForm
            fazendaId={fazendaId}
            defaultValues={valoresIniciais}
            onSubmit={onSubmit}
            submitLabel="Cadastrar GTA"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
