import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { useTransacoesParaVincular } from "@/hooks/useGtas"
import { supabase } from "@/lib/supabase"
import {
  arquivoParaBase64,
  TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES,
  TIPOS_ARQUIVO_DOCUMENTO_ACEITOS,
} from "@/lib/arquivoDocumento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
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
  lancamentoFinanceiroSchema,
  type LancamentoFinanceiroFormValues,
} from "@/lib/validations/financeiro"
import type { TipoLancamento } from "@/lib/types/financeiro"

type CamposExtraidos = {
  tipo: TipoLancamento
  categoria: string | null
  descricao: string | null
  data_lancamento: string | null
  valor: number | null
  numero_nota: string | null
  contraparte: string | null
}

const tipoLabels: Record<TipoLancamento, string> = {
  receita: "Receita",
  despesa: "Despesa",
}

const SEM_TRANSACAO = "__nenhuma__"
const PAGO_SIM = "sim"
const PAGO_NAO = "nao"

const hojeISO = () => new Date().toISOString().slice(0, 10)

/**
 * Formulário de lançamento financeiro compartilhado entre criação
 * (`CriarLancamentoDialog`, dentro de um Dialog) e edição
 * (`LancamentoDetailPage`, inline) — mesmo padrão de `GtaForm`.
 */
export function LancamentoForm({
  fazendaId,
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  fazendaId: string | undefined
  defaultValues: LancamentoFinanceiroFormValues
  onSubmit: (values: LancamentoFinanceiroFormValues) => Promise<void>
  submitLabel: string
}) {
  const transacoesQuery = useTransacoesParaVincular(fazendaId)
  const [extraindo, setExtraindo] = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  const form = useForm<LancamentoFinanceiroFormValues>({
    resolver: zodResolver(lancamentoFinanceiroSchema),
    defaultValues,
  })

  const pago = form.watch("pago")

  async function handleUploadDocumento(arquivo: File) {
    if (!fazendaId) return
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES) {
      toast.error("Arquivo excede o tamanho máximo permitido (10MB).")
      return
    }

    setExtraindo(true)
    try {
      const base64 = await arquivoParaBase64(arquivo)
      const { data, error } = await supabase.functions.invoke("classificar-documento", {
        body: { fazenda_id: fazendaId, mime_type: arquivo.type, arquivo_base64: base64 },
      })

      if (error) {
        let mensagem = error.message
        try {
          const contexto = (error as { context?: Response }).context
          const corpo = await contexto?.clone().json()
          if (corpo?.error) mensagem = corpo.error
        } catch {
          // sem corpo JSON legível — mantém error.message
        }
        throw new Error(mensagem)
      }

      const campos = data.campos as CamposExtraidos
      form.setValue("tipo", campos.tipo)
      if (campos.categoria) form.setValue("categoria", campos.categoria)
      if (campos.descricao) form.setValue("descricao", campos.descricao)
      if (campos.data_lancamento) form.setValue("data_lancamento", campos.data_lancamento)
      if (campos.valor !== null) form.setValue("valor", campos.valor)
      if (campos.numero_nota) form.setValue("numero_nota", campos.numero_nota)
      if (campos.contraparte) form.setValue("contraparte", campos.contraparte)

      toast.success("Documento lido — revise os campos antes de salvar.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao ler documento.")
    } finally {
      setExtraindo(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <input
            ref={inputArquivoRef}
            type="file"
            accept={TIPOS_ARQUIVO_DOCUMENTO_ACEITOS}
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              if (arquivo) handleUploadDocumento(arquivo)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={extraindo || !fazendaId}
            onClick={() => inputArquivoRef.current?.click()}
          >
            <SparklesIcon />
            {extraindo ? "Lendo documento…" : "Enviar documento (nota, boleto, recibo)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            A IA pré-preenche os campos abaixo a partir do documento — revise e edite antes de
            salvar. Nada é gravado automaticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: TipoLancamento) => tipoLabels[v]}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(Object.keys(tipoLabels) as TipoLancamento[]).map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipoLabels[tipo]}
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
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: Insumos, Combustível, Impostos" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="data_lancamento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do lançamento</FormLabel>
                <FormControl>
                  <Input type="date" max={hojeISO()} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="valor"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor</FormLabel>
                <FormControl>
                  <NumericInput
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? undefined)}
                    onBlur={field.onBlur}
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
            name="numero_nota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número da nota (opcional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contraparte"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contraparte (opcional)</FormLabel>
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
            name="pago"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pago</FormLabel>
                <Select
                  value={field.value ? PAGO_SIM : PAGO_NAO}
                  onValueChange={(v) => {
                    const novoPago = v === PAGO_SIM
                    field.onChange(novoPago)
                    if (!novoPago) form.setValue("data_pagamento", null)
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => (v === PAGO_SIM ? "Sim" : "Não")}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={PAGO_NAO}>Não</SelectItem>
                    <SelectItem value={PAGO_SIM}>Sim</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {pago && (
            <FormField
              control={form.control}
              name="data_pagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do pagamento</FormLabel>
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
          )}
        </div>

        <FormField
          control={form.control}
          name="transacao_animal_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Transação de animal vinculada (opcional)</FormLabel>
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
              <p className="text-xs text-muted-foreground">
                Vincular evita contar esta operação duas vezes na visão de fluxo de caixa.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
