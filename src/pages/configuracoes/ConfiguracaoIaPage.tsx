import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
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
  const somenteLeitura = fazenda?.papel !== "admin"

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

      {somenteLeitura && (
        <p className="rounded-lg border border-amber-600/20 bg-amber-600/10 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400">
          Apenas o papel admin pode alterar esta configuração.
        </p>
      )}

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
              disabled={somenteLeitura}
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
              disabled={somenteLeitura}
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

          {!somenteLeitura && (
            <div>
              <Button onClick={handleSave} disabled={atualizar.isPending}>
                {atualizar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
