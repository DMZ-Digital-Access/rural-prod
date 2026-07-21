-- ============================================================================
-- Migration: desvincular animais automaticamente ao ARQUIVAR um lote
--
-- Contexto: excluir um lote já desvincula os animais associados
-- (animais.lote_id usa `on delete set null`, Fase 2). JP pediu que arquivar
-- um lote tenha o MESMO efeito — hoje arquivar só troca `lotes.ativo` para
-- false, sem tocar em `animais.lote_id`, deixando os animais "presos" a um
-- lote arquivado.
--
-- Mecanismo: trigger AFTER UPDATE em `lotes`, só quando `ativo` transiciona
-- de true para false — replica para o caminho de arquivamento o mesmo
-- efeito que o ON DELETE SET NULL já dá ao caminho de exclusão.
-- SECURITY INVOKER: quem arquiva um lote (admin/membro, via
-- lotes_update_vinculada) já tem permissão de UPDATE direto em
-- animais.lote_id (animais_update_vinculada, Fase 2) — sem privilégio a
-- elevar, mesmo princípio de mínimo privilégio já usado em todo o schema
-- desta fase (ex.: ADR-0004 D2, ADR-0006 D4).
--
-- Reativar um lote (ativo false → true) NÃO re-vincula os animais que
-- foram desvinculados no arquivamento — comportamento assimétrico
-- deliberado: a mesma coisa já acontece com exclusão (irreversível), e
-- "lembrar" quais animais pertenciam a um lote arquivado no passado não é
-- um dado que o produto pede hoje.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================

create or replace function public.desvincular_animais_ao_arquivar_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ativo = true and new.ativo = false then
    update public.animais
       set lote_id = null
     where lote_id = new.id;
  end if;

  return new;
end;
$$;

comment on function public.desvincular_animais_ao_arquivar_lote() is
  'AFTER UPDATE em lotes: quando ativo transiciona true→false (arquivamento), '
  'desvincula (lote_id = null) todos os animais associados — mesmo efeito '
  'que ON DELETE SET NULL já dá para exclusão de lote. SECURITY INVOKER '
  '(padrão, sem elevação): quem arquiva já tem UPDATE direto em '
  'animais.lote_id via animais_update_vinculada (Fase 2).';

create trigger desvincular_animais_apos_arquivar
  after update of ativo on public.lotes
  for each row
  execute function public.desvincular_animais_ao_arquivar_lote();
