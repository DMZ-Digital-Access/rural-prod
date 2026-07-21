-- ============================================================================
-- Migration: bucket declaracoes-rebanho passa a aceitar imagem, não só PDF —
--            correção de JP durante a Fase 4: "as declarações de rebanho
--            também podem ser imagem, além do formato pdf".
--
-- A migration original do item 14 (20260721030000_fase3_storage_buckets.sql)
-- restringiu este bucket a `application/pdf` (a spec original, seção 3.2/7,
-- só previa PDF para este documento especificamente — GTAs e Notas/
-- Contranotas já aceitavam PDF OU imagem desde o início). Mesmo conjunto de
-- imagem já usado em gtas-documentos/transacoes-documentos: JPEG/JPG, PNG,
-- WebP, HEIC/HEIF (celular é o jeito mais comum do produtor fotografar um
-- documento em campo).
--
-- Só atualiza `storage.buckets.allowed_mime_types` — não é uma tabela do
-- app (`storage.objects` é que tem o `protect_delete()`/RLS de multi-
-- tenancy já revisado; `storage.buckets` é config, sem policy de escrita
-- pela API pública, só por migration/dashboard).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
   ]
 where id = 'declaracoes-rebanho';
