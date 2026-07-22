-- ============================================================================
-- Migration: RPCs pra tela Equipe (Fase B do multi-fazenda, 2026-07-22) —
--            listar_membros_fazenda() e remover_membro().
--
-- Boa parte do backend de equipe já existia desde o ADR-0002 (2026-07-16):
-- criar_convite/aceitar_convite/promover_papel/cancelar_convite + Edge
-- Function enviar-convite + policy convites_select_admin — mas nenhum
-- frontend os consumia (confirmado por busca em toda a base antes desta
-- tarefa). Faltavam só duas coisas: listar membros (usuarios_fazendas só
-- permite ver a própria linha, sem cruzamento com usuarios.nome/email pra
-- outros usuários) e remover um membro (nenhuma RPC/policy existia).
--
-- Mesmo arcabouço das 4 RPCs de ADR-0002: SECURITY DEFINER (usuarios_
-- fazendas/convites não têm policy de escrita — e usuarios não expõe nome/
-- email de OUTROS usuários via RLS a ninguém, nem a admin), checagem
-- imperativa de admin dentro do corpo (nunca delegada a uma policy
-- declarativa — ADR-0002 D2, lição do achado nº1 do cyber_chief na Fase 1),
-- search_path=''.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. listar_membros_fazenda(p_fazenda_id) — admin-only (decisão confirmada
--    com JP: a tela Equipe inteira, inclusive a lista de membros, é área de
--    admin — membro/financeiro não veem nada aqui).
-- ----------------------------------------------------------------------------
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
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = p_fazenda_id
       and papel = 'admin'
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
  'esse cruzamento, evitando abrir uma policy nova e mais ampla em usuarios.';

revoke all on function public.listar_membros_fazenda(uuid) from public;
grant execute on function public.listar_membros_fazenda(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. remover_membro(p_fazenda_id, p_usuario_id) — admin-only. Permite
--    p_usuario_id = auth.uid() (autoremoção/"sair da fazenda", decisão
--    confirmada com JP) — a mesma guarda "nunca zero admins" cobre esse
--    caso (bloqueia se o chamador for o único admin restante).
-- ----------------------------------------------------------------------------
create or replace function public.remover_membro(p_fazenda_id uuid, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamador_e_admin boolean;
  v_papel_alvo       text;
  v_admins_restantes integer;
begin
  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = p_fazenda_id
       and papel = 'admin'
  ) into v_chamador_e_admin;

  if not v_chamador_e_admin then
    raise exception 'Apenas admins da fazenda podem remover membros';
  end if;

  select papel into v_papel_alvo
    from public.usuarios_fazendas
   where usuario_id = p_usuario_id
     and fazenda_id = p_fazenda_id;

  if not found then
    raise exception 'Usuário não está vinculado a esta fazenda';
  end if;

  -- Guarda: a fazenda nunca pode ficar com zero vínculos papel='admin' —
  -- mesmo `for update` das linhas admin ANTES de contar já usado em
  -- promover_papel() (ADR-0002, correção de race condition do gate do
  -- cyber_chief) — fecha a mesma janela de corrida aqui.
  if v_papel_alvo = 'admin' then
    perform 1
      from public.usuarios_fazendas
     where fazenda_id = p_fazenda_id
       and papel = 'admin'
     for update;

    select count(*) into v_admins_restantes
      from public.usuarios_fazendas
     where fazenda_id = p_fazenda_id
       and papel = 'admin'
       and usuario_id <> p_usuario_id;

    if v_admins_restantes = 0 then
      raise exception 'A fazenda não pode ficar sem nenhum admin';
    end if;
  end if;

  delete from public.usuarios_fazendas
   where usuario_id = p_usuario_id
     and fazenda_id = p_fazenda_id;
end;
$$;

comment on function public.remover_membro(uuid, uuid) is
  'Remove um vínculo usuario_fazenda — admin-only. Permite auto-remoção '
  '(p_usuario_id = auth.uid(), "sair da fazenda") — mesma guarda "nunca zero '
  'admins" (com for update, mesmo padrão de promover_papel) bloqueia se o '
  'chamador for o único admin restante, inclusive contra si mesmo.';

revoke all on function public.remover_membro(uuid, uuid) from public;
grant execute on function public.remover_membro(uuid, uuid) to authenticated;
