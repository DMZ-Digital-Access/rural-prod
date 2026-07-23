-- ============================================================================
-- Migration: desativa a espécie "Ave" do catálogo (pedido de JP, 2026-07-23)
--
-- "Retirar Aves da lista de animais, em todos os lugares onde essa
-- classificação aparecer" — usa o mecanismo já existente pra isso
-- (especies.ativo, Fase 3): `useEspecies()` (hook usado em todo Select de
-- espécie do projeto — Transações, Tipo de Pecuária, etc.) já filtra
-- `ativo = true`. Não é uma exclusão física: confirmado antes de aplicar
-- que não há nenhuma transacao/fazendas_especies referenciando "Ave" hoje
-- (0 linhas em ambas), então esta migration não precisa reconciliar dado
-- nenhum — só desativa o catálogo. Reversível (bastaria um UPDATE
-- ativo=true de volta, sem migration nova, se precisar reverter).
--
-- Autor: RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

update public.especies set ativo = false where nome = 'Ave';
