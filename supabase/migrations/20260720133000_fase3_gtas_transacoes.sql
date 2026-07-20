-- ============================================================================
-- Migration: Fase 3 — Eixo 2, item 11: gtas, transacoes, transacoes_detalhe,
--            transacoes_animais
-- Tabelas: gtas, transacoes, transacoes_detalhe, transacoes_animais
-- Funções: preparar_vinculo_transacao_animal() (trigger, SECURITY INVOKER),
--          aplicar_status_animal_apos_vinculo() (trigger, SECURITY INVOKER),
--          reverter_status_animal_apos_desvinculo() (trigger, SECURITY
--          INVOKER), validar_gta_transacao_mesma_fazenda() (trigger),
--          validar_transacao_gta_mesma_fazenda() (trigger).
--
-- Escopo desta migration: SOMENTE o item 11 da seção 10 da spec. A view de
-- saldo de rebanho, lancamentos_financeiros, declaracoes_rebanho,
-- prazos_declaracao_estado e os buckets de Storage (gtas-documentos,
-- declaracoes-rebanho) são itens seguintes da mesma fase — fora de escopo,
-- propositalmente não implementados aqui.
--
-- Aditiva sobre 20260716171522_fase1_usuarios_fazendas.sql,
-- 20260716183000_adr0002_convites_papeis.sql,
-- 20260717140000_fase2_lotes_animais_pesagens.sql e
-- 20260720120000_fase3_especies_agrupamentos.sql — reaproveita
-- trigger_set_updated_at() e prevent_fazenda_id_change() já existentes, não
-- recria nada. Segue os mesmos padrões já revisados pelo cyber_chief:
-- search_path = '' em toda função, referências sempre schema-qualificadas,
-- comentários SQL extensos, mensagens de erro genéricas (sem oráculo de
-- enumeração cross-fazenda), CHECK sobre `text` em vez de enum de banco.
--
-- transacoes_animais implementa EXATAMENTE o ADR-0004
-- (.agents/memory/adr/ADR-0004-vinculo-transacoes-animais.md, decisões
-- D1-D6) — nenhuma decisão do ADR é reaberta ou reinterpretada aqui.
--
-- DECISÕES DE DESIGN DESTA MIGRATION (resumo — detalhe em cada seção):
--
-- 1. REFERÊNCIA CIRCULAR gtas.transacao_id <-> transacoes.gta_id (ambas
--    nullable, exatamente como a spec seção 3.2 define — não é redundância
--    a corrigir). Resolvida por ordem de criação: `transacoes` é criada
--    PRIMEIRO com `gta_id` como coluna simples, SEM a FK (que aponta para
--    frente, para uma tabela que ainda não existe); `gtas` é criada em
--    seguida já com a FK completa para `transacoes` (que já existe nesse
--    ponto); por fim, um `ALTER TABLE transacoes ADD CONSTRAINT` fecha a FK
--    que faltou, agora que `gtas` existe. Ver seção 1.
--
-- 2. INTEGRIDADE CRUZADA gtas<->transacoes: além da FK, dois triggers BEFORE
--    INSERT OR UPDATE (um em cada tabela, seção 3.1) garantem que, quando o
--    vínculo bidirecional é preenchido, as duas linhas pertencem à MESMA
--    fazenda_id — mesma classe de proteção que `validar_lote_mesma_fazenda`
--    (Fase 2) já aplica a `animais.lote_id`, e que o ADR-0004 (D4) aplica a
--    `transacoes_animais`. Sem essa checagem, a FK sozinha permitiria (em
--    tese, para um usuário com vínculo em mais de uma fazenda) linkar uma
--    GTA da fazenda A a uma transação da fazenda B.
--
-- 3. `especie_id` (em gtas e transacoes) e `agrupamento_etario_id` (em
--    transacoes_detalhe) usam `on delete restrict`, NÃO `on delete cascade`
--    como a migration anterior (catálogos) usou entre `agrupamentos_etarios`
--    e `especies`. Distinção deliberada: aquele cascade é catálogo->catálogo
--    (deletar uma espécie cascateando suas próprias faixas etárias é
--    aceitável, ambos são dado de configuração). Aqui a relação é
--    catálogo->dado transacional real (GTA/transação/detalhe de venda são
--    registros de negócio do produtor, com valor regulatório/fiscal) —
--    cascatear a exclusão de uma espécie do catálogo até apagar histórico de
--    transações do produtor seria uma perda de dado destrutiva e silenciosa,
--    inaceitável mesmo sendo um cenário hoje improvável (especies só é
--    escrita via migration/seed, spec 3.2). `restrict` força qualquer
--    tentativa futura de remover uma espécie referenciada a falhar
--    explicitamente, nunca a apagar histórico por efeito colateral.
--
-- 4. `gta_id`/`transacao_id`, quando a linha referenciada do outro lado do
--    vínculo circular é removida, usam `on delete set null` (não cascade):
--    a spec descreve a GTA como podendo existir "de forma avulsa/
--    informativa" sem transação vinculada, e o inverso (transação sem GTA)
--    já é o caso comum (`gta_id` nullable). Remover um dos dois lados do
--    vínculo não deveria arrastar o outro registro inteiro para exclusão.
--
-- 5. FRONTEIRA DE `financeiro` — TRÊS REGRAS DISTINTAS NA MESMA MIGRATION,
--    ATENÇÃO ESPECIAL PARA O GATE DO cyber_chief:
--    - `gtas`: ZERO acesso para `financeiro` (nem SELECT) — spec seção 5.4
--      lista "GTAs" explicitamente na frase "sem acesso a", não apenas
--      "edição de GTA".
--    - `transacoes`/`transacoes_detalhe`: SELECT permitido para
--      `financeiro` (alimenta Painel Financeiro e Saldo de Animais, ambos
--      derivados de `transacoes_detalhe`), mas ZERO INSERT/UPDATE/DELETE
--      ("edição de transações" é negada pela spec 5.4, não a leitura). Esta
--      é exatamente a "nota de dependência" que o ADR-0004 (D3) deixou em
--      aberto para esta migration decidir — decidida aqui, nestes termos.
--    - `transacoes_animais`: ZERO acesso para `financeiro` (nem SELECT),
--      conforme ADR-0004 D3, decisão já fechada e não reaberta aqui —
--      `animal_id` é dado de manejo individual (Eixo 1), vedado a
--      `financeiro` mesmo quando o acesso de leitura a `transacoes` (Eixo 2)
--      é concedido.
--
-- 6. Sem policy de DELETE em `gtas`, `transacoes` e `transacoes_detalhe`
--    (decisão desta migration — a tarefa pedia para decidir e justificar
--    para `transacoes`; a mesma lógica se estende a `transacoes_detalhe`
--    por consistência). Mesmo espírito de `lotes`/`animais` na Fase 2:
--    correção é via UPDATE (nenhum dos 3 campos de `transacoes`/
--    `transacoes_detalhe`/`gtas` é calculado — todos editáveis livremente
--    por quem tem permissão de UPDATE), não exclusão física. Deletar uma
--    `transacao` teria efeito em cascata sobre `transacoes_animais`
--    (`on delete cascade`, seção 1.5) e reverteria automaticamente
--    `animais.status` via o trigger de D5 do ADR-0004 — um efeito
--    colateral real demais para expor sem um fluxo de confirmação
--    dedicado, que fica fora do escopo desta migration (ver ADR-0004,
--    Critério de Revisão nº3, que já antecipa esse cenário para o dia em
--    que `db_sage` decidir habilitar DELETE de fato). `transacoes_animais`,
--    ao contrário, TEM policy de DELETE — decisão já fechada pelo ADR-0004
--    (D3/D5), não desta seção.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- Referência: especificacao-sistema.md, seção 3.2 (schema de gtas/
--             transacoes/transacoes_detalhe) e 5.4 (fronteira de acesso do
--             papel financeiro); ADR-0004 (schema e mecanismo completos de
--             transacoes_animais, D1-D6); item 11 da seção 10 (plano de
--             implementação); migrations anteriores (padrões de trigger de
--             integridade, RLS, comentários).
-- ============================================================================


