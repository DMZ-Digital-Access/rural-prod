import { useState } from "react"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
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
            Convidar membro
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
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
      toast.success(souEu ? "Você saiu da fazenda." : "Membro removido.")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover membro.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={souEu ? "Sair da fazenda" : "Remover membro"}
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
              : "O acesso deste membro a esta fazenda é removido imediatamente."}
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
 * Equipe (Fase B do multi-fazenda, 2026-07-22) — substitui o placeholder de
 * `/app/configuracoes/equipe`. Admin-only (decisão confirmada com JP): quem
 * não é admin da fazenda atual não vê nada aqui, nem a lista de colegas.
 */
export function EquipePage() {
  const { user } = useAuth()
  const { data: fazenda } = useFazendaAtual()
  const ehAdmin = fazenda?.papel === "admin"

  const membrosQuery = useMembrosFazenda(ehAdmin ? fazenda?.fazenda_id : undefined)
  const convitesQuery = useConvitesFazenda(ehAdmin ? fazenda?.fazenda_id : undefined)
  const promoverPapel = usePromoverPapel(fazenda?.fazenda_id)
  const cancelarConvite = useCancelarConvite(fazenda?.fazenda_id)

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

  if (!ehAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Apenas o admin da fazenda tem acesso a esta tela.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-muted-foreground">
            Membros e convites da fazenda {fazenda?.nome}.
          </p>
        </div>
        <ConvidarMembroDialog fazendaId={fazenda?.fazenda_id} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-lg font-medium">Membros</h2>

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
                {membrosQuery.data.map((membro) => {
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
                        <RemoverMembroDialog
                          membro={membro}
                          souEu={souEu}
                          fazendaId={fazenda?.fazenda_id}
                        />
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
                    <TableCell>{PAPEL_LABELS[convite.papel_oferecido] ?? convite.papel_oferecido}</TableCell>
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
