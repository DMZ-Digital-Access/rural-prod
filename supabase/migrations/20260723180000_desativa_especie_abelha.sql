-- ============================================================================
-- Migration: desativa a espécie "Abelha" do catálogo (pedido de JP, 2026-07-23)
--
-- Mesmo mecanismo e mesma justificativa da migration anterior
-- (20260723170000_desativa_especie_aves.sql) — especies.ativo=false,
-- filtrado por useEspecies() em todo Select de espécie do projeto.
-- Confirmado antes de aplicar: 0 linhas em transacoes/fazendas_especies/
-- animais referenciando "Abelha" hoje — desativação não deixa dado órfão.
--
-- Autor: RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

update public.especies set ativo = false where nome = 'Abelha';
