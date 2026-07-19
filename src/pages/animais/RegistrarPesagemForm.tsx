import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { pesagemSchema, type PesagemFormValues } from "@/lib/validations/pesagens"
import { useRegistrarPesagem } from "@/hooks/usePesagens"

const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * Formulário de registro de pesagem — SEMPRE via RPC `registrar_pesagem`
 * (migration da Fase 2, seção 4/5.2). Só coleta data + peso; quem decide se
 * o resultado é uma correção do registro mais recente ou um novo registro
 * histórico é o backend — este formulário só informa o resultado via toast,
 * sem tentar adivinhar o comportamento antes da resposta.
 */
export function RegistrarPesagemForm({ animalId }: { animalId: string }) {
  const registrarPesagem = useRegistrarPesagem(animalId)

  const form = useForm<PesagemFormValues>({
    resolver: zodResolver(pesagemSchema),
    defaultValues: { data_evento: hojeISO(), peso_kg: undefined as unknown as number },
  })

  async function onSubmit(values: PesagemFormValues) {
    try {
      await registrarPesagem.mutateAsync(values)
      toast.success(
        "Pesagem registrada. Se a data estiver a até 2 dias da pesagem mais recente, o registro anterior foi corrigido em vez de criar um novo."
      )
      form.reset({ data_evento: hojeISO(), peso_kg: undefined as unknown as number })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar pesagem."
      )
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4 sm:flex-row sm:items-end"
      >
        <FormField
          control={form.control}
          name="data_evento"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Data</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="peso_kg"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Peso (kg)</FormLabel>
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

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Registrando…" : "Registrar pesagem"}
        </Button>
      </form>
    </Form>
  )
}