-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 public.transacoes — criada ANTES de gtas, propositalmente. `gta_id` é
--     uma coluna uuid simples aqui, SEM foreign key ainda — a FK completa é
--     adicionada em 1.3, depois que `gtas` existir (ver decisão 1 do
--     cabeçalho). `especie_id` usa `on delete restrict` (decisão 3 do
--     cabeçalho — catálogo->dado transacional, nunca cascade).
-- ----------------------------------------------------------------------------
create table public.transacoes (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references public.fazendas(id) on delete cascade,
  tipo_operacao         text not null
                        constraint transacoes_tipo_operacao_check
                        check (tipo_operacao in ('compra', 'venda', 'entrada_pastoreio', 'saida_pastoreio')),
  especie_id            uuid not null references public.especies(id) on delete restrict,
  outra_parte           text not null,
  data_operacao         date not null,
  numero_nota           text,
  quantidade_animais    integer not null
                        constraint transacoes_quantidade_animais_positiva
                        check (quantidade_animais > 0),
  tem_contranota        boolean,
  valor_nota            numeric(12,2)
                        constraint transacoes_valor_nota_nao_negativo
                        check (valor_nota is null or valor_nota >= 0),
  gta_id                uuid, -- FK adicionada em 1.3 (ver decisão 1 do cabeçalho)
  status_gta_transacao  text not null default 'n_a'
                        constraint transacoes_status_gta_transacao_check
                        check (status_gta_transacao in ('despendenciada', 'n_a', 'pendente')),
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint transacoes_data_operacao_nao_futura check (data_operacao <= current_date)
);

