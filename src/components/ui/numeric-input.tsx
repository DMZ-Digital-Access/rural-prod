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
  ref,
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

  // Reformata quando o valor externo muda por um caminho que NÃO é a
  // digitação neste próprio input (ex.: form.reset() ao fechar o dialog).
  // A guarda `paraNumero(texto) === value` é essencial: como este efeito
  // depende de `value`, e o próprio onChange abaixo já atualiza `value` a
  // cada tecla digitada, sem a guarda o efeito reformatava (arredondando
  // para `casasDecimais`) a CADA tecla — na prática travando a digitação
  // em 1 dígito assim que casasDecimais > 0 (ex.: digitar "1" virava
  // "1,00" imediatamente, e a tecla seguinte já entrava depois da vírgula
  // em vez de continuar o número inteiro). Só reformata quando o valor
  // externo realmente diverge do que já está digitado.
  useEffect(() => {
    if (paraNumero(texto) === value) return
    setTexto(value === null || value === undefined ? "" : formatarPtBr(value, casasDecimais))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, casasDecimais])

  return (
    <Input
      {...props}
      ref={ref}
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
