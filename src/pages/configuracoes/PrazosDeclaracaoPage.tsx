import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useAtualizarEstadoFazenda,
  useEstadoFazenda,
  usePrazosDoEstado,
} from "@/hooks/useEstadoFazenda"
import { Button } from "@/components/ui/button"
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
import { DefinirPrazoDialog } from "@/pages/configuracoes/DefinirPrazoDialog"
import { UFS } from "@/lib/estados"

const SEM_UF = "__nenhuma__"

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

/**
 * Configurações > Prazos de Declaração (item 20, spec seção 5.3) — canônico
 * pra editar `fazendas.estado` (movido de dentro da tela de Declarações,
 * que agora só linka pra cá) e pra cadastrar/corrigir prazos formais de
 * `prazos_declaracao_estado` por ano (spec seção 4.2). Escrita exige
 * papel <> financeiro (mesma fronteira de `definir_prazo_declaracao_estado`
 * — não é exclusivo de admin, diferente de Modelo de IA).
 */
export function PrazosDeclaracaoPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const estadoQuery = useEstadoFazenda(fazenda?.fazenda_id)
  const atualizarEstado = useAtualizarEstadoFazenda(fazenda?.fazenda_id)
  const prazosQuery = usePrazosDoEstado(estadoQuery.data)

  const [ufSelecionada, setUfSelecionada] = useState(SEM_UF)

  useEffect(() => {
    if (estadoQuery.data) setUfSelecionada(estadoQuery.data)
  }, [estadoQuery.data])

  async function salvarEstado() {
    if (ufSelecionada === SEM_UF) return
    try {
      await atualizarEstado.mutateAsync(ufSelecionada)
      toast.success("Estado da fazenda atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar estado.")
    }
  }

  const mostrarBotaoSalvarEstado =
    !somenteLeitura && ufSelecionada !== SEM_UF && ufSelecionada !== estadoQuery.data

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Prazos de Declaração</h1>
        <p className="text-muted-foreground">
          Prazo regulatório de envio da Declaração Anual de Rebanho, por estado — usado no
          alerta de pendência e na tela de Declarações.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <Label>Estado da fazenda (UF)</Label>
        <p className="mb-2 text-sm text-muted-foreground">
          Determina qual UF é usada pra calcular o prazo vigente.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            value={ufSelecionada}
            onValueChange={(v) => {
              if (v) setUfSelecionada(v)
            }}
            disabled={somenteLeitura}
          >
            <SelectTrigger className="w-32">
              <SelectValue>{(v: string) => (v === SEM_UF ? "Selecione" : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {UFS.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mostrarBotaoSalvarEstado && (
            <Button size="sm" disabled={atualizarEstado.isPending} onClick={salvarEstado}>
              Salvar estado
            </Button>
          )}
        </div>
      </div>

      {estadoQuery.data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Prazos cadastrados — {estadoQuery.data}</h2>
            {!somenteLeitura && <DefinirPrazoDialog estado={estadoQuery.data} />}
          </div>

          {prazosQuery.data && prazosQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum prazo cadastrado ainda
              {estadoQuery.data === "RS"
                ? " — usando o padrão de 01/04 a 30/06 enquanto isso."
                : "."}
            </p>
          )}

          {prazosQuery.data && prazosQuery.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ano</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prazosQuery.data.map((prazo) => (
                    <TableRow key={prazo.id}>
                      <TableCell className="font-medium">{prazo.ano_referencia}</TableCell>
                      <TableCell>{formatData(prazo.data_inicio_prazo)}</TableCell>
                      <TableCell>{formatData(prazo.data_fim_prazo)}</TableCell>
                      <TableCell>
                        {!somenteLeitura && (
                          <DefinirPrazoDialog estado={estadoQuery.data as string} prazoExistente={prazo} />
                        )}
                      </TableCell>
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
