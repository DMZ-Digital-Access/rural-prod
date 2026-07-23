-- ============================================================================
-- Migration: rastreabilidade de origem do animal individualizado
--
-- Pedido de JP (2026-07-23), a partir da investigação da inconsistência do
-- card "Cabeças" do Painel Inteligente (migration
-- 20260723100000_atualizar_entrada_saida_lote.sql): animais pendentes
-- criados por registrar_entrada_saida_lote() (ADR-0006) não tinham nenhum
-- vínculo rastreável de volta à transação de origem — só uma convenção de
-- nomenclatura (identificacao = {TIPO}-{DATA}-{NNN}) que nem sempre é única
-- (duas compras do mesmo tipo/dia/fazenda). Submetido a uma revisão
-- simulada (cyber_chief/db_sage/architect) antes desta migration.
--
-- 1. animais.transacao_origem_id — nullable, FK pra transacoes, ON DELETE
--    SET NULL (excluir a transação de origem não deve arrastar o animal).
--    NULL para todo animal já existente hoje (sem backfill heurístico —
--    a numeração sequencial sozinha não garante atribuição correta quando
--    há duas transações do mesmo tipo/dia; melhor "origem desconhecida"
--    honesta do que uma atribuição adivinhada).
--
-- 2. registrar_entrada_saida_lote() (ADR-0005/0006) — CREATE OR REPLACE:
--    preenche transacao_origem_id em cada INSERT do loop de pendentes.
--    Aproveitando que a função já é reaberta: adiciona
--    pg_advisory_xact_lock() logo antes do bloco de numeração, fechando a
--    race condition sinalizada por Constantine (cyber_chief) na revisão —
--    duas chamadas concorrentes do mesmo tipo/dia/fazenda podiam calcular
--    o mesmo MAX(...) antes de qualquer uma commitar e gerar
--    `identificacao` duplicada (erro de unique constraint na segunda a
--    commitar). Lock é liberado automaticamente no fim da transação
--    (_xact_), sem necessidade de unlock explícito.
--
-- 3. animais_com_detalhes (Fase 2) — CREATE OR REPLACE VIEW: LEFT JOIN em
--    transacoes via transacao_origem_id, expõe origem_tipo_operacao/
--    origem_outra_parte/origem_data_operacao e um idade_meses_aquisicao
--    novo (meses entre data_nascimento e a data de aquisição — mesma
--    fórmula de idade_meses, só trocando current_date pela data da
--    transação de origem). NULL quando não há origem rastreada ou quando
--    data_nascimento ainda não foi preenchida (animal ainda pendente).
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

alter table public.animais
  add column transacao_origem_id uuid references public.transacoes(id) on delete set null;

comment on column public.animais.transacao_origem_id is
  'Transação de origem (compra/nascimento/entrada_pastoreio) que criou este '
  'animal via registrar_entrada_saida_lote() — ADR-0006 estendido em '
  '2026-07-23. NULL = origem não rastreada (animal criado antes desta '
  'migration). ON DELETE SET NULL: excluir a transação não deve arrastar o '
  'animal, só perder o rastro de origem.';

create or replace function public.registrar_entrada_saida_lote(
  p_fazenda_id        uuid,
  p_tipo_operacao     text,
  p_especie_id        uuid,
  p_outra_parte       text,
  p_data_operacao     date,
  p_quantidade_machos integer default 0,
  p_quantidade_femeas integer default 0,
  p_valor_nota        numeric default null,
  p_peso_total_kg     numeric default null
)
returns public.transacoes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quantidade_total integer;
  v_transacao        public.transacoes;
  v_prefixo          text;
  v_proximo_numero   integer;
  v_i                integer;