comment on table public.transacoes is
  'Livro-razão de Entradas e Saídas — compra/venda/pastoreio (Eixo 2, spec '
  'seção 3.2). `gta_id` referencia gtas (FK adicionada em 1.3, depois que '
  'gtas existir — referência circular deliberada com gtas.transacao_id, '
  'ver cabeçalho desta migration, decisão 1). Sem policy de DELETE (decisão '
  '6 do cabeçalho) — correção é via UPDATE.';

comment on column public.transacoes.gta_id is
  'Vínculo opcional a uma GTA (spec: "status_gta_transacao reflete a coluna '
  'GTA do print"). on delete set null quando a GTA referenciada for '
  'removida (ver 1.3) — não arrasta a transação inteira.';

create index idx_transacoes_fazenda_id on public.transacoes(fazenda_id);
create index idx_transacoes_especie_id on public.transacoes(especie_id);
create index idx_transacoes_gta_id on public.transacoes(gta_id) where gta_id is not null;
create index idx_transacoes_data_operacao on public.transacoes(fazenda_id, data_operacao desc);

create trigger set_updated_at
  before update on public.transacoes
  for each row
  execute function public.trigger_set_updated_at();

-- Reaproveita a guarda de imutabilidade genérica da Fase 2 (id/fazenda_id/
-- created_at) — mesmo raciocínio de defesa em profundidade: a policy de
-- UPDATE (seção 4) já escopa por fazenda vinculada, mas não há caso de uso
-- legítimo para "mover" uma transação de fazenda por UPDATE.
create trigger prevent_identity_change
  before update on public.transacoes
  for each row
  execute function public.prevent_fazenda_id_change();


-- ----------------------------------------------------------------------------
-- 1.2 public.gtas — criada DEPOIS de transacoes, já com a FK completa para
--     `transacoes` (que já existe neste ponto). `numero_gta` é único POR
--     FAZENDA (unique(fazenda_id, numero_gta)), não globalmente — dois
--     produtores podem coincidentemente ter o mesmo número de GTA de
--     fazendas diferentes.
-- ----------------------------------------------------------------------------
create table public.gtas (
  id                 uuid primary key default gen_random_uuid(),
  fazenda_id         uuid not null references public.fazendas(id) on delete cascade,
  numero_gta         text not null,
  municipio_origem   text not null,
  origem             text not null,
  municipio_destino  text not null,
  destino            text not null,
  especie_id         uuid not null references public.especies(id) on delete restrict,
  status_liberacao   text not null default 'pendente'
                     constraint gtas_status_liberacao_check
                     check (status_liberacao in ('pendente', 'liberada')),
  data_liberacao     date,
  transacao_id       uuid references public.transacoes(id) on delete set null,
  arquivo_path       text, -- bucket de Storage fora do escopo desta migration (item 14)
  arquivo_mime_type  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (fazenda_id, numero_gta),
  constraint gtas_data_liberacao_consistente
    check (status_liberacao <> 'liberada' or data_liberacao is not null),
  constraint gtas_data_liberacao_nao_futura
    check (data_liberacao is null or data_liberacao <= current_date)
);

