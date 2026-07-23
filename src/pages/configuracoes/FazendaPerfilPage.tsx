import { useEffect, useRef, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeftIcon, ImageIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useAtualizarNomeFazenda } from "@/hooks/useAtualizarNomeFazenda"
import {
  useAtualizarDescricaoFazenda,
  useFazendaPerfil,
  useHeroFazendaUrl,
  useUploadHeroFazenda,
} from "@/hooks/useFazendaPerfil"
import {
  useCancelarConvite,
  useConvidarMembro,
  useConvitesFazenda,
  useMembrosFazenda,
  usePromoverPapel,
  useRemoverMembro,
  type MembroFazenda,
} from "@/hooks/useEquipeFazenda"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const PAPEIS = ["admin", "membro", "financeiro"] as const
const PAPEL_LABELS: Record<string, string> = {
  admin: "Admin",
  membro: "Membro",
  financeiro: "Financeiro",
}
// Ordem de exibição pedida por JP: admins primeiro, depois membros, depois financeiro.
const ORDEM_PAPEL: Record<string, number> = { admin: 0, membro: 1, financeiro: 2 }

function formatData(data: string) {
  return new Date(data).toLocaleDateString("pt-BR")
}

function ConvidarMembroDialog({ fazendaId }: { fazendaId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [papel, setPapel] = useState<string>("membro")
  const convidar = useConvidarMembro(fazendaId)

  async function handleSubmit() {
    if (!email.trim()) {
      toast.error("Informe o e-mail do convidado.")
      return
    }
    try {
      await convidar.mutateAsync({ email: email.trim(), papel })
      toast.success("Convite enviado com sucesso.")
      setEmail("")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar convite.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            Convidar usuário
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Enviamos um e-mail com um link pra entrar na fazenda com o papel escolhido.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="email-convite">E-mail</Label>
            <Input
              id="email-convite"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Papel</Label>
            <Select value={papel} onValueChange={(v) => v && setPapel(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => PAPEL_LABELS[v] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PAPEL_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={convidar.isPending}>
          {convidar.isPending ? "Enviando…" : "Enviar convite"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function RemoverMembroDialog({
  membro,
  souEu,
  fazendaId,
}: {
  membro: MembroFazenda
  souEu: boolean
  fazendaId: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const removerMembro = useRemoverMembro(fazendaId)

  async function handleConfirmar() {
    try {
      await removerMembro.mutateAsync(membro.usuario_id)
      toast.success(souEu ? "Você saiu da fazenda." : "Usuário removido.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover usuário.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={souEu ? "Sair da fazenda" : "Remover usuário"}
          >
            <Trash2Icon />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {souEu ? "Sair desta fazenda?" : `Remover ${membro.nome ?? membro.email}?`}
          </DialogTitle>
          <DialogDescription>
            {souEu
              ? "Você perde o acesso a esta fazenda imediatamente. Se você for o único admin, a ação será bloqueada."
              : "O acesso deste usuário a esta fazenda é removido imediatamente."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={removerMembro.isPending}
            onClick={handleConfirmar}
          >
            {removerMembro.isPending ? "Removendo…" : souEu ? "Sair" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Perfil da Fazenda (2026-07-23) — aberto a partir de "Administração de
 * Fazendas" (Configurações), só pra fazendas onde o usuário é admin. Hero
 * image + nome + descrição livre + a lista de usuários com acesso (que até
 * esta tarefa vivia numa tela "Equipe" separada — absorvida aqui, decisão
 * de JP, pra não duplicar a mesma funcionalidade em dois lugares).
 */
export function FazendaPerfilPage() {
  const { fazendaId } = useParams<{ fazendaId: string }>()
  const { user } = useAuth()
  const fazendasDoUsuarioQuery = useFazendasDoUsuario()
  const vinculo = fazendasDoUsuarioQuery.data?.find((f) => f.fazenda_id === fazendaId)
  const ehAdmin = vinculo?.papel === "admin"

  const perfilQuery = useFazendaPerfil(ehAdmin ? fazendaId : undefined)
  const perfil = perfilQuery.data
  const heroUrlQuery = useHeroFazendaUrl(perfil?.imagem_hero_path)
  const uploadHero = useUploadHeroFazenda(fazendaId)
  const heroInputRef = useRef<HTMLInputElement | null>(null)

  const atualizarNomeFazenda = useAtualizarNomeFazenda(fazendaId)
  const [nome, setNome] = useState("")
  useEffect(() => {
    if (perfil?.nome !== undefined) setNome(perfil.nome)
  }, [perfil?.nome])

  const atualizarDescricao = useAtualizarDescricaoFazenda(fazendaId)
  const [descricao, setDescricao] = useState("")
  useEffect(() => {
    setDescricao(perfil?.descricao ?? "")
  }, [perfil?.descricao])

  const membrosQuery = useMembrosFazenda(ehAdmin ? fazendaId : undefined)
  const convitesQuery = useConvitesFazenda(ehAdmin ? fazendaId : undefined)
  const promoverPapel = usePromoverPapel(fazendaId)
  const cancelarConvite = useCancelarConvite(fazendaId)

  async function handleUploadHero(arquivo: File) {
    try {
      await uploadHero.mutateAsync(arquivo)
      toast.success("Imagem de capa atualizada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.")
    }
  }

  async function salvarNome() {
    try {
      await atualizarNomeFazenda.mutateAsync(nome)
      toast.success("Nome atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar nome.")
    }
  }

  async function salvarDescricao() {
    try {
      await atualizarDescricao.mutateAsync(descricao.trim() || null)
      toast.success("Descrição atualizada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar descrição.")
    }
  }

  async function handleMudarPapel(usuarioId: string, novoPapel: string) {
    try {
      await promoverPapel.mutateAsync({ usuarioId, novoPapel })
      toast.success("Papel atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar papel.")
    }
  }

  async function handleCancelarConvite(conviteId: string) {
    try {
      await cancelarConvite.mutateAsync(conviteId)
      toast.success("Convite cancelado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cancelar convite.")
    }
  }

  const membrosOrdenados = [...(membrosQuery.data ?? [])].sort(
    (a, b) => (ORDEM_PAPEL[a.papel] ?? 9) - (ORDEM_PAPEL[b.papel] ?? 9)
  )

  if (fazendasDoUsuarioQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>
  }

  if (!vinculo || !ehAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to="/app/configuracoes"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Voltar para Configurações
        </Link>
        <p className="text-sm text-muted-foreground">
          Apenas o admin desta fazenda tem acesso ao perfil dela.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/app/configuracoes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para Configurações
      </Link>

      <div className="relative flex h-40 items-end overflow-hidden rounded-xl border border-border bg-muted sm:h-56">
        {heroUrlQuery.data ? (
          <img
            src={heroUrlQuery.data}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="size-10" />
          </div>
        )}
        <input
          ref={heroInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0]
            if (arquivo) handleUploadHero(arquivo)
            e.target.value = ""
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="relative m-3"
          disabled={uploadHero.isPending}
          onClick={() => heroInputRef.current?.click()}
        >
          {uploadHero.isPending ? "Enviando…" : "Alterar imagem de capa"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <div className="grid gap-1.5">
          <Label htmlFor="nome-fazenda-perfil">Nome</Label>
          <Input
            id="nome-fazenda-perfil"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="text-lg font-semibold"
          />
        </div>
        <div className="mt-3">
          <Button
            size="sm"
            onClick={salvarNome}
            disabled={atualizarNomeFazenda.isPending || nome === perfil?.nome}
          >
            {atualizarNomeFazenda.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
        <h2 className="mb-3 text-lg font-medium">Sobre a fazenda</h2>
        <Textarea
          rows={4}
          placeholder="Atividades, localização, fundação, fundadores…"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <div className="mt-3">
          <Button
            size="sm"
            onClick={salvarDescricao}
            disabled={atualizarDescricao.isPending || descricao === (perfil?.descricao ?? "")}
          >
            {atualizarDescricao.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Usuários com acesso</h2>
          <ConvidarMembroDialog fazendaId={fazendaId} />
        </div>

        {membrosQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        )}

        {membrosQuery.data && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membrosOrdenados.map((membro) => {
                  const souEu = membro.usuario_id === user?.id
                  return (
                    <TableRow key={membro.usuario_id}>
                      <TableCell>
                        {membro.nome ?? "—"}
                        {souEu && <span className="text-muted-foreground"> (você)</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{membro.email}</TableCell>
                      <TableCell>
                        <Select
                          value={membro.papel}
                          onValueChange={(v) => v && handleMudarPapel(membro.usuario_id, v)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue>{(v: string) => PAPEL_LABELS[v] ?? v}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {PAPEIS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {PAPEL_LABELS[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <RemoverMembroDialog membro={membro} souEu={souEu} fazendaId={fazendaId} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-medium">Convites pendentes</h2>

        {convitesQuery.data && convitesQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
        )}

        {convitesQuery.data && convitesQuery.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel oferecido</TableHead>
                  <TableHead className="hidden sm:table-cell">Expira em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convitesQuery.data.map((convite) => (
                  <TableRow key={convite.id}>
                    <TableCell>{convite.convidado_email}</TableCell>
                    <TableCell>
                      {PAPEL_LABELS[convite.papel_oferecido] ?? convite.papel_oferecido}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatData(convite.expires_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelarConvite.isPending}
                        onClick={() => handleCancelarConvite(convite.id)}
                      >
                        Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