begin
  if p_tipo_operacao not in ('compra', 'venda', 'nascimento', 'obito', 'consumo') then
    raise exception 'tipo_operacao inválido para esta operação — use compra, venda, nascimento, obito ou consumo';
  end if;

  v_quantidade_total := coalesce(p_quantidade_machos, 0) + coalesce(p_quantidade_femeas, 0);

  if v_quantidade_total <= 0 then
    raise exception 'informe ao menos um animal (machos ou fêmeas)';
  end if;

  insert into public.transacoes (
    fazenda_id, tipo_operacao, especie_id, outra_parte, data_operacao,
    quantidade_animais, valor_nota, peso_total_kg
  ) values (
    p_fazenda_id, p_tipo_operacao, p_especie_id, p_outra_parte, p_data_operacao,
    v_quantidade_total, p_valor_nota, p_peso_total_kg
  )
  returning * into v_transacao;

  if p_quantidade_machos > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (v_transacao.id, null, 'macho', p_quantidade_machos);
  end if;

  if p_quantidade_femeas > 0 then
    insert into public.transacoes_detalhe (transacao_id, agrupamento_etario_id, sexo, quantidade)
    values (v_transacao.id, null, 'femea', p_quantidade_femeas);
  end if;

  -- ADR-0006 D3/D4: só as 3 operações de ENTRADA criam animais pendentes.
  -- Venda/obito/consumo/saida_pastoreio agem sobre animais já existentes
  -- (mecanismo de seleção individual do ADR-0004, tela ainda não
  -- construída) — nenhuma linha nova aqui para esses tipos.
  if p_tipo_operacao in ('compra', 'nascimento', 'entrada_pastoreio') then
    -- 2026-07-23 (achado do cyber_chief): trava por fazenda+tipo+data ANTES
    -- de calcular o próximo número — sem isso, duas chamadas concorrentes
    -- do mesmo tipo/dia/fazenda podem ler o mesmo MAX(...) e gerar
    -- identificacao duplicada. Advisory lock (não uma linha real: no
    -- primeiro lançamento do dia não há nenhuma linha em animais ainda pra
    -- travar com `for update`) — liberado automaticamente no fim da
    -- transação.
    perform pg_advisory_xact_lock(
      hashtext(p_fazenda_id::text || p_tipo_operacao || p_data_operacao::text)
    );

    v_prefixo := upper(p_tipo_operacao) || '-' || to_char(p_data_operacao, 'YYYY-MM-DD') || '-';

    select coalesce(max(
             (regexp_replace(identificacao, '^' || v_prefixo, ''))::integer
           ), 0)
      into v_proximo_numero
      from public.animais
     where fazenda_id = p_fazenda_id
       and identificacao like v_prefixo || '%'
       and identificacao ~ ('^' || v_prefixo || '[0-9]+$');

    for v_i in 1..p_quantidade_machos loop
      v_proximo_numero := v_proximo_numero + 1;
      insert into public.animais (fazenda_id, identificacao, sexo, transacao_origem_id)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'macho', v_transacao.id);
    end loop;

    for v_i in 1..p_quantidade_femeas loop
      v_proximo_numero := v_proximo_numero + 1;
      insert into public.animais (fazenda_id, identificacao, sexo, transacao_origem_id)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'femea', v_transacao.id);
    end loop;
  end if;

  return v_transacao;
end;
$$;

comment on function public.registrar_entrada_saida_lote(uuid, text, uuid, text, date, integer, integer, numeric, numeric) is
  'ADR-0005 + ADR-0006 + 2026-07-23. Insere transacao + transacoes_detalhe '
  'atomicamente (ADR-0005) e, para as 3 operações de entrada (compra/'
  'nascimento/entrada_pastoreio), cria N linhas pendentes em animais '
  '(ADR-0006 D3/D4) já vinculadas via transacao_origem_id (2026-07-23) — '
  'identificacao {TIPO}-{AAAA-MM-DD}-{NNN}, sequencial por fazenda+tipo+data, '
  'protegida por advisory lock contra corrida entre chamadas concorrentes '
  'do mesmo tipo/dia/fazenda (achado do cyber_chief, 2026-07-23). '
  'data_nascimento/peso_inicial_kg ficam NULL até "Individualizar Animal" '
  'completar. SECURITY INVOKER — RLS de transacoes/transacoes_detalhe/'
  'animais (admin/membro) já protege a escrita.';

-- DROP + CREATE (não CREATE OR REPLACE): a.* agora expande com a coluna
-- nova transacao_origem_id no meio da lista de colunas da view — Postgres
-- só permite CREATE OR REPLACE VIEW quando as colunas existentes mantêm
-- nome/posição e só se acrescenta no FINAL; aqui a posição efetiva muda.
-- Sem view/função dependendo desta view (só comentários mencionando o
-- nome) — seguro de derrubar e recriar. Privilégios (anon/authenticated/
-- service_role) vêm de ALTER DEFAULT PRIVILEGES do próprio Supabase
-- (aplica a toda relação nova em public, não é um GRANT explícito desta
-- migration) — confirmados intactos após a recriação.
drop view if exists public.animais_com_detalhes;

create view public.animais_com_detalhes
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
  coalesce(p.numero_pesagens, 0) as numero_pesagens,
  t.tipo_operacao as origem_tipo_operacao,
  t.outra_parte   as origem_outra_parte,
  t.data_operacao as origem_data_operacao,
  case
    when a.data_nascimento is null or t.data_operacao is null then null
    else (
      date_part('year', age(t.data_operacao, a.data_nascimento)) * 12
      + date_part('month', age(t.data_operacao, a.data_nascimento))
    )::integer
  end as idade_meses_aquisicao
from public.animais a
left join (
  select animal_id, count(*) as numero_pesagens
    from public.pesagens
   group by animal_id
) p on p.animal_id = a.id
left join public.transacoes t on t.id = a.transacao_origem_id;

comment on view public.animais_com_detalhes is
  'Animais + idade/categoria/ganho/nº pesagens calculados (spec seção '
  '3.1) + origem rastreada (2026-07-23: origem_tipo_operacao/'
  'origem_outra_parte/origem_data_operacao via transacao_origem_id, e '
  'idade_meses_aquisicao — idade do animal na data da transação de '
  'origem, não hoje). security_invoker=true — RLS de public.animais '
  'aplicada ao usuário que consulta a view, não ao dono da view (ver '
  'cabeçalho da migration original, decisão 7).';
