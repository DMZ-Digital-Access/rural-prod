-- ============================================================================
-- Migration: fazendas.llm_provider/llm_model passa a exigir admin do
--            SOFTWARE, não mais admin da FAZENDA.
--
-- Contexto (pedido de JP, 2026-07-22): "os itens de administrar prompt do
-- OCR e administrar LLM só serão acessíveis ao admin do software, o admin de
-- cada conta/fazenda não terá acesso a isso." A chave de API de cada
-- provedor já era compartilhada/nossa desde a decisão original (migration
-- 20260721080000, BYOK descartado) — o admin da fazenda nunca controlou
-- credencial própria, só a escolha de provedor/modelo. Essa escolha agora
-- também passa a ser administrada centralmente.
--
-- Aditiva sobre 20260721080000_fazendas_config_llm.sql — não edita a
-- migration original, só substitui o corpo da função (create or replace),
-- mesmo padrão já usado em 20260721050000/20260722100000 para funções
-- redefinidas em migrations posteriores.
--
-- Colunas continuam por fazenda, sem mudança de schema aqui — só muda QUEM
-- pode gravar: troca a checagem de
-- `usuarios_fazendas.papel = 'admin'` (papel NA fazenda) para
-- `public.is_admin_software()` (papel NO sistema, migration 20260722110000).
-- ============================================================================

create or replace function public.restringir_alteracao_config_llm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin_software() then
    raise exception 'apenas o admin do software pode alterar a configuração de IA da fazenda';
  end if;

  return new;
end;
$$;

comment on function public.restringir_alteracao_config_llm() is
  'Restringe UPDATE de llm_provider/llm_model a admin do SOFTWARE '
  '(usuarios.papel_sistema = admin_software, migration 20260722110000) — '
  'não mais ao admin da FAZENDA (usuarios_fazendas.papel), decisão revertida '
  'em 2026-07-22 a pedido de JP. Sobre fazendas_update_vinculada (Fase 1, '
  'item 6), que autoriza UPDATE de qualquer papel vinculado sem distinção — '
  'esta guarda continua sendo a única linha de defesa para estas 2 colunas.';
