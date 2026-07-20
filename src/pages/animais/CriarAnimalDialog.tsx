import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
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
import { criarAnimalSchema, type CriarAnimalFormValues } from "@/lib/validations/animais"
import { useCriarAnimal } from "@/hooks/useAnimais"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

export function CriarAnimalDialog({
  fazendaId,
  lotes,
}: {
  fazendaId: string | undefined
  lotes: LoteComEstatisticas[]
}) {
  const [open, setOpen] = useState(false)
  const criarAnimal = useCriarAnimal(fazendaId)

  const form = useForm<CriarAnimalFormValues>({
    resolver: zodResolver(criarAnimalSchema),
    defaultValues: {
      identificacao: "",
      data_nascimento: "",
      sexo: "macho",
      peso_inicial_kg: undefined as unknown as number,
      lote_id: null,
    },
  })

  async function onSubmit(values: CriarAnimalFormValues) {
    try {
      await criarAnimal.mutateAsync(values)
      toast.success("Animal cadastrado com sucesso.")
      form.reset({
        identificacao: "",
        data_nascimento: "",
        sexo: "macho",
        peso_inicial_kg: undefined as unknown as number,
        lote_id: null,
      })
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao cadastrar animal."
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset()
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon />
            Individualizar Animal
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Individualizar Animal</DialogTitle>
          <DialogDescription>
            Cadastre o registro individual de um animal já contabilizado no
            saldo do rebanho (via Entradas e Saídas de Animais de Lote).
          </DialogDescription>
        </DialogHeader>

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
                    <Input placeholder="Ex.: BR-0231" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_nascimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de nascimento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sexo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sexo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="macho">Macho</SelectItem>
                      <SelectItem value="femea">Fêmea</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="peso_inicial_kg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Peso de hoje (kg)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      inputMode="decimal"
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
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

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Salvando…" : "Cadastrar animal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
