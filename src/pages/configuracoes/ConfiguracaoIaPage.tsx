import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useSouAdminSoftware } from "@/hooks/useSouAdminSoftware"
import {
  useAtualizarConfiguracaoLlm,
  useConfiguracaoLlm,
} from "@/hooks/useConfiguracaoLlm"
import { LLM_CATALOG, LLM_PROVIDER_LABELS, type LlmProvider } from "@/lib/llmCatalog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PROVIDERS = Object.keys(LLM_CATALOG) as LlmProvider[]

export function ConfiguracaoIaPage() {
  const { data: fazenda } = useFazendaAtual()
  const souAdminSoftwareQuery = useSouAdminSoftware()
  const souAdminSoftware = souAdminSoftwareQuery.data === true

  const configQuery = useConfiguracaoLlm(fazenda?.fazenda_id)
  const atualizar = useAtualizarConfiguracaoLlm(fazenda?.fazenda_id)

  const [provider, setProvider] = useState<LlmProvider>("anthropic")
  const [model, setModel] = useState<string>(LLM_CATALOG.anthropic.models[0].id)

  useEffect(() => {
    if (!configQuery.data) return
    setProvider(configQuery.data.llm_provider)
    setModel(configQuery.data.llm_model)
  }, [configQuery.data])

  function handleProviderChange(novoProvider: LlmProvider) {
    setProvider(novoProvider)
    setModel(LLM_CATALOG[novoProvider].models[0].id)
  }

  async function handleSave() {
    try {
      await atualizar.mutateAsync({ llm_provider: provider, llm_model: model })
      toast.success("Configuração de IA atualizada com sucesso.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar configuração."
      )
    }
  }

  const modeloSelecionado = LLM_CATALOG[provider].models.find((m) => m.id === model)

  if (souAdminSoftwareQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>
  }

  if (!souAdminSoftware) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Modelo de IA</h1>
        <p className="text-sm text-muted-foreground">
          Apenas o admin do software tem acesso a esta configuração.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Modelo de IA</h1>
        <p className="text-muted-foreground">
          Define qual provedor e modelo de IA o sistema usa para ler documentos (nota,
          boleto, recibo) e pré-preencher lançamentos financeiros. A chave de API é
          compartilhada pelo sistema — você só escolhe entre as opções já configuradas.
        </p>
      </div>

      {configQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando configuração…</p>
      )}

      {configQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar configuração:{" "}
          {configQuery.error instanceof Error
            ? configQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {configQuery.data && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:max-w-lg">
          <div className="grid gap-1.5">
            <Label>Provedor</Label>
            <Select
              value={provider}
              onValueChange={(v) => v && handleProviderChange(v as LlmProvider)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: LlmProvider) => LLM_PROVIDER_LABELS[v]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {LLM_PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Modelo</Label>
            <Select
              value={model}
              onValueChange={(v) => v && setModel(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    LLM_CATALOG[provider].models.find((m) => m.id === v)?.label ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LLM_CATALOG[provider].models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {modeloSelecionado && (
              <p className="text-xs text-muted-foreground">{modeloSelecionado.descricao}</p>
            )}
          </div>

          <div>
            <Button onClick={handleSave} disabled={atualizar.isPending}>
              {atualizar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
