import type { ReactNode } from "react"
import { PawPrintIcon, ReceiptTextIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { EntradaSaidaLoteDialog } from "@/pages/animais/EntradaSaidaLoteDialog"
import { CriarLancamentoDialog } from "@/pages/financeiro/CriarLancamentoDialog"

/**
 * Botão grande de ação — visual compartilhado pelas duas opções desta tela.
 * O clique real é decidido por quem chama (a função `abrir` de cada dialog
 * reaproveitado), este componente só cuida da apresentação.
 */
function BotaoAcaoRapida({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: ReactNode
  titulo: string
  descricao: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center transition-colors hover:border-foreground/30 hover:bg-muted"
    >
      <span className="text-muted-foreground">{icone}</span>
      <span className="text-lg font-semibold">{titulo}</span>
      <span className="text-sm text-muted-foreground">{descricao}</span>
    </button>
  )
}

/**
 * Lançamento Rápido (pedido de JP, 2026-07-22) — tela dedicada, sem mais
 * nada além das duas ações mais comuns do dia a dia, pra não precisar
 * navegar até a lista específica só pra abrir "Novo Lançamento"/"Entradas e
 * Saídas". Reaproveita os dois dialogs já existentes (mesma lógica, só o
 * botão-gatilho muda de visual via a prop `trigger`) — nenhum fluxo novo.
 */
export function LancamentoRapidoPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  if (somenteLeitura) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Lançamento Rápido</h1>
        <p className="text-sm text-muted-foreground">
          Seu papel (financeiro) tem acesso só de consulta — não é possível lançar novas
          operações.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Lançamento Rápido</h1>
        <p className="text-muted-foreground">
          Escolha o que você quer registrar agora.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EntradaSaidaLoteDialog
          fazendaId={fazenda?.fazenda_id}
          trigger={(abrir) => (
            <BotaoAcaoRapida
              icone={<PawPrintIcon className="size-10" />}
              titulo="Operação com Animais"
              descricao="Compra, venda, nascimento, óbito ou consumo de animais do rebanho."
              onClick={abrir}
            />
          )}
        />

        <CriarLancamentoDialog
          fazendaId={fazenda?.fazenda_id}
          trigger={(abrir) => (
            <BotaoAcaoRapida
              icone={<ReceiptTextIcon className="size-10" />}
              titulo="Despesas e Receitas Gerais"
              descricao="Envie a foto de uma nota, boleto ou recibo — a IA pré-preenche os campos pra você revisar."
              onClick={abrir}
            />
          )}
        />
      </div>
    </div>
  )
}
