-- ============================================================================
-- Migration: corrige fazendas.llm_model — gemini-2.5-flash foi DESATIVADO
--            pelo Google para chaves de API novas
--
-- Achado real (2026-07-21), ao configurar a GEMINI_API_KEY de produção pela
-- primeira vez: toda chamada real a `gemini-2.5-flash` (DEFAULT desde a
-- migration 20260721090000) retorna 404 do próprio Google —
-- "This model models/gemini-2.5-flash is no longer available to new users.
-- Please update your code to use a newer model" — confirmado por chamadas
-- HTTP diretas contra a API, não suposição. O mesmo vale para
-- `gemini-2.5-pro` e `gemini-3-pro-preview` (também no catálogo do
-- frontend, `src/lib/llmCatalog.ts`, agora corrigido). `gemini-3.6-flash`
-- foi confirmado funcionando de verdade (chamada real, resposta 200 com
-- texto gerado) e é o modelo "flash" padrão recomendado pela própria
-- documentação do Gemini hoje — vira o novo DEFAULT.
--
-- Aditiva sobre 20260721090000_fazendas_llm_padrao_gemini.sql — não edita a
-- migration original, só corrige o valor pra frente e faz backfill das
-- fazendas que ainda estavam no default morto (nenhuma fazenda tinha
-- escolhido esse modelo deliberadamente — era só o DEFAULT nunca alterado).
--
-- Mesmo cuidado operacional já documentado: o trigger
-- `restringir_alteracao_config_llm` (só admin pode alterar llm_provider/
-- llm_model) bloqueia até UPDATE via psql superusuário direto (`auth.uid()`
-- é NULL fora de sessão autenticada) — precisa disable/enable ao redor do
-- backfill.
-- ============================================================================

alter table public.fazendas
  alter column llm_model set default 'gemini-3.6-flash';

alter table public.fazendas disable trigger restringir_alteracao_config_llm;

update public.fazendas
   set llm_model = 'gemini-3.6-flash'
 where llm_provider = 'gemini'
   and llm_model = 'gemini-2.5-flash';

alter table public.fazendas enable trigger restringir_alteracao_config_llm;

comment on column public.fazendas.llm_model is
  'Modelo do provedor de IA escolhido (texto livre, validado contra '
  'src/lib/llmCatalog.ts no frontend). DEFAULT gemini-3.6-flash desde '
  '2026-07-21 (gemini-2.5-flash foi desativado pelo Google para chaves de '
  'API novas — ver migration 20260721130000). Só editável por papel=admin '
  '(trigger restringir_alteracao_config_llm).';
