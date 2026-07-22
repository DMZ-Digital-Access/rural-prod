import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

/**
 * "Papel no sistema" (usuarios.papel_sistema, 2026-07-22) — independe de
 * fazenda, diferente de useFazendaAtual().papel ("papel na fazenda"). Usado
 * pra gatear telas de configuração global (Modelo de IA, Prompt de
 * Extração/OCR) que só admin do software deve acessar — nem o admin de uma
 * fazenda tem acesso.
 */
export function useSouAdminSoftware() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["usuario-atual", "papel-sistema", user?.id] as const,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("papel_sistema")
        .eq("id", user!.id)
        .single()

      if (error) throw error
      return data.papel_sistema === "admin_software"
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}
