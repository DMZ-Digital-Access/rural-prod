import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEspecies } from "@/hooks/useEspecies"
import { useTransacoesParaVincular } from "@/hooks/useGtas"
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
import { gtaSchema, type GtaFormValues } from "@/lib/validations/gtas"

const statusLabels: Record<GtaFormValues["status_liberacao"], string> = {
  pendente: "Pendente",
  liberada: "Liberada",
}

const SEM_TRANSACAO = "__nenhuma__"

const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * Formulário de GTA compartilhado entre criação (`CriarGtaDialog`, dentro de
 * um Dialog) e edição (`GtaDetailPage`, inline, mesmo padrão de "completar
 * dados" já usado em `TransacaoDetailPage`).
 */
export function GtaForm({
  fazendaId,
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  fazendaId: string | undefined
  defaultValues: GtaFormValues
  onSubmit: (values: GtaFormValues) => Promise<void>
  submitLabel: string
}) {
  const especiesQuery = useEspecies()
  const transacoesQuery = useTransacoesParaVincular(fazendaId)

  const form = useForm<GtaFormValues>({
    resolver: zodResolver(gtaSchema),
    defaultValues,
  })

  const statusLiberacao = form.watch("status_liberacao")

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="numero_gta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número da GTA</FormLabel>
              <FormControl>
                <Input placeholder="Ex.: AE-699057" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="municipio_origem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Município de origem</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="origem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Propriedade de origem</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="municipio_destino"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Município de destino</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="destino"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Propriedade de destino</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="especie_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Espécie</FormLabel>
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
            name="quantidade_animais"
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="status_liberacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status de liberação</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: GtaFormValues["status_liberacao"]) => statusLabels[v]}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(statusLabels) as GtaFormValues["status_liberacao"][]).map(
                      (status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabels[status]}
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
            name="data_liberacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Data de liberação
                  {statusLiberacao !== "liberada" && " (opcional)"}
                </FormLabel>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="transacao_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Transação vinculada (opcional)</FormLabel>
                <Select
                  value={field.value ?? SEM_TRANSACAO}
                  onValueChange={(v) => field.onChange(v === SEM_TRANSACAO ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => {
                          if (v === SEM_TRANSACAO) return "Nenhuma"
                          const t = transacoesQuery.data?.find((tr) => tr.id === v)
                          return t
                            ? `${t.outra_parte} — ${new Date(`${t.data_operacao}T00:00:00`).toLocaleDateString("pt-BR")}`
                            : "Nenhuma"
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_TRANSACAO}>Nenhuma</SelectItem>
                    {transacoesQuery.data?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.outra_parte} —{" "}
                        {new Date(`${t.data_operacao}T00:00:00`).toLocaleDateString("pt-BR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
