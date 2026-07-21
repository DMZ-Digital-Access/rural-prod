import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { DialogFooter } from "@/components/ui/dialog"
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
import { useEspecies } from "@/hooks/useEspecies"
import { useRegistrarEntradaSaidaLote } from "@/hooks/useTransacoes"
import {
  entradaSaidaLoteSchema,
  type EntradaSaidaLoteFormValues,
} from "@/lib/validations/transacoes"

const hojeISO = () => new Date().toISOString().slice(0, 10)

const outraParteLabels: Record<"compra" | "nascimento", string> = {
  compra: "Vendedor",
  nascimento: "Observação (opcional)",
}

function defaultValues(tipoOperacao: "compra" | "nascimento"): EntradaSaidaLoteFormValues {
  return {
    tipo_operacao: tipoOperacao,
    especie_id: "",
    outra_parte: "",
    data_operacao: hojeISO(),
    quantidade_total: undefined as unknown as number,
    quantidade_machos: 0,
    quantidade_femeas: 0,
    valor_nota: null,
    peso_total_kg: null,
  }
}

/**
 * Compra/Nascimento (ADR-0005/0006) — lançamento agregado, sem escolher
 * animais específicos: cria N registros pendentes de individualização em
 * `animais` automaticamente (identificação {TIPO}-{DATA}-{NNN}).
 */
export function EntradaAgregadaForm({
  fazendaId,
  tipoOperacao,
  onSuccess,
}: {
  fazendaId: string | undefined
  tipoOperacao: "compra" | "nascimento"
  onSuccess: () => void
}) {
  const especiesQuery = useEspecies()
  const registrar = useRegistrarEntradaSaidaLote(fazendaId)

  const form = useForm<EntradaSaidaLoteFormValues>({
    resolver: zodResolver(entradaSaidaLoteSchema),
    defaultValues: defaultValues(tipoOperacao),
  })

  // Troca entre Compra/Nascimento no seletor compartilhado do dialog pai
  // limpa o formulário — contextos diferentes o suficiente para não fazer
  // sentido preservar valores entre um e outro.
  useEffect(() => {
    form.reset(defaultValues(tipoOperacao))
  }, [tipoOperacao, form])

  async function onSubmit(values: EntradaSaidaLoteFormValues) {
    try {
      await registrar.mutateAsync(values)
      toast.success("Operação registrada. O saldo de rebanho já foi atualizado.")
      form.reset(defaultValues(tipoOperacao))
      onSuccess()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar a operação."
      )
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="especie_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de animal</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a espécie">
                      {(value: string) =>
                        especiesQuery.data?.find((e) => e.id === value)?.nome ??
                        "Selecione a espécie"
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(especiesQuery.data ?? []).map((especie) => (
                    <SelectItem key={especie.id} value={especie.id}>
                      {especie.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantidade_total"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de animais</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  inputMode="numeric"
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

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="quantidade_machos"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Machos</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
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
            name="quantidade_femeas"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fêmeas</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    inputMode="numeric"
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
        </div>

        <FormField
          control={form.control}
          name="outra_parte"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{outraParteLabels[tipoOperacao]}</FormLabel>
              <FormControl>
                <Input placeholder="Ex.: Frigorífico Zimmer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="data_operacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data da operação</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="valor_nota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor financeiro (opcional)</FormLabel>
                <FormControl>
                  <NumericInput
                    casasDecimais={2}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="peso_total_kg"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Peso total, kg (opcional)</FormLabel>
                <FormControl>
                  <NumericInput
                    casasDecimais={0}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Registrando…" : "Registrar operação"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
