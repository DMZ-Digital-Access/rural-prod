-- ============================================================================
-- Migration: corrige o backfill de admin_software — a migration anterior
--            (20260722110000) mirou `jp@natux.group`, que não existe como
--            usuário cadastrado neste ambiente (confirmado por
--            `select email from usuarios` antes de escrever esta correção) —
--            0 linhas afetadas, ninguém ficou admin_software de fato.
--
-- A conta realmente usada como "dona"/administradora nos testes deste
-- projeto é `jp.teste.livestock@gmail.com` (papel='admin' na única fazenda
-- de teste, usada em toda validação funcional da sessão). Aditiva sobre
-- 20260722110000 — não edita a migration original, só corrige o alvo do
-- backfill.
--
-- Mesmo cuidado operacional já documentado (auth.uid() é NULL numa sessão de
-- migration/superusuário): disable/enable ao redor do UPDATE.
-- ============================================================================

alter table public.usuarios disable trigger prevent_identity_change;

update public.usuarios
   set papel_sistema = 'admin_software'
 where email = 'jp.teste.livestock@gmail.com';

alter table public.usuarios enable trigger prevent_identity_change;
