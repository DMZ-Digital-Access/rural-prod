-- ============================================================================
-- Migration: Dados da fazenda — Município, Localização, Área, Logo e Marca
--            do gado (pedido de JP, 2026-07-23)
--
-- Localização (nome) e Localização por coordenadas ficam como campo de
-- texto livre por ora — sem integração real do Google Places/Maps (exigiria
-- chave de API do Google Cloud, decisão explícita de JP de adiar). Área
-- salva valor + unidade exatamente como o usuário escolher, sem conversão
-- automática entre unidades (decisão explícita de JP — módulo fiscal varia
-- por município, então uma conversão fixa seria enganosa).
--
-- Logo da fazenda e Marca do gado — dois campos de imagem opcionais, novo
-- bucket `fazendas-imagens` (separado de `fazendas-hero`, que é só a capa
-- do Perfil da Fazenda — mesmo padrão de RLS admin-only, ver migration
-- 20260723160000).
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

alter table public.fazendas
  add column municipio               text,
  add column localizacao_nome        text,
  add column localizacao_coordenadas text,
  add column area_valor              numeric(10,1),
  add column area_unidade            text
                                      constraint fazendas_area_unidade_valida
                                      check (area_unidade in ('hectares', 'alqueires', 'acre', 'modulo_fiscal')),
  add column logo_path                text,
  add column marca_gado_path          text;

comment on column public.fazendas.municipio is
  '2026-07-23: nome do município onde a fazenda fica — texto livre.';

comment on column public.fazendas.localizacao_nome is
  '2026-07-23: localização por nome (ex.: "Fazenda perto de X, Google '
  'Places") — texto livre por ora, sem integração real da API do Google '
  'Places (exigiria chave de API do Google Cloud).';

comment on column public.fazendas.localizacao_coordenadas is
  '2026-07-23: localização por coordenadas (Google Maps) — texto livre '
  '(ex.: "-23.5505, -46.6333" ou link do Maps), sem integração real da API.';

comment on column public.fazendas.area_valor is
  '2026-07-23: valor numérico da área da fazenda, sempre na unidade de '
  'area_unidade — sem conversão entre unidades (decisão de JP: módulo '
  'fiscal varia por município, converter seria enganoso).';

comment on column public.fazendas.area_unidade is
  '2026-07-23: unidade de area_valor — hectares/alqueires/acre/'
  'modulo_fiscal, salva exatamente como o usuário escolheu.';

comment on column public.fazendas.logo_path is
  '2026-07-23: caminho no bucket fazendas-imagens — {fazenda_id}/logo.{ext}. '
  'Nullable — opcional.';

comment on column public.fazendas.marca_gado_path is
  '2026-07-23: caminho no bucket fazendas-imagens — '
  '{fazenda_id}/marca-gado.{ext}. Nullable — opcional.';

-- ----------------------------------------------------------------------------
-- restringir_alteracao_nome_fazenda (migration 20260722150000) era só
-- `before update of nome` — estende pros campos novos de "Dados da fazenda"
-- (mesma seção de tela, mesmo padrão admin/membro, não financeiro). A
-- function já é genérica (só checa papel, não referencia coluna nenhuma),
-- só a lista de colunas do trigger muda.
-- ----------------------------------------------------------------------------

drop trigger if exists restringir_alteracao_nome_fazenda on public.fazendas;
create trigger restringir_alteracao_nome_fazenda
  before update of
    nome, municipio, localizacao_nome, localizacao_coordenadas,
    area_valor, area_unidade, logo_path, marca_gado_path
  on public.fazendas
  for each row
  execute function public.restringir_alteracao_nome_fazenda();

-- ----------------------------------------------------------------------------
-- Bucket fazendas-imagens — logo + marca do gado, só admin da fazenda
-- (mesmo padrão de fazendas-hero, migration 20260723160000).
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fazendas-imagens', 'fazendas-imagens', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy fazendas_imagens_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'fazendas-imagens'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

create policy fazendas_imagens_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'fazendas-imagens'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );

create policy fazendas_imagens_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'fazendas-imagens'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  )
  with check (
    bucket_id = 'fazendas-imagens'
    and (storage.foldername(name))[1]::uuid in (
      select uf.fazenda_id from public.usuarios_fazendas uf
       where uf.usuario_id = auth.uid() and uf.papel = 'admin'
    )
  );
