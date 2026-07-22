-- ============================================================================
-- Migration: novo padrão de LLM — gemini-2.5-flash-lite
--
-- Pedido de JP (2026-07-22): "vamos incluir o gemini-2.5-flash-lite, sendo
-- nosso modelo padrão, e o gemini-3.5-flash-lite como segundo modelo da
-- lista, a seguir manter a lista atual, na ordem atual, após o
-- 3.5-flash-lite" — catálogo do frontend já atualizado em
-- src/lib/llmCatalog.ts nesta mesma tarefa.
--
-- gemini-2.5-flash-lite é um modelo DIFERENTE de gemini-2.5-flash (removido
-- do catálogo em 2026-07-21 por estar confirmado morto pelo Google) — pedido
-- explícito de JP, não suposição própria. Só editável por admin do software
-- (trigger restringir_alteracao_config_llm, migration 20260722120000).
--
-- Aditiva sobre 20260721130000_fazendas_llm_modelo_gemini_atualizado.sql —
-- não edita a migration original, só corrige o valor pra frente e faz
-- backfill das fazendas que ainda estavam no default anterior
-- (gemini-3.6-flash — confirmado, via select antes desta migration, que as
-- 4 fazendas existentes no ambiente estão todas nesse valor, nenhuma
-- escolheu deliberadamente um modelo diferente).
-- ============================================================================

alter table public.fazendas
  alter column llm_model set default 'gemini-2.5-flash-lite';

alter table public.fazendas disable trigger restringir_alteracao_config_llm;

update public.fazendas
   set llm_model = 'gemini-2.5-flash-lite'
 where llm_provider = 'gemini'
   and llm_model = 'gemini-3.6-flash';

alter table public.fazendas enable trigger restringir_alteracao_config_llm;

comment on column public.fazendas.llm_model is
  'Modelo do provedor de IA escolhido (texto livre, validado contra '
  'src/lib/llmCatalog.ts no frontend). DEFAULT gemini-2.5-flash-lite desde '
  '2026-07-22 (pedido de JP — ver migration 20260722190000). Só editável '
  'por admin do software (trigger restringir_alteracao_config_llm, '
  'migration 20260722120000).';
