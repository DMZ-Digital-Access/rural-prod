-- ============================================================================
-- Migration: nomes de especies no singular (pedido de JP, 2026-07-23)
--
-- O catálogo `especies` (seed original, migration
-- 20260720120000_fase3_especies_agrupamentos.sql) foi semeado no plural
-- (Bovinos/Ovinos/Equinos/...). JP pediu singular ("Tipo de Animal" deve
-- mostrar "Bovino", não "Bovinos") em todo lugar onde essa classificação
-- aparece — como todo consumidor (transacoes, animais_com_detalhes, Saldo
-- de Rebanho, Painel Inteligente, GTAs, Declarações) lê `especies.nome`
-- direto via join, um UPDATE aqui é suficiente pra propagar em todo lugar,
-- sem precisar tocar em nenhuma outra tabela/view/RPC.
--
-- Seguro por FK: `transacoes.especie_id`/`animais.especie_id`/
-- `agrupamentos_etarios.especie_id` referenciam `especies.id` (nunca
-- `especies.nome`) — renomear a coluna de exibição não quebra nenhum
-- vínculo existente, é só texto.
--
-- Autor: RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

update public.especies set nome = 'Bovino'  where nome = 'Bovinos';
update public.especies set nome = 'Ovino'   where nome = 'Ovinos';
update public.especies set nome = 'Equino'  where nome = 'Equinos';
update public.especies set nome = 'Caprino' where nome = 'Caprinos';
update public.especies set nome = 'Muar'    where nome = 'Muares';
update public.especies set nome = 'Ave'     where nome = 'Aves';
update public.especies set nome = 'Suíno'   where nome = 'Suínos';
update public.especies set nome = 'Abelha'  where nome = 'Abelhas';
