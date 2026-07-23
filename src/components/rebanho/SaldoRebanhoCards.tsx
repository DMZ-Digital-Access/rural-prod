import { useResumoSaldoAno } from "@/hooks/useTransacoes"
import { Card, CardContent } from "@/components/ui/card"
import { formatNumero } from "@/lib/format"

/**
 * Cards de Saldo de Rebanho por espécie — extraído do Painel Inteligente
 * (pedido de JP, 2026-07-23) pra aparecer também no topo da página Animais,
 * com o mesmo comportamento e os mesmos dados nas duas telas (mesmo hook,
 * mesma lógica de "espécie sem nenhum saldo/pendência fica de fora", já
 * feita dentro de `useResumoSaldoAno`).
 */
export function SaldoRebanhoCards({
  fazendaId,
  ano,
}: {
  fazendaId: string | undefined
  ano: number
}) {
  const resumoSaldo = useResumoSaldoAno(fazendaId, ano)

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Saldo de Rebanho</h2>
      {resumoSaldo.data && resumoSaldo.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma movimentação de animais registrada ainda.
        </p>
      )}
      {resumoSaldo.data && resumoSaldo.data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {resumoSaldo.data.map((especie) => (
            <Card key={especie.especieNome}>
              <CardContent className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{especie.especieNome}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatNumero(especie.saldoFim)}
                </span>
                {especie.pendente > 0 && (
                  <span className="text-xs text-orange-600 dark:text-orange-400">
                    {formatNumero(especie.pendente)} pendente
                    {especie.pendente === 1 ? "" : "s"}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
