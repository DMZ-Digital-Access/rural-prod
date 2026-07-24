import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAISES_TELEFONE, formatarTelefoneBr } from "@/lib/paisesTelefone"

const PAIS_PADRAO = PAISES_TELEFONE[0] // Brasil, +55

// DDIs mais longos primeiro — evita "+1" casar por engano com um valor que
// na verdade começa com um DDI de 2+ dígitos que também comece por "1"
// (nenhum caso real hoje, mas defensivo pra qualquer país novo adicionado).
const PAISES_POR_DDI_DESC = [...PAISES_TELEFONE].sort((a, b) => b.ddi.length - a.ddi.length)

function separarValor(valor: string | null | undefined) {
  if (!valor) return { ddi: PAIS_PADRAO.ddi, resto: "" }
  const pais = PAISES_POR_DDI_DESC.find((p) => valor.startsWith(p.ddi))
  if (!pais) return { ddi: PAIS_PADRAO.ddi, resto: valor.trim() }
  return { ddi: pais.ddi, resto: valor.slice(pais.ddi.length).trim() }
}

/**
 * Telefone com seletor de país (bandeira + DDI, pedido de JP, 2026-07-24) —
 * número nacional formatado automaticamente no padrão brasileiro
 * ((DDD) NNNN-NNNN ou (DDD) NNNNN-NNNN) enquanto o usuário digita só
 * dígitos; outros países mostram os dígitos crus (cada um tem sua própria
 * máscara, fora de escopo aqui). Valor externo é uma única string
 * "+55 (53) 3222-3371" — sem coluna nova no banco, mesmo campo
 * `telefone_celular` de antes.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const [ddi, setDdi] = useState(() => separarValor(value).ddi)
  const [numero, setNumero] = useState(() => separarValor(value).resto)

  // Reformata quando o valor externo muda por um caminho que não é a
  // digitação neste próprio input (ex.: form carregando os dados do
  // usuário) — mesma guarda de NumericInput, evita loop com o próprio
  // onChange.
  useEffect(() => {
    const separado = separarValor(value)
    setDdi(separado.ddi)
    setNumero(separado.resto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emitir(novoDdi: string, novoNumero: string) {
    const combinado = novoNumero ? `${novoDdi} ${novoNumero}` : ""
    onChange(combinado || null)
  }

  return (
    <div className="flex gap-2">
      <Select
        value={ddi}
        onValueChange={(v) => {
          if (!v) return
          setDdi(v)
          emitir(v, numero)
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-24 shrink-0">
          <SelectValue>
            {(v: string) => {
              const pais = PAISES_TELEFONE.find((p) => p.ddi === v)
              return pais ? `${pais.bandeira} ${pais.ddi}` : v
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PAISES_TELEFONE.map((pais) => (
            <SelectItem key={pais.sigla} value={pais.ddi}>
              {pais.bandeira} {pais.sigla} {pais.ddi}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        placeholder={ddi === PAIS_PADRAO.ddi ? "(00) 00000-0000" : undefined}
        className="flex-1"
        value={numero}
        disabled={disabled}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "")
          const formatado = ddi === PAIS_PADRAO.ddi ? formatarTelefoneBr(digitos) : digitos
          setNumero(formatado)
          emitir(ddi, formatado)
        }}
      />
    </div>
  )
}
