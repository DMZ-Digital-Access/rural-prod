import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightLeftIcon } from "lucide-react"
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
import { useEspecies } from "@/hooks/useEspecies"
import { useRegistrarEntradaSaidaLote } from "@/hooks/useTransacoes"
import {
  entradaSaidaLoteSchema,
  type EntradaSaidaLoteFormValues,
} from "@/lib/validations/transacoes"
import type { TipoOperacaoTransacao } from "@/lib/types/rebanho"

const hojeISO = () => new Date().toISOString().slice(0, 10)

const tipoOperacaoLabels: Record<
  Extract<TipoOperacaoTransacao, "compra" | "venda" | "nascimento" | "obito" | "consumo">,
  string
> = {
  compra: "Compra",
  venda: "Venda",
  nascimento: "Nascimento",
  obito: "Óbito",
  consumo: "Consumo",
}

// Rótulo do campo "outra parte" varia por tipo de operação (decisão de UI,
// não de schema — ADR-0005 D7 mantém outra_parte como coluna única).
const outraParteLabels: Record<keyof typeof tipoOperacaoLabels, string> = {
  compra: "Vendedor",
  venda: "Comprador",
  nascimento: "Observação (opcional)",
  obito: "Observação (opcional)",
  consumo: "Observação (opcional)",
}

const defaultValues: EntradaSaidaLoteFormValues = {
  tipo_operacao: "compra",
  especie_id: "",
  outra_parte: "",
  data_operacao: hojeISO(),
  quantidade_total: undefined as unknown as number,
  quantidade_machos: 0,
  quantidade_femeas: 0,
  valor_nota: null,
  peso_total_kg: null,
}

export function EntradaSaidaLoteDialog({
  fazendaId,
}: {
  fazendaId: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const especiesQuery = useEspecies()
  const registrar = useRegistrarEntradaSaidaLote(fazendaId)

  const form = useForm<EntradaSaidaLoteFormValues>({
    resolver: zodResolver(entradaSaidaLoteSchema),
    defaultValues,
  })

  const tipoOperacao = form.watch("tipo_operacao")

  async function onSubmit(values: EntradaSaidaLoteFormValues) {
    try {
      await registrar.mutateAsync(values)
      toast.success("Operação registrada. O saldo de rebanho já foi atualizado.")
      form.reset(defaultValues)
      setOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar a operação."
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset(defaultValues)
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <ArrowRightLeftIcon />
            Entradas e Saídas de Animais de Lote
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entradas e Saídas de Animais de Lote</DialogTitle>
          <DialogDescription>
            Lançamento agregado — afeta o saldo de rebanho imediatamente, mesmo
            sem GTA, nota ou contranota. Os animais podem ser individualizados
            depois em "Individualizar Animal".
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="tipo_operacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de operação</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(tipoOperacaoLabels) as (keyof typeof tipoOperacaoLabels)[]).map(
                        (tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {tipoOperacaoLabels[tipo]}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="especie_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de animal</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a espécie" />
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
                      <Input
                        type="number"
                        step="0.01"
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

              <FormField
                control={form.control}
                name="peso_total_kg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Peso total, kg (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
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
                {form.formState.isSubmitting ? "Registrando…" : "Registrar operação"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