comment on table public.gtas is
  'Guia de Trânsito Animal (Eixo 2, spec seção 3.2). numero_gta único POR '
  'FAZENDA (unique(fazenda_id, numero_gta)), não globalmente. transacao_id '
  'é o lado da FK completa da referência circular com transacoes.gta_id '
  '(ver cabeçalho desta migration, decisão 1) — GTA pode existir avulsa/'
  'informativa, sem transação vinculada. arquivo_path/arquivo_mime_type '
  'ficam nulos nesta migration — bucket gtas-documentos é item 14, fora de '
  'escopo aqui. ZERO acesso para papel=financeiro em toda RLS desta tabela '
  '(nem SELECT) — spec seção 5.4, GTAs está na lista explícita de "sem '
  'acesso", ver decisão 5 do cabeçalho.';

comment on column public.gtas.numero_gta is
  'Identificador oficial exibido ao usuário (ex.: "AE-699057"), distinto '
  'do id interno. Único por fazenda_id, não globalmente.';

comment on constraint gtas_data_liberacao_consistente on public.gtas is
  'status_liberacao=liberada exige data_liberacao preenchida (spec: '
  '"preenchido quando status = liberada"). O inverso não é forçado — '
  'pendente com data_liberacao preenchida não é impedido, para não travar '
  'um fluxo futuro de pré-preenchimento antes da confirmação final.';

create index idx_gtas_fazenda_id on public.gtas(fazenda_id);
create index idx_gtas_especie_id on public.gtas(especie_id);
create index idx_gtas_transacao_id on public.gtas(transacao_id) where transacao_id is not null;

create trigger set_updated_at
  before update on public.gtas
  for each row
  execute function public.trigger_set_updated_at();

create trigger prevent_identity_change
  before update on public.gtas
  for each row
  execute function public.prevent_fazenda_id_change();


-- ----------------------------------------------------------------------------
-- 1.3 Fecha a referência circular: FK de transacoes.gta_id -> gtas(id),
--     agora que gtas existe (ver decisão 1 do cabeçalho).
-- ----------------------------------------------------------------------------
alter table public.transacoes
  add constraint transacoes_gta_id_fkey
  foreign key (gta_id) references public.gtas(id) on delete set null;


