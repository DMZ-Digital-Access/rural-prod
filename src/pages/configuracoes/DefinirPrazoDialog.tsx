import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useDefinirPrazoDeclaracao } from "@/hooks/useEstadoFazenda"
import type { PrazoDeclaracaoEstado } from "@/lib/types/declaracoes"

const anoAtual = () => new Date().getFullYear()

const prazoSchema = z
  .object({
    ano_referencia: z
      .number({ error: "Informe o ano" })
      .int()
      .min(2000, "Ano inválido")
      .max(anoAtual() + 3, "Ano não pode ser tão distante no futuro"),
    data_inicio_prazo: z.string().min(1, "Informe a data de início"),
    data_fim_prazo: z.string().min(1, "Informe a data de fim"),
  })
  .refine((v) => v.data_fim_prazo > v.data_inicio_prazo, {
    message: "A data de fim precisa ser depois da data de início",
    path: ["data_fim_prazo"],
  })

type PrazoFormValues = z.infer<typeof prazoSchema>

/**
 * Cadastra ou corrige o prazo de um (estado, ano) — spec seção 5.3.
 * `definir_prazo_declaracao_estado()` faz upsert por (estado,
 * ano_referencia), então esta mesma chamada serve pra "novo prazo" e pra
 * "editar prazo existente". `ano_referencia` trava na edição (mudar o ano
 * miraria numa linha diferente do upsert, não corrigiria a atual).
 */
export function DefinirPrazoDialog({
  estado,
  prazoExistente,
}: {
  estado: string
  prazoExistente?: PrazoDeclaracaoEstado
}) {
  const [open, setOpen] = useState(false)
  const definirPrazo = useDefinirPrazoDeclaracao()

  const form = useForm<PrazoFormValues>({
    resolver: zodResolver(prazoSchema),
    defaultValues: prazoExistente
      ? {
          ano_referencia: prazoExistente.ano_referencia,
          data_inicio_prazo: prazoExistente.data_inicio_prazo,
          data_fim_prazo: prazoExistente.data_fim_prazo,
        }
      : {
          ano_referencia: anoAtual(),
          data_inicio_prazo: "",
          data_fim_prazo: "",
        },
  })

  async function onSubmit(values: PrazoFormValues) {
    try {
      await definirPrazo.mutateAsync({ estado, ...values })
      toast.success("Prazo salvo com sucesso.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar prazo.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={prazoExistente ? "outline" : "default"} size="sm" />}>
        {prazoExistente ? <PencilIcon /> : <PlusIcon />}
        {prazoExistente ? "Editar" : "Novo prazo"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {prazoExistente ? "Editar prazo" : "Novo prazo"} — {estado}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
                      disabled={!!prazoExistente}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="data_inicio_prazo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início do prazo</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_fim_prazo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fim do prazo</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
