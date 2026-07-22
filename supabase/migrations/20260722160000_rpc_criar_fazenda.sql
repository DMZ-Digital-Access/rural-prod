-- ============================================================================
-- Migration: RPC criar_fazenda(p_nome) — permite a um admin já existente
--            cadastrar uma fazenda ADICIONAL (multi-fazenda, Fase A).
--
-- Contexto (JP, 2026-07-22): "vamos ter a possibilidade de um usuario ser
-- admin, membro ou financeiro de mais de uma fazenda... no admin deve ter a
-- opção de cadastrar mais de uma fazenda". O schema já suporta N:N desde a
-- Fase 1 (usuarios_fazendas) e ADR-0002 (convites pra entrar numa fazenda
-- EXISTENTE), mas não havia nenhuma forma de criar uma fazenda NOVA fora do
-- signup (handle_new_user()) — confirmado por busca em todas as migrations:
-- `public.fazendas` não tem policy de INSERT pra authenticated (ADR-0001,
-- deliberado). Esta RPC é o único novo caminho de criação.
--
-- Decisão confirmada com JP: só quem JÁ é papel='admin' em pelo menos uma
-- fazenda existente pode criar uma fazenda adicional — membro/financeiro
-- puro (nunca admin em lugar nenhum) não pode virar dono de fazenda nova.
--
-- SECURITY DEFINER (mesma justificativa das 4 RPCs de convite, ADR-0002):
-- a tabela de destino não tem policy de escrita pra authenticated. Toda
-- validação de autorização é feita explicitamente dentro da função antes de
-- qualquer INSERT — nenhum bypass de RLS além do estritamente necessário.
-- ============================================================================

create or replace function public.criar_fazenda(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id uuid;
begin
  if p_nome is null or trim(p_nome) = '' then
    raise exception 'informe o nome da fazenda';
  end if;

  if not exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and papel = 'admin'
  ) then
    raise exception 'só quem já é admin de uma fazenda pode cadastrar uma fazenda adicional';
  end if;

  insert into public.fazendas (usuario_id, nome)
  values (auth.uid(), trim(p_nome))
  returning id into v_fazenda_id;

  insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
  values (auth.uid(), v_fazenda_id, 'admin');

  return v_fazenda_id;
end;
$$;

comment on function public.criar_fazenda(text) is
  'Cria uma fazenda ADICIONAL pro chamador (multi-fazenda, 2026-07-22) — '
  'exige que o chamador já seja admin em pelo menos uma fazenda existente. '
  'SECURITY DEFINER: public.fazendas não tem policy de INSERT pra '
  'authenticated (ADR-0001, deliberado) — única forma de criar fazenda fora '
  'do signup (handle_new_user()). Insere fazendas + usuarios_fazendas '
  '(papel=admin) na mesma transação.';

revoke all on function public.criar_fazenda(text) from public;
grant execute on function public.criar_fazenda(text) to authenticated;
