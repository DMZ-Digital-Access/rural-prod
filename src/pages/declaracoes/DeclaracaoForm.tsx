import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEspecies } from "@/hooks/useEspecies"
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
 * Formulário de declaração anual — compartilhado entre criação (espécie/ano
 * editáveis) e edição (espécie/ano desabilitados, `bloquearIdentidade`
 * true — só quantidade/data de referência são corrigíveis, ver
 * validations/declaracoes.ts).
 */
export function DeclaracaoForm({
  defaultValues,
  bloquearIdentidade = false,
  onSubmit,
  submitLabel,
}: {
  defaultValues: DeclaracaoRebanhoFormValues
  bloquearIdentidade?: boolean
  onSubmit: (values: DeclaracaoRebanhoFormValues) => Promise<void>
  submitLabel: string
}) {
  const especiesQuery = useEspecies()

  const form = useForm<DeclaracaoRebanhoFormValues>({
    resolver: zodResolver(declaracaoRebanhoSchema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="especie_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Espécie</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={bloquearIdentidade}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => especiesQuery.data?.find((e) => e.id === v)?.nome ?? ""}
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
            name="ano_referencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ano de referência</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    inputMode="numeric"
                    disabled={bloquearIdentidade}
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <FormField
            control={form.control}
            name="quantidade_declarada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade declarada</FormLabel>
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
                      field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
