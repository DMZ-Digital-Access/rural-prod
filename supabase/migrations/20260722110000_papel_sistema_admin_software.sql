-- ============================================================================
-- Migration: usuarios.papel_sistema — novo nível de permissão, INDEPENDENTE
--            de fazenda ("admin do software", não "admin da fazenda").
--
-- Contexto (pedido de JP, 2026-07-22): ao desenhar a tela de controle do
-- prompt/schema de OCR de classificar-documento, ficou claro que "administrar
-- prompt do OCR" e "administrar LLM" (tela /app/configuracoes/ia) devem ficar
-- acessíveis SÓ ao admin do software — o admin de cada fazenda/conta NÃO deve
-- ter acesso a nenhuma das duas. O sistema hoje só tem `papel` POR FAZENDA
-- (usuarios_fazendas.papel: admin/membro/financeiro) — não existe nenhum
-- conceito de permissão que independa de fazenda em lugar nenhum do projeto
-- (confirmado por busca em todo frontend/backend antes de escrever esta
-- migration). Esta migration cria esse primeiro nível.
--
-- Nomenclatura (pedido de JP: "trazer as nomenclaturas mais adequadas para
-- identificar esses tipos de perfil de usuário"), sem renomear a coluna
-- usuarios_fazendas.papel já existente (raio de impacto grande — spec, RLS e
-- todo o frontend já a usam) — a partir de agora, duas camadas conceituais
-- distintas de permissão:
--   - "papel na fazenda" (usuarios_fazendas.papel): admin / membro /
--     financeiro — inalterado, escopo de UMA fazenda.
--   - "papel no sistema" (usuarios.papel_sistema): usuario / admin_software
--     — novo, escopo do sistema inteiro, sem relação com nenhuma fazenda.
--
-- Aditiva sobre 20260716171522_fase1_usuarios_fazendas.sql — não edita a
-- migration original, só estende a função de guarda já existente.
--
-- SEGURANÇA — achado crítico fechado nesta própria migration (mesma classe
-- de risco que o cyber_chief já sinalizou para nome/email/created_at em
-- usuarios, review de 2026-07-16): a policy `usuarios_update_own` autoriza
-- UPDATE sem nenhuma restrição de coluna sobre a própria linha. Sem guarda,
-- QUALQUER usuário autenticado poderia rodar
-- `update usuarios set papel_sistema = 'admin_software' where id = auth.uid()`
-- e se autopromover a admin do software — a mesma classe de brecha, mesma
-- mitigação: estender `prevent_usuarios_identity_change()` (trigger
-- `prevent_identity_change`, já existente) para também bloquear mudança de
-- `papel_sistema` pelo client. Só editável por migration/superusuário (ou uma
-- futura tela de gestão de admins de sistema, restrita a quem já é
-- admin_software — fora do escopo desta tarefa).
-- ============================================================================

alter table public.usuarios
  add column papel_sistema text not null default 'usuario'
  constraint usuarios_papel_sistema_check
  check (papel_sistema in ('usuario', 'admin_software'));

comment on column public.usuarios.papel_sistema is
  '"Papel no sistema" (2026-07-22) — independe de qualquer fazenda, diferente '
  'de usuarios_fazendas.papel ("papel na fazenda": admin/membro/financeiro). '
  '"admin_software" controla telas de configuração global do sistema (hoje: '
  'Modelo de IA e Prompt de Extração/OCR) — o admin de uma fazenda NÃO tem '
  'acesso a essas telas só por ser admin da própria fazenda. Só alterável '
  'via migration/superusuário — bloqueado para o client pela guarda '
  'prevent_usuarios_identity_change() (ver comentário daquela função).';

-- ----------------------------------------------------------------------------
-- Estende a guarda de imutabilidade já existente (2026-07-16) para também
-- proteger papel_sistema — mesmo raciocínio de defesa em profundidade: a
-- garantia sobrevive mesmo que uma migration futura afrouxe o WITH CHECK da
-- policy usuarios_update_own sem revisão de segurança.
-- ----------------------------------------------------------------------------
create or replace function public.prevent_usuarios_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'usuarios.id não pode ser alterado';
  end if;
  if new.email is distinct from old.email then
    raise exception 'usuarios.email não pode ser alterado pelo client — é espelho de auth.users.email';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'usuarios.created_at não pode ser alterado';
  end if;
  if new.papel_sistema is distinct from old.papel_sistema then
    raise exception 'usuarios.papel_sistema não pode ser alterado pelo client — só por migration/superusuário';
  end if;
  return new;
end;
$$;

comment on function public.prevent_usuarios_identity_change() is
  'Guarda de imutabilidade para usuarios_update_own (RLS, Fase 1 seção 3): '
  'impede que o próprio usuário altere id/email/created_at/papel_sistema via '
  'UPDATE, mesmo que a policy de RLS não restrinja colunas. email é espelho '
  'de auth.users; nome é o único campo pensado como editável pelo client. '
  'papel_sistema adicionado em 2026-07-22 (ver migration '
  '20260722110000) — sem esta guarda, qualquer usuário autenticado poderia '
  'se autopromover a admin_software via UPDATE direto.';

-- ----------------------------------------------------------------------------
-- Helper reaproveitável em qualquer policy/trigger que precise checar o
-- papel de sistema do chamador. SECURITY INVOKER — o SELECT abaixo lê a
-- PRÓPRIA linha do chamador (usuarios_select_own, Fase 1, já autoriza),
-- sem elevação de privilégio.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin_software()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.usuarios
     where id = auth.uid()
       and papel_sistema = 'admin_software'
  );
$$;

comment on function public.is_admin_software() is
  'Helper de RLS/trigger — true quando o usuário autenticado é admin do '
  'software (usuarios.papel_sistema = admin_software), independente de '
  'qualquer fazenda. SECURITY INVOKER: lê a própria linha do chamador em '
  'usuarios, já autorizada por usuarios_select_own.';

-- ----------------------------------------------------------------------------
-- Backfill — única concessão inicial de admin_software (mesmo padrão de
-- "achado real, decisão consciente" já usado nas migrations anteriores da
-- Fase 4, ex.: 20260721130000). Concessão de novos admins de software fica
-- para uma tela de gestão futura, restrita a quem já é admin_software.
--
-- A guarda prevent_identity_change (recém-estendida acima) bloquearia até
-- esta própria UPDATE — mesmo cuidado operacional já documentado em
-- 20260721090000/20260721130000: disable/enable ao redor do backfill,
-- rodando como superusuário de migration, não como sessão autenticada.
-- ----------------------------------------------------------------------------
alter table public.usuarios disable trigger prevent_identity_change;

update public.usuarios
   set papel_sistema = 'admin_software'
 where email = 'jp@natux.group';

alter table public.usuarios enable trigger prevent_identity_change;
