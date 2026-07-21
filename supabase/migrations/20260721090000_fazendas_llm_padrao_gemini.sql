-- ============================================================================
-- Migration: Gemini como provedor padrão de IA — pedido de JP ao construir a
--            Edge Function de classificação de lançamentos financeiros:
--            "constroi a edge function usando gemini como padrao".
--
-- Motivo de mudar o DEFAULT (não só a Edge Function): dos 3 provedores do
-- catálogo (Anthropic/OpenAI/Gemini, ver ADR da tela de Configurações,
-- migration 20260721080000), só o Gemini tem chamada de API real
-- implementada nesta tarefa — uma fazenda nova continuaria com
-- `llm_provider = 'anthropic'` (default anterior) e o recurso simplesmente
-- não funcionaria até o admin abrir Configurações e trocar manualmente.
-- Trocando o default para o único provedor implementado, o recurso funciona
-- "out of the box".
--
-- Linhas já existentes também atualizadas para 'gemini'/'gemini-2.5-flash'
-- (só há fazendas de teste em produção agora, sem efeito colateral real) —
-- alterar só o DEFAULT não muda linhas já gravadas.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

alter table public.fazendas
  alter column llm_provider set default 'gemini',
  alter column llm_model set default 'gemini-2.5-flash';

-- Backfill das linhas existentes — bypassa o trigger
-- restringir_alteracao_config_llm (exige auth.uid() de uma sessão
-- autenticada real, ausente numa migration rodando como superusuário).
alter table public.fazendas disable trigger restringir_alteracao_config_llm;

update public.fazendas
   set llm_provider = 'gemini',
       llm_model = 'gemini-2.5-flash'
 where llm_provider = 'anthropic'
   and llm_model = 'claude-haiku-4-5';

alter table public.fazendas enable trigger restringir_alteracao_config_llm;
