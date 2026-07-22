import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useAtualizarNomeFazenda } from "@/hooks/useAtualizarNomeFazenda"
import { useCriarFazenda } from "@/hooks/useCriarFazenda"
import { useAtualizarNomeUsuario, useUsuarioAtual } from "@/hooks/useUsuarioAtual"
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
          <Button size="sm">
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

/**
 * Configurações > dados da fazenda e do usuário (spec seção 5.3, item 20 —
 * substitui o placeholder). Multi-fazenda (2026-07-22): também lista as
 * fazendas do usuário e permite criar uma adicional (só quem já é admin em
 * alguma fazenda — mesma checagem da RPC criar_fazenda, espelhada aqui pra
 * UX; a RPC é a autoridade real).
 */
export function ConfiguracaoFazendaPage() {
  const { data: fazendaAtual } = useFazendaAtual()
  const fazendasQuery = useFazendasDoUsuario()
  const somenteLeituraFazenda = fazendaAtual?.papel === "financeiro"

  const atualizarNomeFazenda = useAtualizarNomeFazenda(fazendaAtual?.fazenda_id)
  const [nomeFazenda, setNomeFazenda] = useState("")

  useEffect(() => {
    if (fazendaAtual?.nome !== undefined) setNomeFazenda(fazendaAtual.nome)
  }, [fazendaAtual?.nome])

  const usuarioQuery = useUsuarioAtual()
  const atualizarNomeUsuario = useAtualizarNomeUsuario()
  const [nomeUsuario, setNomeUsuario] = useState("")

  useEffect(() => {
    if (usuarioQuery.data?.nome !== undefined) setNomeUsuario(usuarioQuery.data.nome ?? "")
  }, [usuarioQuery.data?.nome])

  const jaEhAdminEmAlgumaFazenda = (fazendasQuery.data ?? []).some((f) => f.papel === "admin")

  async function salvarNomeFazenda() {
    try {
      await atualizarNomeFazenda.mutateAsync(nomeFazenda)
      toast.success("Nome da fazenda atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar nome da fazenda.")
    }
  }

  async function salvarNomeUsuario() {
    try {
      await atualizarNomeUsuario.mutateAsync(nomeUsuario)
      toast.success("Nome atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar nome.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground">Dados da fazenda e do usuário.</p>
      </div>

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
            <Label>E-mail</Label>
            <Input value={usuarioQuery.data?.email ?? ""} disabled />
          </div>
          <div>
            <Button
              size="sm"
              onClick={salvarNomeUsuario}
              disabled={atualizarNomeUsuario.isPending || nomeUsuario === usuarioQuery.data?.nome}
            >
              {atualizarNomeUsuario.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Minhas fazendas</h2>
          {jaEhAdminEmAlgumaFazenda && <CriarFazendaDialog />}
        </div>

        {fazendasQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}

        {fazendasQuery.data && (
          <ul className="flex flex-col gap-2">
            {fazendasQuery.data.map((f) => (
              <li
                key={f.fazenda_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="truncate text-sm">{f.nome}</span>
                <Badge variant="secondary">{PAPEL_LABELS[f.papel] ?? f.papel}</Badge>
              </li>
            ))}
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
