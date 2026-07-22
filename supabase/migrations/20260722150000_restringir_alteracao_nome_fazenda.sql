-- ============================================================================
-- Migration: fazendas.nome passa a exigir papel <> financeiro.
--
-- Achado ao planejar a tela /app/configuracoes (2026-07-22): a policy
-- `fazendas_update_vinculada` (Fase 1) autoriza UPDATE de `nome` por
-- QUALQUER papel vinculado, inclusive `financeiro` — inconsistente com o
-- resto do sistema, onde financeiro é sempre só leitura em toda escrita já
-- revisada (transacoes, lancamentos_financeiros, gtas, declaracoes_rebanho,
-- configuração de IA). Confirmado com JP: corrigir.
--
-- Aditiva sobre 20260716171522_fase1_usuarios_fazendas.sql — não edita a
-- migration original, só adiciona um trigger novo (a guarda de imutabilidade
-- já existente, `prevent_fazendas_identity_change()`, protege id/usuario_id/
-- created_at e deliberadamente deixa `nome` livre — este trigger novo é
-- sobre QUEM pode mudar `nome`, não sobre impedir a mudança em si).
-- ============================================================================

create or replace function public.restringir_alteracao_nome_fazenda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_papel text;
begin
  select papel
    into v_papel
    from public.usuarios_fazendas
   where usuario_id = auth.uid()
     and fazenda_id = old.id;

  if v_papel is distinct from 'admin' and v_papel is distinct from 'membro' then
    raise exception 'papel financeiro não pode alterar o nome da fazenda';
  end if;

  return new;
end;
$$;

comment on function public.restringir_alteracao_nome_fazenda() is
  'Restringe UPDATE de fazendas.nome a papel admin/membro (não financeiro) — '
  'achado de inconsistência de RLS ao planejar /app/configuracoes '
  '(2026-07-22): fazendas_update_vinculada (Fase 1) autorizava qualquer '
  'papel vinculado, diferente do resto do sistema. Mesmo padrão de '
  'restringir_alteracao_config_llm, mas escopo de FAZENDA (usuarios_fazendas '
  '.papel), não de sistema (usuarios.papel_sistema).';

create trigger restringir_alteracao_nome_fazenda
  before update of nome on public.fazendas
  for each row
  execute function public.restringir_alteracao_nome_fazenda();
