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
import { useEspecies } from "@/hooks/useEspecies"
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

/**
 * Subtrai N meses de uma data ISO (YYYY-MM-DD), retornando outra data ISO —
 * usado para calcular uma data_nascimento aproximada a partir da idade
 * informada na aquisição (2026-07-23: alternativa a digitar uma data exata,
 * que muitas vezes não é conhecida em animais comprados). `setMonth` do
 * Date nativo já rola o mês/ano corretamente sem lib extra.
 */
function subtrairMeses(dataIso: string, meses: number): string {
  const data = new Date(`${dataIso}T00:00:00`)
  data.setMonth(data.getMonth() - meses)
  return data.toISOString().slice(0, 10)
}

function formatDataOrigem(dataIso: string | null) {
  if (!dataIso) return "—"
  return new Date(`${dataIso}T00:00:00`).toLocaleDateString("pt-BR")
}

type ModoIdade = "data_exata" | "idade_aproximada"

export function EditarAnimalDialog({
  animal,
  lotes,
}: {
  animal: AnimalComDetalhes
  lotes: LoteComEstatisticas[]
}) {
  const [open, setOpen] = useState(false)
  const [modoIdade, setModoIdade] = useState<ModoIdade>("data_exata")
  const atualizarAnimal = useAtualizarAnimal(animal.id)
  const especiesQuery = useEspecies()

  const pendente = animalPendenteIndividualizacao(animal)
  const temOrigemRastreada = animal.origem_data_operacao !== null

  const form = useForm<EditarAnimalFormValues>({
    resolver: zodResolver(editarAnimalSchema),
    defaultValues: {
      identificacao: animal.identificacao,
      lote_id: animal.lote_id,
      status: animal.status,
      data_nascimento: animal.data_nascimento,
      peso_inicial_kg: animal.peso_inicial_kg,
      especie_id: animal.especie_id,
      idade_meses_aquisicao: animal.idade_meses_aquisicao,
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
        especie_id: animal.especie_id,
        idade_meses_aquisicao: animal.idade_meses_aquisicao,
      })
      setModoIdade("data_exata")
    }
  }, [open, animal, form])

  async function onSubmit(values: EditarAnimalFormValues) {
    try {
      const payload = { ...values }
      if (
        modoIdade === "idade_aproximada" &&
        values.idade_meses_aquisicao !== null &&
        animal.origem_data_operacao
      ) {
        payload.data_nascimento = subtrairMeses(
          animal.origem_data_operacao,
          values.idade_meses_aquisicao
        )
      }
      await atualizarAnimal.mutateAsync(payload)
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
              name="especie_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de animal</FormLabel>
                  <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(v: string) =>
                            especiesQuery.data?.find((e) => e.id === v)?.nome ?? ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {especiesQuery.data?.map((especie) => (
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

            {temOrigemRastreada && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Idade / data de nascimento</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={modoIdade === "data_exata" ? "default" : "outline"}
                    onClick={() => setModoIdade("data_exata")}
                  >
                    Data exata
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={modoIdade === "idade_aproximada" ? "default" : "outline"}
                    onClick={() => setModoIdade("idade_aproximada")}
                  >
                    Idade aproximada na compra
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {modoIdade === "data_exata" || !temOrigemRastreada ? (
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
              ) : (
                <FormField
                  control={form.control}
                  name="idade_meses_aquisicao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Idade (meses) em {formatDataOrigem(animal.origem_data_operacao)}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
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
                      {field.value !== null &&
                        field.value !== undefined &&
                        animal.origem_data_operacao && (
                          <p className="text-xs text-muted-foreground">
                            Data de nascimento calculada:{" "}
                            {formatDataOrigem(
                              subtrairMeses(animal.origem_data_operacao, field.value)
                            )}
                          </p>
                        )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
