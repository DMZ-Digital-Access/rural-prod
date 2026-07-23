-- ============================================================================
-- Migration: Perfil da Fazenda + reformulação de Configurações (pedido de
--            JP, 2026-07-23)
--
-- 1. usuarios.telefone_celular — simples, só registro (JP: "no momento
--    apenas para registro, não usaremos para validar dados").
--
-- 2. E-mail editável de verdade — hoje bloqueado por
--    prevent_usuarios_identity_change() (revisão de segurança de
--    2026-07-16: usuarios.email é espelho de auth.users.email, cliente
--    nunca pode reescrever). JP confirmou que quer implementar via
--    supabase.auth.updateUser({email}) — o fluxo de confirmação NATIVO do
--    Supabase Auth (e-mail de confirmação pro endereço novo; SMTP do
--    projeto hospedado ainda não confirmado por JP, mesma ressalva do
--    roadmap item 1 — o código fica pronto independente disso).
--    `auth.users.email` só muda quando a confirmação realmente completa
--    (GoTrue mantém o endereço pendente em colunas internas até lá) — por
--    isso um trigger AFTER UPDATE OF email ON auth.users só dispara numa
--    mudança já confirmada, nunca numa tentativa em andamento.
--    Mecanismo de liberação: MESMO padrão já usado por
--    prevent_animais_campos_calculados_change()/atualizar_animal_apos_
--    pesagem() (Fase 2) — uma GUC local à transação
--    (`rural_prod.sync_email_confirmado`), nunca um `disable trigger`
--    (que seria table-wide, não scoped à transação — sob tráfego real
--    concorrente, desabilitar o trigger abriria uma janela em que
--    QUALQUER UPDATE concorrente em usuarios, de qualquer usuário, também
--    escaparia da guarda; a flag de sessão evita isso completamente).
--
-- 3. fazendas ganha descricao/imagem_hero_path (perfil da fazenda) e
--    finalidades_rebanho (Tipo de Pecuária, lista fixa validada por CHECK
--    — não uma tabela de catálogo nova, por ser um conjunto pequeno e
--    estável, ao contrário de especies).
--
-- 4. fazendas_especies — "Tipos de Animais da Fazenda", N:N reaproveitando
--    o catálogo especies já existente (Fase 3). Escrita só admin da
--    fazenda (edição de perfil, não manejo do dia a dia — mais restrito
--    que "papel <> financeiro", que é a fronteira usada no resto do
--    projeto).
--
-- 5. Bucket fazendas-hero — só imagem, só admin (SELECT/INSERT/UPDATE) —
--    mesmo padrão dos buckets da migration 20260721030000, adaptado pra
--    ser mais restrito (só quem acessa o Perfil da Fazenda, que já é
--    admin-only, mexe nisso).
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. usuarios.telefone_celular
-- ----------------------------------------------------------------------------

alter table public.usuarios add column telefone_celular text;

comment on column public.usuarios.telefone_celular is
  'Telefone celular pessoal (2026-07-23) — só registro, não usado pra '
  'validação/autenticação nenhuma (decisão explícita de JP). Editável '
  'livremente pelo próprio usuário (usuarios_update_own).';

-- ----------------------------------------------------------------------------
-- 2. E-mail editável — guarda estendida + trigger de sincronização
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
  if new.email is distinct from old.email
     and coalesce(current_setting('rural_prod.sync_email_confirmado', true), 'off') <> 'on' then
    raise exception 'usuarios.email não pode ser alterado pelo client — é espelho de auth.users.email, use a troca de e-mail (confirmação por e-mail)';
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
  'Guarda de imutabilidade para usuarios_update_own (RLS, Fase 1 seção 3). '
  '2026-07-23: email agora tem uma via legítima de mudança (troca de '
  'e-mail via Supabase Auth, confirmada pelo dono da conta no endereço '
  'novo) — liberada só pela GUC local de transação '
  '`rural_prod.sync_email_confirmado`, setada exclusivamente por '
  'sincronizar_email_usuarios_apos_confirmacao() (trigger em '
  'auth.users). Qualquer tentativa de UPDATE direto do client em '
  'usuarios.email continua bloqueada, exatamente como antes.';

create or replace function public.sincronizar_email_usuarios_apos_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    perform set_config('rural_prod.sync_email_confirmado', 'on', true);
    update public.usuarios set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.sincronizar_email_usuarios_apos_confirmacao() is
  '2026-07-23 — espelha auth.users.email pra public.usuarios DEPOIS que uma '
  'troca de e-mail (supabase.auth.updateUser) é de fato confirmada pelo '
  'dono da conta (GoTrue só grava em auth.users.email quando a confirmação '
  'completa — endereço pendente fica em colunas internas até lá). SECURITY '
  'DEFINER: seta a GUC local de transação que libera '
  'prevent_usuarios_identity_change() só para este UPDATE específico, sem '
  'desabilitar o trigger pra tabela inteira (evitaria janela de corrida '
  'sob tráfego concorrente real).';

create trigger sync_email_apos_confirmacao
  after update of email on auth.users
  for each row
  execute function public.sincronizar_email_usuarios_apos_confirmacao();

-- ----------------------------------------------------------------------------
-- 3. fazendas — perfil (hero/descrição) + Tipo de Pecuária (finalidades)
-- ----------------------------------------------------------------------------

alter table public.fazendas
  add column descricao text,
  add column imagem_hero_path text,
  add column finalidades_rebanho text[] not null default '{}'
    constraint fazendas_finalidades_rebanho_valida
    check (finalidades_rebanho <@ array['recria', 'engorda', 'leite']::text[]);

comment on column public.fazendas.descricao is
  '"Perfil da Fazenda" (2026-07-23) — texto livre do proprietário: '
  'atividades, localização, fundação, fundadores etc. Sem formatação '
  'estruturada, decisão deliberada (spec não pede mais que isso).';

comment on column public.fazendas.imagem_hero_path is
  'Caminho no bucket fazendas-hero (2026-07-23) — {fazenda_id}/hero.{ext}. '
  'Nullable — nem toda fazenda tem imagem definida.';

comment on column public.fazendas.finalidades_rebanho is
  '"Finalidade do Rebanho" (2026-07-23, Tipo de Pecuária) — multi-seleção '
  'fixa (recria/engorda/leite). Lista pequena e estável — validada por '
  'CHECK, não uma tabela de catálogo nova (ao contrário de especies, que '
  'já existe e é usada por fazendas_especies logo abaixo).';

-- fazendas_update_vinculada (RLS, Fase 1) autoriza UPDATE por qualquer papel
-- vinculado, sem distinção de coluna — mesmo achado já corrigido pra `nome`
-- em restringir_alteracao_nome_fazenda (2026-07-22, admin/membro, não
-- financeiro). O Perfil da Fazenda (descrição/hero/finalidades) é mais
-- restrito ainda: só ADMIN edita (é edição de perfil/identidade da
-- fazenda, não manejo do dia a dia que membro também faz).
create or replace function public.restringir_alteracao_perfil_fazenda()
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

  if v_papel is distinct from 'admin' then
    raise exception 'só o admin da fazenda pode alterar o perfil (descrição, imagem, tipo de pecuária)';
  end if;

  return new;
end;
$$;

comment on function public.restringir_alteracao_perfil_fazenda() is
  '2026-07-23 — restringe UPDATE de descricao/imagem_hero_path/'
  'finalidades_rebanho a papel admin (nem membro) — mesmo padrão de '
  'restringir_alteracao_nome_fazenda, escopo mais estrito (perfil da '
  'fazenda, não manejo do dia a dia).';

create trigger restringir_alteracao_perfil_fazenda
  before update of descricao, imagem_hero_path, finalidades_rebanho on public.fazendas
  for each row
  execute function public.restringir_alteracao_perfil_fazenda();

create table public.fazendas_especies (
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  especie_id uuid not null references public.especies(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (fazenda_id, especie_id)
);

comment on table public.fazendas_especies is
  '"Tipos de Animais da Fazenda" (2026-07-23, Tipo de Pecuária) — N:N entre '
  'fazendas e o catálogo especies já existente (Fase 3). Escrita restrita '
  'a admin da fazenda (edição de perfil, mais restrito que a fronteira '
  '"papel <> financeiro" usada no resto do projeto para manejo do dia a '
  'dia).';

alter table public.fazendas_especies enable row level security;

create policy fazendas_especies_select_vinculada
  on public.fazendas_especies
  for select
  to authenticated
  using (
    fazenda_id in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid()
    )
  );

create policy fazendas_especies_insert_admin
  on public.fazendas_especies
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

create policy fazendas_especies_delete_admin
  on public.fazendas_especies
  for delete
  to authenticated
  using (
    fazenda_id in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Bucket fazendas-hero — só imagem, só admin da fazenda
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fazendas-hero', 'fazendas-hero', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy fazendas_hero_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'fazendas-hero'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

create policy fazendas_hero_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'fazendas-hero'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

create policy fazendas_hero_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'fazendas-hero'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  )
  with check (
    bucket_id = 'fazendas-hero'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );
