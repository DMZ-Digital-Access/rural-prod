import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useAtualizarNomeFazenda } from "@/hooks/useAtualizarNomeFazenda"
import { useCriarFazenda } from "@/hooks/useCriarFazenda"
import {
  useAtualizarMeuEmail,
  useAtualizarMeusDados,
  useUsuarioAtual,
} from "@/hooks/useUsuarioAtual"
import {
  useAtualizarFinalidadesFazenda,
  useEspeciesDaFazenda,
  useFazendaPerfil,
  useToggleEspecieDaFazenda,
  type FinalidadeRebanho,
} from "@/hooks/useFazendaPerfil"
import { useEspecies } from "@/hooks/useEspecies"
import { criarFazendaSchema } from "@/lib/validations/fazenda"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const PAPEL_LABELS: Record<string, string> = {
  admin: "Admin",
  membro: "Membro",
  financeiro: "Financeiro",
}

const FINALIDADES: { value: FinalidadeRebanho; label: string }[] = [
  { value: "recria", label: "Recria" },
  { value: "engorda", label: "Engorda" },
  { value: "leite", label: "Leite" },
]

function mesmoConjunto(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((item) => setB.has(item))
}

function CriarFazendaDialog() {
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const criarFazenda = useCriarFazenda()

  async function handleSubmit() {
    setErro(null)
    const resultado = criarFazendaSchema.safeParse({ nome })
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos")
      return
    }

    try {
      await criarFazenda.mutateAsync(resultado.data.nome)
      toast.success("Fazenda criada com sucesso.")
      setNome("")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar fazenda.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <PlusIcon />
            Criar nova fazenda
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar nova fazenda</DialogTitle>
          <DialogDescription>
            Você vira admin da fazenda nova, além das que já tem hoje.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="nome-nova-fazenda">Nome da fazenda</Label>
          <Input
            id="nome-nova-fazenda"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <Button onClick={handleSubmit} disabled={criarFazenda.isPending}>
          {criarFazenda.isPending ? "Criando…" : "Criar fazenda"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function TipoPecuariaSection({
  fazendaId,
  somenteLeitura,
}: {
  fazendaId: string | undefined
  somenteLeitura: boolean
}) {
  const especiesQuery = useEspecies()
  const especiesDaFazendaQuery = useEspeciesDaFazenda(fazendaId)
  const toggleEspecie = useToggleEspecieDaFazenda(fazendaId)
  const perfilQuery = useFazendaPerfil(fazendaId)
  const atualizarFinalidades = useAtualizarFinalidadesFazenda(fazendaId)

  const [finalidadesLocais, setFinalidadesLocais] = useState<FinalidadeRebanho[]>([])
  useEffect(() => {
    setFinalidadesLocais(perfilQuery.data?.finalidades_rebanho ?? [])
  }, [perfilQuery.data?.finalidades_rebanho])

  const especiesSelecionadas = new Set(especiesDaFazendaQuery.data ?? [])

  async function handleToggleEspecie(especieId: string) {
    try {
      await toggleEspecie.mutateAsync({
        especieId,
        incluir: !especiesSelecionadas.has(especieId),
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar tipo de animal."
      )
    }
  }

  function toggleFinalidadeLocal(finalidade: FinalidadeRebanho) {
    setFinalidadesLocais((atual) =>
      atual.includes(finalidade)
        ? atual.filter((item) => item !== finalidade)
        : [...atual, finalidade]
    )
  }

  async function salvarFinalidades() {
    try {
      await atualizarFinalidades.mutateAsync(finalidadesLocais)
      toast.success("Finalidade do rebanho atualizada.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar finalidade do rebanho."
      )
    }
  }

  const finalidadesMudaram = !mesmoConjunto(
    finalidadesLocais,
    perfilQuery.data?.finalidades_rebanho ?? []
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
      <h2 className="mb-3 text-lg font-medium">Tipo de Pecuária</h2>

      <div className="mb-4">
        <Label className="mb-2 block">Tipos de Animais da Fazenda</Label>
        <div className="flex flex-wrap gap-2">
          {especiesQuery.data?.map((especie) => (
            <Button
              key={especie.id}
              type="button"
              size="sm"
              variant={especiesSelecionadas.has(especie.id) ? "default" : "outline"}
              disabled={somenteLeitura || toggleEspecie.isPending}
              onClick={() => handleToggleEspecie(especie.id)}
            >
              {especie.nome}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Finalidade do Rebanho</Label>
        <div className="flex flex-wrap gap-2">
          {FINALIDADES.map((finalidade) => (
            <Button
              key={finalidade.value}
              type="button"
              size="sm"
              variant={
                finalidadesLocais.includes(finalidade.value) ? "default" : "outline"
              }
              disabled={somenteLeitura}
              onClick={() => toggleFinalidadeLocal(finalidade.value)}
            >
              {finalidade.label}
            </Button>
          ))}
        </div>
        {!somenteLeitura && (
          <div className="mt-3">
            <Button
              size="sm"
              onClick={salvarFinalidades}
              disabled={atualizarFinalidades.isPending || !finalidadesMudaram}
            >
              {atualizarFinalidades.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Configurações > dados da fazenda e do usuário (reformulada 2026-07-23,
 * pedido de JP): "Tipo de Pecuária" novo (sempre sobre a fazenda ATUAL,
 * com banner de "Editando: X" pra nunca confundir com outra fazenda);
 * "Meus dados" ganha telefone celular + e-mail editável de verdade;
 * "Minhas fazendas" vira "Administração de Fazendas", com "Criar nova
 * fazenda" discreto dentro dela e linhas onde o usuário é admin virando
 * links pro Perfil da Fazenda (que absorveu a antiga tela "Equipe").
 */
export function ConfiguracaoFazendaPage() {
  const { data: fazendaAtual } = useFazendaAtual()
  const fazendasQuery = useFazendasDoUsuario()
  const somenteLeituraFazenda = fazendaAtual?.papel === "financeiro"
  const ehAdminDaFazendaAtual = fazendaAtual?.papel === "admin"

  const atualizarNomeFazenda = useAtualizarNomeFazenda(fazendaAtual?.fazenda_id)
  const [nomeFazenda, setNomeFazenda] = useState("")

  useEffect(() => {
    if (fazendaAtual?.nome !== undefined) setNomeFazenda(fazendaAtual.nome)
  }, [fazendaAtual?.nome])

  const usuarioQuery = useUsuarioAtual()
  const atualizarMeusDados = useAtualizarMeusDados()
  const atualizarMeuEmail = useAtualizarMeuEmail()
  const [nomeUsuario, setNomeUsuario] = useState("")
  const [telefone, setTelefone] = useState("")
  const [novoEmail, setNovoEmail] = useState("")

  useEffect(() => {
    if (usuarioQuery.data) {
      setNomeUsuario(usuarioQuery.data.nome ?? "")
      setTelefone(usuarioQuery.data.telefone_celular ?? "")
      setNovoEmail(usuarioQuery.data.email ?? "")
    }
  }, [usuarioQuery.data])

  const jaEhAdminEmAlgumaFazenda = (fazendasQuery.data ?? []).some((f) => f.papel === "admin")

  async function salvarNomeFazenda() {
    try {
      await atualizarNomeFazenda.mutateAsync(nomeFazenda)
      toast.success("Nome da fazenda atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar nome da fazenda.")
    }
  }

  async function salvarMeusDados() {
    try {
      await atualizarMeusDados.mutateAsync({
        nome: nomeUsuario,
        telefone_celular: telefone.trim() || null,
      })
      toast.success("Dados atualizados.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar dados.")
    }
  }

  async function salvarNovoEmail() {
    const email = novoEmail.trim()
    try {
      await atualizarMeuEmail.mutateAsync(email)
      toast.success(
        `Um e-mail de confirmação foi enviado para ${email}. Seu e-mail atual continua ativo até você confirmar.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao trocar de e-mail.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground">Dados da fazenda e do usuário.</p>
      </div>

      {fazendaAtual && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm sm:max-w-lg">
          <span className="text-muted-foreground">Editando a fazenda:</span>
          <span className="font-medium">{fazendaAtual.nome}</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <h2 className="mb-3 text-lg font-medium">Dados da fazenda</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="nome-fazenda">Nome</Label>
          <Input
            id="nome-fazenda"
            value={nomeFazenda}
            onChange={(e) => setNomeFazenda(e.target.value)}
            disabled={somenteLeituraFazenda}
          />
        </div>
        {somenteLeituraFazenda && (
          <p className="mt-2 text-sm text-muted-foreground">
            Papel financeiro não pode alterar o nome da fazenda.
          </p>
        )}
        {!somenteLeituraFazenda && (
          <div className="mt-3">
            <Button
              size="sm"
              onClick={salvarNomeFazenda}
              disabled={atualizarNomeFazenda.isPending || nomeFazenda === fazendaAtual?.nome}
            >
              {atualizarNomeFazenda.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        )}
      </div>

      <TipoPecuariaSection
        fazendaId={fazendaAtual?.fazenda_id}
        somenteLeitura={!ehAdminDaFazendaAtual}
      />

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <h2 className="mb-3 text-lg font-medium">Meus dados</h2>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nome-usuario">Nome</Label>
            <Input
              id="nome-usuario"
              value={nomeUsuario}
              onChange={(e) => setNomeUsuario(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="telefone-usuario">Telefone celular</Label>
            <Input
              id="telefone-usuario"
              type="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <Button
              size="sm"
              onClick={salvarMeusDados}
              disabled={
                atualizarMeusDados.isPending ||
                (nomeUsuario === usuarioQuery.data?.nome &&
                  telefone === (usuarioQuery.data?.telefone_celular ?? ""))
              }
            >
              {atualizarMeusDados.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>

          <div className="grid gap-1.5 border-t border-border pt-3">
            <Label htmlFor="email-usuario">E-mail</Label>
            <Input
              id="email-usuario"
              type="email"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Trocar o e-mail exige confirmação por um link enviado ao endereço novo — o
              e-mail atual continua ativo até você confirmar.
            </p>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={salvarNovoEmail}
              disabled={atualizarMeuEmail.isPending || novoEmail.trim() === usuarioQuery.data?.email}
            >
              {atualizarMeuEmail.isPending ? "Enviando…" : "Salvar novo e-mail"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Administração de Fazendas</h2>
          {jaEhAdminEmAlgumaFazenda && <CriarFazendaDialog />}
        </div>

        {fazendasQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}

        {fazendasQuery.data && (
          <ul className="flex flex-col gap-2">
            {fazendasQuery.data.map((f) =>
              f.papel === "admin" ? (
                <li key={f.fazenda_id}>
                  <Link
                    to={`/app/configuracoes/fazendas/${f.fazenda_id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:border-foreground/30 hover:bg-muted"
                  >
                    <span className="truncate text-sm">{f.nome}</span>
                    <Badge variant="secondary">{PAPEL_LABELS[f.papel] ?? f.papel}</Badge>
                  </Link>
                </li>
              ) : (
                <li
                  key={f.fazenda_id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="truncate text-sm">{f.nome}</span>
                  <Badge variant="secondary">{PAPEL_LABELS[f.papel] ?? f.papel}</Badge>
                </li>
              )
            )}
          </ul>
        )}

        {!jaEhAdminEmAlgumaFazenda && (
          <p className="mt-2 text-sm text-muted-foreground">
            Só quem já é admin de uma fazenda pode cadastrar uma fazenda adicional.
          </p>
        )}
      </div>
    </div>
  )
}
