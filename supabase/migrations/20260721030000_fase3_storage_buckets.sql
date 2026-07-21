-- ============================================================================
-- Migration: Fase 3, item 14 — buckets de Supabase Storage
--
-- 3 buckets, todos privados, RLS por fazenda_id (mesmo padrão de
-- multi-tenancy já usado em todas as tabelas do projeto):
--
-- 1. declaracoes-rebanho — só PDF (spec seção 3.2/7). financeiro TEM acesso
--    de leitura (spec seção 5.4, "Declarações de Rebanho" está na lista de
--    acesso restrito, não na lista de "sem acesso"). Sem policy de DELETE —
--    "declarações anuais nunca devem ser apagáveis pelo usuário" (spec
--    seção 9, item 9), mesma decisão já aplicada à tabela
--    declaracoes_rebanho (Fase 3 item 13).
--
-- 2. gtas-documentos — PDF ou imagem (JPEG/PNG/WebP/HEIC/HEIF), spec seção
--    3.2/7. financeiro ZERO acesso (nem SELECT) — mesma fronteira já
--    aplicada à tabela gtas (spec seção 5.4, GTAs está na lista explícita
--    de "sem acesso"). Sem policy de DELETE, mesma decisão já aplicada à
--    tabela gtas (Fase 3 item 11).
--
-- 3. transacoes-documentos (novo, ADR-0005 D3 — não estava na spec
--    original, que só prescrevia numero_nota/tem_contranota como texto/
--    boolean) — PDF ou imagem, para os arquivos de Nota e Contranota
--    (transacoes.arquivo_nota_path/arquivo_contranota_path). financeiro TEM
--    acesso de leitura (mesma fronteira já aplicada à tabela transacoes —
--    SELECT permitido, zero escrita, Fase 3 item 11). Sem policy de
--    DELETE, mesma decisão já aplicada a transacoes/transacoes_detalhe.
--
-- Convenção de caminho: `{fazenda_id}/...` em todos os 3 buckets — RLS
-- extrai o primeiro segmento do caminho (storage.foldername(name)[1]) e
-- compara com as fazendas vinculadas ao usuário, mesmo padrão de
-- multi-tenancy já usado em toda tabela do projeto (usuarios_fazendas).
--
-- Escrita (INSERT/UPDATE) sempre restrita a admin/membro — financeiro
-- nunca escreve documento, só lê onde a tabela correspondente já permite.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================


-- ============================================================================
-- 1. Criação dos 3 buckets
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('declaracoes-rebanho', 'declaracoes-rebanho', false, 10485760, array['application/pdf']),
  ('gtas-documentos', 'gtas-documentos', false, 10485760, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]),
  ('transacoes-documentos', 'transacoes-documentos', false, 10485760, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ])
on conflict (id) do nothing;


-- ============================================================================
-- 2. declaracoes-rebanho — SELECT admin/membro/financeiro; INSERT/UPDATE
--    admin/membro; sem DELETE.
-- ============================================================================

create policy declaracoes_rebanho_select_vinculada
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'declaracoes-rebanho'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy declaracoes_rebanho_insert_vinculada
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'declaracoes-rebanho'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy declaracoes_rebanho_update_vinculada
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'declaracoes-rebanho'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    bucket_id = 'declaracoes-rebanho'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );


-- ============================================================================
-- 3. gtas-documentos — SELECT/INSERT/UPDATE só admin/membro (financeiro
--    ZERO acesso, mesma fronteira da tabela gtas); sem DELETE.
-- ============================================================================

create policy gtas_documentos_select_vinculada
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'gtas-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy gtas_documentos_insert_vinculada
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gtas-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy gtas_documentos_update_vinculada
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'gtas-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    bucket_id = 'gtas-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );


-- ============================================================================
-- 4. transacoes-documentos (ADR-0005 D3) — SELECT admin/membro/financeiro
--    (mesma fronteira de transacoes); INSERT/UPDATE só admin/membro; sem
--    DELETE.
-- ============================================================================

create policy transacoes_documentos_select_vinculada
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'transacoes-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy transacoes_documentos_insert_vinculada
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'transacoes-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy transacoes_documentos_update_vinculada
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'transacoes-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    bucket_id = 'transacoes-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );
