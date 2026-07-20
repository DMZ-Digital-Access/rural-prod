-- ============================================================================
-- Migration: Fase 3 — Eixo 2, item 13: lancamentos_financeiros,
--            declaracoes_rebanho, prazos_declaracao_estado
-- Tabelas: lancamentos_financeiros, declaracoes_rebanho, prazos_declaracao_estado
-- Funções: definir_prazo_declaracao_estado() (SECURITY DEFINER, único caminho
--          de escrita em prazos_declaracao_estado), obter_prazo_declaracao_estado()
--          (SQL, STABLE, leitura com fallback — spec seção 4.2).
--
-- Escopo desta migration: SOMENTE o item 13 da seção 10 da spec. A view de
-- saldo de rebanho (item 12, bloqueada por falta dos prints de referência) e
-- os buckets de Storage `declaracoes-rebanho`/`gtas-documentos` (item 14) são
-- itens seguintes da mesma fase — fora de escopo, propositalmente não
-- implementados aqui (arquivo_pdf_path fica como coluna nula, mesmo padrão já
-- usado para gtas.arquivo_path na migration anterior).
--
-- Aditiva sobre as 5 migrations anteriores — reaproveita trigger_set_updated_at()
-- e prevent_fazenda_id_change() já existentes, não recria nada. Segue os
-- mesmos padrões já revisados pelo cyber_chief: search_path = '' em toda
-- função, referências sempre schema-qualificadas, comentários SQL extensos,
-- mensagens de erro genéricas, CHECK sobre `text` em vez de enum de banco.
--
-- DECISÕES DE DESIGN DESTA MIGRATION (resumo — detalhe em cada seção):
--
-- 1. `lancamentos_financeiros.categoria` = TEXT LIVRE, sem CHECK e sem tabela
--    de categorias configurável nova. A spec (seção 3.2) deixa em aberto se
--    vira "enum fixo ou tabela configurável", e a seção 5.3 antecipa uma tela
--    de "Categorias de lançamento financeiro (customização... se o time optar
--    por não deixar fixo em enum)". Decisão: texto livre, SEM CHECK
--    restringindo aos 7 exemplos que a spec lista (insumo/medicamento/
--    combustivel/mao_de_obra/manutencao/imposto/outros) — um CHECK travando
--    nesses valores contradiria a própria premissa de "não fixo", e uma
--    tabela `categorias_financeiras` nova (com FK) é a opção mais robusta,
--    mas também a mais cara agora: exigiria RLS própria, uma tela de CRUD
--    dedicada (que a spec só lista como item futuro de Configurações, não
--    desta fase) e uma migração de dado no dia em que o cliente pedir
--    categorias diferentes das 7 sugeridas — sem nenhum ganho de integridade
--    real, porque "categoria de lançamento financeiro" não é um dado que
--    outra tabela referencia (diferente de `especies`, que é FK de verdade em
--    `gtas`/`transacoes`/`declaracoes_rebanho`). Se o cliente pedir de fato
--    uma tela de customização de categorias (spec 5.3), isso é uma migração
--    aditiva simples no futuro (criar a tabela, popular com os valores livres
--    já usados, trocar a coluna por FK) — não uma decisão que precise ser
--    resolvida "certa" hoje. Trade-off documentado, não uma omissão.
--
-- 2. `prazos_declaracao_estado` — AMBIGUIDADE REAL DA SPEC, RESOLVIDA AQUI COM
--    A OPÇÃO (a) DA TAREFA, adaptada: tabela permanece GLOBAL (sem
--    `fazenda_id`, exatamente como a spec seção 3.2 lista as colunas — é
--    dado regulatório por estado, não por fazenda; duas fazendas no mesmo
--    estado devem enxergar o MESMO prazo, nunca dois prazos divergentes para
--    a mesma UF/ano). O risco real que a tarefa aponta é outro: se a ESCRITA
--    fosse uma policy de RLS solta (ex.: "qualquer admin de qualquer fazenda
--    pode fazer UPDATE"), o admin da fazenda X no Paraná poderia alterar o
--    prazo do Rio Grande do Sul, afetando o alerta de TODAS as fazendas
--    gaúchas do sistema — não é um problema de isolamento de tenant (RLS
--    convencional não resolve isso, porque a linha não pertence a tenant
--    nenhum), é um problema de "dado compartilhado com escrita larga demais".
--
--    Solução adotada: ZERO policy de INSERT/UPDATE/DELETE para
--    `authenticated`/`anon` na tabela (mesmo default-deny já usado em
--    `usuarios`/`fazendas`/`usuarios_fazendas`/`convites`, ADR-0001/ADR-0002)
--    — toda escrita passa OBRIGATORIAMENTE pela função `SECURITY DEFINER`
--    `definir_prazo_declaracao_estado()` (seção 3), que:
--      (i)   exige que o chamador tenha pelo menos um vínculo
--            `papel <> 'financeiro'` em QUALQUER fazenda (barra quem não tem
--            nenhum papel operacional no sistema — `financeiro` é
--            explicitamente vetado de Configurações pela spec 5.4);
--      (ii)  valida formato de UF (2 letras) e consistência das datas
--            (fim > início) ANTES de gravar — RLS declarativa não valida
--            forma de dado, só quem pode escrever;
--      (iii) grava `atualizado_por_usuario_id` (coluna nova, não prevista
--            literalmente na spec, adicionada aqui) a cada escrita — trilha
--            de auditoria: se um admin de outro estado alterar um prazo por
--            engano/má-fé, fica registrado QUEM e QUANDO, mesmo que o
--            sistema hoje não consiga impedir estruturalmente a ação (ver
--            limite abaixo).
--
--    LIMITE HONESTO desta solução (documentado para o gate do cyber_chief,
--    não escondido): a validação (i) NÃO confirma que o usuário tem uma
--    fazenda DE FATO no estado que está editando — porque `fazendas` (Fase 1,
--    schema já aplicado, fora do escopo desta migration) NÃO TEM coluna de
--    UF/estado hoje. Fechar esse buraco por completo exigiria uma migração
--    futura adicionando `fazendas.estado` e trocando a checagem (i) por
--    "existe fazenda vinculada ao usuário com `estado` igual ao `p_estado`
--    do prazo" — sinalizado explicitamente como pendência para `architect`/
--    `db_sage` decidirem numa fase futura (ver log desta tarefa e
--    PROJECT_CONTEXT.md seção 4). A mitigação real entregue aqui é: (1) a
--    superfície de ataque cai de "qualquer request autenticado" para "só
--    quem tem vínculo operacional em pelo menos uma fazenda" (2) toda escrita
--    é atribuível a um usuário específico (auditoria), o que a RLS declarativa
--    sozinha não dava; (3) o ponto de checagem é um ÚNICO lugar (a função),
--    então quando a coluna `fazendas.estado` existir, a correção é uma
--    alteração cirúrgica nesta função, não uma reescrita de política espalhada.
--    Rejeitei alternativa (b) "fazenda_id em prazos_declaracao_estado, uma
--    linha por fazenda" porque contradiz a própria natureza do dado — o prazo
--    é publicado pelo órgão estadual, é o MESMO para toda fazenda na mesma UF/
--    ano; duplicar por fazenda criaria divergência garantida no primeiro
--    UPDATE feito por uma fazenda só, e um JOINariam SELECT mais caro sem
--    ganho nenhum de integridade (o problema não é "de quem é a linha", é
--    "quem pode escrever nela").
--
--    ADENDO — cyber_chief (Constantine), gate de segurança de 2026-07-20:
--    decisão do gate foi BLOQUEAR a migration original nesse ponto específico
--    e aplicar uma correção estrutural agora, em vez de aceitar o limite só
--    documentado (razão completa: self-signup dá `papel='admin'` automático
--    em fazenda própria a QUALQUER usuário novo, ADR-0001 — então "vínculo
--    operacional em alguma fazenda" não é uma barreira real, é
--    essencialmente todo usuário cadastrado no sistema; e a superfície de
--    ataque é a API/RPC, alcançável mesmo sem nenhuma tela de UI ligada à
--    função ainda). Correção: seção 1.0 abaixo adiciona `fazendas.estado`
--    (nullable, sem backfill) e a autorização de
--    `definir_prazo_declaracao_estado()` (seção 3.1) passa a exigir, quando a
--    fazenda vinculada ao chamador TEM `estado` preenchido, que ele coincida
--    com o estado do prazo sendo editado; fazendas sem `estado` (100% do
--    parque existente hoje, já que a coluna nasce vazia) continuam sob a
--    regra antiga como fallback, para não regredir a funcionalidade atual
--    nem exigir um fluxo de produto novo nesta migration. Efeito honesto:
--    isso NÃO reduz o risco para nenhuma fazenda existente hoje (todas caem
--    no fallback permissivo), mas fecha a validação por completo, sem
--    nenhuma outra alteração de código, assim que o produto passar a
--    coletar `estado` (fluxo "complete seu cadastro", fora do escopo deste
--    gate). Ver
--    `.agents/memory/log/2026-07-20-cyber_chief-review-fase3-financeiro.md`
--    para a análise de risco completa.
--
-- 3. FALLBACK DO PADRÃO RS (spec seção 4.2) SEM SEED ANUAL — em vez de inserir
--    uma linha por ano (o que exigiria uma migração nova todo ano só para
--    2027, 2028...), a tabela nasce VAZIA (nenhum INSERT de seed nesta
--    migration) e a função `obter_prazo_declaracao_estado()` (seção 3.2)
--    resolve o fallback em tempo de leitura: se existir linha cadastrada para
--    (estado, ano), retorna ela; senão, se estado = 'RS', calcula
--    01/abril–30/junho do ano pedido via `make_date()` (nunca hardcoded como
--    string de data fixa); para qualquer outro estado sem linha cadastrada,
--    retorna NULL/`origem = null` — a spec só validou o padrão para o RS, não
--    há padrão a assumir para os demais estados até o cliente cadastrar um.
--    Consumida pelo Painel Inteligente (item 21, fase futura) e pela tela de
--    Configurações (item 20) — nenhuma das duas implementadas aqui.
--
-- 4. `especie_id` em `declaracoes_rebanho` usa `on delete restrict`, mesmo
--    raciocínio já aplicado a `gtas`/`transacoes`/`transacoes_detalhe` na
--    migration anterior (catálogo→dado transacional/regulatório real, nunca
--    cascade).
--
-- 5. FRONTEIRA DE `financeiro` (spec seção 5.4: "Acesso restrito a: Painel
--    Financeiro, Declarações de Rebanho, Saldo de Animais", perfil de
--    consulta): `lancamentos_financeiros` e `declaracoes_rebanho` têm SELECT
--    liberado para `financeiro`, ZERO INSERT/UPDATE/DELETE — mesmo padrão já
--    usado em `transacoes`/`transacoes_detalhe` na migration anterior.
--    `prazos_declaracao_estado` tem SELECT aberto a QUALQUER `authenticated`
--    (incluindo `financeiro`, sem filtro de papel) — não por ser "catálogo
--    inofensivo" como `especies`, mas porque a tela de Declarações de Rebanho
--    (spec seção 5.2, módulo ao qual `financeiro` TEM acesso) precisa exibir
--    "o prazo regulatório vigente (estado/ano) e status em relação a ele" —
--    negar SELECT deste dado a `financeiro` quebraria a própria tela que a
--    spec 5.4 autoriza esse papel a usar.
--
-- 6. SEM policy de DELETE em `lancamentos_financeiros` (decisão própria desta
--    migration — a spec não fala explicitamente de exclusão aqui) nem em
--    `declaracoes_rebanho` (decisão JÁ DADA pela spec, item 9 da seção 9:
--    "declarações anuais nunca devem ser apagáveis pelo usuário — são
--    documento oficial — no máximo substituíveis com histórico de versão, a
--    definir"). Para `lancamentos_financeiros`, a justificativa é a mesma já
--    usada para `transacoes` na migration anterior (consistência) mais uma
--    própria desta tabela: o Módulo Financeiro exporta lançamentos para
--    contabilidade externa por período (spec seção 5.2) — permitir DELETE
--    client-side arriscaria invalidar silenciosamente um período já exportado
--    e conciliado por um contador. Correção é via UPDATE.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- Referência: especificacao-sistema.md, seção 3.2 (schema de
--             lancamentos_financeiros/declaracoes_rebanho/
--             prazos_declaracao_estado), 4.2 (regra de fallback RS), 5.3
--             (Configurações — prazos editáveis) e 5.4 (fronteira de acesso
--             do papel financeiro); item 13 da seção 10 (plano de
--             implementação); migrations anteriores (padrões de trigger de
--             integridade, RLS, comentários, função SECURITY DEFINER com
--             grant explícito).
-- ============================================================================


-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.0 CORREÇÃO DE SEGURANÇA — cyber_chief (Constantine), gate de 2026-07-20
--     (ver adendo à decisão 2 do cabeçalho): adiciona `public.fazendas.estado`
--     (UF), NULLABLE, sem backfill de fazendas existentes. Consumida pela
--     autorização de `definir_prazo_declaracao_estado()` (seção 3.1): quando
--     a fazenda vinculada ao chamador tem `estado` preenchido, precisa
--     coincidir com o estado do prazo sendo editado; quando não preenchido
--     (hoje, todas as fazendas), a autorização cai no fallback antigo
--     (qualquer vínculo `papel <> financeiro`), para não regredir a
--     funcionalidade atual nem exigir fluxo de produto novo nesta migration.
--     Editável pelo próprio admin/membro da fazenda — não é bloqueada por
--     `prevent_fazendas_identity_change()` (migration
--     20260716171522_fase1_usuarios_fazendas.sql, guarda só cobre
--     id/usuario_id/created_at), mesma classe de campo que `nome` hoje.
-- ----------------------------------------------------------------------------
alter table public.fazendas
  add column estado text
  constraint fazendas_estado_uf_check
  check (estado is null or estado ~ '^[A-Z]{2}$');

comment on column public.fazendas.estado is
  'UF (sigla de 2 letras maiúsculas) onde a fazenda está localizada. Coluna '
  'nova (2026-07-20, achado do cyber_chief no gate de '
  'prazos_declaracao_estado desta migration) — NULLABLE, nasce vazia para '
  'TODAS as fazendas existentes; coletar esse dado de usuários já '
  'cadastrados é um fluxo de produto ("complete seu cadastro") fora do '
  'escopo desta migration. Editável pelo próprio admin/membro (mesma policy '
  'fazendas_update_vinculada de `nome`). Consumida por '
  'definir_prazo_declaracao_estado() (seção 3.1) para restringir a edição '
  'do prazo de um estado às fazendas de fato localizadas nele, quando '
  'preenchida (fallback permissivo enquanto NULL).';


-- ----------------------------------------------------------------------------
-- 1.1 public.lancamentos_financeiros — insumos/despesas/receitas gerais, além
--     das compras/vendas de animais já cobertas por `transacoes` (spec seção
--     3.2). `categoria` é texto livre (decisão 1 do cabeçalho).
--     `transacao_animal_id` referencia `transacoes` (não `transacoes_animais`
--     — nome do campo na spec é `transacao_animal_id`, mas o FK de destino é
--     explicitamente `transacoes`, para permitir marcar "este lançamento já
--     está coberto por uma transação de compra/venda", evitando duplicidade
--     na visão consolidada de fluxo de caixa).
-- ----------------------------------------------------------------------------
create table public.lancamentos_financeiros (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references public.fazendas(id) on delete cascade,
  tipo                text not null
                      constraint lancamentos_financeiros_tipo_check
                      check (tipo in ('receita', 'despesa')),
  categoria           text not null,
  descricao           text not null,
  data_lancamento     date not null,
  valor               numeric(12,2) not null
                      constraint lancamentos_financeiros_valor_positivo
                      check (valor > 0),
  numero_nota         text,
  contraparte         text,
  transacao_animal_id uuid references public.transacoes(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint lancamentos_financeiros_data_lancamento_nao_futura
    check (data_lancamento <= current_date)
);

comment on table public.lancamentos_financeiros is
  'Receitas/despesas gerais da fazenda (insumos, medicamentos, combustível, '
  'mão de obra, manutenção, impostos etc. — spec seção 3.2), fora das '
  'compras/vendas de animais já cobertas por `transacoes`. `categoria` é '
  'texto livre, sem CHECK/tabela de configuração (decisão 1 do cabeçalho '
  'desta migration). `transacao_animal_id` (nullable) permite vincular a uma '
  'transação de animal já registrada, evitando dupla contagem na visão '
  'consolidada de fluxo de caixa (spec seção 5.2). Sem policy de DELETE '
  '(decisão 6 do cabeçalho) — correção é via UPDATE, para não arriscar '
  'invalidar silenciosamente um período já exportado para contabilidade '
  'externa.';

comment on column public.lancamentos_financeiros.categoria is
  'Texto livre — decisão desta migration (ver decisão 1 do cabeçalho): a '
  'spec (seção 3.2/5.3) deixa em aberto se vira enum fixo ou tabela '
  'configurável; optou-se por texto livre por ser a opção mais simples e '
  'sem custo de migração futura de dado se o cliente pedir customização de '
  'categorias (spec 5.3) — nesse caso, migração futura cria a tabela e '
  'promove esta coluna para FK.';

comment on column public.lancamentos_financeiros.transacao_animal_id is
  'FK para `transacoes` (não `transacoes_animais`) — vínculo opcional a uma '
  'compra/venda de animal já registrada no sistema, evitando duplicidade na '
  'visão consolidada de fluxo de caixa (spec seção 3.2/5.2). on delete set '
  'null: perder a transação vinculada não deve apagar o lançamento '
  'financeiro em si.';

create index idx_lancamentos_financeiros_fazenda_id on public.lancamentos_financeiros(fazenda_id);
create index idx_lancamentos_financeiros_data_lancamento
  on public.lancamentos_financeiros(fazenda_id, data_lancamento desc);
create index idx_lancamentos_financeiros_transacao_animal_id
  on public.lancamentos_financeiros(transacao_animal_id)
  where transacao_animal_id is not null;

create trigger set_updated_at
  before update on public.lancamentos_financeiros
  for each row
  execute function public.trigger_set_updated_at();

create trigger prevent_identity_change
  before update on public.lancamentos_financeiros
  for each row
  execute function public.prevent_fazenda_id_change();


-- ----------------------------------------------------------------------------
-- 1.2 public.declaracoes_rebanho — histórico da Declaração Anual de Rebanho
--     por fazenda/espécie/ano (spec seção 3.2). `especie_id` usa
--     `on delete restrict` (decisão 4 do cabeçalho). `arquivo_pdf_path` fica
--     nulo nesta migration — bucket de Storage é item 14, fora de escopo.
--     unique(fazenda_id, especie_id, ano_referencia): uma declaração por
--     espécie/ano por fazenda — corrigir um valor já declarado é via UPDATE
--     (a própria linha tem `status`/`data_envio` editáveis), não criando uma
--     segunda linha para o mesmo ano.
-- ----------------------------------------------------------------------------
create table public.declaracoes_rebanho (
  id                   uuid primary key default gen_random_uuid(),
  fazenda_id           uuid not null references public.fazendas(id) on delete cascade,
  especie_id           uuid not null references public.especies(id) on delete restrict,
  ano_referencia       integer not null
                       constraint declaracoes_rebanho_ano_referencia_check
                       check (ano_referencia >= 2000),
  data_declaracao      date,
  quantidade_declarada integer not null
                       constraint declaracoes_rebanho_quantidade_nao_negativa
                       check (quantidade_declarada >= 0),
  status               text not null default 'pendente'
                       constraint declaracoes_rebanho_status_check
                       check (status in ('pendente', 'enviado')),
  data_envio           date,
  arquivo_pdf_path     text, -- bucket de Storage fora do escopo desta migration (item 14)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (fazenda_id, especie_id, ano_referencia),
  constraint declaracoes_rebanho_data_envio_consistente
    check (status <> 'enviado' or data_envio is not null),
  constraint declaracoes_rebanho_data_envio_nao_futura
    check (data_envio is null or data_envio <= current_date)
);

comment on table public.declaracoes_rebanho is
  'Declaração Anual de Rebanho à Secretaria Estadual de Agricultura, por '
  'fazenda/espécie/ano (spec seção 3.2). unique(fazenda_id, especie_id, '
  'ano_referencia) — uma declaração por espécie/ano; correção é via UPDATE '
  'da própria linha, nunca uma segunda linha para o mesmo ano. '
  'arquivo_pdf_path fica nulo nesta migration (bucket declaracoes-rebanho é '
  'item 14, fora de escopo aqui). SEM policy de DELETE (spec, item 9 da '
  'seção 9: "declarações anuais nunca devem ser apagáveis pelo usuário — são '
  'documento oficial"). SELECT liberado para papel=financeiro (spec 5.4, '
  '"Declarações de Rebanho" está na lista explícita de acesso), '
  'INSERT/UPDATE só admin/membro.';

comment on constraint declaracoes_rebanho_data_envio_consistente on public.declaracoes_rebanho is
  'status=enviado exige data_envio preenchida — mesmo padrão de '
  'gtas_data_liberacao_consistente (migration anterior).';

create index idx_declaracoes_rebanho_fazenda_id on public.declaracoes_rebanho(fazenda_id);
create index idx_declaracoes_rebanho_especie_id on public.declaracoes_rebanho(especie_id);

create trigger set_updated_at
  before update on public.declaracoes_rebanho
  for each row
  execute function public.trigger_set_updated_at();

create trigger prevent_identity_change
  before update on public.declaracoes_rebanho
  for each row
  execute function public.prevent_fazenda_id_change();


-- ----------------------------------------------------------------------------
-- 1.3 public.prazos_declaracao_estado — config regulatória GLOBAL (sem
--     fazenda_id, spec seção 3.2), editável apenas via a função
--     `definir_prazo_declaracao_estado()` (seção 3.1) — ver decisão 2 do
--     cabeçalho desta migration para a análise completa do risco de escrita
--     compartilhada e por que a tabela não ganhou fazenda_id.
--
--     `atualizado_por_usuario_id`: coluna de auditoria NÃO prevista
--     literalmente na spec, adicionada por decisão desta migration — é a
--     trilha que compensa a ausência de uma restrição estrutural "só quem
--     tem fazenda nesse estado pode editar" (schema de `fazendas` hoje não
--     tem coluna de UF, ver decisão 2 do cabeçalho).
--
--     unique(estado, ano_referencia): um único prazo vigente por UF/ano —
--     é exatamente essa unicidade que a função usa como alvo de
--     `ON CONFLICT` para fazer upsert.
-- ----------------------------------------------------------------------------
create table public.prazos_declaracao_estado (
  id                        uuid primary key default gen_random_uuid(),
  estado                    text not null
                            constraint prazos_declaracao_estado_uf_check
                            check (estado ~ '^[A-Z]{2}$'),
  ano_referencia            integer not null
                            constraint prazos_declaracao_estado_ano_referencia_check
                            check (ano_referencia >= 2000),
  data_inicio_prazo         date not null,
  data_fim_prazo            date not null,
  atualizado_por_usuario_id uuid references public.usuarios(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (estado, ano_referencia),
  constraint prazos_declaracao_estado_datas_consistentes
    check (data_fim_prazo > data_inicio_prazo)
);

comment on table public.prazos_declaracao_estado is
  'Prazo regulatório de envio da Declaração Anual de Rebanho, por UF/ano '
  '(spec seção 3.2/4.2) — GLOBAL, sem fazenda_id (decisão 2 do cabeçalho '
  'desta migration: é dado publicado pelo órgão estadual, o mesmo para '
  'toda fazenda na mesma UF/ano, não um dado por-tenant). Tabela SEM '
  'nenhuma policy de INSERT/UPDATE/DELETE para authenticated/anon — toda '
  'escrita passa exclusivamente por definir_prazo_declaracao_estado() '
  '(SECURITY DEFINER, seção 3.1), que valida formato de UF, consistência de '
  'datas, exige vínculo operacional (papel <> financeiro) em pelo menos uma '
  'fazenda cujo estado (fazendas.estado, seção 1.0) coincida com o editado '
  'quando preenchido, e grava atualizado_por_usuario_id para auditoria. '
  'Tabela nasce VAZIA nesta migration — o fallback do padrão RS (01/04-30/06) não é '
  'semeado como linha, é resolvido em tempo de leitura por '
  'obter_prazo_declaracao_estado() (seção 3.2, decisão 3 do cabeçalho).';

comment on column public.prazos_declaracao_estado.atualizado_por_usuario_id is
  'Auditoria de quem fez a última escrita — coluna adicionada por decisão '
  'desta migration (não está na spec literal), compensa a ausência de uma '
  'restrição estrutural "só quem tem fazenda nesse estado edita" (fazendas '
  'não tem coluna de UF hoje, ver decisão 2 do cabeçalho). Populada apenas '
  'por definir_prazo_declaracao_estado(), nunca client-writable diretamente.';

create trigger set_updated_at
  before update on public.prazos_declaracao_estado
  for each row
  execute function public.trigger_set_updated_at();


-- ============================================================================
-- 2. (reservado — sem triggers de integridade cruzada nesta migration; as
--    3 tabelas não têm referências circulares nem vínculos N:N novos)
-- ============================================================================


-- ============================================================================
-- 3. FUNÇÕES DE prazos_declaracao_estado
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 definir_prazo_declaracao_estado() — ÚNICO caminho de escrita da tabela
--     (decisão 2 do cabeçalho). SECURITY DEFINER: a tabela não tem NENHUMA
--     policy de INSERT/UPDATE para authenticated, então a função precisa
--     rodar com privilégio elevado para conseguir escrever — mesmo padrão já
--     usado em aceitar_convite()/promover_papel()/criar_convite()/
--     cancelar_convite() (ADR-0002) para as tabelas usuarios_fazendas/
--     convites, que seguem a mesma lógica de "escrita só por função, nunca
--     policy solta".
--
--     Autorização (i): exige que o chamador tenha papel <> 'financeiro' em
--     QUALQUER fazenda — CORRIGIDO pelo cyber_chief no gate de 2026-07-20
--     (ver adendo à decisão 2 do cabeçalho e seção 1.0): agora também exige
--     que, se essa fazenda tiver `estado` preenchido, ele coincida com o
--     estado sendo editado. Fazendas sem `estado` (hoje, todas — coluna
--     nova, sem backfill) continuam sob a regra antiga como fallback.
--
--     Validação (ii): formato de UF (2 letras maiúsculas) e datas
--     consistentes (fim > início) — falha antes de qualquer escrita.
--
--     Upsert por (estado, ano_referencia): permite tanto "cadastrar um
--     estado novo" quanto "sobrescrever o prazo de um ano específico já
--     cadastrado" (spec seção 3.2, ambos os casos de uso da tela de
--     Configurações).
-- ----------------------------------------------------------------------------
create or replace function public.definir_prazo_declaracao_estado(
  p_estado           text,
  p_ano_referencia   integer,
  p_data_inicio_prazo date,
  p_data_fim_prazo    date
)
returns public.prazos_declaracao_estado
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tem_vinculo_operacional boolean;
  v_estado                  text;
  v_row                     public.prazos_declaracao_estado;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  -- Validação de forma ANTES de qualquer checagem de autorização/escrita
  -- (também fecha um NULL-bypass achado no gate do cyber_chief de
  -- 2026-07-20: `NULL !~ regex` avalia NULL, e `if NULL then` é tratado
  -- como falso em PL/pgSQL — sem os `is null` explícitos abaixo, um
  -- parâmetro NULL pulava silenciosamente a validação de formato e só
  -- falhava depois, no INSERT, com um erro genérico de `not null
  -- constraint` em vez de uma mensagem própria).
  if p_estado is null then
    raise exception 'estado é obrigatório';
  end if;

  v_estado := upper(trim(p_estado));

  if v_estado !~ '^[A-Z]{2}$' then
    raise exception 'estado inválido — informe a sigla de 2 letras (UF)';
  end if;

  if p_ano_referencia is null or p_ano_referencia < 2000 then
    raise exception 'ano_referencia inválido';
  end if;

  if p_data_inicio_prazo is null or p_data_fim_prazo is null then
    raise exception 'data_inicio_prazo e data_fim_prazo são obrigatórias';
  end if;

  if p_data_fim_prazo <= p_data_inicio_prazo then
    raise exception 'data_fim_prazo deve ser posterior a data_inicio_prazo';
  end if;

  -- Autorização — correção do cyber_chief (2026-07-20, ver adendo à decisão
  -- 2 do cabeçalho e seção 1.0): exige vínculo `papel <> financeiro` em
  -- QUALQUER fazenda, IGUAL A ANTES, mas agora também considera
  -- `fazendas.estado` quando preenchido — se a fazenda vinculada tem estado
  -- definido, ele precisa coincidir com `v_estado`; fazendas sem estado
  -- (hoje, todas) continuam contando no fallback permissivo, para não
  -- regredir a funcionalidade atual.
  select exists (
    select 1
      from public.usuarios_fazendas uf
      join public.fazendas f on f.id = uf.fazenda_id
     where uf.usuario_id = auth.uid()
       and uf.papel <> 'financeiro'
       and (f.estado is null or f.estado = v_estado)
  ) into v_tem_vinculo_operacional;

  if not v_tem_vinculo_operacional then
    raise exception 'sem permissão para editar prazos de declaração';
  end if;

  insert into public.prazos_declaracao_estado (
    estado, ano_referencia, data_inicio_prazo, data_fim_prazo,
    atualizado_por_usuario_id
  )
  values (
    v_estado, p_ano_referencia, p_data_inicio_prazo, p_data_fim_prazo,
    auth.uid()
  )
  on conflict (estado, ano_referencia) do update set
    data_inicio_prazo         = excluded.data_inicio_prazo,
    data_fim_prazo             = excluded.data_fim_prazo,
    atualizado_por_usuario_id  = excluded.atualizado_por_usuario_id,
    updated_at                 = now()
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.definir_prazo_declaracao_estado(text, integer, date, date) is
  'Único caminho de escrita de prazos_declaracao_estado (decisão 2 do '
  'cabeçalho desta migration). SECURITY DEFINER — a tabela não tem policy '
  'de INSERT/UPDATE para authenticated. Autorização (corrigida pelo '
  'cyber_chief no gate de 2026-07-20, ver adendo à decisão 2 do cabeçalho e '
  'seção 1.0): chamador precisa ter papel <> financeiro em pelo menos uma '
  'fazenda, E, se essa fazenda tiver fazendas.estado preenchido, ele precisa '
  'coincidir com o estado sendo editado — fazendas sem estado (hoje, todas) '
  'caem no fallback permissivo antigo, para não regredir a funcionalidade '
  'atual. Todos os parâmetros validados contra NULL explicitamente antes de '
  'qualquer escrita (fecha bypass de checagem de formato via NULL achado no '
  'mesmo gate). Upsert por (estado, ano_referencia); grava '
  'atualizado_por_usuario_id para auditoria.';

revoke all on function public.definir_prazo_declaracao_estado(text, integer, date, date) from public;
grant execute on function public.definir_prazo_declaracao_estado(text, integer, date, date) to authenticated;


-- ----------------------------------------------------------------------------
-- 3.2 obter_prazo_declaracao_estado() — leitura com fallback (decisão 3 do
--     cabeçalho): se existir linha cadastrada para (estado, ano), retorna
--     ela (origem='cadastrado'); senão, se estado='RS', calcula
--     01/abril-30/junho do ano pedido via make_date() (origem='padrao_rs',
--     spec seção 4.2); para qualquer outro estado sem linha cadastrada,
--     retorna datas NULL e origem NULL — não há padrão validado com o
--     cliente além do RS.
--
--     LANGUAGE SQL / STABLE / SECURITY INVOKER (default, sem elevação): só
--     faz SELECT, já respeita a policy de SELECT aberta da própria tabela
--     (seção 4) — sem necessidade de privilégio elevado. Sem GRANT
--     explícito, mesmo padrão de calcular_categoria_animal() (Fase 2):
--     função pura, PUBLIC executa por padrão.
-- ----------------------------------------------------------------------------
create or replace function public.obter_prazo_declaracao_estado(
  p_estado          text,
  p_ano_referencia  integer
)
returns table (
  data_inicio_prazo date,
  data_fim_prazo    date,
  origem            text
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(p.data_inicio_prazo, v.data_inicio_padrao),
    coalesce(p.data_fim_prazo, v.data_fim_padrao),
    case
      when p.id is not null then 'cadastrado'
      when v.data_inicio_padrao is not null then 'padrao_rs'
      else null
    end
  from (
    select
      case when upper(trim(p_estado)) = 'RS'
        then make_date(p_ano_referencia, 4, 1) end as data_inicio_padrao,
      case when upper(trim(p_estado)) = 'RS'
        then make_date(p_ano_referencia, 6, 30) end as data_fim_padrao
  ) v
  left join public.prazos_declaracao_estado p
    on p.estado = upper(trim(p_estado))
   and p.ano_referencia = p_ano_referencia;
$$;

comment on function public.obter_prazo_declaracao_estado(text, integer) is
  'Leitura com fallback (decisão 3 do cabeçalho desta migration, spec seção '
  '4.2): retorna o prazo cadastrado para (estado, ano_referencia) se '
  'existir; senão, para estado=RS, calcula o padrão 01/04-30/06 do ano '
  'pedido (nunca hardcoded como data fixa — make_date(ano, 4, 1)/'
  '(ano, 6, 30)); para outros estados sem cadastro, retorna NULL/origem '
  'NULL. Evita seed anual manual de linhas futuras. Consumida pelo Painel '
  'Inteligente (item 21) e pela tela de Declarações (módulo 5.2) — nenhuma '
  'das duas implementada nesta migration.';


-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================

alter table public.lancamentos_financeiros enable row level security;
alter table public.declaracoes_rebanho enable row level security;
alter table public.prazos_declaracao_estado enable row level security;

-- ----------------------------------------------------------------------------
-- 4.1 lancamentos_financeiros — SELECT para QUALQUER papel vinculado,
--     INCLUINDO financeiro (spec 5.4, "Painel Financeiro" está na lista de
--     acesso). INSERT/UPDATE só admin/membro. Sem policy de DELETE (decisão
--     6 do cabeçalho).
-- ----------------------------------------------------------------------------
create policy lancamentos_financeiros_select_vinculada
  on public.lancamentos_financeiros
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy lancamentos_financeiros_insert_vinculada
  on public.lancamentos_financeiros
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy lancamentos_financeiros_update_vinculada
  on public.lancamentos_financeiros
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
-- 4.2 declaracoes_rebanho — SELECT para QUALQUER papel vinculado, INCLUINDO
--     financeiro (spec 5.4, "Declarações de Rebanho" está na lista de
--     acesso). INSERT/UPDATE só admin/membro. Sem policy de DELETE (spec,
--     item 9 da seção 9 — decisão já dada pela spec, não desta migration).
-- ----------------------------------------------------------------------------
create policy declaracoes_rebanho_select_vinculada
  on public.declaracoes_rebanho
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid()
    )
  );

create policy declaracoes_rebanho_insert_vinculada
  on public.declaracoes_rebanho
  for insert
  to authenticated
  with check (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy declaracoes_rebanho_update_vinculada
  on public.declaracoes_rebanho
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
-- 4.3 prazos_declaracao_estado — SELECT aberto a QUALQUER authenticated, SEM
--     filtro de papel nem de fazenda (decisão 5 do cabeçalho: dado global,
--     financeiro precisa dele para renderizar a tela de Declarações, que a
--     spec 5.4 autoriza esse papel a acessar). ZERO policy de INSERT/UPDATE/
--     DELETE — toda escrita é exclusivamente via
--     definir_prazo_declaracao_estado() (seção 3.1, decisão 2 do cabeçalho).
-- ----------------------------------------------------------------------------
create policy prazos_declaracao_estado_select_authenticated
  on public.prazos_declaracao_estado
  for select
  to authenticated
  using (true);
