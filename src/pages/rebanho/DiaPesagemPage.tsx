import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { formatNumero } from "@/lib/format"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useBuscarAnimaisPorIdentificacao,
  type AnimalBusca,
} from "@/hooks/useAnimais"
import {
  useCriarOuObterSessaoPesagem,
  useFinalizarSessaoPesagem,
  useHistoricoSessoesPesagem,
  usePesagensDaSessao,
  useRegistrarPesagemRapida,
  useSessaoPesagemAtiva,
  type PesagemDaSessao,
  type SessaoPesagemHistorico,
} from "@/hooks/usePesagens"
import {
  pesagemRapidaSchema,
  type PesagemRapidaFormValues,
} from "@/lib/validations/pesagens"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

function formatPeso(kg: number) {
  return `${formatNumero(kg, 1)} kg`
}

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Deriva o rótulo de lote da sessão ATIVA a partir dos animais já pesados
 * (pedido de JP, 2026-07-23: "essa análise será feita pelo lote que está
 * registrado em cada animal", sem input do usuário). Mesma regra de
 * "coalesce pro sentinela" já usada em `listar_sessoes_pesagem_finalizadas`
 * no backend — "sem lote" conta como seu próprio grupo distinto, então 1
 * animal sem lote + 1 com Lote X não vira "mesmo lote" por engano.
 */
function calcularLoteLabel(pesagens: PesagemDaSessao[]): string | null {
  if (pesagens.length === 0) return null

  const idsDistintos = new Set(
    pesagens.map((p) => p.animais.lote_id ?? "__sem_lote__")
  )
  if (idsDistintos.size > 1) return "Lotes: Variados"

  const loteId = pesagens[0].animais.lote_id
  if (!loteId) return "Lote: —"
  return `Lote: ${pesagens[0].animais.lotes?.nome ?? "—"}`
}

/**
 * "Dia de Pesagem" (pedido de JP, 2026-07-23) — ferramenta de campo pra
 * pesar muitos animais em sequência rápida: busca por trecho da
 * identificação, peso, registrar, repete. Reaproveita `registrar_pesagem()`
 * (RPC da Fase 2) tal como está — pesar o mesmo animal 2x dentro de 2 dias
 * já vira correção do mesmo registro por conta própria da RPC.
 *
 * Sessão (2026-07-23, migration 20260723150000_sessoes_pesagem.sql): nasce
 * sozinha no 1º peso — cada pesagem já é salva na hora, então mesmo sem
 * clicar em "Pesagem Concluída" nada se perde — e fica em aberto até o
 * usuário concluir, só então virando uma linha na aba Histórico. Só UMA
 * sessão em aberto por fazenda por vez — um segundo usuário vê quem está
 * pesando agora em vez de conseguir começar uma nova
 * (useSessaoPesagemAtiva + bloqueadoPorOutroUsuario).
 *
 * Layout: área de entrada (topo) NUNCA rola — só a lista de baixo (ou o
 * conteúdo da aba Histórico) tem overflow-y-auto. Identificação/Peso lado a
 * lado numa grade de 2 colunas, em qualquer tamanho de tela.
 */
export function DiaPesagemPage() {
  const { user } = useAuth()
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const [tecladoAlfabetico, setTecladoAlfabetico] = useState(false)
  const [sessaoIdAtual, setSessaoIdAtual] = useState<string | null>(null)
  const [confirmarFinal, setConfirmarFinal] = useState(false)
  const [sessaoHistoricoSelecionada, setSessaoHistoricoSelecionada] =
    useState<SessaoPesagemHistorico | null>(null)
  const identificacaoInputRef = useRef<HTMLInputElement | null>(null)
  const pesoInputRef = useRef<HTMLInputElement | null>(null)

  const sessaoAtivaQuery = useSessaoPesagemAtiva(fazenda?.fazenda_id)
  const sessaoAtiva = sessaoAtivaQuery.data ?? null
  const bloqueadoPorOutroUsuario = !!sessaoAtiva && sessaoAtiva.usuario_id !== user?.id

  // Ao carregar (ou reabrir a tela no mesmo dia), se já existe uma sessão
  // ativa MINHA, retoma ela em vez de esperar um novo peso pra criar outra.
  useEffect(() => {
    if (sessaoAtiva && sessaoAtiva.usuario_id === user?.id && !sessaoIdAtual) {
      setSessaoIdAtual(sessaoAtiva.id)
    }
  }, [sessaoAtiva, user?.id, sessaoIdAtual])

  const criarSessao = useCriarOuObterSessaoPesagem(fazenda?.fazenda_id)
  const finalizarSessao = useFinalizarSessaoPesagem(fazenda?.fazenda_id)
  const registrarPesagem = useRegistrarPesagemRapida(fazenda?.fazenda_id)

  const pesagensSessaoQuery = usePesagensDaSessao(sessaoIdAtual)
  const pesagensSessao = pesagensSessaoQuery.data ?? []

  const historicoQuery = useHistoricoSessoesPesagem(fazenda?.fazenda_id)
  const pesagensHistoricoQuery = usePesagensDaSessao(
    sessaoHistoricoSelecionada?.id ?? null
  )

  const form = useForm<PesagemRapidaFormValues>({
    resolver: zodResolver(pesagemRapidaSchema),
    defaultValues: { animal_id: "", identificacao: "", peso_kg: undefined as unknown as number },
  })

  const identificacaoDigitada = form.watch("identificacao")
  const animalIdResolvido = form.watch("animal_id")

  const buscaQuery = useBuscarAnimaisPorIdentificacao(
    fazenda?.fazenda_id,
    animalIdResolvido ? "" : identificacaoDigitada
  )

  const stats = {
    quantidade: pesagensSessao.length,
    pesoTotal: pesagensSessao.reduce((soma, p) => soma + p.peso_kg, 0),
    pesoMedio:
      pesagensSessao.length > 0
        ? pesagensSessao.reduce((soma, p) => soma + p.peso_kg, 0) / pesagensSessao.length
        : 0,
  }
  const loteLabel = calcularLoteLabel(pesagensSessao)

  function selecionarAnimal(animal: AnimalBusca) {
    form.setValue("animal_id", animal.id)
    form.setValue("identificacao", animal.identificacao)
    pesoInputRef.current?.focus()
  }

  async function onSubmit(values: PesagemRapidaFormValues) {
    try {
      let sessaoId = sessaoIdAtual
      if (!sessaoId) {
        const sessao = await criarSessao.mutateAsync()
        sessaoId = sessao.id
        setSessaoIdAtual(sessaoId)
      }
      await registrarPesagem.mutateAsync({
        animal_id: values.animal_id,
        peso_kg: values.peso_kg,
        sessao_pesagem_id: sessaoId,
      })
      toast.success(`Pesagem de ${values.identificacao} registrada.`)
      form.reset({ animal_id: "", identificacao: "", peso_kg: undefined as unknown as number })
      identificacaoInputRef.current?.focus()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar pesagem."
      )
    }
  }

  async function handleFinalizar() {
    if (!sessaoIdAtual) return
    try {
      await finalizarSessao.mutateAsync(sessaoIdAtual)
      toast.success("Pesagem concluída — evento registrado no histórico.")
      setSessaoIdAtual(null)
      setConfirmarFinal(false)
      form.reset({ animal_id: "", identificacao: "", peso_kg: undefined as unknown as number })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao concluir a pesagem."
      )
    }
  }

  if (somenteLeitura) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Dia de Pesagem</h1>
        <p className="text-sm text-muted-foreground">
          O papel financeiro não tem acesso a este módulo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-3">
      <h1 className="shrink-0 text-xl font-semibold">Dia de Pesagem</h1>

      <Tabs defaultValue="pesagem" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="pesagem">Pesagem</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pesagem" className="flex min-h-0 flex-1 flex-col gap-3">
          {bloqueadoPorOutroUsuario ? (
            <p className="rounded-lg border border-amber-600/20 bg-amber-600/10 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
              Existe uma pesagem sendo registrada nesse momento na fazenda{" "}
              {fazenda?.nome}, por {sessaoAtiva?.usuario_nome}.
            </p>
          ) : (
            <>
              <div className="flex shrink-0 flex-col gap-2">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="identificacao"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between gap-1">
                              <FormLabel className="text-xs">Identificação</FormLabel>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-xs"
                                onClick={() => setTecladoAlfabetico((v) => !v)}
                              >
                                {tecladoAlfabetico ? "123" : "ABC"}
                              </Button>
                            </div>
                            <FormControl>
                              <Input
                                {...field}
                                ref={(el) => {
                                  field.ref(el)
                                  identificacaoInputRef.current = el
                                }}
                                inputMode={tecladoAlfabetico ? "text" : "numeric"}
                                autoComplete="off"
                                placeholder="Ex.: 385"
                                className="h-12 text-xl"
                                onChange={(e) => {
                                  field.onChange(e)
                                  if (
                                    form.getValues("animal_id") &&
                                    e.target.value !== field.value
                                  ) {
                                    form.setValue("animal_id", "")
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="peso_kg"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Peso (kg)</FormLabel>
                            <FormControl>
                              <NumericInput
                                casasDecimais={1}
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                ref={(el) => {
                                  pesoInputRef.current = el
                                }}
                                disabled={!animalIdResolvido}
                                className="h-12 text-xl"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!animalIdResolvido &&
                      identificacaoDigitada.trim().length > 0 &&
                      (buscaQuery.data?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1.5">
                          {buscaQuery.data?.map((animal) => (
                            <Button
                              key={animal.id}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => selecionarAnimal(animal)}
                            >
                              {animal.identificacao}
                            </Button>
                          ))}
                        </div>
                      )}

                    {!animalIdResolvido &&
                      identificacaoDigitada.trim().length > 0 &&
                      !buscaQuery.isLoading &&
                      (buscaQuery.data?.length ?? 0) === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum animal ativo encontrado com esse trecho de identificação.
                        </p>
                      )}

                    <Button
                      type="submit"
                      disabled={form.formState.isSubmitting || !animalIdResolvido}
                    >
                      {form.formState.isSubmitting ? "Registrando…" : "Registrar"}
                    </Button>
                  </form>
                </Form>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {loteLabel && <span>{loteLabel}</span>}
                    <span>Animais pesados: {formatNumero(stats.quantidade)}</span>
                    <span>
                      Peso médio: {stats.quantidade > 0 ? formatPeso(stats.pesoMedio) : "—"}
                    </span>
                    <span>
                      Peso total: {stats.quantidade > 0 ? formatPeso(stats.pesoTotal) : "—"}
                    </span>
                  </div>

                  {sessaoIdAtual && stats.quantidade > 0 && (
                    <Dialog open={confirmarFinal} onOpenChange={setConfirmarFinal}>
                      <DialogTrigger
                        render={
                          <Button type="button" variant="outline" size="sm">
                            Pesagem Concluída
                          </Button>
                        }
                      />
                      <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Concluir esta pesagem?</DialogTitle>
                          <DialogDescription>
                            {formatNumero(stats.quantidade)} animal(is) pesado(s) nesta sessão. Depois de
                            concluir, ela vai para o histórico e uma nova pesagem começa do
                            zero. Mesmo sem concluir agora, os pesos já registrados continuam
                            salvos.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="sm:flex-row sm:justify-end">
                          <Button variant="outline" onClick={() => setConfirmarFinal(false)}>
                            Cancelar
                          </Button>
                          <Button
                            disabled={finalizarSessao.isPending}
                            onClick={handleFinalizar}
                          >
                            {finalizarSessao.isPending ? "Concluindo…" : "Concluir"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificação</TableHead>
                      <TableHead>Peso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pesagensSessao.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          Nenhum animal pesado ainda nesta sessão.
                        </TableCell>
                      </TableRow>
                    )}
                    {pesagensSessao.map((pesagem) => (
                      <TableRow key={pesagem.id}>
                        <TableCell>{pesagem.animais.identificacao}</TableCell>
                        <TableCell>{formatPeso(pesagem.peso_kg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="historico" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Nº animais</TableHead>
                  <TableHead>Peso médio</TableHead>
                  <TableHead>Peso total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historicoQuery.data?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma pesagem finalizada ainda.
                    </TableCell>
                  </TableRow>
                )}
                {historicoQuery.data?.map((sessao) => (
                  <TableRow
                    key={sessao.id}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => setSessaoHistoricoSelecionada(sessao)}
                  >
                    <TableCell>{formatDataHora(sessao.finalizada_em)}</TableCell>
                    <TableCell>{sessao.lote_nome ?? "—"}</TableCell>
                    <TableCell>{formatNumero(sessao.quantidade_animais)}</TableCell>
                    <TableCell>
                      {sessao.peso_medio_kg !== null ? formatPeso(sessao.peso_medio_kg) : "—"}
                    </TableCell>
                    <TableCell>
                      {sessao.peso_total_kg !== null ? formatPeso(sessao.peso_total_kg) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!sessaoHistoricoSelecionada}
        onOpenChange={(open) => {
          if (!open) setSessaoHistoricoSelecionada(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Pesagem de{" "}
              {sessaoHistoricoSelecionada
                ? formatDataHora(sessaoHistoricoSelecionada.finalizada_em)
                : ""}
            </DialogTitle>
            <DialogDescription>
              {sessaoHistoricoSelecionada?.usuario_nome &&
                `Registrado por ${sessaoHistoricoSelecionada.usuario_nome}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identificação</TableHead>
                  <TableHead>Peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pesagensHistoricoQuery.data?.map((pesagem) => (
                  <TableRow key={pesagem.id}>
                    <TableCell>{pesagem.animais.identificacao}</TableCell>
                    <TableCell>{formatPeso(pesagem.peso_kg)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
