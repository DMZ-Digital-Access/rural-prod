-- ============================================================================
-- Migration: excluir_pesagem() — permite corrigir erros excluindo um
--            registro do histórico de pesagens (pedido de JP, 2026-07-23)
--
-- atualizar_animal_apos_pesagem() (Fase 2) só reagia a INSERT/UPDATE em
-- pesagens — ao excluir uma linha, peso_atual_kg/gmd_medio_kg/
-- ultima_pesagem_data do animal ficariam desatualizados (ainda referenciando
-- a pesagem já excluída). Estendida para também reagir a DELETE, recalculando
-- a partir da pesagem mais recente restante (ou, se não sobrar nenhuma,
-- voltando ao baseline de "animal ainda não pesado": peso_atual_kg =
-- peso_inicial_kg, sem GMD, sem data de última pesagem — mesmo estado que
-- inicializar_peso_atual_ao_completar_pendencia() já estabelece).
--
-- excluir_pesagem(p_pesagem_id) é o único caminho de exclusão — mesmo padrão
-- de registrar_pesagem() (SECURITY DEFINER: pesagens não tem policy de
-- DELETE para authenticated, autorização checada explicitamente no corpo).
-- Trava a linha do animal (`for update`) antes do DELETE, serializando com
-- o `for update` já usado por registrar_pesagem() para o mesmo animal.
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

create or replace function public.atualizar_animal_apos_pesagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_animal_id         uuid;
  v_peso_inicial      numeric(8,3);
  v_data_registro     date;
  v_peso_mais_recente numeric(8,3);
  v_data_mais_recente date;
  v_dias_totais       integer;
  v_gmd               numeric(8,4);
begin
  v_animal_id := coalesce(new.animal_id, old.animal_id);

  select peso_inicial_kg, created_at::date
    into v_peso_inicial, v_data_registro
    from public.animais
   where id = v_animal_id;

  select peso_kg, data_evento
    into v_peso_mais_recente, v_data_mais_recente
    from public.pesagens
   where animal_id = v_animal_id
   order by data_evento desc, created_at desc
   limit 1;

  perform set_config('rural_prod.recalculo_pesagem', 'on', true);

  if v_peso_mais_recente is null then
    -- Nenhuma pesagem restante (a última foi excluída) — volta ao baseline
    -- de "animal ainda não pesado".
    update public.animais
       set peso_atual_kg = v_peso_inicial,
           gmd_medio_kg = null,
           ultima_pesagem_data = null
     where id = v_animal_id;
  else
    v_dias_totais := v_data_mais_recente - v_data_registro;

    if v_dias_totais is null or v_dias_totais <= 0 then
      v_gmd := null;
    else
      v_gmd := round((v_peso_mais_recente - v_peso_inicial) / v_dias_totais, 4);
    end if;

    update public.animais
       set peso_atual_kg = v_peso_mais_recente,
           gmd_medio_kg = v_gmd,
           ultima_pesagem_data = v_data_mais_recente
     where id = v_animal_id;
  end if;

  return null;
end;
$$;

comment on function public.atualizar_animal_apos_pesagem() is
  'Trigger AFTER INSERT OR UPDATE OR DELETE ON pesagens (DELETE adicionado '
  'em 2026-07-23 — excluir_pesagem()). Recalcula peso_atual_kg/gmd_medio_kg/'
  'ultima_pesagem_data em animais a partir da pesagem mais recente '
  'pós-operação; sem nenhuma pesagem restante, volta ao baseline '
  '(peso_atual_kg = peso_inicial_kg, sem GMD/data). GMD = (peso_atual - '
  'peso_inicial) / dias_totais, dias_totais <= 0 => NULL. SECURITY DEFINER '
  'só para poder setar a flag que libera '
  'prevent_animais_campos_calculados_change().';

drop trigger if exists recalcular_animal on public.pesagens;
create trigger recalcular_animal
  after insert or update or delete on public.pesagens
  for each row
  execute function public.atualizar_animal_apos_pesagem();

create or replace function public.excluir_pesagem(p_pesagem_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_animal_id  uuid;
  v_fazenda_id uuid;
  v_autorizado boolean;
begin
  select animal_id
    into v_animal_id
    from public.pesagens
   where id = p_pesagem_id;

  if not found then
    raise exception 'Pesagem não encontrada ou você não tem permissão para excluí-la';
  end if;

  select fazenda_id
    into v_fazenda_id
    from public.animais
   where id = v_animal_id
   for update;

  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = v_fazenda_id
       and papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Pesagem não encontrada ou você não tem permissão para excluí-la';
  end if;

  delete from public.pesagens where id = p_pesagem_id;
end;
$$;

comment on function public.excluir_pesagem(uuid) is
  '2026-07-23: exclui um registro do histórico de pesagens (correção de '
  'erro de digitação, pedido de JP). SECURITY DEFINER: pesagens não tem '
  'policy de DELETE para authenticated. Trava animais (for update) antes do '
  'DELETE, serializando com registrar_pesagem() para o mesmo animal. '
  'atualizar_animal_apos_pesagem() (AFTER DELETE) recalcula peso_atual_kg/'
  'gmd_medio_kg/ultima_pesagem_data automaticamente.';

revoke all on function public.excluir_pesagem(uuid) from public;
grant execute on function public.excluir_pesagem(uuid) to authenticated;