-- ----------------------------------------------------------------------------
-- 1.4 public.transacoes_detalhe — quebra estruturada de sexo/faixa etária
--     por transação (spec seção 3.2), permite que o saldo de rebanho (item
--     futuro desta fase) seja derivado automaticamente. `agrupamento_etario_id`
--     usa `on delete restrict` (decisão 3 do cabeçalho).
-- ----------------------------------------------------------------------------
create table public.transacoes_detalhe (
  id                    uuid primary key default gen_random_uuid(),
  transacao_id          uuid not null references public.transacoes(id) on delete cascade,
  agrupamento_etario_id uuid not null references public.agrupamentos_etarios(id) on delete restrict,
  sexo                  text not null
                        constraint transacoes_detalhe_sexo_check
                        check (sexo in ('macho', 'femea')),
  quantidade            integer not null
                        constraint transacoes_detalhe_quantidade_positiva
                        check (quantidade > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.transacoes_detalhe is
  'Quebra estruturada de sexo/faixa etária de uma transação (spec seção '
  '3.2) — permite saldo de rebanho calculado automaticamente em vez de '
  'digitado à parte. on delete cascade em transacao_id (linha de detalhe '
  'não tem sentido sem a transação pai). agrupamento_etario_id usa '
  'on delete restrict (decisão 3 do cabeçalho desta migration) — nunca '
  'apagar detalhe de transação real por efeito colateral de limpeza de '
  'catálogo. RLS: SELECT para qualquer papel vinculado (incluindo '
  'financeiro); INSERT/UPDATE só admin/membro; sem DELETE (decisão 6 do '
  'cabeçalho) — mesma lógica de transacoes, fazenda derivada via '
  'transacao_id (tabela não tem fazenda_id própria).';

create index idx_transacoes_detalhe_transacao_id on public.transacoes_detalhe(transacao_id);
create index idx_transacoes_detalhe_agrupamento_etario_id on public.transacoes_detalhe(agrupamento_etario_id);

create trigger set_updated_at
  before update on public.transacoes_detalhe
  for each row
  execute function public.trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1.5 public.transacoes_animais — vínculo N:N transação<->animal individual
--     (Opção B, spec seção 3.3), schema e mecanismo definidos INTEGRALMENTE
--     por ADR-0004 (D1-D6) — implementado aqui sem desvio.
--
--     `tipo_operacao_transacao` (D1): cópia IMUTÁVEL do tipo_operacao da
--     transação vinculada, capturada no INSERT pelo trigger BEFORE INSERT
--     (seção 3.1) — nunca editável depois, nunca reconsultada em transacoes
--     no momento de um DELETE (ver justificativa completa no ADR-0004, D1).
--
--     unique(transacao_id, animal_id): decisão desta migration, NÃO parte
--     do ADR-0004 (que não trata de deduplicação) — vincular o mesmo animal
--     duas vezes à mesma transação não tem significado de negócio distinto
--     de vinculá-lo uma vez; a constraint só fecha uma lacuna óbvia de
--     integridade que o ADR não precisou decidir por ser consequência
--     direta do desenho N:N já dado pela spec.
--
--     Sem updated_at e sem policy de UPDATE (ADR-0004 D3: "um vínculo é
--     criado ou removido, nunca editado em lugar").
-- ----------------------------------------------------------------------------
create table public.transacoes_animais (
  id                       uuid primary key default gen_random_uuid(),
  transacao_id             uuid not null references public.transacoes(id) on delete cascade,
  animal_id                uuid not null references public.animais(id) on delete cascade,
  tipo_operacao_transacao  text not null
                           constraint transacoes_animais_tipo_operacao_check
                           check (tipo_operacao_transacao in ('compra', 'venda', 'entrada_pastoreio', 'saida_pastoreio')),
  created_at               timestamptz not null default now(),
  unique (transacao_id, animal_id)
);

comment on table public.transacoes_animais is
  'Vínculo N:N entre transacoes e animais (Opção B, spec seção 3.3) — '
  'schema e mecanismo definidos INTEGRALMENTE por ADR-0004 (D1-D6), '
  'implementado sem desvio nesta migration. Ao vincular uma venda, '
  'aplicar_status_animal_apos_vinculo() (seção 3.2) atualiza '
  'automaticamente animais.status para venda; reverter_status_animal_apos_'
  'desvinculo() (seção 3.3) reverte para ativo no DELETE, com as guardas '
  'de D5 (idempotência + coexistência de múltiplos vínculos de venda). '
  'ZERO acesso para papel=financeiro em toda RLS desta tabela (nem '
  'SELECT) — ADR-0004 D3, dois motivos independentes (financeiro não pode '
  'operar transacoes; animal_id é dado de manejo individual do Eixo 1, '
  'vedado a financeiro mesmo quando SELECT de transacoes é liberado).';

comment on column public.transacoes_animais.tipo_operacao_transacao is
  'Cópia IMUTÁVEL de transacoes.tipo_operacao, capturada no momento do '
  'INSERT por preparar_vinculo_transacao_animal() (seção 3.1) — nunca '
  'reconsultada depois, mesmo se o DELETE desta linha for consequência de '
  'um ON DELETE CASCADE disparado pela exclusão da transação pai (ver '
  'ADR-0004, D1, para a justificativa completa de ordenação).';

create index idx_transacoes_animais_transacao_id on public.transacoes_animais(transacao_id);
create index idx_transacoes_animais_animal_id on public.transacoes_animais(animal_id);


-- ============================================================================
-- 2. TRIGGERS DE INTEGRIDADE CRUZADA gtas <-> transacoes
--
-- Decisão 2 do cabeçalho desta migration: a FK sozinha não impede um usuário
-- com vínculo em mais de uma fazenda de linkar uma GTA da fazenda A a uma
-- transação da fazenda B (mesma classe de risco que validar_lote_mesma_
-- fazenda, Fase 2, e D4 do ADR-0004 fecham para lote_id/animal_id).
-- SECURITY INVOKER (padrão, sem elevação) em ambas — os SELECTs abaixo já
-- respeitam a RLS do próprio chamador (RLS de gtas exclui financeiro por
-- completo; RLS de transacoes permite SELECT a financeiro mas isso não
-- enfraquece a checagem, que só valida coincidência de fazenda_id, não
-- concede nenhum acesso extra). Mensagem de erro genérica, mesmo padrão de
-- não-oráculo já usado em validar_lote_mesma_fazenda()/registrar_pesagem().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 validar_gta_transacao_mesma_fazenda() — gtas.transacao_id, quando
--     preenchido, precisa apontar para uma transação da MESMA fazenda_id.
-- ----------------------------------------------------------------------------
create or replace function public.validar_gta_transacao_mesma_fazenda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fazenda_transacao uuid;
begin
  if new.transacao_id is null then
    return new;
  end if;

  select fazenda_id
    into v_fazenda_transacao
    from public.transacoes
   where id = new.transacao_id;

  if not found or v_fazenda_transacao is distinct from new.fazenda_id then
    raise exception 'transacao_id inválido ou não pertence à mesma fazenda da GTA';
  end if;

  return new;
end;
$$;

comment on function public.validar_gta_transacao_mesma_fazenda() is
  'Impede que uma GTA seja vinculada a uma transação de OUTRA fazenda — '
  'ver cabeçalho desta migration, decisão 2. CHECK constraint não serve '
  'aqui porque não pode consultar outra tabela.';

create trigger validar_gta_transacao_mesma_fazenda
  before insert or update of transacao_id, fazenda_id on public.gtas
  for each row
  execute function public.validar_gta_transacao_mesma_fazenda();


-- ----------------------------------------------------------------------------
-- 2.2 validar_transacao_gta_mesma_fazenda() — transacoes.gta_id, quando
--     preenchido, precisa apontar para uma GTA da MESMA fazenda_id.
-- ----------------------------------------------------------------------------
create or replace function public.validar_transacao_gta_mesma_fazenda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fazenda_gta uuid;
begin
  if new.gta_id is null then
    return new;
  end if;

  select fazenda_id
    into v_fazenda_gta
    from public.gtas
   where id = new.gta_id;

  if not found or v_fazenda_gta is distinct from new.fazenda_id then
    raise exception 'gta_id inválido ou não pertence à mesma fazenda da transação';
  end if;

  return new;
end;
$$;

comment on function public.validar_transacao_gta_mesma_fazenda() is
  'Impede que uma transação seja vinculada a uma GTA de OUTRA fazenda — '
  'ver cabeçalho desta migration, decisão 2.';

create trigger validar_transacao_gta_mesma_fazenda
  before insert or update of gta_id, fazenda_id on public.transacoes
  for each row
  execute function public.validar_transacao_gta_mesma_fazenda();


-- ============================================================================
-- 3. TRIGGERS DE transacoes_animais — implementação literal de ADR-0004
--    D2/D4/D5. Nenhuma decisão do ADR é reaberta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 preparar_vinculo_transacao_animal() — BEFORE INSERT.
--     ADR-0004 D2 (mecanismo) + D4 (integridade cross-fazenda): valida que
--     transacao_id e animal_id pertencem à mesma fazenda_id e popula
--     NEW.tipo_operacao_transacao a partir de transacoes.tipo_operacao.
--     SECURITY INVOKER: os SELECTs abaixo já respeitam a RLS do próprio
--     chamador (RLS de transacoes e de animais, ambas excluem financeiro
--     nos casos relevantes) — dupla proteção sem privilégio elevado, mesmo
--     raciocínio de validar_lote_mesma_fazenda() (Fase 2).
-- ----------------------------------------------------------------------------
create or replace function public.preparar_vinculo_transacao_animal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fazenda_transacao uuid;
  v_fazenda_animal    uuid;
  v_tipo_operacao     text;
begin
  select fazenda_id, tipo_operacao
    into v_fazenda_transacao, v_tipo_operacao
    from public.transacoes
   where id = new.transacao_id;

  if not found then
    raise exception 'transação ou animal inválido, ou não pertencem à mesma fazenda';
  end if;

  select fazenda_id
    into v_fazenda_animal
    from public.animais
   where id = new.animal_id;

  if not found or v_fazenda_animal is distinct from v_fazenda_transacao then
    raise exception 'transação ou animal inválido, ou não pertencem à mesma fazenda';
  end if;

  new.tipo_operacao_transacao := v_tipo_operacao;

  return new;
end;
$$;

comment on function public.preparar_vinculo_transacao_animal() is
  'ADR-0004 D2/D4. BEFORE INSERT em transacoes_animais: valida integridade '
  'cross-fazenda entre transacao_id e animal_id, e denormaliza '
  'tipo_operacao_transacao a partir de transacoes.tipo_operacao no '
  'momento da criação do vínculo. Mensagem de erro genérica (não revela '
  'qual dos dois IDs é inválido nem se pertence a outra fazenda).';

create trigger preparar_vinculo
  before insert on public.transacoes_animais
  for each row
  execute function public.preparar_vinculo_transacao_animal();


-- ----------------------------------------------------------------------------
-- 3.2 aplicar_status_animal_apos_vinculo() — AFTER INSERT.
--     ADR-0004 D2: se tipo_operacao_transacao = 'venda', atualiza
--     animais.status para 'venda'. Para os demais tipos, o vínculo é
--     gravado sem efeito colateral (ADR-0004 D2, justificativa completa).
--     SECURITY INVOKER: quem chega até aqui já passou pela policy de
--     INSERT de transacoes_animais (admin/membro), que por si só já tem
--     permissão de UPDATE direto em animais.status (animais_update_
--     vinculada, Fase 2) — não há RLS a contornar, sem motivo para elevar
--     privilégio (ADR-0004 D2).
-- ----------------------------------------------------------------------------
create or replace function public.aplicar_status_animal_apos_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo_operacao_transacao = 'venda' then
    update public.animais
       set status = 'venda'
     where id = new.animal_id;
  end if;

  return new;
end;
$$;

comment on function public.aplicar_status_animal_apos_vinculo() is
  'ADR-0004 D2. AFTER INSERT em transacoes_animais: aplica '
  'animais.status = venda quando tipo_operacao_transacao = venda. Sem '
  'trava de revenda (ADR-0004 D6, deliberado — sinalização é '
  'responsabilidade da UI, não do banco).';

create trigger aplicar_status_apos_vinculo
  after insert on public.transacoes_animais
  for each row
  execute function public.aplicar_status_animal_apos_vinculo();


-- ----------------------------------------------------------------------------
-- 3.3 reverter_status_animal_apos_desvinculo() — AFTER DELETE.
--     ADR-0004 D5: reverte animais.status para 'ativo' apenas se (a) o
--     vínculo removido era de venda, (b) o status atual do animal AINDA é
--     'venda' (guarda de idempotência/não-regressão — não sobrescreve um
--     morte/baixa legítimo e mais recente), e (c) não existe outra linha
--     remanescente de venda para o mesmo animal (guarda de coexistência —
--     ADR-0004 D6, um animal pode estar legitimamente vinculado a mais de
--     uma venda).
-- ----------------------------------------------------------------------------
create or replace function public.reverter_status_animal_apos_desvinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status_atual         text;
  v_outro_vinculo_venda  boolean;
begin
  if old.tipo_operacao_transacao <> 'venda' then
    return old;
  end if;

  -- `for update`: serializa duas execuções concorrentes deste trigger para o
  -- MESMO animal_id (ex.: DELETE simultâneo de dois vínculos de venda
  -- distintos do mesmo animal). Sem o lock, ambas as transações leem, sob
  -- READ COMMITTED, um snapshot em que a linha da outra ainda não foi
  -- commitada — a checagem de coexistência abaixo (v_outro_vinculo_venda)
  -- enxergaria a outra linha como "ainda existente" em AMBAS as sessões
  -- simultaneamente, e as DUAS decidiriam não reverter, deixando
  -- animais.status preso em 'venda' para sempre mesmo depois que os dois
  -- vínculos de venda tiverem sido removidos (achado do cyber_chief, gate
  -- da Fase 3 — .agents/memory/log/2026-07-20-cyber_chief-review-fase3-
  -- transacoes.md). Com o lock, a segunda transação a obter o lock só
  -- prossegue depois do commit da primeira, e sua checagem de EXISTS
  -- seguinte (nova instrução, novo snapshot) reflete o estado real —
  -- mesmo padrão já usado em registrar_pesagem() (Fase 2) e no `perform
  -- ... for update` de promover_papel() (ADR-0002) para fechar TOCTOU
  -- equivalente.
  select status
    into v_status_atual
    from public.animais
   where id = old.animal_id
     for update;

  if not found or v_status_atual <> 'venda' then
    return old;
  end if;

  select exists (
    select 1
      from public.transacoes_animais
     where animal_id = old.animal_id
       and tipo_operacao_transacao = 'venda'
  ) into v_outro_vinculo_venda;

  if v_outro_vinculo_venda then
    return old;
  end if;

  update public.animais
     set status = 'ativo'
   where id = old.animal_id;

  return old;
end;
$$;

comment on function public.reverter_status_animal_apos_desvinculo() is
  'ADR-0004 D5. AFTER DELETE em transacoes_animais: reverte animais.status '
  'para ativo com guardas de idempotência (só se status ainda for venda) e '
  'coexistência (só se não houver outra linha de venda remanescente para '
  'o mesmo animal). Nunca reconsulta transacoes — usa OLD.'
  'tipo_operacao_transacao, a cópia denormalizada de D1, correta mesmo '
  'quando o DELETE é consequência de ON DELETE CASCADE da transação pai. '
  'SELECT ... FOR UPDATE na linha de animais (correção do cyber_chief, gate '
  'da Fase 3): serializa duas execuções concorrentes deste trigger para o '
  'mesmo animal_id, fechando um TOCTOU em que dois DELETEs simultâneos de '
  'vínculos de venda distintos do mesmo animal fariam ambos enxergar a '
  'linha do outro como "ainda existente" e ambos deixarem de reverter — '
  'ver .agents/memory/log/2026-07-20-cyber_chief-review-fase3-transacoes.md.';

create trigger reverter_status_apos_desvinculo
  after delete on public.transacoes_animais
  for each row
  execute function public.reverter_status_animal_apos_desvinculo();


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

alter table public.transacoes enable row level security;
alter table public.gtas enable row level security;
alter table public.transacoes_detalhe enable row level security;
alter table public.transacoes_animais enable row level security;

-- ----------------------------------------------------------------------------
-- 4.1 gtas — ZERO acesso para papel=financeiro (nem SELECT). Demais papéis
--     (admin/membro) têm SELECT/INSERT/UPDATE escopados à fazenda vinculada.
--     Sem policy de DELETE (spec/tarefa: exclusão física de GTA não prevista
--     nesta fase).
-- ----------------------------------------------------------------------------
create policy gtas_select_vinculada
  on public.gtas
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy gtas_insert_vinculada
  on public.gtas
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy gtas_update_vinculada
  on public.gtas
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
-- 4.2 transacoes — SELECT para QUALQUER papel vinculado, INCLUINDO
--     financeiro (alimenta Painel Financeiro / Saldo de Animais, spec 5.4).
--     INSERT/UPDATE só admin/membro ("edição de transações" negada a
--     financeiro pela spec 5.4). Sem policy de DELETE (decisão 6 do
--     cabeçalho desta migration).
-- ----------------------------------------------------------------------------
create policy transacoes_select_vinculada
  on public.transacoes
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy transacoes_insert_vinculada
  on public.transacoes
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy transacoes_update_vinculada
  on public.transacoes
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
-- 4.3 transacoes_detalhe — mesma lógica de transacoes (SELECT para todos os
--     papéis vinculados incluindo financeiro; INSERT/UPDATE só admin/
--     membro), mas a fazenda vem indiretamente via transacao_id ->
--     transacoes.fazenda_id (join explícito, mesmo padrão de
--     pesagens_select_vinculada na Fase 2 — não delega para a RLS de
--     transacoes por trás de um SELECT implícito, repete a condição de
--     fazenda explicitamente na própria policy).
-- ----------------------------------------------------------------------------
create policy transacoes_detalhe_select_vinculada
  on public.transacoes_detalhe
  for select
  to authenticated
  using (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid()
       )
    )
  );

create policy transacoes_detalhe_insert_vinculada
  on public.transacoes_detalhe
  for insert
  to authenticated
  with check (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );

create policy transacoes_detalhe_update_vinculada
  on public.transacoes_detalhe
  for update
  to authenticated
  using (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  )
  with check (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );


-- ----------------------------------------------------------------------------
-- 4.4 transacoes_animais — ADR-0004 D3, implementado sem desvio: ZERO
--     acesso para papel=financeiro (nem SELECT/INSERT/DELETE). Demais
--     papéis (admin/membro) têm SELECT/INSERT/DELETE escopados via
--     transacao_id -> transacoes.fazenda_id. SEM policy de UPDATE (ADR-0004
--     D3 — correção é DELETE + novo INSERT).
-- ----------------------------------------------------------------------------
create policy transacoes_animais_select_vinculada
  on public.transacoes_animais
  for select
  to authenticated
  using (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );

create policy transacoes_animais_insert_vinculada
  on public.transacoes_animais
  for insert
  to authenticated
  with check (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );

create policy transacoes_animais_delete_vinculada
  on public.transacoes_animais
  for delete
  to authenticated
  using (
    transacao_id in (
      select t.id
        from public.transacoes t
       where t.fazenda_id in (
         select fazenda_id from public.usuarios_fazendas
          where usuario_id = auth.uid() and papel <> 'financeiro'
       )
    )
  );
