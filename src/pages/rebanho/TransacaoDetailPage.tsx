import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useParams } from "react-router-dom"
import { ArrowLeftIcon, FileTextIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useEspecies } from "@/hooks/useEspecies"
import {
  useAbrirDocumentoTransacao,
  useAtualizarTransacao,
  useGtasDaTransacao,
  useTransacao,
  useTransacaoDetalhe,
  useTransacaoTemVinculoIndividual,
  useUploadDocumentoTransacao,
  type TipoDocumentoTransacao,
} from "@/hooks/useTransacoes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Textarea } from "@/components/ui/textarea"
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
import { TipoOperacaoBadge } from "@/components/rebanho/TipoOperacaoBadge"
import { StatusGtaBadge } from "@/components/rebanho/StatusGtaBadge"
import { StatusLiberacaoGtaBadge } from "@/components/rebanho/StatusLiberacaoGtaBadge"
import {
  atualizarTransacaoSchema,
  type AtualizarTransacaoFormValues,
} from "@/lib/validations/transacoes"
import type { Transacao } from "@/lib/types/rebanho"

const statusGtaLabels: Record<Transacao["status_gta_transacao"], string> = {
  despendenciada: "GTA em dia",
  pendente: "GTA pendente",
  n_a: "Não aplicável",
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function DocumentoField({
  label,
  caminho,
  disabled,
  onUpload,
  enviando,
}: {
  label: string
  caminho: string | null
  disabled: boolean
  onUpload: (arquivo: File) => void
  enviando: boolean
}) {
  const abrirDocumento = useAbrirDocumentoTransacao()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge
          variant="outline"
          className={
            caminho
              ? "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400"
              : "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
          }
        >
          {caminho ? "Presente" : "Pendente"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {caminho && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={abrirDocumento.isPending}
            onClick={async () => {
              try {
                const url = await abrirDocumento.mutateAsync(caminho)
                window.open(url, "_blank", "noopener,noreferrer")
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Erro ao abrir documento."
                )
              }
            }}
          >
            <FileTextIcon />
            Ver documento
          </Button>
        )}

        {!disabled && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0]
                if (arquivo) onUpload(arquivo)
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              {enviando ? "Enviando…" : caminho ? "Substituir" : "Enviar"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function TransacaoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const transacaoQuery = useTransacao(id)
  const detalheQuery = useTransacaoDetalhe(id)
  const gtasQuery = useGtasDaTransacao(id)
  const temVinculoIndividualQuery = useTransacaoTemVinculoIndividual(id)
  const atualizarTransacao = useAtualizarTransacao(id ?? "")
  const uploadDocumento = useUploadDocumentoTransacao(fazenda?.fazenda_id, id ?? "")
  const [enviando, setEnviando] = useState<TipoDocumentoTransacao | null>(null)

  const especiesQuery = useEspecies()
  const transacao = transacaoQuery.data
  const temVinculoIndividual = temVinculoIndividualQuery.data ?? false

  const form = useForm<AtualizarTransacaoFormValues>({
    resolver: zodResolver(atualizarTransacaoSchema),
    defaultValues: {
      outra_parte: "",
      data_operacao: "",
      especie_id: "",
      quantidade_machos: undefined as unknown as number,
      quantidade_femeas: undefined as unknown as number,
      numero_nota: "",
      valor_nota: null,
      peso_total_kg: null,
      status_gta_transacao: "n_a",
      observacoes: "",
    },
  })

  // `values` do useForm troca de undefined -> objeto real assim que a
  // transação carrega, o que faz o Select (Base UI) trocar de
  // não-controlado para controlado e travar sem valor exibido (mesmo
  // problema já visto em SaidaAnimaisIndividuaisForm/EntradaAgregadaForm) —
  // por isso o reset explícito aqui em vez da opção `values`. Machos/fêmeas
  // vêm da soma de transacoes_detalhe (não de quantidade_animais direto) —
  // é a fonte que a RPC atualizar_entrada_saida_lote realmente ressincroniza
  // (ver hook useAtualizarTransacao).
  useEffect(() => {
    if (!transacao || !detalheQuery.data) return
    const machos = detalheQuery.data
      .filter((linha) => linha.sexo === "macho")
      .reduce((soma, linha) => soma + linha.quantidade, 0)
    const femeas = detalheQuery.data
      .filter((linha) => linha.sexo === "femea")
      .reduce((soma, linha) => soma + linha.quantidade, 0)

    form.reset({
      outra_parte: transacao.outra_parte,
      data_operacao: transacao.data_operacao,
      especie_id: transacao.especie_id,
      quantidade_machos: machos,
      quantidade_femeas: femeas,
      numero_nota: transacao.numero_nota ?? "",
      valor_nota: transacao.valor_nota,
      peso_total_kg: transacao.peso_total_kg,
      status_gta_transacao: transacao.status_gta_transacao,
      observacoes: transacao.observacoes ?? "",
    })
  }, [transacao, detalheQuery.data, form])

  async function onSubmit(values: AtualizarTransacaoFormValues) {
    try {
      await atualizarTransacao.mutateAsync(values)
      toast.success("Transação atualizada com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar transação.")
    }
  }

  async function handleUpload(tipo: TipoDocumentoTransacao, arquivo: File) {
    setEnviando(tipo)
    try {
      await uploadDocumento.mutateAsync({ tipo, arquivo })
      toast.success("Documento enviado com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar documento.")
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/app/financeiro/transacoes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para Entradas e Saídas
      </Link>

      {transacaoQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando transação…</p>
      )}

      {transacaoQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar transação:{" "}
          {transacaoQuery.error instanceof Error
            ? transacaoQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {transacao && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <TipoOperacaoBadge tipo={transacao.tipo_operacao} />
              <h1 className="text-2xl font-semibold">{transacao.outra_parte}</h1>
            </div>
            <StatusGtaBadge status={transacao.status_gta_transacao} />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="font-medium">{formatData(transacao.data_operacao)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Espécie</p>
              <p className="font-medium">{transacao.especies?.nome ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nº de animais</p>
              <p className="font-medium">{transacao.quantidade_animais}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nº da nota</p>
              <p className="font-medium">{transacao.numero_nota ?? "—"}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-medium">
              GTAs vinculadas
              <span className="ml-1 font-normal text-muted-foreground">
                (uma por caminhão de transporte)
              </span>
            </p>
            {gtasQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            )}
            {gtasQuery.data && gtasQuery.data.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma GTA vinculada ainda.</p>
            )}
            {gtasQuery.data && gtasQuery.data.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {gtasQuery.data.map((gta) => (
                  <Link
                    key={gta.id}
                    to={`/app/rebanho/gtas/${gta.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{gta.numero_gta}</span>
                    <StatusLiberacaoGtaBadge status={gta.status_liberacao} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {detalheQuery.data && detalheQuery.data.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-sm font-medium">Sexo / faixa etária</p>
              <div className="flex flex-wrap gap-2">
                {detalheQuery.data.map((linha) => (
                  <Badge key={linha.id} variant="secondary">
                    {linha.sexo === "macho" ? "Macho" : "Fêmea"} —{" "}
                    {linha.agrupamentos_etarios?.label ?? "Não classificado"}:{" "}
                    {linha.quantidade}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DocumentoField
              label="Nota"
              caminho={transacao.arquivo_nota_path}
              disabled={somenteLeitura}
              enviando={enviando === "nota"}
              onUpload={(arquivo) => handleUpload("nota", arquivo)}
            />
            <DocumentoField
              label="Contranota"
              caminho={transacao.arquivo_contranota_path}
              disabled={somenteLeitura}
              enviando={enviando === "contranota"}
              onUpload={(arquivo) => handleUpload("contranota", arquivo)}
            />
          </div>

          {!somenteLeitura && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-sm font-medium">Editar operação</p>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="flex flex-col gap-4"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="outra_parte"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Outra parte</FormLabel>
                          <FormControl>
                            <Input {...field} />
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
                            <Input
                              type="date"
                              max={new Date().toISOString().slice(0, 10)}
                              {...field}
                            />
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
                              disabled={temVinculoIndividual}
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
                              disabled={temVinculoIndividual}
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
                          {temVinculoIndividual && (
                            <p className="text-xs text-muted-foreground">
                              Vinculada a animais individuais — a quantidade é derivada dos
                              animais selecionados, não editável aqui.
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="numero_nota"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número da nota</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status_gta_transacao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status da GTA</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue>
                                  {(v: Transacao["status_gta_transacao"]) =>
                                    statusGtaLabels[v]
                                  }
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(
                                Object.keys(statusGtaLabels) as Array<
                                  Transacao["status_gta_transacao"]
                                >
                              ).map((status) => (
                                <SelectItem key={status} value={status}>
                                  {statusGtaLabels[status]}
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
                      name="valor_nota"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor da nota</FormLabel>
                          <FormControl>
                            <NumericInput
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
                          <FormLabel>Peso total (kg)</FormLabel>
                          <FormControl>
                            <NumericInput
                              casasDecimais={1}
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

                  <FormField
                    control={form.control}
                    name="observacoes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? "Salvando…" : "Salvar alterações"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </>
      )}
    </div>
  )
}
