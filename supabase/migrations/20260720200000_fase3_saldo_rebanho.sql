-- ============================================================================
-- Migration: Fase 3 — Eixo 2, item 12: saldo de rebanho (view calculada)
-- Objetos: view saldo_rebanho_movimentos, função obter_saldo_rebanho(),
--          view de conveniência saldo_rebanho
--
-- Escopo desta migration: SOMENTE o item 12 da seção 10 da spec — o cálculo
-- de saldo de rebanho a partir de transacoes_detalhe. Buckets de Storage
-- (item 14) seguem fora de escopo.
--
-- Aditiva sobre todas as migrations anteriores — reaproveita transacoes/
-- transacoes_detalhe/agrupamentos_etarios/especies/usuarios_fazendas já
-- existentes, não recria nada. Segue os padrões já revisados pelo
-- cyber_chief: search_path = '' em toda função, referências sempre
-- schema-qualificadas, `security_invoker = true` em toda view nova (mesmo
-- padrão de animais_com_detalhes/lotes_com_estatisticas, Fase 2 —
-- indispensável, sem isso a view rodaria com o privilégio de quem a criou,
-- vazando saldo de TODAS as fazendas).
--
-- DECISÕES DE DESIGN DESTA MIGRATION:
--
-- 1. VIEW PARAMETRIZÁVEL POR DATA — a spec (seção 3.2, "saldo_rebanho") pede
--    uma view, mas também exige consulta por "data de referência" arbitrária
--    ("Saldo referente a data: 15/07/2026" no print, não só hoje). Uma VIEW
--    pura do Postgres não aceita parâmetro. Resolvido em duas camadas:
--    (a) `saldo_rebanho_movimentos` — view granular, um registro por linha
--    de `transacoes_detalhe`, com quantidade já sinalizada (+ entrada,
--    - saída) e classificação `registrada`/`pendente`, SEM filtro de data;
--    (b) `obter_saldo_rebanho(p_data_referencia date default current_date)`
--    — função STABLE que agrega (a) até a data informada. Para o caso comum
--    "saldo de hoje", a view de conveniência `saldo_rebanho` (seção 3) chama
--    a função com `current_date` — cobre o nome literal que a spec usa,
--    sem abrir mão do parâmetro para consultas históricas.
--
-- 2. CLASSIFICAÇÃO registrada vs. pendente USA `transacoes.status_gta_
--    transacao`, NÃO um JOIN em `gtas.status_liberacao` — decisão de
--    segurança, não só de conveniência. `gtas` tem RLS que EXCLUI
--    `financeiro` por completo (zero SELECT, Fase 3 item 11, spec 5.4);
--    `transacoes`/`transacoes_detalhe` PERMITEM SELECT a `financeiro`
--    (mesma spec 5.4 — financeiro alimenta o Painel Financeiro/Saldo). Se a
--    view fizesse LEFT JOIN em `gtas`, um usuário `financeiro` (RLS aplicada
--    via security_invoker) veria SEMPRE `null` do lado de `gtas` — TODA
--    movimentação cairia silenciosamente em "registrada", mesmo quando na
--    verdade está pendente de liberação, porque a linha da GTA
--    simplesmente não é visível para aquele papel. Isso não vazaria dado
--    (não é um problema de autorização), mas produziria um saldo
--    DIFERENTE — e errado — para financeiro em relação a admin/membro,
--    quebrando a premissa de fonte única de verdade do módulo. Usar a
--    coluna já denormalizada em `transacoes.status_gta_transacao` (que
--    `financeiro` enxerga) evita o problema por completo e é exatamente o
--    que a spec descreve essa coluna como sendo: "reflete a coluna GTA do
--    print, que indica se a movimentação depende de GTA e seu status".
--    Limite honesto: `status_gta_transacao` é um campo editável
--    independente (Fase 3 item 11 não criou nenhum trigger de sincronismo
--    com `gtas.status_liberacao`) — se ficar desatualizado manualmente em
--    relação à GTA real, o saldo herda essa desatualização. Não é escopo
--    desta migration corrigir (decisão de schema já gated na Fase 3 item
--    11); fica registrado como limite conhecido.
--
-- 3. "ESPINHA" COMPLETA (fazenda × espécie × agrupamento × sexo) — os
--    prints de referência (`Bovinos/Ovino-saldo-atual.png`, fornecidos por
--    JP em 2026-07-20) mostram TODAS as combinações de agrupamento×sexo da
--    espécie, inclusive as com 0/0 (ex.: "25-36 meses | Macho | 0 | 0").
--    Agregar direto de `transacoes_detalhe` omitiria silenciosamente
--    qualquer combinação sem nenhuma movimentação histórica. A função monta
--    primeiro a "espinha" completa (cross join de espécies/agrupamentos ×
--    sexo × fazendas do usuário) e faz LEFT JOIN da agregação de
--    movimentos por cima, com `coalesce(..., 0)` — replica o comportamento
--    visual do print exatamente.
--
-- 4. ESPÉCIES SEM AGRUPAMENTO (Abelhas, subtipos de Aves além de Frango de
--    Corte) ficam FORA da espinha automaticamente — o `join
--    agrupamentos_etarios on especie_id` (sem filtro de subtipo) já exclui
--    espécies/subtipos sem nenhuma linha em `agrupamentos_etarios` (Fase 3
--    item 10, decisão 6). Não é lacuna: Abelhas usa saldo por unidade de
--    colônia, estrutura completamente diferente (spec seção 3.2, ⚠️
--    "não confundir") — fora do escopo desta view. Deliberado, sem código
--    especial para "ignorar" Abelhas.
--
-- 5. SINAL DE `tipo_operacao`: `compra`/`entrada_pastoreio` somam (+),
--    `venda`/`saida_pastoreio` subtraem (-) — os 4 tipos afetam o saldo
--    corrente (spec seção 5.2, "toda nova transação... atualiza
--    automaticamente o Módulo de Saldo de Rebanho"), não só compra/venda.
--
-- 6. LIMITE HONESTO sobre `transacoes_detalhe` ser OPCIONAL (spec seção 3.2
--    já descreve a tabela como "opcional, recomendado"): uma `transacao`
--    sem nenhuma linha de detalhe (ex.: produtor só preencheu
--    `observacoes` em texto livre, como vários exemplos reais do print
--    "Controle de entradas e saídas" fornecido por JP) simplesmente NÃO
--    aparece nesta view/função — a quantidade fica de fora do saldo
--    calculado. Não é bug desta migration; é a consequência direta e já
--    documentada da estrutura opcional que a própria spec define. Fica
--    registrado para o gate de validação do `qa` (Checkpoint de Validação
--    de Saldo): a reconciliação com os números reais do print pode exigir
--    completar `transacoes_detalhe` retroativamente para as transações
--    históricas relevantes, não é algo que a função deva "adivinhar".
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- Referência: especificacao-sistema.md, seção 3.2 (schema completo de
--             saldo_rebanho, incluindo qtd_registrada/qtd_pendente) e
--             seção 5.2 (módulo Saldo de Rebanho); item 12 da seção 10;
--             prints de referência fornecidos por JP em 2026-07-20
--             (Bovinos/Ovino-saldo-atual.png).
-- ============================================================================


-- ============================================================================
-- 1. VIEW GRANULAR — um registro por linha de transacoes_detalhe, com
--    quantidade já sinalizada e classificação registrada/pendente. Sem
--    filtro de data — a função da seção 2 aplica o corte.
-- ============================================================================

create or replace view public.saldo_rebanho_movimentos
with (security_invoker = true)
as
select
  t.fazenda_id,
  ae.especie_id,
  td.agrupamento_etario_id,
  td.sexo,
  t.data_operacao,
  case
    when t.tipo_operacao in ('compra', 'entrada_pastoreio') then td.quantidade
    else -td.quantidade
  end as quantidade_sinalizada,
  case
    when t.status_gta_transacao = 'pendente' then 'pendente'
    else 'registrada'
  end as bucket
from public.transacoes_detalhe td
join public.transacoes t on t.id = td.transacao_id
join public.agrupamentos_etarios ae on ae.id = td.agrupamento_etario_id;

comment on view public.saldo_rebanho_movimentos is
  'Um registro por linha de transacoes_detalhe, com quantidade já '
  'sinalizada (+ compra/entrada_pastoreio, - venda/saida_pastoreio) e '
  'classificação registrada/pendente derivada de '
  'transacoes.status_gta_transacao (NÃO de gtas.status_liberacao — ver '
  'decisão 2 do cabeçalho desta migration, motivo de segurança/RLS). Sem '
  'filtro de data — obter_saldo_rebanho() aplica o corte por data de '
  'referência. security_invoker=true: RLS de transacoes/transacoes_detalhe '
  'aplicada a quem consulta, não a quem criou a view (mesmo padrão de '
  'animais_com_detalhes/lotes_com_estatisticas, Fase 2).';


-- ============================================================================
-- 2. FUNÇÃO PRINCIPAL — agrega a view acima até a data de referência,
--    contra a "espinha" completa de fazenda × espécie × agrupamento × sexo
--    (decisão 3 do cabeçalho: replica os zeros visíveis no print).
-- ============================================================================

create or replace function public.obter_saldo_rebanho(
  p_data_referencia date default current_date
)
returns table (
  fazenda_id            uuid,
  especie_id            uuid,
  especie_nome          text,
  agrupamento_etario_id uuid,
  agrupamento_label     text,
  sexo                  text,
  qtd_registrada        bigint,
  qtd_pendente          bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with fazendas_do_usuario as (
    select fazenda_id
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
  ),
  espinha as (
    select
      fu.fazenda_id,
      e.id   as especie_id,
      e.nome as especie_nome,
      ae.id    as agrupamento_etario_id,
      ae.label as agrupamento_label,
      sx.sexo
    from fazendas_do_usuario fu
    cross join public.especies e
    join public.agrupamentos_etarios ae on ae.especie_id = e.id
    cross join (values ('macho'), ('femea')) as sx(sexo)
  )
  select
    espinha.fazenda_id,
    espinha.especie_id,
    espinha.especie_nome,
    espinha.agrupamento_etario_id,
    espinha.agrupamento_label,
    espinha.sexo,
    coalesce(
      sum(m.quantidade_sinalizada) filter (where m.bucket = 'registrada'),
      0
    )::bigint as qtd_registrada,
    coalesce(
      sum(m.quantidade_sinalizada) filter (where m.bucket = 'pendente'),
      0
    )::bigint as qtd_pendente
  from espinha
  left join public.saldo_rebanho_movimentos m
    on m.fazenda_id = espinha.fazenda_id
   and m.especie_id = espinha.especie_id
   and m.agrupamento_etario_id = espinha.agrupamento_etario_id
   and m.sexo = espinha.sexo
   and m.data_operacao <= p_data_referencia
  group by
    espinha.fazenda_id, espinha.especie_id, espinha.especie_nome,
    espinha.agrupamento_etario_id, espinha.agrupamento_label, espinha.sexo
  order by
    espinha.fazenda_id, espinha.especie_nome, espinha.agrupamento_label,
    espinha.sexo;
$$;

comment on function public.obter_saldo_rebanho(date) is
  'Saldo de rebanho por fazenda/espécie/agrupamento etário/sexo, na data de '
  'referência informada (default hoje) — spec seção 3.2/5.2, item 12 da '
  'seção 10. SECURITY INVOKER (padrão, sem elevação): a RLS de '
  'usuarios_fazendas/transacoes/transacoes_detalhe já escopa o resultado ao '
  'usuário chamador, incluindo o papel financeiro (spec 5.4 — financeiro TEM '
  'acesso a este módulo). Retorna a espinha completa (espécie×agrupamento× '
  'sexo, mesmo com 0/0) para as fazendas vinculadas ao usuário — ver '
  'decisão 3 do cabeçalho desta migration. Abelhas e subtipos de Aves sem '
  'faixa etária ficam fora do resultado (deliberado, decisão 4 do '
  'cabeçalho) — saldo de Abelhas é por colônia, fora do escopo desta '
  'função.';


-- ============================================================================
-- 3. VIEW DE CONVENIÊNCIA — nome literal usado pela spec (seção 3.2),
--    cobrindo o caso comum "saldo de hoje" sem exigir chamar a função via
--    RPC. Para data de referência arbitrária, usar obter_saldo_rebanho()
--    diretamente.
-- ============================================================================

create or replace view public.saldo_rebanho
with (security_invoker = true)
as
select * from public.obter_saldo_rebanho(current_date);

comment on view public.saldo_rebanho is
  'Saldo de rebanho referente a HOJE (current_date) — conveniência sobre '
  'obter_saldo_rebanho(), mesmo nome usado pela spec seção 3.2. Para saldo '
  'histórico numa data de corte arbitrária (spec: "Saldo referente a data", '
  'print de referência), chamar obter_saldo_rebanho(p_data_referencia) '
  'diretamente via RPC. security_invoker=true (mesmo padrão das demais '
  'views deste projeto) — redundante em termos de segurança já que a '
  'função por trás é SECURITY INVOKER, mas mantido por consistência com o '
  'padrão estabelecido nas Fases 1/2 para toda view nova.';
