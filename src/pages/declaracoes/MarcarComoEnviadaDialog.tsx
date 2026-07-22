import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SendIcon, UploadIcon } from "lucide-react"
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
import { useMarcarComoEnviada } from "@/hooks/useDeclaracoesRebanho"
import { TIPOS_ARQUIVO_DOCUMENTO_ACEITOS } from "@/lib/arquivoDocumento"
import {
  marcarComoEnviadaSchema,
  type MarcarComoEnviadaFormValues,
} from "@/lib/validations/declaracoes"

const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * "Marcar como enviada" (spec seção 5.2) — data de envio + upload opcional
 * do PDF/imagem da declaração protocolada. Upload é opcional porque nem
 * toda declaração do histórico do produtor necessariamente terá o
 * comprovante digitalizado disponível (mesmo raciocínio já usado pra GTAs).
 */
export function MarcarComoEnviadaDialog({
  declaracaoId,
  fazendaId,
}: {
  declaracaoId: string
  fazendaId: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const marcarComoEnviada = useMarcarComoEnviada(declaracaoId, fazendaId)

  const form = useForm<MarcarComoEnviadaFormValues>({
    resolver: zodResolver(marcarComoEnviadaSchema),
    defaultValues: { data_envio: hojeISO() },
  })

  async function onSubmit(values: MarcarComoEnviadaFormValues) {
    try {
      await marcarComoEnviada.mutateAsync({ values, arquivo })
      toast.success("Declaração marcada como enviada.")
      setOpen(false)
      setArquivo(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao marcar como enviada.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setArquivo(null)
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <SendIcon />
        Marcar como enviada
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar declaração como enviada</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="data_envio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de envio</FormLabel>
                  <FormControl>
                    <Input type="date" max={hojeISO()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Comprovante (opcional)</label>
              <input
                ref={inputRef}
                type="file"
                accept={TIPOS_ARQUIVO_DOCUMENTO_ACEITOS}
                className="hidden"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <UploadIcon />
                {arquivo ? arquivo.name : "Selecionar arquivo"}
              </Button>
            </div>

            <div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Salvando…" : "Confirmar envio"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
