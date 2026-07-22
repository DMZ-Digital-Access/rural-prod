-- ============================================================================
-- Migration: corrige ambiguidade de coluna em listar_membros_fazenda()
--
-- Achado real durante a validação (verificação de segurança direta no
-- banco, 2026-07-22): a cláusula `returns table (usuario_id uuid, ...)`
-- declara implicitamente uma variável `usuario_id` visível em todo o corpo
-- da função (comportamento padrão do PL/pgSQL para RETURNS TABLE) — que
-- colidia com a coluna `usuarios_fazendas.usuario_id` referenciada sem
-- qualificação na checagem de admin, causando
-- `ERROR: column reference "usuario_id" is ambiguous` em TODA chamada,
-- inclusive de um admin de verdade (a função nunca funcionou, mesmo pro
-- caminho feliz).
--
-- Aditiva sobre 20260722170000_rpc_equipe_fazenda.sql — não edita a
-- migration original, só substitui o corpo da função (create or replace),
-- mesmo padrão já usado em correções anteriores desta sessão. Qualifica
-- a referência com o alias `uf` na subquery de checagem de admin.
-- ============================================================================

create or replace function public.listar_membros_fazenda(p_fazenda_id uuid)
returns table (
  usuario_id uuid,
  nome       text,
  email      text,
  papel      text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamador_e_admin boolean;
begin
  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = p_fazenda_id
       and uf.papel = 'admin'
  ) into v_chamador_e_admin;

  if not v_chamador_e_admin then
    raise exception 'Apenas admins da fazenda podem ver a lista de membros';
  end if;

  return query
    select uf.usuario_id, u.nome, u.email, uf.papel
      from public.usuarios_fazendas uf
      join public.usuarios u on u.id = uf.usuario_id
     where uf.fazenda_id = p_fazenda_id
     order by uf.created_at asc;
end;
$$;

comment on function public.listar_membros_fazenda(uuid) is
  'Lista membros (usuario_id, nome, email, papel) de uma fazenda — admin-only. '
  'SECURITY DEFINER: usuarios não expõe nome/email de OUTROS usuários via RLS '
  'a ninguém (nem a admin) — só esta RPC, gated por admin da fazenda, faz '
  'esse cruzamento, evitando abrir uma policy nova e mais ampla em usuarios. '
  'Corrigido em 2026-07-22 (migration 20260722180000): a coluna de retorno '
  'usuario_id colidia com usuarios_fazendas.usuario_id na checagem de admin '
  '(RETURNS TABLE declara a variável implicitamente) — qualificado com '
  'alias uf.';

revoke all on function public.listar_membros_fazenda(uuid) from public;
grant execute on function public.listar_membros_fazenda(uuid) to authenticated;
