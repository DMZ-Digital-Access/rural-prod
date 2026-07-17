-- ============================================================================
-- Migration: Fase 2 — Eixo 1: Gestão Individual de Rebanho
-- Tabelas: lotes, animais, pesagens
-- Views: animais_com_detalhes, lotes_com_estatisticas
-- Funções: calcular_categoria_animal() (pura), registrar_pesagem() (RPC,
--          SECURITY DEFINER), atualizar_animal_apos_pesagem() (trigger)
-- Débito técnico corrigido (spec seção 9, item 2): GMD deixa de ser média
--          simples acumulada (bug do protótipo) e passa a ser
--          (peso_atual - peso_inicial) / dias_totais.
--
-- Aditiva sobre 20260716171522_fase1_usuarios_fazendas.sql e
-- 20260716183000_adr0002_convites_papeis.sql — não recria nada, reaproveita
-- trigger_set_updated_at() e usuarios_fazendas já existentes. Segue os
-- mesmos padrões já revisados pelo cyber_chief nas duas migrations
-- anteriores: search_path = '' em toda função nova, referências sempre
-- schema-qualificadas, comentários SQL extensos, RLS default-deny como
-- postura padrão (aqui com uma exceção deliberada e documentada — ver
-- decisão 2 abaixo).
--
-- DECISÕES DE DESIGN DESTA MIGRATION (resumo — detalhe em cada seção):
--
-- 1. Categorização automática (Bezerro/Novilho/Boi, Bezerra/Novilha/Vaca) é
--    uma função SQL pura `calcular_categoria_animal(idade_meses, sexo)`,
--    IMMUTABLE — recebe a idade já calculada (não `data_nascimento`), para
--    que a função em si seja genuinamente pura (mesma entrada -> mesma
--    saída, para sempre). Quem depende de `current_date` (o cálculo da
--    idade a partir de `data_nascimento`) fica isolado na VIEW, que já é
--    naturalmente STABLE por natureza de consulta. Isso também é o que
--    permite reuso sem duplicação: um único lugar calcula a categoria.
--
-- 2. `pesagens` é a ÚNICA das 3 tabelas desta migration SEM policy de
--    INSERT/UPDATE declarativa para `authenticated` — toda escrita passa
--    por `registrar_pesagem()` (SECURITY DEFINER), pelo mesmo motivo que
--    ADR-0002 generalizou para `usuarios_fazendas`/`convites`: a decisão
--    "é correção (UPDATE) ou histórico novo (INSERT)" depende de um
--    SELECT anterior ao próprio comando SQL, e a atualização consequente
--    de `animais.peso_atual_kg/gmd_medio_kg/ultima_pesagem_data` é uma
--    regra de negócio, não um efeito colateral opcional — um INSERT/UPDATE
--    direto do client em `pesagens` (se fosse permitido) contornaria as
--    duas regras por completo. `lotes` e `animais`, ao contrário, GANHAM
--    policies de INSERT/UPDATE declarativas normais (spec: "qualquer papel
--    vinculado pode gerenciar animais nesta fase") — não há decisão
--    condicional nem recálculo derivado ao criar/editar um lote ou um
--    animal (fora dos 3 campos calculados de `animais`, tratados no item 4).
--    CORREÇÃO cyber_chief (gate Fase 2, achado nº1): "qualquer papel
--    vinculado" tem um limite explícito na própria spec (seção 5.4) — o
--    papel `financeiro` (já existente em produção via ADR-0002) é
--    excluído de TODAS as policies das 3 tabelas desta migration (SELECT
--    inclusive), não só INSERT/UPDATE. Ver comentário completo na seção 6.
--
-- 3. GMD = (peso_atual - peso_inicial) / dias_totais. `dias_totais` usa
--    `animais.created_at::date` (data de registro do animal no sistema),
--    NÃO `data_nascimento`. Motivo: `peso_inicial_kg` é capturado na
--    CRIAÇÃO do animal (spec seção 3.1), não necessariamente ao nascer —
--    um animal pode entrar no sistema já adulto. Medir "dias totais" a
--    partir de `data_nascimento` inflaria o denominador com anos de vida
--    anteriores ao acompanhamento, sub-relatando o GMD real do período
--    efetivamente medido. `dias_totais <= 0` (pesagem no mesmo dia do
--    registro, ou -- por proteção -- retroativa a uma data anterior ao
--    registro) resulta em `gmd_medio_kg = NULL`, não erro nem `0` — `0`
--    afirmaria "ganho de peso confirmado zero", o que é uma alegação
--    diferente de "dados insuficientes para calcular uma taxa".
--
-- 4. `animais.peso_atual_kg`, `gmd_medio_kg` e `ultima_pesagem_data` são
--    campos CALCULADOS, mantidos exclusivamente por
--    `atualizar_animal_apos_pesagem()`. A policy de UPDATE client-facing
--    de `animais` (item 2) é escopada por `fazenda_id`, não por coluna —
--    RLS do Postgres não expressa "WITH CHECK só nestas colunas" (mesma
--    limitação que gerou os guardas de imutabilidade do cyber_chief na
--    Fase 1 para `usuarios.email`/`fazendas.usuario_id`). Sem uma guarda
--    adicional, um usuário vinculado à própria fazenda poderia fazer
--    `UPDATE animais SET peso_atual_kg = 999` sem nunca ter registrado uma
--    pesagem real, falsificando a métrica que é o próprio objeto do débito
--    técnico corrigido nesta fase. Não é um IDOR cross-fazenda (não cruza
--    tenant), mas é falsificação de dado dentro da própria fazenda — a
--    guarda de trigger `prevent_animais_campos_calculados_change()`
--    (seção 3) fecha essa lacuna com uma flag de sessão local à
--    transação, liberada apenas quando quem escreve é o próprio trigger
--    de recálculo.
--
-- 5. `animais.lote_id`, quando preenchido, precisa apontar para um lote da
--    MESMA `fazenda_id` do animal — sem essa checagem, um usuário poderia
--    (acidental ou deliberadamente) associar seu animal a um `lote_id` de
--    OUTRA fazenda, poluindo `lotes_com_estatisticas` de terceiros com
--    dados de fora do tenant — exatamente o tipo de vazamento entre
--    fazendas citado como inaceitável no escopo desta tarefa. Validado em
--    trigger (`validar_lote_mesma_fazenda()`, seção 3), não em CHECK
--    constraint, porque CHECK não pode consultar outra tabela.
--
-- 6. `lotes_com_estatisticas`: métricas escolhidas por serem baratas
--    (um único GROUP BY, sem subquery correlacionada por linha) e úteis
--    para a tela de listagem/comparativo de lotes (spec seção 5.1,
--    "Comparativo de desempenho entre lotes"): número total de animais já
--    associados ao lote (histórico), número de animais ATIVOS
--    (status='ativo' AND ativo=true — únicos que contam para peso/GMD
--    "atuais" do lote), peso total e médio dos ativos, GMD médio simples
--    dos ativos (não ponderado por dias — mesmo trade-off "começar simples,
--    otimizar depois" já adotado pela spec para o saldo de rebanho do
--    Eixo 2, seção 7).
--
-- 7. AMBAS as views usam `security_invoker = true` (storage parameter de
--    view, Postgres 15+). SEM isso, a view roda com o privilégio de quem a
--    criou (o role da migration, tipicamente dono das tabelas e portanto
--    isento de RLS) — qualquer usuário autenticado que consultasse a view
--    enxergaria TODOS os animais/lotes de TODAS as fazendas, não só os
--    seus. Este seria um IDOR real e grave (exatamente o cenário que a
--    tarefa nomeia como inaceitável), silencioso porque as tabelas base
--    têm RLS correta — só a view, por ausência desta opção, vazaria por
--    fora dela. Atenção redobrada pedida aqui para o gate do cyber_chief.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-17
-- Revisão de segurança: CONCLUÍDA (cyber_chief/CONSTANTINE, 2026-07-17) —
--   🟢 liberada para `supabase db push` do ponto de vista deste gate
--   (decisão de quando aplicar continua humana/orchestrator). 3 correções
--   aplicadas diretamente neste arquivo: (1) achado nº1 — RLS de
--   lotes/animais/pesagens e a checagem de autorização de
--   registrar_pesagem() não excluíam papel='financeiro', que já existe de
--   verdade em produção (ADR-0002) e que a spec (seção 5.4) proíbe
--   explicitamente de ter qualquer acesso a manejo individual de
--   animais/lotes/pesagens — adicionado `papel <> 'financeiro'` em todas
--   as policies das 3 tabelas e na autorização de registrar_pesagem();
--   (2) achado nº2 — inicializar_peso_atual_animal() só protegia
--   peso_atual_kg/gmd_medio_kg/ultima_pesagem_data contra UPDATE direto
--   (seção 3.4), não contra INSERT — um client podia cadastrar um animal
--   já com GMD/última pesagem falsos; corrigido forçando os 3 campos
--   sempre no BEFORE INSERT; (3) achado menor — mensagens de erro de
--   registrar_pesagem() unificadas para não revelar se um animal_id existe
--   em outra fazenda (mesmo princípio já usado em
--   validar_lote_mesma_fazenda()). security_invoker=true nas duas views
--   (decisão 7) e o mecanismo de GUC local à transação
--   rural_prod.recalculo_pesagem (decisão 4) foram revisados e confirmados
--   corretos, sem alteração. Ver
--   .agents/memory/log/2026-07-17-cyber_chief-review-fase2.md.
-- Referência: especificacao-sistema.md, seções 3.1, 4.1, 5.4 e 9 (item 2).
-- ============================================================================


-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 public.lotes
-- ----------------------------------------------------------------------------
create table public.lotes (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references public.fazendas(id) on delete cascade,
  nome        text not null,
  descricao   text,
  data_inicio date not null default current_date,
  data_fim    date,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lotes_data_fim_apos_inicio check (data_fim is null or data_fim >= data_inicio)
);

comment on table public.lotes is
  'Lote de manejo de animais dentro de uma fazenda (Eixo 1, spec seção 3.1). '
  '`ativo`=false representa "arquivado" (spec seção 5.1) — não é status de '
  'negócio do lote, é flag de listagem/arquivamento.';

create index idx_lotes_fazenda_id on public.lotes(fazenda_id);

create trigger set_updated_at
  before update on public.lotes
  for each row
  execute function public.trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1.2 public.animais
--     `identificacao` único por fazenda (decisão de modelagem desta
--     migration, não explícita na spec, mas condizente com o uso real do
--     campo como brinco/tag de identificação do animal — duplicidade
--     dentro da mesma fazenda seria um erro de cadastro, não um caso de
--     uso legítimo).
-- ----------------------------------------------------------------------------
create table public.animais (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references public.fazendas(id) on delete cascade,
  lote_id             uuid references public.lotes(id) on delete set null,
  identificacao       text not null,
  data_nascimento     date not null,
  sexo                text not null
                      constraint animais_sexo_check
                      check (sexo in ('macho', 'femea')),
  peso_inicial_kg     numeric(8,3) not null
                      constraint animais_peso_inicial_positivo
                      check (peso_inicial_kg > 0),
  peso_atual_kg       numeric(8,3)
                      constraint animais_peso_atual_positivo
                      check (peso_atual_kg is null or peso_atual_kg > 0),
  gmd_medio_kg        numeric(8,4),
  ultima_pesagem_data date,
  ativo               boolean not null default true,
  status              text not null default 'ativo'
                      constraint animais_status_check
                      check (status in ('ativo', 'venda', 'morte', 'baixa')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint animais_data_nascimento_nao_futura check (data_nascimento <= current_date),
  unique (fazenda_id, identificacao)
);

comment on table public.animais is
  'Animal individual (Eixo 1, spec seção 3.1). `status` é o estado de '
  'negócio mutuamente exclusivo (ativo/venda/morte/baixa, spec seção 4.1); '
  '`ativo` (boolean) é flag de listagem, tratada de forma independente do '
  '`status` pela spec (mesmo padrão redundante de `lotes.ativo`) — mantida '
  'como o campo literal da spec, não uma reinterpretação desta migration. '
  '`peso_atual_kg`/`gmd_medio_kg`/`ultima_pesagem_data` são CALCULADOS, '
  'mantidos exclusivamente por atualizar_animal_apos_pesagem() — ver '
  'guarda prevent_animais_campos_calculados_change() (seção 3) e cabeçalho '
  'desta migration, decisão 4.';

comment on column public.animais.peso_inicial_kg is
  'Peso capturado na CRIAÇÃO do animal no sistema — não necessariamente ao '
  'nascer (um animal pode ser cadastrado já adulto). Base para o cálculo '
  'de GMD (peso_atual - peso_inicial) / dias_totais, onde dias_totais usa '
  'created_at do animal, não data_nascimento — ver cabeçalho, decisão 3.';

create index idx_animais_fazenda_id on public.animais(fazenda_id);
create index idx_animais_lote_id on public.animais(lote_id);

create trigger set_updated_at
  before update on public.animais
  for each row
  execute function public.trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1.3 public.pesagens
--     Sem `updated_at` (decisão desta migration, spec permite qualquer
--     escolha): a regra de correção já usa UPDATE do registro existente
--     quando a mudança é <= 2 dias da última pesagem (spec seção 4.1) —
--     `created_at` continua fixo desde a primeira gravação, preservando um
--     traço de "quando este registro passou a existir" mesmo que seus
--     valores (`data_evento`/`peso_kg`) sejam corrigidos depois. Não há
--     necessidade hoje de saber "quando a correção aconteceu" — se essa
--     necessidade surgir, é uma migration aditiva de uma coluna, sem
--     mudança estrutural.
-- ----------------------------------------------------------------------------
create table public.pesagens (
  id          uuid primary key default gen_random_uuid(),
  animal_id   uuid not null references public.animais(id) on delete cascade,
  data_evento date not null,
  peso_kg     numeric(8,3) not null
              constraint pesagens_peso_positivo
              check (peso_kg > 0),
  created_at  timestamptz not null default now(),
  constraint pesagens_data_evento_nao_futura check (data_evento <= current_date)
);

comment on table public.pesagens is
  'Histórico de pesagens de um animal (Eixo 1, spec seção 3.1). Escrita '
  'EXCLUSIVAMENTE via public.registrar_pesagem() — zero policy de INSERT/'
  'UPDATE/DELETE para authenticated/anon (ver seção RLS e cabeçalho desta '
  'migration, decisão 2). A regra "correção vs. novo registro histórico" '
  '(spec seção 4.1) só pode ser decidida ANTES do comando SQL rodar, o que '
  'não é expressável como trigger simples BEFORE INSERT.';

create index idx_pesagens_animal_id on public.pesagens(animal_id);
create index idx_pesagens_animal_id_data_evento on public.pesagens(animal_id, data_evento desc);


-- ============================================================================
-- 2. FUNÇÃO DE CATEGORIZAÇÃO (pura, reutilizável)
--
-- Recebe idade já calculada (não data_nascimento) para ser genuinamente
-- IMMUTABLE — mesma entrada sempre produz a mesma saída, sem depender de
-- current_date. Quem calcula a idade "hoje" a partir de data_nascimento é
-- a view (seção 4), que é reavaliada a cada consulta por natureza.
-- Faixas (spec seção 4.1): macho <8m Bezerro / 8-24m Novilho / >24m Boi;
-- fêmea mesmas faixas → Bezerra/Novilha/Vaca.
-- ============================================================================
create or replace function public.calcular_categoria_animal(
  p_idade_meses integer,
  p_sexo text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_sexo = 'macho' then
      case
        when p_idade_meses < 8 then 'Bezerro'
        when p_idade_meses <= 24 then 'Novilho'
        else 'Boi'
      end
    else
      case
        when p_idade_meses < 8 then 'Bezerra'
        when p_idade_meses <= 24 then 'Novilha'
        else 'Vaca'
      end
  end;
$$;

comment on function public.calcular_categoria_animal(integer, text) is
  'Categorização zootécnica automática (spec seção 4.1), pura e IMMUTABLE. '
  'Recebe idade em meses já calculada (não data_nascimento) — reutilizada '
  'por animais_com_detalhes, único lugar onde a regra de faixas etárias '
  'vive. Não confundir com agrupamentos_etarios do Eixo 2 (spec seção 3.2, '
  '"não confundir com a categorização do Eixo 1") — sistemas paralelos '
  'deliberadamente independentes, fora do escopo desta migration.';


-- ============================================================================
-- 3. TRIGGERS DE INTEGRIDADE (lotes/animais)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Imutabilidade de id/fazenda_id/created_at em lotes e animais.
--
-- Mesma lógica de defesa em profundidade do cyber_chief na Fase 1
-- (prevent_usuarios_identity_change/prevent_fazendas_identity_change):
-- as policies de UPDATE (seção 6) já escopam USING/WITH CHECK por
-- fazenda_id vinculada ao usuário, então reescrever fazenda_id para outra
-- fazenda TAMBÉM vinculada ao mesmo usuário não abre acesso indevido hoje
-- — mas não há caso de uso legítimo para "mover" um lote/animal de
-- fazenda por UPDATE (isso deveria ser uma operação explícita e auditada,
-- não um efeito colateral de edição comum), e bloquear aqui remove
-- qualquer dependência futura de que o WITH CHECK de RLS continue restrito
-- o suficiente. Uma única função genérica, reusada nas duas tabelas
-- (usa tg_table_name na mensagem de erro).
-- ----------------------------------------------------------------------------
create or replace function public.prevent_fazenda_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception '%.id não pode ser alterado', tg_table_name;
  end if;
  if new.fazenda_id is distinct from old.fazenda_id then
    raise exception '%.fazenda_id não pode ser alterado — moveria o registro para outra fazenda por fora de um fluxo administrativo explícito', tg_table_name;
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception '%.created_at não pode ser alterado', tg_table_name;
  end if;
  return new;
end;
$$;

comment on function public.prevent_fazenda_id_change() is
  'Guarda de imutabilidade genérica (id/fazenda_id/created_at), reusada '
  'por lotes e animais. Defesa em profundidade — não corrige um exploit '
  'ativo (RLS já escopa por fazenda vinculada), mas remove a premissa de '
  'que o WITH CHECK de uma policy futura continue restrito o suficiente. '
  'Mesmo padrão do gate de segurança da Fase 1.';

create trigger prevent_identity_change
  before update on public.lotes
  for each row
  execute function public.prevent_fazenda_id_change();

create trigger prevent_identity_change
  before update on public.animais
  for each row
  execute function public.prevent_fazenda_id_change();


-- ----------------------------------------------------------------------------
-- 3.2 validar_lote_mesma_fazenda() — animais.lote_id só pode apontar para
--     um lote da MESMA fazenda do animal.
--
-- SECURITY INVOKER (padrão, sem elevação): o SELECT abaixo já respeita a
-- RLS de `lotes` do próprio chamador. Se lote_id apontar para um lote de
-- OUTRA fazenda (não vinculada ao chamador), a RLS de lotes já filtra essa
-- linha para fora do SELECT, então o resultado é "not found" de qualquer
-- forma — dupla proteção (RLS de lotes + esta checagem explícita), sem
-- precisar de privilégio elevado para funcionar. Mensagem de erro
-- deliberadamente genérica (não revela se o lote existe em outra fazenda).
-- ----------------------------------------------------------------------------
create or replace function public.validar_lote_mesma_fazenda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fazenda_lote uuid;
begin
  if new.lote_id is null then
    return new;
  end if;

  select fazenda_id
    into v_fazenda_lote
    from public.lotes
   where id = new.lote_id;

  if not found or v_fazenda_lote is distinct from new.fazenda_id then
    raise exception 'lote_id inválido ou não pertence à mesma fazenda do animal';
  end if;

  return new;
end;
$$;

comment on function public.validar_lote_mesma_fazenda() is
  'Impede que um animal seja associado a um lote de OUTRA fazenda — sem '
  'esta checagem, lotes_com_estatisticas de terceiros poderia ser poluída '
  'por animais de fora do tenant (vazamento entre fazendas, ver cabeçalho '
  'desta migration, decisão 5). CHECK constraint não serve aqui porque não '
  'pode consultar outra tabela.';

create trigger validar_lote_mesma_fazenda
  before insert or update of lote_id, fazenda_id on public.animais
  for each row
  execute function public.validar_lote_mesma_fazenda();


-- ----------------------------------------------------------------------------
-- 3.3 inicializar_peso_atual_animal() — ao criar um animal, força
--     peso_atual_kg = peso_inicial_kg e gmd_medio_kg/ultima_pesagem_data =
--     NULL, sempre, ignorando qualquer valor enviado pelo client.
--
-- CORREÇÃO cyber_chief (gate Fase 2, achado nº2): a versão original só
-- copiava peso_inicial_kg para peso_atual_kg quando o client NÃO enviava
-- peso_atual_kg explicitamente (`if new.peso_atual_kg is null`), e não
-- tocava em gmd_medio_kg/ultima_pesagem_data. Como
-- prevent_animais_campos_calculados_change() (seção 3.4) só dispara em
-- `before update`, não em `before insert`, isso deixava os 3 campos
-- calculados TOTALMENTE livres no momento da criação: qualquer usuário com
-- permissão de INSERT em animais (animais_insert_vinculada) podia cadastrar
-- um animal já com `gmd_medio_kg`/`ultima_pesagem_data`/`peso_atual_kg`
-- arbitrários, sem nunca ter existido uma pesagem real — a mesma
-- falsificação que a decisão 4 do cabeçalho desta migration já identificava
-- como inaceitável, só que pela porta que a guarda de UPDATE não cobre.
-- Não há cenário legítimo em que um animal recém-criado já tenha GMD ou
-- data de última pesagem (por definição, pesagem zero nesse instante), então
-- a correção é sobrescrever incondicionalmente, não só quando NULL.
-- ----------------------------------------------------------------------------
create or replace function public.inicializar_peso_atual_animal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.peso_atual_kg := new.peso_inicial_kg;
  new.gmd_medio_kg := null;
  new.ultima_pesagem_data := null;
  return new;
end;
$$;

comment on function public.inicializar_peso_atual_animal() is
  'BEFORE INSERT em animais: força peso_atual_kg = peso_inicial_kg e '
  'gmd_medio_kg/ultima_pesagem_data = NULL, sempre — fecha a lacuna de '
  'falsificação de campos calculados no INSERT que '
  'prevent_animais_campos_calculados_change() (seção 3.4, só UPDATE) não '
  'cobria (CORREÇÃO cyber_chief, gate Fase 2, achado nº2). Único caminho '
  'real para popular estes 3 campos depois da criação é '
  'registrar_pesagem()/atualizar_animal_apos_pesagem().';

create trigger inicializar_peso_atual
  before insert on public.animais
  for each row
  execute function public.inicializar_peso_atual_animal();


-- ----------------------------------------------------------------------------
-- 3.4 prevent_animais_campos_calculados_change() — bloqueia UPDATE direto
--     (client-side) de peso_atual_kg/gmd_medio_kg/ultima_pesagem_data.
--
-- Mecanismo: atualizar_animal_apos_pesagem() (seção 5) seta uma GUC LOCAL
-- À TRANSAÇÃO (`rural_prod.recalculo_pesagem = on`, is_local = true em
-- set_config — nunca escapa da transação corrente, relevante sob
-- connection pooling) imediatamente antes de escrever nestas 3 colunas; a
-- guarda só bloqueia quando essa flag NÃO está ativa. Ver decisão 4 no
-- cabeçalho desta migration para o raciocínio completo (por que isso não é
-- opcional, mesmo não sendo IDOR cross-fazenda).
-- ----------------------------------------------------------------------------
create or replace function public.prevent_animais_campos_calculados_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('rural_prod.recalculo_pesagem', true), 'off') = 'on' then
    return new;
  end if;

  if new.peso_atual_kg is distinct from old.peso_atual_kg
     or new.gmd_medio_kg is distinct from old.gmd_medio_kg
     or new.ultima_pesagem_data is distinct from old.ultima_pesagem_data then
    raise exception 'peso_atual_kg, gmd_medio_kg e ultima_pesagem_data são calculados a partir de pesagens — use registrar_pesagem(), não UPDATE direto em animais';
  end if;

  return new;
end;
$$;

comment on function public.prevent_animais_campos_calculados_change() is
  'Bloqueia UPDATE direto dos 3 campos calculados de animais fora do fluxo '
  'de atualizar_animal_apos_pesagem() (flag de sessão local à transação). '
  'Ver cabeçalho desta migration, decisão 4.';

create trigger prevent_campos_calculados_change
  before update of peso_atual_kg, gmd_medio_kg, ultima_pesagem_data on public.animais
  for each row
  execute function public.prevent_animais_campos_calculados_change();


-- ============================================================================
-- 4. VIEWS
--
-- `security_invoker = true` em AMBAS — ver cabeçalho desta migration,
-- decisão 7. Sem esta opção, as views rodariam com o privilégio de quem as
-- criou (dono das tabelas, isento de RLS), vazando animais/lotes de TODAS
-- as fazendas para qualquer usuário autenticado que consultasse a view —
-- um IDOR real, mesmo com RLS correta nas tabelas base.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 animais_com_detalhes
--     idade_dias/idade_meses calculados a partir de data_nascimento (só
--     aqui, não na função de categorização — ver cabeçalho, decisão 1);
--     categoria via calcular_categoria_animal(); ganho_total_kg =
--     peso_atual - peso_inicial; numero_pesagens via subquery agregada
--     (não correlacionada linha a linha — um único GROUP BY por trás do
--     LEFT JOIN, plano de execução único para a view inteira).
-- ----------------------------------------------------------------------------
create or replace view public.animais_com_detalhes
with (security_invoker = true)
as
select
  a.*,
  (current_date - a.data_nascimento) as idade_dias,
  (
    date_part('year', age(current_date, a.data_nascimento)) * 12
    + date_part('month', age(current_date, a.data_nascimento))
  )::integer as idade_meses,
  public.calcular_categoria_animal(
    (
      date_part('year', age(current_date, a.data_nascimento)) * 12
      + date_part('month', age(current_date, a.data_nascimento))
    )::integer,
    a.sexo
  ) as categoria,
  (a.peso_atual_kg - a.peso_inicial_kg) as ganho_total_kg,
  coalesce(p.numero_pesagens, 0) as numero_pesagens
from public.animais a
left join (
  select animal_id, count(*) as numero_pesagens
    from public.pesagens
   group by animal_id
) p on p.animal_id = a.id;

comment on view public.animais_com_detalhes is
  'Animais + idade/categoria/ganho/nº pesagens calculados (spec seção '
  '3.1). security_invoker=true — RLS de public.animais aplicada ao '
  'usuário que consulta a view, não ao dono da view (ver cabeçalho desta '
  'migration, decisão 7).';


-- ----------------------------------------------------------------------------
-- 4.2 lotes_com_estatisticas
--     Métricas escolhidas: ver cabeçalho desta migration, decisão 6.
--     numero_animais_total conta TODO animal já associado ao lote,
--     independente de status; as demais métricas (ativos/peso/gmd) só
--     consideram status='ativo' AND ativo=true — animais vendidos/mortos/
--     baixados não devem inflar "desempenho atual" do lote.
-- ----------------------------------------------------------------------------
create or replace view public.lotes_com_estatisticas
with (security_invoker = true)
as
select
  l.*,
  coalesce(stats.numero_animais_total, 0) as numero_animais_total,
  coalesce(stats.numero_animais_ativos, 0) as numero_animais_ativos,
  stats.peso_total_kg,
  stats.peso_medio_kg,
  stats.gmd_medio_kg
from public.lotes l
left join (
  select
    a.lote_id,
    count(*) as numero_animais_total,
    count(*) filter (where a.status = 'ativo' and a.ativo) as numero_animais_ativos,
    sum(a.peso_atual_kg) filter (where a.status = 'ativo' and a.ativo) as peso_total_kg,
    avg(a.peso_atual_kg) filter (where a.status = 'ativo' and a.ativo) as peso_medio_kg,
    avg(a.gmd_medio_kg) filter (where a.status = 'ativo' and a.ativo) as gmd_medio_kg
    from public.animais a
   where a.lote_id is not null
   group by a.lote_id
) stats on stats.lote_id = l.id;

comment on view public.lotes_com_estatisticas is
  'Lotes + agregações de animais associados (spec seção 3.1). '
  'security_invoker=true (ver cabeçalho desta migration, decisão 7). '
  'gmd_medio_kg é média simples entre animais ativos, não ponderada por '
  'dias de acompanhamento — mesmo trade-off "simples primeiro, otimizar '
  'depois" já adotado pela spec para o saldo de rebanho do Eixo 2 (seção '
  '7); revisitar se o comparativo entre lotes (spec seção 5.1) exigir mais '
  'precisão.';


-- ============================================================================
-- 5. REGISTRO DE PESAGEM — atualizar_animal_apos_pesagem() (trigger) +
--    registrar_pesagem() (RPC, SECURITY DEFINER)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 atualizar_animal_apos_pesagem() — AFTER INSERT OR UPDATE ON pesagens.
--
-- Recalcula peso_atual_kg/gmd_medio_kg/ultima_pesagem_data em animais a
-- partir da pesagem mais recente do animal APÓS a operação (que pode ser
-- a própria pesagem que disparou o trigger, ou uma pesagem diferente/mais
-- antiga se p_data_evento tiver sido retroativo o suficiente para não ser
-- "a mais recente"). Único lugar onde a fórmula de GMD vive — reage a
-- QUALQUER escrita em pesagens, não só as originadas por
-- registrar_pesagem() (hoje a única, mas a garantia não depende disso).
--
-- SECURITY DEFINER (com search_path=''): a escrita em animais precisa
-- passar pela guarda prevent_animais_campos_calculados_change() (seção
-- 3.4), que só libera quando a GUC de sessão está ativa — setada aqui,
-- antes do UPDATE, sempre pelo próprio trigger, nunca pelo client.
-- ----------------------------------------------------------------------------
create or replace function public.atualizar_animal_apos_pesagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peso_inicial      numeric(8,3);
  v_data_registro     date;
  v_peso_mais_recente numeric(8,3);
  v_data_mais_recente date;
  v_dias_totais       integer;
  v_gmd               numeric(8,4);
begin
  select peso_inicial_kg, created_at::date
    into v_peso_inicial, v_data_registro
    from public.animais
   where id = new.animal_id;

  select peso_kg, data_evento
    into v_peso_mais_recente, v_data_mais_recente
    from public.pesagens
   where animal_id = new.animal_id
   order by data_evento desc, created_at desc
   limit 1;

  v_dias_totais := v_data_mais_recente - v_data_registro;

  -- Proteção contra divisão por zero (e contra dias_totais negativo, ex.:
  -- pesagem retroativa a uma data anterior ao registro do animal): NULL,
  -- não erro nem 0 — ver cabeçalho desta migration, decisão 3.
  if v_dias_totais is null or v_dias_totais <= 0 then
    v_gmd := null;
  else
    v_gmd := round((v_peso_mais_recente - v_peso_inicial) / v_dias_totais, 4);
  end if;

  perform set_config('rural_prod.recalculo_pesagem', 'on', true);

  update public.animais
     set peso_atual_kg = v_peso_mais_recente,
         gmd_medio_kg = v_gmd,
         ultima_pesagem_data = v_data_mais_recente
   where id = new.animal_id;

  return new;
end;
$$;

comment on function public.atualizar_animal_apos_pesagem() is
  'Trigger AFTER INSERT OR UPDATE ON pesagens. Recalcula peso_atual_kg/'
  'gmd_medio_kg/ultima_pesagem_data em animais a partir da pesagem mais '
  'recente pós-operação. GMD = (peso_atual - peso_inicial) / dias_totais, '
  'dias_totais = data da pesagem mais recente - animais.created_at (não '
  'data_nascimento — ver cabeçalho desta migration, decisão 3). '
  'dias_totais <= 0 => gmd_medio_kg = NULL (proteção contra divisão por '
  'zero, decisão 3). SECURITY DEFINER só para poder setar a flag que '
  'libera prevent_animais_campos_calculados_change() (seção 3.4).';

create trigger recalcular_animal
  after insert or update on public.pesagens
  for each row
  execute function public.atualizar_animal_apos_pesagem();


-- ----------------------------------------------------------------------------
-- 5.2 registrar_pesagem(p_animal_id, p_data_evento, p_peso_kg) RETURNS uuid
--
-- Único caminho de escrita em pesagens (spec seção 4.1 + cabeçalho desta
-- migration, decisão 2). SECURITY DEFINER: necessário porque pesagens não
-- tem NENHUMA policy de INSERT/UPDATE para authenticated (seção 6) — sem
-- elevação, o próprio INSERT/UPDATE dentro desta função falharia por RLS
-- default-deny. A autorização (chamador vinculado à fazenda do animal) é
-- checada explicitamente no corpo, nunca delegada a uma policy declarativa
-- — mesmo padrão imperativo das 4 funções SECURITY DEFINER do ADR-0002.
--
-- `for update` na linha do animal serializa chamadas concorrentes de
-- registrar_pesagem() para o MESMO animal — mesma classe de corrida já
-- fechada pelo cyber_chief em promover_papel() (ADR-0002): sem o lock,
-- duas chamadas concorrentes poderiam decidir UPDATE vs. INSERT a partir
-- do mesmo estado "antes", produzindo um resultado inconsistente com a
-- ordem real de chegada das duas chamadas.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_pesagem(
  p_animal_id uuid,
  p_data_evento date,
  p_peso_kg numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id            uuid;
  v_animal_encontrado     boolean;
  v_autorizado            boolean;
  v_pesagem_recente_id    uuid;
  v_pesagem_recente_data  date;
  v_pesagem_id            uuid;
begin
  if p_peso_kg is null or p_peso_kg <= 0 then
    raise exception 'peso_kg deve ser maior que zero';
  end if;

  if p_data_evento is null then
    raise exception 'data_evento é obrigatória';
  end if;

  if p_data_evento > current_date then
    raise exception 'data_evento não pode ser no futuro';
  end if;

  select fazenda_id
    into v_fazenda_id
    from public.animais
   where id = p_animal_id
   for update;

  v_animal_encontrado := found;

  -- Autorização: chamador precisa ter vínculo com a fazenda do animal E
  -- não ter papel='financeiro' (spec seção 5.4: financeiro é
  -- explicitamente "sem acesso a manejo individual de animais/lotes/
  -- pesagens" — CORREÇÃO cyber_chief, gate Fase 2, achado nº1, mesmo
  -- motivo das policies de RLS acima). Checagem obrigatória aqui — esta
  -- função SECURITY DEFINER roda com o privilégio do owner (ignora RLS);
  -- sem esta checagem seria uma porta aberta para qualquer usuário
  -- autenticado escrever pesagem em animal de QUALQUER fazenda (IDOR
  -- cross-tenant inaceitável, ver escopo desta tarefa), ou para um
  -- usuário financeiro escrever pesagem apesar de não ter esse acesso.
  if v_animal_encontrado then
    select exists (
      select 1
        from public.usuarios_fazendas
       where usuario_id = auth.uid()
         and fazenda_id = v_fazenda_id
         and papel <> 'financeiro'
    ) into v_autorizado;
  else
    v_autorizado := false;
  end if;

  -- CORREÇÃO cyber_chief (gate Fase 2, achado menor — consistência com
  -- validar_lote_mesma_fazenda(), seção 3.2): mensagem única e genérica
  -- para "animal não existe" e "existe mas sem permissão" — a versão
  -- anterior usava duas mensagens distintas, um oráculo que permitiria a
  -- qualquer usuário autenticado descobrir se um UUID de animal existe em
  -- QUALQUER fazenda do sistema (não só a sua), mesmo sem conseguir agir
  -- sobre ele. Baixo risco isolado (UUID não é adivinhável), mas sem
  -- motivo para manter a distinção.
  if not v_animal_encontrado or not v_autorizado then
    raise exception 'Animal não encontrado ou você não tem permissão para registrar pesagem nele';
  end if;

  select id, data_evento
    into v_pesagem_recente_id, v_pesagem_recente_data
    from public.pesagens
   where animal_id = p_animal_id
   order by data_evento desc, created_at desc
   limit 1;

  if v_pesagem_recente_id is not null
     and abs(p_data_evento - v_pesagem_recente_data) <= 2 then
    -- Correção (spec seção 4.1): mudança em até 2 dias da última pesagem
    -- é tratada como correção do MESMO registro, não novo histórico.
    update public.pesagens
       set data_evento = p_data_evento,
           peso_kg = p_peso_kg
     where id = v_pesagem_recente_id
    returning id into v_pesagem_id;
  else
    -- Fora da janela de correção (ou primeira pesagem do animal): novo
    -- registro histórico.
    insert into public.pesagens (animal_id, data_evento, peso_kg)
    values (p_animal_id, p_data_evento, p_peso_kg)
    returning id into v_pesagem_id;
  end if;

  -- Recálculo de animais.peso_atual_kg/gmd_medio_kg/ultima_pesagem_data
  -- NÃO acontece aqui — é responsabilidade do trigger
  -- atualizar_animal_apos_pesagem() (seção 5.1), disparado automaticamente
  -- pelo INSERT/UPDATE acima. Mantém a fórmula de GMD em um único lugar,
  -- mesmo princípio de não-duplicação já usado em
  -- calcular_categoria_animal() (seção 2).

  return v_pesagem_id;
end;
$$;

comment on function public.registrar_pesagem(uuid, date, numeric) is
  'Único caminho de escrita em pesagens (spec seção 4.1). SECURITY '
  'DEFINER — autorização (usuario_fazendas) checada explicitamente no '
  'corpo. Decide UPDATE (correção, <= 2 dias da última pesagem) vs. '
  'INSERT (novo histórico) e delega o recálculo de animais para o '
  'trigger atualizar_animal_apos_pesagem(). RETURNS o id da pesagem '
  'criada/atualizada. `for update` no animal serializa chamadas '
  'concorrentes para o mesmo animal (ver cabeçalho, seção 5.2).';

revoke all on function public.registrar_pesagem(uuid, date, numeric) from public;
grant execute on function public.registrar_pesagem(uuid, date, numeric) to authenticated;


-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

alter table public.lotes enable row level security;
alter table public.animais enable row level security;
alter table public.pesagens enable row level security;

-- ----------------------------------------------------------------------------
-- 6.1 lotes — qualquer papel vinculado à fazenda pode gerenciar (spec:
--     "a spec não define restrição por papel para o Eixo 1 ainda").
--     Sem policy de DELETE — arquivamento é via `ativo=false` (UPDATE),
--     não exclusão física; RLS default-deny cobre DELETE por padrão.
-- ----------------------------------------------------------------------------
-- CORREÇÃO cyber_chief (gate Fase 2, achado nº1): as 3 policies abaixo
-- originalmente escopavam só por `fazenda_id in (usuarios_fazendas do
-- chamador)`, sem checar `papel` — qualquer vínculo, incluindo
-- `papel='financeiro'`, passava. Isso contradiz especificacao-sistema.md
-- seção 5.4, que é explícita e não deixa margem: o papel Financeiro/
-- Contábil tem "Acesso restrito a: Painel Financeiro, Declarações de
-- Rebanho, Saldo de Animais" (tudo Eixo 2) e "Sem acesso a: manejo
-- individual de animais/lotes/pesagens[...]" (Eixo 1, exatamente as 3
-- tabelas desta migration) — zero acesso, nem leitura. Diferente do achado
-- equivalente da Fase 1 (`usuarios_fazendas_update_own`), que era uma
-- escalação LATENTE (papel 'financeiro' não existia ainda na constraint),
-- este é um gap ATIVO agora: ADR-0002 (`usuarios_fazendas_papel_check`)
-- já está aplicado no banco remoto e `criar_convite()` já aceita
-- `p_papel = 'financeiro'` em produção — um admin pode convidar um usuário
-- financeiro hoje, e sem esta correção esse usuário teria CRUD completo
-- (exceto DELETE) sobre lotes/animais e leitura de pesagens de toda a
-- fazenda, o oposto do desenho de produto. Mitigação: toda policy destas 3
-- tabelas passa a exigir `papel <> 'financeiro'` no subselect de
-- `usuarios_fazendas`, tanto em USING quanto em WITH CHECK.
create policy lotes_select_vinculada
  on public.lotes
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy lotes_insert_vinculada
  on public.lotes
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy lotes_update_vinculada
  on public.lotes
  for update
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

-- ----------------------------------------------------------------------------
-- 6.2 animais — mesmo padrão de lotes. Sem policy de DELETE (baixa/venda/
--     morte é status, não exclusão física). peso_atual_kg/gmd_medio_kg/
--     ultima_pesagem_data continuam tecnicamente cobertos por esta policy
--     de UPDATE (RLS não escopa coluna), mas protegidos por trigger
--     dedicado (seção 3.4) — ver cabeçalho, decisão 4.
-- ----------------------------------------------------------------------------
-- CORREÇÃO cyber_chief (gate Fase 2, achado nº1 — ver comentário completo
-- acima da seção 6.1): mesma correção, `papel <> 'financeiro'` em todas as
-- 3 policies.
create policy animais_select_vinculada
  on public.animais
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy animais_insert_vinculada
  on public.animais
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy animais_update_vinculada
  on public.animais
  for update
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  )
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

-- ----------------------------------------------------------------------------
-- 6.3 pesagens — SOMENTE SELECT declarativo. Zero policy de INSERT/UPDATE/
--     DELETE para authenticated/anon (ver cabeçalho desta migration,
--     decisão 2) — toda escrita passa por registrar_pesagem()
--     (SECURITY DEFINER, seção 5.2), que faz sua própria checagem de
--     autorização. RLS default-deny cobre qualquer tentativa de escrita
--     direta do client via PostgREST.
-- ----------------------------------------------------------------------------
-- CORREÇÃO cyber_chief (gate Fase 2, achado nº1 — ver comentário completo
-- acima da seção 6.1): mesma correção, `papel <> 'financeiro'`.
create policy pesagens_select_vinculada
  on public.pesagens
  for select
  to authenticated
  using (
    animal_id in (
      select a.id
        from public.animais a
       where a.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );
