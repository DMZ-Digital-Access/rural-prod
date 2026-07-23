import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export type FinalidadeRebanho = "recria" | "engorda" | "leite"

export type FazendaPerfil = {
  id: string
  nome: string
  descricao: string | null
  imagem_hero_path: string | null
  finalidades_rebanho: FinalidadeRebanho[]
}

const fazendaPerfilKey = (fazendaId: string | undefined) =>
  ["fazenda-perfil", fazendaId] as const

/**
 * Detalhe de UMA fazenda (Perfil da Fazenda + Tipo de Pecuária,
 * 2026-07-23) — `fazendas_select_vinculada` (RLS, Fase 1) já cobre a
 * fronteira de acesso (qualquer papel vinculado lê).
 */
export function useFazendaPerfil(fazendaId: string | undefined) {
  return useQuery({
    queryKey: fazendaPerfilKey(fazendaId),
    queryFn: async (): Promise<FazendaPerfil> => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("id, nome, descricao, imagem_hero_path, finalidades_rebanho")
        .eq("id", fazendaId as string)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!fazendaId,
  })
}

/**
 * Descrição da fazenda (Perfil da Fazenda) — só admin (trigger
 * `restringir_alteracao_perfil_fazenda`, migration 20260723160000).
 * Mutação separada de `useAtualizarFinalidadesFazenda` deliberadamente —
 * as duas vivem em telas diferentes (Perfil da Fazenda vs. Configurações,
 * "Tipo de Pecuária") e um UPDATE combinado arriscaria sobrescrever um
 * campo que a tela chamadora nem está editando.
 */
export function useAtualizarDescricaoFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (descricao: string | null) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase
        .from("fazendas")
        .update({ descricao })
        .eq("id", fazendaId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fazendaPerfilKey(fazendaId) })
    },
  })
}

/**
 * Finalidades do rebanho (Tipo de Pecuária, tela Configurações) — só admin
 * (mesmo trigger de `useAtualizarDescricaoFazenda`). Ver comentário lá
 * sobre por que é uma mutação separada.
 */
export function useAtualizarFinalidadesFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (finalidades: FinalidadeRebanho[]) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase
        .from("fazendas")
        .update({ finalidades_rebanho: finalidades })
        .eq("id", fazendaId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fazendaPerfilKey(fazendaId) })
    },
  })
}

/**
 * Upload da imagem de capa (hero) da fazenda — bucket `fazendas-hero`
 * (só admin, RLS), caminho `{fazenda_id}/hero.{extensao}`, `upsert: true`
 * (substitui a imagem anterior). Mesmo padrão de
 * `useUploadDocumentoTransacao`.
 */
export function useUploadHeroFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (arquivo: File) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg"
      const caminho = `${fazendaId}/hero.${extensao}`

      const { error: uploadError } = await supabase.storage
        .from("fazendas-hero")
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
      if (uploadError) throw uploadError

      const { error } = await supabase
        .from("fazendas")
        .update({ imagem_hero_path: caminho })
        .eq("id", fazendaId)
      if (error) throw error

      return caminho
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fazendaPerfilKey(fazendaId) })
    },
  })
}

/**
 * URL assinada da imagem de capa — 1h de validade (imagem exibida direto
 * na página, não um documento baixado sob demanda, por isso uma janela
 * maior que os 60s usados em `useAbrirDocumentoTransacao`).
 */
export function useHeroFazendaUrl(caminho: string | null | undefined) {
  return useQuery({
    queryKey: ["fazenda-hero-url", caminho] as const,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from("fazendas-hero")
        .createSignedUrl(caminho as string, 3600)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!caminho,
  })
}

/** Espécies (Tipos de Animais) já vinculadas à fazenda — fazendas_especies. */
export function useEspeciesDaFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["fazenda-especies", fazendaId] as const,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("fazendas_especies")
        .select("especie_id")
        .eq("fazenda_id", fazendaId as string)

      if (error) throw error
      return data.map((linha) => linha.especie_id as string)
    },
    enabled: !!fazendaId,
  })
}

/** Inclui/remove uma espécie da fazenda (toggle) — só admin (RLS). */
export function useToggleEspecieDaFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ especieId, incluir }: { especieId: string; incluir: boolean }) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      if (incluir) {
        const { error } = await supabase
          .from("fazendas_especies")
          .insert({ fazenda_id: fazendaId, especie_id: especieId })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("fazendas_especies")
          .delete()
          .eq("fazenda_id", fazendaId)
          .eq("especie_id", especieId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fazenda-especies", fazendaId] })
    },
  })
}
