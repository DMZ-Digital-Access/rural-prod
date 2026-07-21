-- ============================================================================
-- Migration: corrige a cardinalidade real entre transacoes e gtas — pedido
--            de JP durante a construção do Módulo de GTAs (Fase 4, item 17):
--            "as GTAs são feitas uma para cada caminhão que transporta a
--            carga. então em uma transação pode existir 1 nota e 1
--            contranota mas mais de 1 GTA relacionada à mesma operação".
--
-- A migration original do item 11 (20260720133000_fase3_gtas_transacoes.sql)
-- desenhou um vínculo CIRCULAR 1:1 (transacoes.gta_id <-> gtas.transacao_id)
-- — cada transação apontava para NO MÁXIMO uma GTA. Isso está ERRADO: uma
-- operação (transação) pode ter várias GTAs, uma por caminhão de transporte,
-- enquanto nota/contranota continuam sendo 1 por transação (não mudam).
--
-- A correção é remover só o lado 1:1 que sobrava
-- (`transacoes.gta_id`) — `gtas.transacao_id` (muitos-para-um: várias GTAs
-- apontando para a MESMA transação) já é exatamente a modelagem certa para
-- "uma transação tem N GTAs", sem precisar de nenhuma tabela de junção nova.
-- Confirmado antes de escrever esta migration que `transacoes.gta_id` está
-- 0/2 preenchido em produção (nenhuma linha real usa esse campo) — remoção
-- sem perda de dado.
--
-- Efeito colateral bom: o embed PostgREST `transacoes -> gtas` deixa de ser
-- ambíguo (só resta uma FK entre as duas tabelas, `gtas_transacao_id_fkey`)
-- — o hint de constraint que o frontend já usava
-- (`gtas!transacoes_gta_id_fkey`, ver Módulo de Transações) deixa de ser
-- necessário, e o embed passa a devolver um ARRAY (muitos-para-um do lado de
-- `transacoes`), que é o formato certo agora que sabemos que pode haver mais
-- de uma GTA.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-21
-- Referência: Módulo de GTAs/Transações (Fase 4, itens 15/17), correção de
--             modelagem pedida por JP no meio da tarefa.
-- ============================================================================

drop trigger if exists validar_transacao_gta_mesma_fazenda on public.transacoes;
drop function if exists public.validar_transacao_gta_mesma_fazenda();

alter table public.transacoes
  drop constraint if exists transacoes_gta_id_fkey;

drop index if exists idx_transacoes_gta_id;

alter table public.transacoes
  drop column if exists gta_id;

comment on table public.transacoes is
  'Livro-razão de Entradas e Saídas — compra/venda/pastoreio/nascimento/'
  'óbito/consumo (Eixo 2, spec seção 3.2, expandido por ADR-0005). Uma '
  'transação pode ter N GTAs vinculadas (uma por caminhão de transporte) '
  'via gtas.transacao_id — ver comentário daquela coluna. Sem policy de '
  'DELETE (migration do item 11, decisão 6) — correção é via UPDATE.';

comment on column public.gtas.transacao_id is
  'Vínculo opcional a uma transação (spec: "vínculo opcional a uma '
  'transação"). MUITOS-PARA-UM deliberado: uma transação pode ter várias '
  'GTAs vinculadas (uma por caminhão de transporte), mas cada GTA pertence '
  'a NO MÁXIMO uma transação — correção de 2026-07-21 sobre o desenho '
  'original 1:1 da migration do item 11 (transacoes.gta_id, removido nesta '
  'migration, nunca teve dado real em produção). on delete set null quando '
  'a transação referenciada for removida — não arrasta a GTA inteira.';

comment on function public.validar_gta_transacao_mesma_fazenda() is
  'Impede que uma GTA seja vinculada a uma transação de OUTRA fazenda — '
  'única checagem de integridade cross-fazenda necessária agora que o '
  'vínculo é só muitos-para-um (gtas.transacao_id), não mais circular. '
  'CHECK constraint não serve aqui porque não pode consultar outra tabela.';
