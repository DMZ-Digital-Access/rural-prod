import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoteSelectField } from "@/components/rebanho/LoteSelectField"
import { editarAnimalSchema, type EditarAnimalFormValues } from "@/lib/validations/animais"
import { useAtualizarAnimal } from "@/hooks/useAnimais"
import {
  animalPendenteIndividualizacao,
  type AnimalComDetalhes,
  type LoteComEstatisticas,
} from "@/lib/types/rebanho"

const statusOptions: { value: EditarAnimalFormValues["status"]; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "venda", label: "Vendido" },
  { value: "morte", label: "Morte" },
  { value: "baixa", label: "Baixa" },
]

const statusLabels = Object.fromEntries(
  statusOptions.map((opt) => [opt.value, opt.label])
) as Record<EditarAnimalFormValues["status"], string>

const hojeISO = () => new Date().toISOString().slice(0, 10)

export function EditarAnimalDialog({
  animal,
  lotes,
}: {
  animal: AnimalComDetalhes
  lotes: LoteComEstatisticas[]
}) {
  const [open, setOpen] = useState(false)
  const atualizarAnimal = useAtualizarAnimal(animal.id)

  const pendente = animalPendenteIndividualizacao(animal)

  const form = useForm<EditarAnimalFormValues>({
    resolver: zodResolver(editarAnimalSchema),
    defaultValues: {
      identificacao: animal.identificacao,
      lote_id: animal.lote_id,
      status: animal.status,
      data_nascimento: animal.data_nascimento,
      peso_inicial_kg: animal.peso_inicial_kg,
    },
  })

  // Sincroniza o form se o animal exibido mudar (ex.: reabrir o dialog para
  // outra linha da tabela sem desmontar o componente pai).
  useEffect(() => {
    if (open) {
      form.reset({
        identificacao: animal.identificacao,
        lote_id: animal.lote_id,
        status: animal.status,
        data_nascimento: animal.data_nascimento,
        peso_inicial_kg: animal.peso_inicial_kg,
      })
    }
  }, [open, animal, form])

  async function onSubmit(values: EditarAnimalFormValues) {
    try {
      await atualizarAnimal.mutateAsync(values)
      toast.success("Animal atualizado com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar animal."
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Editar animal">
            <PencilIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar animal</DialogTitle>
          <DialogDescription>
            Identificação, lote e status podem ser alterados aqui. Peso atual
            e GMD são calculados a partir das pesagens.
          </DialogDescription>
        </DialogHeader>

        {pendente && (
          <p className="rounded-lg border border-amber-600/20 bg-amber-600/10 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
            Este animal está pendente de individualização — preencha a data de
            nascimento e o peso inicial para completar o cadastro.
          </p>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="identificacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Identificação</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lote_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lote</FormLabel>
                  <LoteSelectField
                    lotes={lotes}
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        {/* Base UI só resolve o rótulo do SelectItem depois
                            que o popup abre uma vez — render-prop evita
                            depender disso (mesmo padrão de DashboardPage). */}
                        <SelectValue>
                          {(value: EditarAnimalFormValues["status"]) =>
                            statusLabels[value]
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="data_nascimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de nascimento</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        max={hojeISO()}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? null : e.target.value)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="peso_inicial_kg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso inicial (kg)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        inputMode="decimal"
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? null : e.target.valueAsNumber
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Salvando…" : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
