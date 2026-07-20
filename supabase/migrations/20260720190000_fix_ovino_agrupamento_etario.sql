-- ============================================================================
-- Migration: correção de dado — faixas etárias de Ovino em agrupamentos_etarios
--
-- Contexto: a migration 20260720120000_fase3_especies_agrupamentos.sql
-- semeou Ovino com 2 faixas "0-6 meses"/"Mais de 6 meses", decisão que vinha
-- da validação com o cliente de 2026-07-16 (PROJECT_CONTEXT.md seção 2).
-- Em 2026-07-20, JP forneceu prints reais da tela "Saldo Atual" do sistema
-- da Secretaria Estadual de Agricultura (mesma fonte de verdade que a spec
-- usa para `Bovinos-saldo-atual.png`) — o print de Ovino mostra as faixas
-- "0-12 meses"/"mais de 12 meses", não "0-6"/"Mais de 6". JP confirmou:
-- seguir o print real, corrigindo a decisão de 2026-07-16.
--
-- Por que uma migration NOVA em vez de editar 20260720120000 diretamente:
-- aquela migration já foi aplicada ao banco remoto (achado do
-- cyber_chief/db_sage em 2026-07-20, ver PROJECT_CONTEXT.md seção 1) —
-- reescrever uma migration já aplicada quebraria a reprodutibilidade de um
-- ambiente novo (`supabase db reset` aplicaria o conteúdo editado, enquanto
-- o remoto já rodou o conteúdo antigo). Migrations são aditivas sempre,
-- mesmo para corrigir dado de uma migration recente.
--
-- Escopo: UPDATE de 2 linhas existentes de `agrupamentos_etarios` (Ovino,
-- sem subtipo) — mesmos `id`/`ordem`, só `label`/`idade_min`/`idade_max`
-- corrigidos. Nenhuma outra tabela/espécie tocada. Nenhum dado de
-- `transacoes_detalhe`/saldo depende dessas faixas ainda (item 12 da fase
-- não implementado) — correção sem risco de quebrar histórico já lançado.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================

update public.agrupamentos_etarios ae
set label = '0-12 meses',
    idade_min = 0,
    idade_max = 12
from public.especies e
where ae.especie_id = e.id
  and e.nome = 'Ovinos'
  and ae.subtipo_especie_id is null
  and ae.ordem = 1;

update public.agrupamentos_etarios ae
set label = 'Mais de 12 meses',
    idade_min = 13,
    idade_max = null
from public.especies e
where ae.especie_id = e.id
  and e.nome = 'Ovinos'
  and ae.subtipo_especie_id is null
  and ae.ordem = 2;
