import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { ImageIcon, PlusIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useFazendasDoUsuario } from "@/hooks/useFazendasDoUsuario"
import { useCriarFazenda } from "@/hooks/useCriarFazenda"
import { useAtualizarEstadoFazenda, useEstadoFazenda } from "@/hooks/useEstadoFazenda"
import { UFS } from "@/lib/estados"
import {
  useAtualizarMeuEmail,
  useAtualizarMeusDados,
  useUsuarioAtual,
} from "@/hooks/useUsuarioAtual"
import {
  useAtualizarDadosFazenda,
  useAtualizarFinalidadesFazenda,
  useEspeciesDaFazenda,
  useFazendaPerfil,
  useLogoFazendaUrl,
  useMarcaGadoFazendaUrl,
  useToggleEspecieDaFazenda,
  useUploadLogoFazenda,
  useUploadMarcaGadoFazenda,
  type AreaUnidade,
  type FinalidadeRebanho,
} from "@/hooks/useFazendaPerfil"
import { useEspecies } from "@/hooks/useEspecies"
import { criarFazendaSchema } from "@/lib/validations/fazenda"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const SEM_UF = "__nenhuma__"

const AREA_UNIDADES: { value: AreaUnidade; label: string }[] = [
  { value: "hectares", label: "Hectares" },
  { value: "alqueires", label: "Alqueires" },
  { value: "acre", label: "Acre" },
  { value: "modulo_fiscal", label: "Módulo fiscal" },
]

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

  // Espécies e finalidades vivem em local state até o clique em Salvar
  // (pedido de JP, 2026-07-23: antes espécie salvava imediatamente por
  // clique, sem passar pelo botão Salvar — daí parecer que "editar só os
  // animais" não "ativava" nada; agora as duas mudanças, juntas ou
  // separadas, habilitam o mesmo botão único).
  const [especiesLocais, setEspeciesLocais] = useState<string[]>([])
  const [finalidadesLocais, setFinalidadesLocais] = useState<FinalidadeRebanho[]>([])

  useEffect(() => {
    setEspeciesLocais(especiesDaFazendaQuery.data ?? [])
  }, [especiesDaFazendaQuery.data])

  useEffect(() => {
    setFinalidadesLocais(perfilQuery.data?.finalidades_rebanho ?? [])
  }, [perfilQuery.data?.finalidades_rebanho])

  function toggleEspecieLocal(especieId: string) {
    setEspeciesLocais((atual) =>
      atual.includes(especieId)
        ? atual.filter((item) => item !== especieId)
        : [...atual, especieId]
    )
  }

  function toggleFinalidadeLocal(finalidade: FinalidadeRebanho) {
    setFinalidadesLocais((atual) =>
      atual.includes(finalidade)
        ? atual.filter((item) => item !== finalidade)
        : [...atual, finalidade]
    )
  }

  const especiesMudaram = !mesmoConjunto(
    especiesLocais,
    especiesDaFazendaQuery.data ?? []
  )
  const finalidadesMudaram = !mesmoConjunto(
    finalidadesLocais,
    perfilQuery.data?.finalidades_rebanho ?? []
  )
  const salvando = toggleEspecie.isPending || atualizarFinalidades.isPending

  async function salvar() {
    try {
      if (especiesMudaram) {
        const especiesSalvas = new Set(especiesDaFazendaQuery.data ?? [])
        const especiesLocaisSet = new Set(especiesLocais)
        const paraIncluir = especiesLocais.filter((id) => !especiesSalvas.has(id))
        const paraRemover = (especiesDaFazendaQuery.data ?? []).filter(
          (id) => !especiesLocaisSet.has(id)
        )

        await Promise.all([
          ...paraIncluir.map((especieId) =>
            toggleEspecie.mutateAsync({ especieId, incluir: true })
          ),
          ...paraRemover.map((especieId) =>
            toggleEspecie.mutateAsync({ especieId, incluir: false })
          ),
        ])
      }

      if (finalidadesMudaram) {
        await atualizarFinalidades.mutateAsync(finalidadesLocais)
      }

      toast.success("Tipo de pecuária atualizado.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar tipo de pecuária."
      )
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:max-w-lg">
      <h2 className="mb-3 text-lg font-medium">Tipo de pecuária</h2>

      <div className="mb-4">
        <Label className="mb-2 block">Tipos de Animais da Fazenda</Label>
        <div className="flex flex-wrap gap-2">
          {especiesQuery.data?.map((especie) => (
            <Button
              key={especie.id}
              type="button"
              size="sm"
              variant={especiesLocais.includes(especie.id) ? "default" : "outline"}
              disabled={somenteLeitura}
              onClick={() => toggleEspecieLocal(especie.id)}
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
      </div>

      {!somenteLeitura && (
        <div className="mt-3">
          <Button
            size="sm"
            onClick={salvar}
            disabled={salvando || (!especiesMudaram && !finalidadesMudaram)}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}
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

  const perfilFazendaQuery = useFazendaPerfil(fazendaAtual?.fazenda_id)
  const atualizarDadosFazenda = useAtualizarDadosFazenda(fazendaAtual?.fazenda_id)
  const estadoQuery = useEstadoFazenda(fazendaAtual?.fazenda_id)
  const atualizarEstado = useAtualizarEstadoFazenda(fazendaAtual?.fazenda_id)

  const [nomeFazenda, setNomeFazenda] = useState("")
  const [municipio, setMunicipio] = useState("")
  const [estado, setEstado] = useState(SEM_UF)
  const [localizacaoNome, setLocalizacaoNome] = useState("")
  const [localizacaoCoordenadas, setLocalizacaoCoordenadas] = useState("")
  const [areaValor, setAreaValor] = useState<number | null>(null)
  const [areaUnidade, setAreaUnidade] = useState<AreaUnidade>("hectares")

  useEffect(() => {
    const perfil = perfilFazendaQuery.data
    if (!perfil) return
    setNomeFazenda(perfil.nome)
    setMunicipio(perfil.municipio ?? "")
    setLocalizacaoNome(perfil.localizacao_nome ?? "")
    setLocalizacaoCoordenadas(perfil.localizacao_coordenadas ?? "")
    setAreaValor(perfil.area_valor)
    setAreaUnidade(perfil.area_unidade ?? "hectares")
  }, [perfilFazendaQuery.data])

  useEffect(() => {
    if (estadoQuery.data) setEstado(estadoQuery.data)
  }, [estadoQuery.data])

  const uploadLogo = useUploadLogoFazenda(fazendaAtual?.fazenda_id)
  const uploadMarcaGado = useUploadMarcaGadoFazenda(fazendaAtual?.fazenda_id)
  const logoUrlQuery = useLogoFazendaUrl(perfilFazendaQuery.data?.logo_path)
  const marcaGadoUrlQuery = useMarcaGadoFazendaUrl(perfilFazendaQuery.data?.marca_gado_path)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const marcaGadoInputRef = useRef<HTMLInputElement | null>(null)

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

  const perfil = perfilFazendaQuery.data
  const estadoMudou = estado !== SEM_UF && estado !== (estadoQuery.data ?? SEM_UF)
  const dadosFazendaMudaram =
    (!!perfil &&
      (nomeFazenda !== perfil.nome ||
        municipio !== (perfil.municipio ?? "") ||
        localizacaoNome !== (perfil.localizacao_nome ?? "") ||
        localizacaoCoordenadas !== (perfil.localizacao_coordenadas ?? "") ||
        areaValor !== perfil.area_valor ||
        areaUnidade !== (perfil.area_unidade ?? "hectares"))) ||
    estadoMudou

  async function salvarDadosFazenda() {
    try {
      if (perfil) {
        await atualizarDadosFazenda.mutateAsync({
          nome: nomeFazenda,
          municipio: municipio.trim() || null,
          localizacao_nome: localizacaoNome.trim() || null,
          localizacao_coordenadas: localizacaoCoordenadas.trim() || null,
          area_valor: areaValor,
          area_unidade: areaValor === null ? null : areaUnidade,
        })
      }
      if (estadoMudou) {
        await atualizarEstado.mutateAsync(estado)
      }
      toast.success("Dados da fazenda atualizados.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar dados da fazenda.")
    }
  }

  async function handleUploadLogo(arquivo: File) {
    try {
      await uploadLogo.mutateAsync(arquivo)
      toast.success("Logo da fazenda atualizada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar logo.")
    }
  }

  async function handleUploadMarcaGado(arquivo: File) {
    try {
      await uploadMarcaGado.mutateAsync(arquivo)
      toast.success("Marca do gado atualizada.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar marca do gado.")
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
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nome-fazenda">Nome</Label>
            <Input
              id="nome-fazenda"
              value={nomeFazenda}
              onChange={(e) => setNomeFazenda(e.target.value)}
              disabled={somenteLeituraFazenda}
            />
          </div>
          <div className="flex gap-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="municipio-fazenda">Município</Label>
              <Input
                id="municipio-fazenda"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                disabled={somenteLeituraFazenda}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="estado-fazenda">Estado</Label>
              <Select
                value={estado}
                onValueChange={(v) => v && setEstado(v)}
                disabled={somenteLeituraFazenda}
              >
                <SelectTrigger id="estado-fazenda" className="w-24">
                  <SelectValue>{(v: string) => (v === SEM_UF ? "—" : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="localizacao-nome-fazenda">Localização</Label>
            <Input
              id="localizacao-nome-fazenda"
              placeholder="Nome do local (Google Places)"
              value={localizacaoNome}
              onChange={(e) => setLocalizacaoNome(e.target.value)}
              disabled={somenteLeituraFazenda}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="localizacao-coordenadas-fazenda">
              Localização por coordenadas
            </Label>
            <Input
              id="localizacao-coordenadas-fazenda"
              placeholder="Ex.: -19.7483, -47.9319 (Google Maps)"
              value={localizacaoCoordenadas}
              onChange={(e) => setLocalizacaoCoordenadas(e.target.value)}
              disabled={somenteLeituraFazenda}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="area-fazenda">Área</Label>
            <div className="flex gap-2">
              <NumericInput
                id="area-fazenda"
                casasDecimais={1}
                value={areaValor}
                onChange={setAreaValor}
                disabled={somenteLeituraFazenda}
                className="flex-1"
              />
              <Select
                value={areaUnidade}
                onValueChange={(v) => v && setAreaUnidade(v as AreaUnidade)}
                disabled={somenteLeituraFazenda}
              >
                <SelectTrigger className="w-40 shrink-0">
                  <SelectValue>
                    {(v: string) =>
                      AREA_UNIDADES.find((u) => u.value === v)?.label ?? ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AREA_UNIDADES.map((unidade) => (
                    <SelectItem key={unidade.value} value={unidade.value}>
                      {unidade.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="grid gap-1.5">
              <Label>Logo da fazenda</Label>
              <div className="relative flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {logoUrlQuery.data ? (
                  <img
                    src={logoUrlQuery.data}
                    alt=""
                    className="absolute inset-0 size-full object-contain"
                  />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              {!somenteLeituraFazenda && (
                <>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0]
                      if (arquivo) handleUploadLogo(arquivo)
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadLogo.isPending}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadLogo.isPending ? "Enviando…" : "Selecionar imagem"}
                  </Button>
                </>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Marca do gado</Label>
              <div className="relative flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {marcaGadoUrlQuery.data ? (
                  <img
                    src={marcaGadoUrlQuery.data}
                    alt=""
                    className="absolute inset-0 size-full object-contain"
                  />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              {!somenteLeituraFazenda && (
                <>
                  <input
                    ref={marcaGadoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0]
                      if (arquivo) handleUploadMarcaGado(arquivo)
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadMarcaGado.isPending}
                    onClick={() => marcaGadoInputRef.current?.click()}
                  >
                    {uploadMarcaGado.isPending ? "Enviando…" : "Selecionar imagem"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {somenteLeituraFazenda && (
          <p className="mt-2 text-sm text-muted-foreground">
            Papel financeiro não pode alterar os dados da fazenda.
          </p>
        )}
        {!somenteLeituraFazenda && (
          <div className="mt-3">
            <Button
              size="sm"
              onClick={salvarDadosFazenda}
              disabled={
                atualizarDadosFazenda.isPending ||
                atualizarEstado.isPending ||
                !dadosFazendaMudaram
              }
            >
              {atualizarDadosFazenda.isPending || atualizarEstado.isPending
                ? "Salvando…"
                : "Salvar"}
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
            <PhoneInput
              id="telefone-usuario"
              value={telefone}
              onChange={(v) => setTelefone(v ?? "")}
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
          <h2 className="text-lg font-medium">Administração de fazendas</h2>
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
