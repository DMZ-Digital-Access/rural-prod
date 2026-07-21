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
import { useAnimais } from "@/hooks/useAnimais"
import { useEspecies } from "@/hooks/useEspecies"
import { useRegistrarSaidaAnimaisIndividuais } from "@/hooks/useTransacoes"
import {
  saidaAnimaisIndividuaisSchema,
  type SaidaAnimaisIndividuaisFormValues,
} from "@/lib/validations/transacoes"
import { animalPendenteIndividualizacao } from "@/lib/types/rebanho"

const hojeISO = () => new Date().toISOString().slice(0, 10)

const outraParteLabels: Record<"venda" | "obito" | "consumo", string> = {
  venda: "Comprador",
  obito: "Observação (opcional)",
  consumo: "Observação (opcional)",
}

/**
 * Venda/Óbito/Consumo (ADR-0004/0005/0006) — diferente da entrada agregada,
 * aqui o usuário escolhe QUAIS animais já cadastrados participam da
 * operação (só animais ativos e já individualizados — vender/matar/
 * consumir um animal pendente, sem idade/peso reais, não faz sentido e a
 * RPC rejeita). O agrupamento etário/sexo de cada animal é calculado
 * automaticamente pelo backend a partir da data de nascimento real — não é
 * pedido no formulário.
 */
export function SaidaAnimaisIndividuaisForm({
  fazendaId,
  tipoOperacao,
  onSuccess,
}: {
  fazendaId: string | undefined
  tipoOperacao: "venda" | "obito" | "consumo"
  onSuccess: () => void
}) {
  const especiesQuery = useEspecies()
  const animaisQuery = useAnimais(fazendaId)
  const registrar = useRegistrarSaidaAnimaisIndividuais(fazendaId)

  const especieBovinos = especiesQuery.data?.find((e) => e.nome === "Bovinos")

  const animaisDisponiveis = (animaisQuery.data ?? []).filter(
    (a) => a.status === "ativo" && !animalPendenteIndividualizacao(a)
  )

  const form = useForm<SaidaAnimaisIndividuaisFormValues>({
    resolver: zodResolver(saidaAnimaisIndividuaisSchema),
    defaultValues: {
      tipo_operacao: tipoOperacao,
      especie_id: "",
      outra_parte: "",
      data_operacao: hojeISO(),
      animal_ids: [],
      valor_nota: null,
      peso_total_kg: null,
    },
  })

  // O catálogo de espécies carrega de forma assíncrona — popula especie_id
  // assim que "Bovinos" resolver (única espécie do Eixo 1 hoje, sem seletor
  // visível aqui). tipo_operacao também é sincronizado se o usuário trocar
  // a operação no seletor do dialog pai sem fechar/reabrir este formulário.
  useEffect(() => {
    if (especieBovinos) {
      form.setValue("especie_id", especieBovinos.id)
    }
  }, [especieBovinos, form])

  useEffect(() => {
    form.setValue("tipo_operacao", tipoOperacao)
  }, [tipoOperacao, form])

  async function onSubmit(values: SaidaAnimaisIndividuaisFormValues) {
    try {
      await registrar.mutateAsync(values)
      toast.success("Operação registrada. Status dos animais e saldo já atualizados.")
      form.reset()
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
          name="animal_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Animais ({field.value.length} selecionado
                {field.value.length === 1 ? "" : "s"})
              </FormLabel>
              <FormControl>
                <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-2">
                  {animaisQuery.isLoading && (
                    <p className="p-2 text-sm text-muted-foreground">
                      Carregando animais…
                    </p>
                  )}
                  {!animaisQuery.isLoading && animaisDisponiveis.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">
                      Nenhum animal ativo e já individualizado disponível.
                    </p>
                  )}
                  {animaisDisponiveis.map((animal) => {
                    const selecionado = field.value.includes(animal.id)
                    return (
                      <label
                        key={animal.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={selecionado}
                          onChange={(e) => {
                            field.onChange(
                              e.target.checked
                                ? [...field.value, animal.id]
                                : field.value.filter((id) => id !== animal.id)
                            )
                          }}
                        />
                        <span className="font-medium">{animal.identificacao}</span>
                        <span className="text-muted-foreground">
                          {animal.categoria} ·{" "}
                          {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
