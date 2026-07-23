import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useBuscarAnimaisPorIdentificacao,
  type AnimalBusca,
} from "@/hooks/useAnimais"
import {
  usePesagensDeHoje,
  useRegistrarPesagemRapida,
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

function formatPeso(kg: number) {
  return `${kg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kg`
}

/**
 * "Dia de Pesagem" (pedido de JP, 2026-07-23) — ferramenta de campo pra
 * pesar muitos animais em sequência rápida: busca por trecho da
 * identificação (não precisa digitar o código inteiro), peso, registrar,
 * repete. Reaproveita `registrar_pesagem()` (RPC da Fase 2) tal como está —
 * como esta tela é sempre "hoje", pesar o mesmo animal 2x no mesmo dia já
 * vira correção do mesmo registro por conta própria da RPC, sem duplicar.
 *
 * Layout de 60/40 (área de entrada em cima, lista de hoje rolável embaixo)
 * igual em mobile e desktop, pedido explícito de JP — ver comentário na
 * div raiz sobre o trade-off de não travar 100% do viewport.
 */
export function DiaPesagemPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const [tecladoAlfabetico, setTecladoAlfabetico] = useState(false)
  const identificacaoInputRef = useRef<HTMLInputElement | null>(null)
  const pesoInputRef = useRef<HTMLInputElement | null>(null)

  const form = useForm<PesagemRapidaFormValues>({
    resolver: zodResolver(pesagemRapidaSchema),
    defaultValues: { animal_id: "", identificacao: "", peso_kg: undefined as unknown as number },
  })

  const identificacaoDigitada = form.watch("identificacao")
  const animalIdResolvido = form.watch("animal_id")

  // Só busca enquanto o animal ainda não foi resolvido (selecionado de uma
  // sugestão) — evita rebuscar a cada tecla depois de já ter escolhido.
  const buscaQuery = useBuscarAnimaisPorIdentificacao(
    fazenda?.fazenda_id,
    animalIdResolvido ? "" : identificacaoDigitada
  )

  const registrarPesagem = useRegistrarPesagemRapida(fazenda?.fazenda_id)
  const pesagensHojeQuery = usePesagensDeHoje(fazenda?.fazenda_id)
  const pesagensHoje = pesagensHojeQuery.data ?? []

  const stats = {
    quantidade: pesagensHoje.length,
    pesoTotal: pesagensHoje.reduce((soma, p) => soma + p.peso_kg, 0),
    pesoMedio:
      pesagensHoje.length > 0
        ? pesagensHoje.reduce((soma, p) => soma + p.peso_kg, 0) / pesagensHoje.length
        : 0,
  }

  function selecionarAnimal(animal: AnimalBusca) {
    form.setValue("animal_id", animal.id)
    form.setValue("identificacao", animal.identificacao)
    pesoInputRef.current?.focus()
  }

  async function onSubmit(values: PesagemRapidaFormValues) {
    try {
      await registrarPesagem.mutateAsync({
        animal_id: values.animal_id,
        peso_kg: values.peso_kg,
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
    // 60/40 fixo (mobile e desktop, pedido de JP) via altura relativa ao
    // viewport — aproximado, não pixel-perfect: acoplar aos paddings/header
    // exatos do AppShell (que podem mudar) tornaria esta página frágil por
    // um ganho visual pequeno. Trade-off aceito: em telas muito baixas pode
    // sobrar um pouco de scroll da página inteira como rede de segurança,
    // em vez de travar 100% do viewport.
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4">
      <div className="flex flex-[3] flex-col gap-4 overflow-y-auto">
        <h1 className="text-2xl font-semibold">Dia de Pesagem</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="identificacao"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel className="text-base">Identificação</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
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
                      placeholder="Digite parte da identificação"
                      className="h-16 text-3xl"
                      onChange={(e) => {
                        field.onChange(e)
                        // Editar o texto depois de já ter resolvido um
                        // animal (ou se o texto não bate mais com o
                        // resolvido) reabre a busca.
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

            {!animalIdResolvido &&
              identificacaoDigitada.trim().length > 0 &&
              (buscaQuery.data?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
                  {buscaQuery.data?.map((animal) => (
                    <Button
                      key={animal.id}
                      type="button"
                      variant="outline"
                      className="h-11 justify-start text-lg"
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
                <p className="text-sm text-muted-foreground">
                  Nenhum animal ativo encontrado com esse trecho de identificação.
                </p>
              )}

            <FormField
              control={form.control}
              name="peso_kg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Peso (kg)</FormLabel>
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
                      className="h-16 text-3xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              size="lg"
              disabled={form.formState.isSubmitting || !animalIdResolvido}
            >
              {form.formState.isSubmitting ? "Registrando…" : "Registrar"}
            </Button>
          </form>
        </Form>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>Animais pesados hoje: {stats.quantidade}</span>
          <span>Peso médio: {stats.quantidade > 0 ? formatPeso(stats.pesoMedio) : "—"}</span>
          <span>Peso total: {stats.quantidade > 0 ? formatPeso(stats.pesoTotal) : "—"}</span>
        </div>
      </div>

      <div className="flex-[2] overflow-y-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identificação</TableHead>
              <TableHead>Peso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pesagensHoje.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Nenhum animal pesado hoje ainda.
                </TableCell>
              </TableRow>
            )}
            {pesagensHoje.map((pesagem) => (
              <TableRow key={pesagem.id}>
                <TableCell>{pesagem.animais.identificacao}</TableCell>
                <TableCell>{formatPeso(pesagem.peso_kg)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
