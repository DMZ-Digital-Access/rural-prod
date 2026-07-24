import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useAnimais,
  useBuscarAnimaisPorIdentificacao,
  type AnimalBusca,
} from "@/hooks/useAnimais"
import { useRegistrarVacinacao } from "@/hooks/useVacinacoes"
import { vacinasParaEspecies } from "@/lib/vacinas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type EspecieOpcao = { id: string; nome: string }
type AnimalAtendido = { identificacao: string; vacinas: string[] }

/**
 * Dia de Vacinação (pedido de JP, 2026-07-24) — fluxo em 2 etapas: (1)
 * escolher quais tipos de animal serão atendidos (todos os tipos com
 * animal ativo na fazenda, não só o "Tipo de Pecuária" declarado — mesma
 * filosofia já usada no Painel Inteligente); (2) por animal, identificação
 * (busca por trecho, mesma UX do Dia de Pesagem) + vacinas aplicadas
 * (catálogo fixo por espécie, união quando mais de um tipo foi escolhido) +
 * observações opcionais. "Outras vacinas ou medicamentos" sempre por
 * último, abre campo de texto livre (nome obrigatório, enfermidade
 * opcional). Cada vacina aplicada vira uma linha própria em `vacinacoes`,
 * visível depois na página do animal (Controle Sanitário).
 */
