import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useSouAdminSoftware } from "@/hooks/useSouAdminSoftware"
import {
  useAtualizarConfiguracaoExtracaoLancamentos,
  useConfiguracaoExtracaoLancamentos,
} from "@/hooks/useConfiguracaoExtracaoLancamentos"
import {
  configuracaoExtracaoSchema,
  type ConfiguracaoExtracaoFormValues,
} from "@/lib/validations/configuracaoExtracao"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Controle do prompt de extração e do schema JSON de saída usados por
 * classificar-documento (config global, singleton — ver
 * configuracao_extracao_lancamentos, migration 20260722130000). Só admin do
 * software acessa (mesma fronteira de /app/configuracoes/ia, migration
 * 20260722120000) — bloqueio total pra qualquer outro usuário, não só os
 * inputs desabilitados.
 */
export function ConfiguracaoExtracaoIaPage() {
  const souAdminSoftwareQuery = useSouAdminSoftware()
  const souAdminSoftware = souAdminSoftwareQuery.data === true

  const configQuery = useConfiguracaoExtracaoLancamentos()
  const atualizar = useAtualizarConfiguracaoExtracaoLancamentos()

  const [promptExtracao, setPromptExtracao] = useState("")
  const [schemaJsonTexto, setSchemaJsonTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!configQuery.data) return
    setPromptExtracao(configQuery.data.prompt_extracao)
    setSchemaJsonTexto(JSON.stringify(configQuery.data.schema_json, null, 2))
  }, [configQuery.data])

  async function handleSave() {
    setErro(null)

    const valores: ConfiguracaoExtracaoFormValues = {
      prompt_extracao: promptExtracao,
      schema_json_texto: schemaJsonTexto,
    }
    const resultado = configuracaoExtracaoSchema.safeParse(valores)
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos")
      return
    }

    try {
      await atualizar.mutateAsync({
        prompt_extracao: resultado.data.prompt_extracao,
        schema_json: JSON.parse(resultado.data.schema_json_texto),
      })
      toast.success("Configuração de extração atualizada com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar configuração.")
    }
  }

  if (souAdminSoftwareQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>
  }

  if (!souAdminSoftware) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Prompt de Extração (IA)</h1>
        <p className="text-sm text-muted-foreground">
          Apenas o admin do software tem acesso a esta configuração.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Prompt de Extração (IA)</h1>
        <p className="text-muted-foreground">
          Controla o prompt e o schema JSON de saída usados para ler documentos (nota,
          boleto, recibo) e pré-preencher lançamentos financeiros. Configuração global —
          vale para todas as fazendas do sistema.
        </p>
      </div>

      {configQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando configuração…</p>
      )}

      {configQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar configuração:{" "}
          {configQuery.error instanceof Error ? configQuery.error.message : "erro desconhecido"}
        </p>
      )}

      {configQuery.data && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:max-w-2xl">
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-extracao">Prompt de extração</Label>
            <Textarea
              id="prompt-extracao"
              value={promptExtracao}
              onChange={(e) => setPromptExtracao(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="schema-json">Schema JSON de saída</Label>
            <Textarea
              id="schema-json"
              value={schemaJsonTexto}
              onChange={(e) => setSchemaJsonTexto(e.target.value)}
              rows={14}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              JSON livre — precisa ser um objeto válido. Cuidado: remover ou renomear um
              campo que o formulário de lançamento já usa (tipo, categoria, descricao,
              data_lancamento, valor, numero_nota, contraparte) faz esse campo específico
              parar de ser pré-preenchido, mas nunca quebra a extração dos demais.
            </p>
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}

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
