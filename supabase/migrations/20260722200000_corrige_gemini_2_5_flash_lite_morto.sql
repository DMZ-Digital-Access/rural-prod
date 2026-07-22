-- ============================================================================
-- Migration: corrige o padrão de LLM — gemini-2.5-flash-lite foi DESATIVADO
--            pelo Google para chaves de API novas
--
-- Achado real (2026-07-22), ao validar a migration anterior
-- (20260722190000) com uso real via classificar-documento: toda chamada
-- real a `gemini-2.5-flash-lite` retorna 502 do próprio Gemini — "This
-- model models/gemini-2.5-flash-lite is no longer available to new users" —
-- confirmado por upload de documento real via Playwright contra o Supabase
-- remoto, não suposição (mesma classe de achado já documentada em
-- 2026-07-21 para gemini-2.5-flash). `gemini-3.5-flash-lite` (segundo da
-- lista pedida por JP) foi testado com sucesso (upload real, extração
-- correta dos campos) e vira o novo padrão em seu lugar.
--
-- Aditiva sobre 20260722190000_fazendas_llm_padrao_gemini_flash_lite.sql —
-- não edita a migration original, só corrige o valor pra frente e faz
-- backfill das fazendas que ainda estavam no valor morto.
-- ============================================================================

alter table public.fazendas
  alter column llm_model set default 'gemini-3.5-flash-lite';

alter table public.fazendas disable trigger restringir_alteracao_config_llm;

update public.fazendas
   set llm_model = 'gemini-3.5-flash-lite'
 where llm_provider = 'gemini'
   and llm_model = 'gemini-2.5-flash-lite';

alter table public.fazendas enable trigger restringir_alteracao_config_llm;

comment on column public.fazendas.llm_model is
  'Modelo do provedor de IA escolhido (texto livre, validado contra '
  'src/lib/llmCatalog.ts no frontend). DEFAULT gemini-3.5-flash-lite desde '
  '2026-07-22 (gemini-2.5-flash-lite foi desativado pelo Google para chaves '
  'de API novas — ver migration 20260722200000). Só editável por admin do '
  'software (trigger restringir_alteracao_config_llm, migration '
  '20260722120000).';
