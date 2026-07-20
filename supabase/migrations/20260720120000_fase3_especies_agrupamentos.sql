-- ============================================================================
-- Migration: Fase 3 — Eixo 2, item 10: catálogos de referência de espécies
-- Tabelas: especies, subtipos_especie, agrupamentos_etarios
-- Seed: transcrição literal do seed definitivo da spec (seção 3.2), validado
--       com o cliente em 2026-07-16 (ver PROJECT_CONTEXT.md seção 2).
--
-- Escopo desta migration: SOMENTE o item 10 da seção 10 da spec (catálogos de
-- espécie/subtipo/faixa etária). `gtas`, `transacoes`, `transacoes_detalhe`,
-- `transacoes_animais`, saldo de rebanho e financeiro são tarefas seguintes
-- da mesma fase — fora do escopo aqui, propositalmente não implementados.
--
-- Aditiva sobre 20260716171522_fase1_usuarios_fazendas.sql,
-- 20260716183000_adr0002_convites_papeis.sql e
-- 20260717140000_fase2_lotes_animais_pesagens.sql — reaproveita
-- trigger_set_updated_at() já existente, não recria nada. Segue os mesmos
-- padrões já revisados pelo cyber_chief: search_path = '' em toda função,
-- referências sempre schema-qualificadas, comentários SQL extensos, CHECK
-- sobre `text` em vez de enum de banco (mesmo trade-off já documentado na
-- Fase 1 para `usuarios_fazendas.papel` — mais barato de estender depois).
--
-- DECISÕES DE DESIGN DESTA MIGRATION (resumo — detalhe em cada seção):
--
-- 1. NATUREZA DAS 3 TABELAS — catálogo de referência global, não multi-tenant.
--    Diferente de TODA tabela criada até aqui no projeto (usuarios/fazendas/
--    lotes/animais/pesagens/etc.), nenhuma das 3 tem `fazenda_id`: são
--    compartilhadas por todas as fazendas do sistema (a lista de espécies
--    suportadas e suas faixas etárias não varia por fazenda). Isso muda a
--    forma da RLS — não há predicado de tenant a aplicar, só a pergunta
--    "quem pode ler" vs. "quem pode escrever" (ver seção 4 desta migration).
--
-- 2. INTEGRIDADE subtipo↔espécie via FK COMPOSTA, não trigger. Um
--    `agrupamentos_etarios.subtipo_especie_id`, quando preenchido, precisa
--    necessariamente pertencer à MESMA `especie_id` da própria linha (não
--    faria sentido uma faixa etária de Bovino apontar para o subtipo "Frango
--    de Corte" de Aves). Em vez de replicar o padrão de trigger de validação
--    já usado na Fase 2 (`validar_lote_mesma_fazenda()`), aqui a integridade
--    é garantida estruturalmente: `subtipos_especie` ganha uma UNIQUE
--    (id, especie_id) — redundante com a PK isoladamente, mas necessária
--    como alvo de FK composta — e `agrupamentos_etarios` referencia
--    `(subtipo_especie_id, especie_id) → subtipos_especie(id, especie_id)`.
--    Postgres usa MATCH SIMPLE por padrão: se `subtipo_especie_id` for NULL
--    (caso normal para Bovino/Suíno/Equino/Ovino/Caprino, que não usam
--    subtipo), a FK composta não é verificada — comportamento correto e sem
--    exceção especial a escrever. Mais barato de manter que um trigger e
--    impossível de contornar por um caminho de escrita que o trigger não
--    previu.
--
-- 3. UNICIDADE DE `ordem` POR GRUPO — dois índices únicos parciais, não um
--    único UNIQUE(especie_id, subtipo_especie_id, ordem). Motivo: NULL não é
--    igual a NULL em constraints UNIQUE do Postgres — um UNIQUE simples sobre
--    as 3 colunas NÃO impediria duas linhas de Bovino (subtipo_especie_id
--    sempre NULL) com o mesmo `ordem`, porque cada NULL conta como distinto
--    do outro. Resolvido com dois índices únicos parciais: um cobre o caso
--    "tem subtipo" (WHERE subtipo_especie_id IS NOT NULL), outro cobre "não
--    tem subtipo" (WHERE subtipo_especie_id IS NULL, chaveado só por
--    especie_id + ordem). Ver seção 2.3.
--
-- 4. TRANSCRIÇÃO LITERAL DAS FAIXAS DE SUÍNO E AVES-FRANGO DE CORTE — a spec
--    (seção 3.2) dá essas duas faixas com limites de raia SOBREPOSTOS entre
--    linhas adjacentes (Suíno: 0–30 · 30–70 · 70–150 · Mais de 180; Aves-
--    Frango: 0–1 · 1–6 · 6–8 · Mais de 8), diferente do padrão sem
--    sobreposição usado pelas faixas em "meses" (Bovino: 0–12 · 13–24 · ...,
--    onde a spec já escreve 13, não 12, como início da 2ª faixa). Esta
--    migration TRANSCREVE os números exatamente como a spec define — inclui
--    o hiato não coberto entre 151–179 dias em Suíno (a spec pula direto de
--    "70–150" para "Mais de 180", não "Mais de 150") — sem "corrigir" o que
--    não foi pedido. A tarefa desta migration é modelar/semear o catálogo,
--    não implementar a função de classificação de idade→faixa (fora de
--    escopo aqui); quem escrever essa função no futuro (provavelmente ao
--    lançar `transacoes_detalhe`) precisa estar ciente da sobreposição/hiato
--    literal ao decidir o operador de comparação (`>=`/`<=` vs. `>`/`<`) —
--    sinalizado explicitamente na "Atenção para o gate" no log desta tarefa.
--    Para as faixas em "meses" (Bovino/Equino/Ovino/Caprino/Muar), o início
--    do último bucket aberto ("Mais de X") foi inferido como X+1 (ex.: Mais
--    de 36 → idade_min=37), aplicando o MESMO padrão de não-sobreposição já
--    explícito nas faixas intermediárias dessas espécies na própria spec
--    (13 depois de 12, 7 depois de 6, 25 depois de 24) — não é um valor
--    inventado, é a extensão do padrão que a spec já demonstra para essas
--    espécies especificamente.
--
-- 5. MUARES — subtipo ÚNICO "Mula/Burro/Jumento" (não dois subtipos
--    separados "Mula" e "Burro/Jumento`). Segue a instrução explícita da
--    tarefa ("subtipo ÚNICO Mula/Burro/Jumento — confirmado, não separar"),
--    que é mais específica que a redação da spec seção 3.2 (que lista "Mula,
--    Burro/Jumento" de um jeito que poderia ser lido como dois itens). Uma
--    única linha em `subtipos_especie` para Muares.
--
-- 6. ABELHAS E DEMAIS SUBTIPOS DE AVES — sem linha em `agrupamentos_etarios`
--    (deliberado, não esquecido). Abelhas usa contagem por unidade de
--    colônia (colmeia/caixa), incompatível com o modelo de
--    faixa-etária × sexo desta tabela (spec seção 3.2, nota ⚠️) — os 2
--    subtipos de Abelhas são semeados em `subtipos_especie` (para uso futuro
--    do módulo de saldo por colônia), mas sem faixa etária associada. Os 5
--    subtipos de Aves além de Frango de Corte (Matriz, Galinha Poedeira,
--    Peru, Codorna, Avestruz) também são semeados sem faixa etária —
--    pendência não bloqueante já registrada em PROJECT_CONTEXT.md seção 4,
--    aguardando validação futura do cliente sobre ciclo de vida >1 ano.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- Referência: especificacao-sistema.md, seção 3.2 (schema completo + seed) e
--             4.2 (motivo do unidade_idade configurável); item 10 da seção 10
--             (plano de implementação). PROJECT_CONTEXT.md seção 2 (decisões
--             de 2026-07-16 que resolveram as pendências originais da spec).
-- ============================================================================


-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 public.especies
--     Catálogo global das espécies suportadas pelo sistema (spec seção 3.2).
--     Sem fazenda_id — compartilhada por todas as fazendas.
-- ----------------------------------------------------------------------------
create table public.especies (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.especies is
  'Catálogo global de espécies suportadas (Bovinos/Suínos/Aves/Equinos/'
  'Muares/Ovinos/Caprinos/Abelhas — spec seção 3.2). Sem fazenda_id: não é '
  'multi-tenant, é config compartilhada por todo o sistema. Escrita só via '
  'migration/seed (ver seção 4, RLS) — nunca pelo client.';

comment on column public.especies.ativo is
  'Permite desativar uma espécie do catálogo sem apagar histórico '
  'referenciado por ela (soft-disable). Filtro de ativo=true é '
  'responsabilidade da camada de aplicação ao popular selects de '
  'formulário — a RLS de SELECT desta tabela não filtra por ativo (ver '
  'seção 4).';

create trigger set_updated_at
  before update on public.especies
  for each row
  execute function public.trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1.2 public.subtipos_especie
--     Subdivisão dentro de uma espécie, só para as que precisam (Aves,
--     Muares, Abelhas — spec seção 3.2). Demais espécies não têm nenhuma
--     linha aqui; `agrupamentos_etarios.subtipo_especie_id` fica NULL para
--     elas.
--
--     UNIQUE (id, especie_id): redundante com a PK isoladamente, mas
--     necessária para ser alvo da FK composta de agrupamentos_etarios (ver
--     decisão 2 do cabeçalho) — é o mecanismo que garante, no nível do
--     schema, que uma faixa etária nunca aponte para o subtipo de outra
--     espécie.
-- ----------------------------------------------------------------------------
create table public.subtipos_especie (
  id         uuid primary key default gen_random_uuid(),
  especie_id uuid not null references public.especies(id) on delete cascade,
  nome       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (especie_id, nome),
  unique (id, especie_id)
);

comment on table public.subtipos_especie is
  'Subdivisão de uma espécie para fins de manejo/faixa etária (spec seção '
  '3.2) — só Aves (6 subtipos), Muares (1, "Mula/Burro/Jumento" — '
  'confirmado como subtipo único, não separar) e Abelhas (2) têm linhas '
  'aqui nesta fase. UNIQUE(id, especie_id) existe só para servir de alvo da '
  'FK composta de agrupamentos_etarios, não é uma regra de negócio própria.';

create index idx_subtipos_especie_especie_id on public.subtipos_especie(especie_id);

create trigger set_updated_at
  before update on public.subtipos_especie
  for each row
  execute function public.trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1.3 public.agrupamentos_etarios
--     Faixas etárias usadas no saldo de rebanho (Eixo 2), variam por
--     espécie/subtipo e por unidade de tempo (spec seção 3.2 e 4.2).
--     NÃO confundir com animais_com_detalhes.categoria (Eixo 1, Fase 2) —
--     são dois sistemas de faixa etária deliberadamente independentes (spec
--     seção 3.2, "⚠️ Atenção — não confundir").
-- ----------------------------------------------------------------------------
create table public.agrupamentos_etarios (
  id                  uuid primary key default gen_random_uuid(),
  especie_id          uuid not null references public.especies(id) on delete cascade,
  subtipo_especie_id  uuid null,
  label               text not null,
  unidade_idade       text not null
                      constraint agrupamentos_etarios_unidade_idade_check
                      check (unidade_idade in ('dias', 'semanas', 'meses')),
  idade_min           integer not null
                      constraint agrupamentos_etarios_idade_min_check
                      check (idade_min >= 0),
  idade_max           integer null
                      constraint agrupamentos_etarios_idade_max_check
                      check (idade_max is null or idade_max > idade_min),
  ordem               integer not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Decisão 2 do cabeçalho: FK composta garante que subtipo_especie_id
  -- (quando não NULL) pertence à MESMA especie_id da linha. MATCH SIMPLE
  -- (default) não verifica a FK quando subtipo_especie_id é NULL — é o
  -- caso normal de Bovino/Suíno/Equino/Ovino/Caprino.
  constraint agrupamentos_etarios_subtipo_mesma_especie
    foreign key (subtipo_especie_id, especie_id)
    references public.subtipos_especie(id, especie_id)
    on delete cascade
);

comment on table public.agrupamentos_etarios is
  'Faixas etárias do saldo de rebanho (Eixo 2), por espécie/subtipo e '
  'unidade de tempo configurável (spec seção 3.2/4.2). Seed completo '
  'validado com o cliente em 2026-07-16 (ver PROJECT_CONTEXT.md seção 2) '
  'para Bovino/Equino/Ovino/Caprino/Muar/Suíno e Aves-Frango de Corte. '
  'Abelhas e os demais subtipos de Aves não têm linha aqui (ver decisão 6 '
  'do cabeçalho desta migration) — não é lacuna, é modelagem deliberada. '
  'NÃO é a mesma faixa etária de animais_com_detalhes.categoria (Eixo 1) — '
  'sistemas paralelos e intencionalmente independentes, ver spec seção 3.2.';

comment on column public.agrupamentos_etarios.subtipo_especie_id is
  'NULL para espécies sem subdivisão (Bovino/Suíno/Equino/Ovino/Caprino). '
  'Quando preenchido, DEVE pertencer à mesma especie_id da própria linha — '
  'garantido pela FK composta agrupamentos_etarios_subtipo_mesma_especie, '
  'não por trigger.';

comment on column public.agrupamentos_etarios.idade_min is
  'Idade mínima da faixa, na unidade de unidade_idade. Ver decisão 4 do '
  'cabeçalho desta migration sobre a transcrição literal dos limites de '
  'Suíno/Aves-Frango de Corte (sobrepostos entre linhas adjacentes, exatamente '
  'como a spec define) vs. os limites sem sobreposição das faixas em meses.';

comment on column public.agrupamentos_etarios.idade_max is
  'Idade máxima da faixa (inclusive), na unidade de unidade_idade. NULL = '
  'faixa aberta ("Mais de X").';

comment on column public.agrupamentos_etarios.ordem is
  'Ordem de exibição dentro do grupo (mesma especie_id + subtipo_especie_id). '
  'Unicidade garantida pelos 2 índices únicos parciais da seção 2.3 — não '
  'por um UNIQUE simples (ver decisão 3 do cabeçalho: NULL não é igual a '
  'NULL em UNIQUE, um UNIQUE simples não fecharia o caso sem subtipo).';

create trigger set_updated_at
  before update on public.agrupamentos_etarios
  for each row
  execute function public.trigger_set_updated_at();


-- ============================================================================
-- 2. ÍNDICES
-- ============================================================================

-- 2.1 FKs simples (além dos implícitos das UNIQUE já criadas acima)
create index idx_agrupamentos_etarios_especie_id on public.agrupamentos_etarios(especie_id);
create index idx_agrupamentos_etarios_subtipo_especie_id
  on public.agrupamentos_etarios(subtipo_especie_id)
  where subtipo_especie_id is not null;

-- 2.2 Consulta principal do módulo de Saldo de Rebanho: "todas as faixas de
--     uma espécie/subtipo, em ordem de exibição" (spec, módulo Saldo de
--     Rebanho, seção 5.2). Cobre a consulta inteira sem tocar a tabela.
create index idx_agrupamentos_etarios_grupo_ordem
  on public.agrupamentos_etarios(especie_id, subtipo_especie_id, ordem);

-- 2.3 Unicidade de `ordem` por grupo — ver decisão 3 do cabeçalho desta
--     migration (por que são 2 índices parciais, não 1 UNIQUE simples).
create unique index uq_agrupamentos_etarios_ordem_com_subtipo
  on public.agrupamentos_etarios(especie_id, subtipo_especie_id, ordem)
  where subtipo_especie_id is not null;

create unique index uq_agrupamentos_etarios_ordem_sem_subtipo
  on public.agrupamentos_etarios(especie_id, ordem)
  where subtipo_especie_id is null;


-- ============================================================================
-- 3. SEED — transcrição literal da spec seção 3.2 (ver decisões 4-6 do
--    cabeçalho desta migration para as escolhas de transcrição)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 especies — 8 linhas, ordem e nomes exatamente como a spec seção 3.2
--     lista o "escopo completo definido pelo cliente".
-- ----------------------------------------------------------------------------
insert into public.especies (nome, ativo) values
  ('Bovinos', true),
  ('Suínos', true),
  ('Aves', true),
  ('Equinos', true),
  ('Muares', true),
  ('Ovinos', true),
  ('Caprinos', true),
  ('Abelhas', true);


-- ----------------------------------------------------------------------------
-- 3.2 subtipos_especie — 9 linhas: Aves (6) + Muares (1, subtipo único,
--     decisão 5 do cabeçalho) + Abelhas (2).
-- ----------------------------------------------------------------------------
insert into public.subtipos_especie (especie_id, nome)
select e.id, st.nome
from public.especies e
join (values
  ('Aves', 'Frango de Corte'),
  ('Aves', 'Matriz'),
  ('Aves', 'Galinha Poedeira'),
  ('Aves', 'Peru'),
  ('Aves', 'Codorna'),
  ('Aves', 'Avestruz'),
  ('Muares', 'Mula/Burro/Jumento'),
  ('Abelhas', 'Apis mellifera'),
  ('Abelhas', 'Abelhas Nativas Sem Ferrão')
) as st(especie_nome, nome)
  on e.nome = st.especie_nome;


-- ----------------------------------------------------------------------------
-- 3.3 agrupamentos_etarios — 24 linhas (4 Bovino + 2 Equino + 2 Ovino +
--     4 Caprino + 4 Muar + 4 Suíno + 4 Aves-Frango de Corte). Abelhas e os
--     demais 5 subtipos de Aves ficam sem linha (decisão 6 do cabeçalho).
-- ----------------------------------------------------------------------------

-- Bovino (meses, sem subtipo) — 0-12 · 13-24 · 25-36 · Mais de 36
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, null, v.label, 'meses', v.idade_min, v.idade_max, v.ordem
from public.especies e
join (values
  ('0-12 meses', 0, 12, 1),
  ('13-24 meses', 13, 24, 2),
  ('25-36 meses', 25, 36, 3),
  ('Mais de 36 meses', 37, null, 4)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Bovinos';

-- Equino (meses, sem subtipo) — 0-12 · Mais de 12
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, null, v.label, 'meses', v.idade_min, v.idade_max, v.ordem
from public.especies e
join (values
  ('0-12 meses', 0, 12, 1),
  ('Mais de 12 meses', 13, null, 2)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Equinos';

-- Ovino (meses, sem subtipo) — 0-6 · Mais de 6
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, null, v.label, 'meses', v.idade_min, v.idade_max, v.ordem
from public.especies e
join (values
  ('0-6 meses', 0, 6, 1),
  ('Mais de 6 meses', 7, null, 2)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Ovinos';

-- Caprino (meses, sem subtipo) — 0-6 · 7-12 · 13-24 · Mais de 24
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, null, v.label, 'meses', v.idade_min, v.idade_max, v.ordem
from public.especies e
join (values
  ('0-6 meses', 0, 6, 1),
  ('7-12 meses', 7, 12, 2),
  ('13-24 meses', 13, 24, 3),
  ('Mais de 24 meses', 25, null, 4)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Caprinos';

-- Muar — subtipo único "Mula/Burro/Jumento" (meses) — 0-12 · 13-24 · 25-36 ·
-- Mais de 36 (mesmas faixas de Bovino, spec seção 3.2)
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, se.id, v.label, 'meses', v.idade_min, v.idade_max, v.ordem
from public.especies e
join public.subtipos_especie se on se.especie_id = e.id and se.nome = 'Mula/Burro/Jumento'
join (values
  ('0-12 meses', 0, 12, 1),
  ('13-24 meses', 13, 24, 2),
  ('25-36 meses', 25, 36, 3),
  ('Mais de 36 meses', 37, null, 4)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Muares';

-- Suíno (dias, sem subtipo) — 0-30 · 30-70 · 70-150 · Mais de 180
-- (limites transcritos literalmente da spec, incluindo a sobreposição entre
-- linhas adjacentes e o hiato 151-179 — ver decisão 4 do cabeçalho)
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, null, v.label, 'dias', v.idade_min, v.idade_max, v.ordem
from public.especies e
join (values
  ('0-30 dias', 0, 30, 1),
  ('30-70 dias', 30, 70, 2),
  ('70-150 dias', 70, 150, 3),
  ('Mais de 180 dias', 180, null, 4)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Suínos';

-- Aves — subtipo Frango de Corte (semanas) — 0-1 · 1-6 · 6-8 · Mais de 8
-- (limites transcritos literalmente da spec, incluindo a sobreposição entre
-- linhas adjacentes — ver decisão 4 do cabeçalho). Demais subtipos de Aves
-- ficam sem linha nesta tabela (decisão 6 do cabeçalho).
insert into public.agrupamentos_etarios
  (especie_id, subtipo_especie_id, label, unidade_idade, idade_min, idade_max, ordem)
select e.id, se.id, v.label, 'semanas', v.idade_min, v.idade_max, v.ordem
from public.especies e
join public.subtipos_especie se on se.especie_id = e.id and se.nome = 'Frango de Corte'
join (values
  ('0-1 semana', 0, 1, 1),
  ('1-6 semanas', 1, 6, 2),
  ('6-8 semanas', 6, 8, 3),
  ('Mais de 8 semanas', 8, null, 4)
) as v(label, idade_min, idade_max, ordem) on true
where e.nome = 'Aves';


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

alter table public.especies enable row level security;
alter table public.subtipos_especie enable row level security;
alter table public.agrupamentos_etarios enable row level security;

-- ----------------------------------------------------------------------------
-- Decisão de RLS (ver decisão 1 do cabeçalho desta migration):
--
-- QUEM LÊ: qualquer usuário autenticado, SEM restrição por fazenda (as 3
-- tabelas não têm fazenda_id — não há tenant a isolar) e SEM restrição por
-- papel. Diferente de `lotes`/`animais`/`pesagens` (Fase 2), onde o papel
-- `financeiro` é bloqueado por ser dado de manejo individual de Eixo 1 (spec
-- seção 5.4) — aqui não se aplica: `especies`/`subtipos_especie`/
-- `agrupamentos_etarios` são catálogo de referência consumido também pelos
-- módulos de Eixo 2 (GTA/Transações/Financeiro, spec seção 5.2), aos quais
-- o papel `financeiro` explicitamente TEM acesso. Restringir a leitura deste
-- catálogo por papel quebraria os próprios formulários que o financeiro
-- precisa usar (ex.: popular o seletor de espécie de um lançamento
-- financeiro). `using (true)` é intencional aqui, não um "esqueci de
-- restringir" — a tabela em si não carrega nenhum dado sensível por
-- fazenda/usuário.
--
-- QUEM ESCREVE: ninguém via client. Nenhuma policy de INSERT/UPDATE/DELETE
-- para `authenticated`/`anon` é criada — mesmo padrão default-deny já usado
-- em `usuarios`/`fazendas`/`usuarios_fazendas` (ADR-0001) e
-- `usuarios_fazendas`/`convites` (ADR-0002): estas 3 tabelas são
-- administradas pelo squad via migration/seed, nunca pelo usuário final.
-- Isso é deliberado mesmo sendo dado "não sensível" — o cadastro de espécies
-- e faixas etárias é regulatório (precisa bater com a nomenclatura oficial
-- usada pelo órgão estadual, spec seção 1) e não é uma decisão que caiba ao
-- produtor individual alterar pela UI. Se um novo subtipo/espécie precisar
-- ser adicionado no futuro, é uma migration nova (mesma lógica do CHECK de
-- `papel` em `usuarios_fazendas`), não uma tela de cadastro.
-- ----------------------------------------------------------------------------

create policy especies_select_authenticated
  on public.especies
  for select
  to authenticated
  using (true);

create policy subtipos_especie_select_authenticated
  on public.subtipos_especie
  for select
  to authenticated
  using (true);

create policy agrupamentos_etarios_select_authenticated
  on public.agrupamentos_etarios
  for select
  to authenticated
  using (true);
