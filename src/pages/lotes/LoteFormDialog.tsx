import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { loteSchema, type LoteFormValues } from "@/lib/validations/lotes"
import { useAtualizarLote, useCriarLote } from "@/hooks/useLotes"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

const hojeISO = () => new Date().toISOString().slice(0, 10)

type Props =
  | { mode: "criar"; fazendaId: string | undefined; lote?: never }
  | { mode: "editar"; fazendaId?: never; lote: LoteComEstatisticas }

export function LoteFormDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const isEditar = props.mode === "editar"

  const criarLote = useCriarLote(isEditar ? undefined : props.fazendaId)
  const atualizarLote = useAtualizarLote(isEditar ? props.lote.id : "")

  const defaultValues: LoteFormValues = isEditar
    ? {
        nome: props.lote.nome,
        descricao: props.lote.descricao ?? "",
        data_inicio: props.lote.data_inicio,
        data_fim: props.lote.data_fim ?? "",
      }
    : { nome: "", descricao: "", data_inicio: hojeISO(), data_fim: "" }

  const form = useForm<LoteFormValues>({
    resolver: zodResolver(loteSchema),
    defaultValues,
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
    // Reset só deve reagir à abertura do dialog — `defaultValues` é
    // recalculado a cada render a partir de `props.lote`/`props.mode` e
    // incluí-lo aqui reexecutaria o reset a cada digitação (defaultValues
    // é um objeto novo por render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: LoteFormValues) {
    try {
      if (isEditar) {
        await atualizarLote.mutateAsync(values)
        toast.success("Lote atualizado com sucesso.")
      } else {
        await criarLote.mutateAsync(values)
        toast.success("Lote criado com sucesso.")
      }
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar lote."
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEditar ? (
            <Button variant="outline" size="icon-sm" aria-label="Editar lote">
              <PencilIcon />
            </Button>
          ) : (
            <Button>
              <PlusIcon />
              Novo lote
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditar ? "Editar lote" : "Novo lote"}</DialogTitle>
          <DialogDescription>
            {isEditar
              ? "Atualize os dados do lote."
              : "Crie um novo lote de manejo para a fazenda."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Lote de recria 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de início</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_fim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de fim (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
