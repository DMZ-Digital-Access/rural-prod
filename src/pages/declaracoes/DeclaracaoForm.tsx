import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEspecies } from "@/hooks/useEspecies"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  declaracaoRebanhoSchema,
  type DeclaracaoRebanhoFormValues,
} from "@/lib/validations/declaracoes"

const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * Formulário de declaração anual — compartilhado entre criação (ano
 * editável) e edição (`bloquearAno`, ano desabilitado — corrigir uma
 * declaração é da data de referência/itens, nunca "mudar de ano", que
 * violaria o `unique(fazenda_id, ano_referencia)` do banco). Uma
 * declaração cobre VÁRIAS espécies (pedido de JP, 2026-07-22 — o
 * documento real entregue ao órgão estadual é único por ano) — `itens` é
 * uma lista dinâmica de espécie × quantidade via `useFieldArray`.
 */
export function DeclaracaoForm({
  defaultValues,
  bloquearAno = false,
  onSubmit,
  submitLabel,
}: {
  defaultValues: DeclaracaoRebanhoFormValues
  bloquearAno?: boolean
  onSubmit: (values: DeclaracaoRebanhoFormValues) => Promise<void>
  submitLabel: string
}) {
  const especiesQuery = useEspecies()

  const form = useForm<DeclaracaoRebanhoFormValues>({
    resolver: zodResolver(declaracaoRebanhoSchema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itens",
  })

  const erroItens =
    form.formState.errors.itens?.message ?? form.formState.errors.itens?.root?.message

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="ano_referencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano de referência</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    inputMode="numeric"
                    disabled={bloquearAno}
                    name={field.name}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="data_declaracao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de referência (opcional)</FormLabel>
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
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Espécies declaradas</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ especie_id: "", quantidade_declarada: undefined as unknown as number })
              }
            >
              <PlusIcon />
              Adicionar espécie
            </Button>
          </div>

          {erroItens && <p className="text-sm text-destructive">{erroItens}</p>}

          {fields.map((fieldItem, index) => (
            <div key={fieldItem.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
              <FormField
                control={form.control}
                name={`itens.${index}.especie_id`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && <FormLabel>Espécie</FormLabel>}
                    <Select value={field.value} onValueChange={field.onChange}>
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
                name={`itens.${index}.quantidade_declarada`}
                render={({ field }) => (
                  <FormItem>
                    {index === 0 && <FormLabel>Quantidade</FormLabel>}
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
                            e.target.value === "" ? undefined : e.target.valueAsNumber
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="outline"
                size="icon"
                className={index === 0 ? "mt-6" : undefined}
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                aria-label="Remover espécie"
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
