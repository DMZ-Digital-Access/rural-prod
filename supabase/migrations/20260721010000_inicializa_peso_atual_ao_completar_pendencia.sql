-- ============================================================================
-- Migration: inicializar peso_atual_kg ao completar peso_inicial_kg de um
--            animal pendente de individualização (ADR-0006)
--
-- Contexto: inicializar_peso_atual_animal() (Fase 2) só roda no BEFORE
-- INSERT — para um animal criado normal (via "Individualizar Animal"),
-- peso_atual_kg = peso_inicial_kg desde o dia 1. Para um animal PENDENTE
-- (criado por Entradas de Lote, ADR-0006, com peso_inicial_kg NULL), esse
-- baseline nunca acontece — se o usuário só preencher peso_inicial_kg depois
-- via UPDATE (tela de edição), peso_atual_kg ficaria NULL para sempre até a
-- primeira pesagem real, inconsistente com o animal criado do jeito normal.
--
-- Esta migration replica, no UPDATE, o mesmo baseline que o INSERT já dá:
-- se peso_inicial_kg estava NULL e está sendo preenchido pela primeira vez
-- (e peso_atual_kg ainda não foi tocado por nenhuma pesagem real), inicializa
-- peso_atual_kg = peso_inicial_kg.
--
-- Por que NÃO precisa da GUC rural_prod.recalculo_pesagem (usada por
-- atualizar_animal_apos_pesagem() para passar por prevent_animais_campos_
-- calculados_change()): esse guard (Fase 2) é `before update OF peso_atual_kg,
-- gmd_medio_kg, ultima_pesagem_data` — só dispara quando o próprio comando
-- UPDATE do cliente lista uma dessas colunas no SET. A tela de edição desta
-- migration nunca inclui peso_atual_kg no UPDATE (só peso_inicial_kg e
-- outros campos normais) — o guard simplesmente não dispara para este
-- comando, mesmo que este trigger (BEFORE UPDATE OF peso_inicial_kg,
-- ordenado antes por rodar na mesma fase) modifique NEW.peso_atual_kg
-- internamente. Validado por teste real, não só leitura da documentação do
-- Postgres.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

create or replace function public.inicializar_peso_atual_ao_completar_pendencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.peso_inicial_kg is null
     and new.peso_inicial_kg is not null
     and old.peso_atual_kg is null then
    new.peso_atual_kg := new.peso_inicial_kg;
  end if;

  return new;
end;
$$;

comment on function public.inicializar_peso_atual_ao_completar_pendencia() is
  'ADR-0006: quando peso_inicial_kg de um animal pendente é preenchido pela '
  'primeira vez (era NULL) via UPDATE, e peso_atual_kg ainda não foi tocado '
  'por nenhuma pesagem real (também NULL), inicializa peso_atual_kg = '
  'peso_inicial_kg — mesmo baseline que inicializar_peso_atual_animal() já '
  'dá no INSERT normal.';

create trigger inicializar_peso_atual_ao_completar
  before update of peso_inicial_kg on public.animais
  for each row
  execute function public.inicializar_peso_atual_ao_completar_pendencia();