export function DiaVacinacaoPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"
  const animaisQuery = useAnimais(fazenda?.fazenda_id)
  const registrarVacinacao = useRegistrarVacinacao()

  const especiesDisponiveis: EspecieOpcao[] = useMemo(() => {
    const vistas = new Map<string, string>()
    for (const a of animaisQuery.data ?? []) {
      if (a.status === "ativo" && a.especie_id && a.especie_nome) {
        vistas.set(a.especie_id, a.especie_nome)
      }
    }
    return Array.from(vistas, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    )
  }, [animaisQuery.data])

  const [etapa, setEtapa] = useState<"tipos" | "aplicacao">("tipos")
  const [especieIdsSelecionadas, setEspecieIdsSelecionadas] = useState<string[]>([])

  const especieNomesSelecionadas = especiesDisponiveis
    .filter((e) => especieIdsSelecionadas.includes(e.id))
    .map((e) => e.nome)
  const vacinasDisponiveis = vacinasParaEspecies(especieNomesSelecionadas)

  const [tecladoAlfabetico, setTecladoAlfabetico] = useState(false)
  const [identificacao, setIdentificacao] = useState("")
  const [animalIdResolvido, setAnimalIdResolvido] = useState("")
  const [vacinasSelecionadas, setVacinasSelecionadas] = useState<Set<string>>(new Set())
  const [outraSelecionada, setOutraSelecionada] = useState(false)
  const [outraNome, setOutraNome] = useState("")
  const [outraEnfermidade, setOutraEnfermidade] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [animaisAtendidos, setAnimaisAtendidos] = useState<AnimalAtendido[]>([])

  const identificacaoInputRef = useRef<HTMLInputElement | null>(null)

  const buscaQuery = useBuscarAnimaisPorIdentificacao(
    fazenda?.fazenda_id,
    animalIdResolvido ? "" : identificacao,
    especieIdsSelecionadas
  )

  function toggleEspecie(id: string) {
    setEspecieIdsSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    )
  }

  function selecionarAnimal(animal: AnimalBusca) {
    setAnimalIdResolvido(animal.id)
    setIdentificacao(animal.identificacao)
  }

  function toggleVacina(vacina: string) {
    setVacinasSelecionadas((atual) => {
      const nova = new Set(atual)
      if (nova.has(vacina)) nova.delete(vacina)
      else nova.add(vacina)
      return nova
    })
  }

  function limparCamposAnimal() {
    setIdentificacao("")
    setAnimalIdResolvido("")
    setVacinasSelecionadas(new Set())
    setOutraSelecionada(false)
    setOutraNome("")
    setOutraEnfermidade("")
    setObservacoes("")
  }

  async function handleRegistrar() {
    if (!animalIdResolvido) return

    const tipos: string[] = Array.from(vacinasSelecionadas)
    const enfermidades: (string | null)[] = tipos.map(() => null)

    if (outraSelecionada) {
      if (!outraNome.trim()) {
        toast.error("Informe o nome da vacina ou medicamento em Outras vacinas ou medicamentos.")
        return
      }
      tipos.push(outraNome.trim())
      enfermidades.push(outraEnfermidade.trim() || null)
    }

    if (tipos.length === 0) {
      toast.error("Selecione ao menos uma vacina ou medicamento.")
      return
    }

    try {
      await registrarVacinacao.mutateAsync({
        animal_id: animalIdResolvido,
        tipos_vacina: tipos,
        enfermidades,
        observacoes: observacoes.trim() || null,
      })
      toast.success(`Vacinação de ${identificacao} registrada.`)
      setAnimaisAtendidos((atual) => [...atual, { identificacao, vacinas: tipos }])
      limparCamposAnimal()
      identificacaoInputRef.current?.focus()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar vacinação."
      )
    }
  }

  if (somenteLeitura) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Dia de Vacinação</h1>
        <p className="text-sm text-muted-foreground">
          O papel financeiro não tem acesso a este módulo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dia de Vacinação</h1>

      {etapa === "tipos" && (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            Quais tipos de animais serão vacinados ou medicados hoje?
          </p>

          {especiesDisponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum animal ativo cadastrado na fazenda ainda.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {especiesDisponiveis.map((especie) => (
                <Button
                  key={especie.id}
                  type="button"
                  variant={especieIdsSelecionadas.includes(especie.id) ? "default" : "outline"}
                  onClick={() => toggleEspecie(especie.id)}
                >
                  {especie.nome}
                </Button>
              ))}
            </div>
          )}

          <div>
            <Button
              disabled={especieIdsSelecionadas.length === 0}
              onClick={() => setEtapa("aplicacao")}
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {etapa === "aplicacao" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Vacinando: {especieNomesSelecionadas.join(", ")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEtapa("tipos")}
            >
              <ArrowLeftIcon />
              Trocar tipos de animais
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <Label htmlFor="identificacao-vacinacao">Identificação</Label>
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
              <Input
                id="identificacao-vacinacao"
                ref={identificacaoInputRef}
                inputMode={tecladoAlfabetico ? "text" : "numeric"}
                autoComplete="off"
                placeholder="Ex.: 385"
                className="h-12 text-xl"
                value={identificacao}
                onChange={(e) => {
                  setIdentificacao(e.target.value)
                  if (animalIdResolvido) setAnimalIdResolvido("")
                }}
              />
            </div>

            {!animalIdResolvido &&
              identificacao.trim().length > 0 &&
              (buscaQuery.data?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-border p-1.5">
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
              identificacao.trim().length > 0 &&
              !buscaQuery.isLoading &&
              (buscaQuery.data?.length ?? 0) === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nenhum animal ativo encontrado com esse trecho, entre os tipos escolhidos.
                </p>
              )}

            <div className="mt-4 grid gap-1.5">
              <Label>Vacinas / medicamentos aplicados</Label>
              <div className="flex flex-wrap gap-2">
                {vacinasDisponiveis.map((vacina) => (
                  <Button
                    key={vacina}
                    type="button"
                    size="sm"
                    variant={vacinasSelecionadas.has(vacina) ? "default" : "outline"}
                    disabled={!animalIdResolvido}
                    onClick={() => toggleVacina(vacina)}
                  >
                    {vacina}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={outraSelecionada ? "default" : "outline"}
                  disabled={!animalIdResolvido}
                  onClick={() => setOutraSelecionada((v) => !v)}
                >
                  Outras vacinas ou medicamentos
                </Button>
              </div>
            </div>

            {outraSelecionada && (
              <div className="mt-3 grid gap-3 rounded-lg border border-border p-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="outra-nome">Vacina ou medicamento</Label>
                  <Input
                    id="outra-nome"
                    value={outraNome}
                    onChange={(e) => setOutraNome(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="outra-enfermidade">Enfermidade tratada</Label>
                  <Input
                    id="outra-enfermidade"
                    value={outraEnfermidade}
                    onChange={(e) => setOutraEnfermidade(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="observacoes-vacinacao">Observações</Label>
              <Textarea
                id="observacoes-vacinacao"
                placeholder="Opcional — algum detalhe específico deste animal."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <Button
                disabled={!animalIdResolvido || registrarVacinacao.isPending}
                onClick={handleRegistrar}
              >
                {registrarVacinacao.isPending ? "Registrando…" : "Registrar"}
              </Button>
            </div>
          </div>

          {animaisAtendidos.length > 0 && (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificação</TableHead>
                    <TableHead>Vacinas / medicamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {animaisAtendidos.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.identificacao}</TableCell>
                      <TableCell>{item.vacinas.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
