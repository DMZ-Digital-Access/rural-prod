import { useState, useEffect, useId } from "react"
import { Input } from "@/components/ui/input"

// Input numérico com exibição formatada pt-BR (separador de milhar ".",
// decimal ","), enquanto o valor mantido no formulário continua sendo um
// number puro (ou null quando vazio). Reaproveitado por qualquer campo de
// valor financeiro/peso do projeto — HTML type="number" nativo não suporta
// separador de milhar, então o input aqui é type="text" com inputMode
// numérico, formatando no blur e aceitando dígitos/vírgula durante a
// digitação.

function formatarPtBr(valor: number, casasDecimais: number) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  })
}

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\./g, "").replace(",", ".").trim()
  if (limpo === "") return null
  const valor = Number(limpo)
  return Number.isFinite(valor) ? valor : null
}

export function NumericInput({
  value,
  onChange,
  onBlur,
  casasDecimais = 2,
  ...props
}: {
  value: number | null | undefined
  onChange: (value: number | null) => void
  onBlur?: () => void
  casasDecimais?: number
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "type"
>) {
  const inputId = useId()
  const [texto, setTexto] = useState(() =>
    value === null || value === undefined ? "" : formatarPtBr(value, casasDecimais)
  )

  // Reformata quando o valor externo muda por um caminho que não é a
  // digitação neste próprio input (ex.: form.reset() ao fechar o dialog).
  useEffect(() => {
    setTexto(value === null || value === undefined ? "" : formatarPtBr(value, casasDecimais))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Input
      {...props}
      id={inputId}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        onChange(paraNumero(e.target.value))
      }}
      onBlur={() => {
        const numero = paraNumero(texto)
        setTexto(numero === null ? "" : formatarPtBr(numero, casasDecimais))
        onBlur?.()
      }}
    />
  )
}
