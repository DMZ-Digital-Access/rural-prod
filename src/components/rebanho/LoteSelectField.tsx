import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormControl } from "@/components/ui/form"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"

const SEM_LOTE = "__sem_lote__"

/**
 * Select de lote reutilizado nos formulários de criar/editar animal. O
 * componente Select (base-ui) não aceita item com value=null — usa-se o
 * sentinela SEM_LOTE na UI, convertido para `null` em `onChange`.
 */
export function LoteSelectField({
  lotes,
  value,
  onChange,
}: {
  lotes: LoteComEstatisticas[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <Select
      value={value ?? SEM_LOTE}
      onValueChange={(v) => onChange(v && v !== SEM_LOTE ? v : null)}
    >
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecione um lote (opcional)" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={SEM_LOTE}>Sem lote</SelectItem>
        {lotes.map((lote) => (
          <SelectItem key={lote.id} value={lote.id}>
            {lote.nome}
            {!lote.ativo ? " (arquivado)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
