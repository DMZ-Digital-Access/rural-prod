-- ============================================================================
-- Migration: histórico de lote do animal (pedido de JP, 2026-07-23) —
--            base de dados pra timeline de Rastreabilidade do Animal
--
-- Contexto: `animais.lote_id` sempre foi só o valor ATUAL — nenhuma mudança
-- de lote (atribuição, transferência, exclusão do lote) era registrada em
-- lugar nenhum. Pra mostrar isso numa timeline (Entrada → Lote(s) → Saída),
-- criamos animais_historico_lote, alimentada por trigger a partir de AGORA —
-- não há como reconstruir mudanças de lote anteriores a esta migration (os
-- animais já existentes começam sem nenhuma linha de histórico até a
-- próxima mudança real de lote_id).
--
-- Mecanismo: cada linha é um "período" (data_inicio → data_fim, data_fim
-- null = período em aberto/atual). Ao mudar animais.lote_id (inclusive pra
-- NULL, via UPDATE direto ou via ON DELETE SET NULL quando o lote é
-- excluído — Postgres dispara AFTER UPDATE OF nesse caso também, mesmo
-- comportamento documentado das ações de FK), fecha o período aberto e abre
-- um novo com o lote_id atual (ou nenhum novo período se o lote_id virou
-- NULL — "sem lote" não é registrado como período, só o fim do anterior).
--
-- SECURITY DEFINER: animais_historico_lote não tem policy de INSERT/UPDATE
-- pra authenticated (só SELECT) — só o trigger escreve, mesmo padrão de
-- pesagens/atualizar_animal_apos_pesagem().
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

create table public.animais_historico_lote (
  id          uuid primary key default gen_random_uuid(),
  animal_id   uuid not null references public.animais(id) on delete cascade,
  lote_id     uuid references public.lotes(id) on delete set null,
  -- Denormalizado a partir de lotes.nome no momento do INSERT — lote_id
  -- sozinho viraria NULL se o lote for excluído depois (ON DELETE SET
  -- NULL), apagando justamente o dado que a timeline precisa mostrar
  -- ("esteve no Lote X"). lote_nome sobrevive à exclusão do lote.
  lote_nome   text,
  data_inicio timestamptz not null default now(),
  data_fim    timestamptz,
  created_at  timestamptz not null default now()
);

create index idx_animais_historico_lote_animal_id
  on public.animais_historico_lote(animal_id);

comment on table public.animais_historico_lote is
  '2026-07-23: histórico de atribuição/transferência de lote de cada animal, '
  'pra timeline de Rastreabilidade do Animal. Cada linha é um período '
  '(data_inicio → data_fim; data_fim null = período aberto/atual). '
  'lote_nome é denormalizado no INSERT (lote_id sozinho vira NULL se o lote '
  'for excluído depois, via ON DELETE SET NULL — lote_nome preserva o nome '
  'na timeline mesmo assim). Alimentada só por trigger '
  '(registrar_historico_lote) a partir desta migration — sem reconstrução '
  'retroativa de mudanças anteriores.';

alter table public.animais_historico_lote enable row level security;

create policy animais_historico_lote_select_vinculada
  on public.animais_historico_lote
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.animais a
        join public.usuarios_fazendas uf on uf.fazenda_id = a.fazenda_id
       where a.id = animais_historico_lote.animal_id
         and uf.usuario_id = auth.uid()
    )
  );

create or replace function public.registrar_historico_lote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote_nome text;
begin
  if TG_OP = 'INSERT' then
    if new.lote_id is not null then
      select nome into v_lote_nome from public.lotes where id = new.lote_id;
      insert into public.animais_historico_lote (animal_id, lote_id, lote_nome, data_inicio)
      values (new.id, new.lote_id, v_lote_nome, now());
    end if;
    return new;
  end if;

  -- TG_OP = 'UPDATE' (só dispara quando lote_id muda, ver WHEN do trigger).
  update public.animais_historico_lote
     set data_fim = now()
   where animal_id = new.id
     and data_fim is null;

  if new.lote_id is not null then
    select nome into v_lote_nome from public.lotes where id = new.lote_id;
    insert into public.animais_historico_lote (animal_id, lote_id, lote_nome, data_inicio)
    values (new.id, new.lote_id, v_lote_nome, now());
  end if;

  return new;
end;
$$;

comment on function public.registrar_historico_lote() is
  '2026-07-23: fecha o período de lote aberto do animal e abre um novo '
  '(se o lote_id novo não for null) sempre que animais.lote_id muda '
  '(INSERT com lote_id já preenchido, ou UPDATE OF lote_id — inclusive via '
  'ON DELETE SET NULL ao excluir o lote). SECURITY DEFINER: '
  'animais_historico_lote não tem policy de INSERT/UPDATE pra authenticated.';

create trigger registrar_historico_lote_insert
  after insert on public.animais
  for each row
  execute function public.registrar_historico_lote();

create trigger registrar_historico_lote_update
  after update of lote_id on public.animais
  for each row
  when (old.lote_id is distinct from new.lote_id)
  execute function public.registrar_historico_lote();

revoke all on public.animais_historico_lote from public;
grant select on public.animais_historico_lote to authenticated;
