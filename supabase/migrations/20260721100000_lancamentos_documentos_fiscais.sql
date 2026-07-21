-- ============================================================================
-- Migration: repositório de documentos fiscais de lancamentos_financeiros —
--            pedido de JP: "vamos guardar em um repositório sim. agrupados
--            por mês da nota", com tela dedicada para financeiro/contábil e
--            admin, distinta dos documentos de transação de pecuária
--            (transacoes-documentos, item 14).
--
-- Colunas novas em lancamentos_financeiros: arquivo_path/arquivo_mime_type
-- (mesmo padrão de transacoes.arquivo_nota_path, ADR-0005 D3).
--
-- Bucket novo `lancamentos-documentos` — convenção de caminho
-- `{fazenda_id}/{AAAA-MM}/{lancamento_id}.{extensao}`: o "AAAA-MM" é o mês
-- da NOTA (transacoes.data_lancamento), não o mês do upload — pedido
-- explícito de JP ("agrupados por mês da nota"). Isso também é o que
-- permite a Edge Function de ZIP mensal (gerar-zip-lancamentos) filtrar por
-- período consultando só `lancamentos_financeiros.data_lancamento`, sem
-- precisar listar objetos do Storage por prefixo.
--
-- RLS: mesma fronteira de acesso já aplicada à própria tabela
-- lancamentos_financeiros (Fase 3, item 13) — financeiro SELECT, admin/
-- membro SELECT/INSERT/UPDATE, sem DELETE (documento fiscal não é
-- apagável pelo usuário, mesma decisão já usada em declaracoes-rebanho).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

alter table public.lancamentos_financeiros
  add column arquivo_path text,
  add column arquivo_mime_type text;

comment on column public.lancamentos_financeiros.arquivo_path is
  'Caminho do documento fiscal original (nota/boleto/recibo) no bucket '
  '`lancamentos-documentos` — pedido de JP, 2026-07-21, fora da spec '
  'original. Convenção: {fazenda_id}/{AAAA-MM do data_lancamento}/'
  '{id}.{extensao}. Nullable — nem todo lançamento tem documento anexado.';

comment on column public.lancamentos_financeiros.arquivo_mime_type is
  'MIME type do arquivo em arquivo_path (PDF ou imagem — mesmo conjunto '
  'dos demais buckets de documento do sistema).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lancamentos-documentos', 'lancamentos-documentos', false, 10485760, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]
)
on conflict (id) do nothing;

create policy lancamentos_documentos_select_vinculada
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'lancamentos-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy lancamentos_documentos_insert_vinculada
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'lancamentos-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy lancamentos_documentos_update_vinculada
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'lancamentos-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    bucket_id = 'lancamentos-documentos'
    and (storage.foldername(name))[1]::uuid in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );
