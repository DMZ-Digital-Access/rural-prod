-- ============================================================================
-- Migration: especie_id em animais — "Tipo de Animal" na lista (pedido de
--            JP, 2026-07-23), substituindo a coluna "Categoria".
--
-- Achado ao investigar o pedido: `animais` nunca teve espécie própria —
-- `calcular_categoria_animal()` sempre devolve rótulos de bovino (Bezerro/
-- Novilho/Boi/...) independente da espécie real. Confirmado em produção que
-- isso já é um problema real, não só teórico: existe um lote de 26 ovinos
-- (compra de 2026-06-11, "Ronaldo Rios") já individualizado em `animais`,
-- hoje rotulado com categorias de bovino.
--
-- 1. animais.especie_id — nullable, FK pra especies. Preenchido daqui pra
--    frente por registrar_entrada_saida_lote() direto de p_especie_id (já
--    recebido como parâmetro, sem depender de transacao_origem_id).
--
-- 2. Backfill do histórico, em duas passadas (confiança decrescente):
--    a. Animais com identificacao no padrão {TIPO}-{DATA}-{NNN} (ADR-0006):
--       espécie inferida por match exato de fazenda+tipo_operacao+data
--       contra transacoes — verificado manualmente em produção antes desta
--       migration que não há ambiguidade (nenhum dia com duas transações do
--       mesmo tipo E espécies diferentes) — não é uma suposição, é uma
--       correspondência determinística dado o estado real dos dados.
--    b. Os 3 animais restantes sem identificacao nesse padrão (cadastrados
--       via o extinto "Individualizar Animal" standalone, antes de existir
--       qualquer rastreabilidade — ver migration 20260723120000) — decisão
--       explícita de JP: assumir Bovinos (Eixo 1/rebanho individual era
--       bovino-only nessa época do sistema). Corrigível manualmente depois
--       via "Editar animal" (campo Espécie novo, decisão de JP).
--
-- 3. animais_com_detalhes — DROP + CREATE (mesmo motivo da migration
--    anterior: a.* muda de posição) — expõe especie_nome via join em
--    especies.
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

alter table public.animais
  add column especie_id uuid references public.especies(id);

comment on column public.animais.especie_id is
  '"Tipo de Animal" (2026-07-23) — animais nunca teve espécie própria antes '
  'desta migration (calcular_categoria_animal() sempre assumia bovino). '
  'Preenchido por registrar_entrada_saida_lote() a partir de p_especie_id. '
  'Editável manualmente em "Editar animal" para correção pontual.';

-- Backfill 2a: match determinístico por fazenda+tipo+data (ver cabeçalho).
update public.animais a
   set especie_id = t.especie_id
  from public.transacoes t
 where a.especie_id is null
   and t.fazenda_id = a.fazenda_id
   and t.tipo_operacao in ('compra', 'nascimento', 'entrada_pastoreio')
   and a.identificacao ~ '^(COMPRA|NASCIMENTO|ENTRADA_PASTOREIO)-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$'
   and upper(t.tipo_operacao) = regexp_replace(a.identificacao, '^([A-Z_]+)-.*$', '\1')
   and t.data_operacao = to_date(
         regexp_replace(a.identificacao, '^[A-Z_]+-([0-9]{4}-[0-9]{2}-[0-9]{2})-[0-9]+$', '\1'),
         'YYYY-MM-DD'
       );

-- Backfill 2b: qualquer sobra (identificacao fora do padrão ADR-0006) vira
-- Bovinos — decisão explícita de JP, ver cabeçalho.
update public.animais
   set especie_id = (select id from public.especies where nome = 'Bovinos')
 where especie_id is null;

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
      insert into public.animais (fazenda_id, identificacao, sexo, transacao_origem_id, especie_id)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'macho', v_transacao.id, p_especie_id);
    end loop;

    for v_i in 1..p_quantidade_femeas loop
      v_proximo_numero := v_proximo_numero + 1;
      insert into public.animais (fazenda_id, identificacao, sexo, transacao_origem_id, especie_id)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'femea', v_transacao.id, p_especie_id);
    end loop;
  end if;

  return v_transacao;
end;
$$;

comment on function public.registrar_entrada_saida_lote(uuid, text, uuid, text, date, integer, integer, numeric, numeric) is
  'ADR-0005 + ADR-0006 + 2026-07-23. Insere transacao + transacoes_detalhe '
  'atomicamente (ADR-0005) e, para as 3 operações de entrada (compra/'
  'nascimento/entrada_pastoreio), cria N linhas pendentes em animais '
  '(ADR-0006 D3/D4) já vinculadas via transacao_origem_id e com especie_id '
  '(2026-07-23) — identificacao {TIPO}-{AAAA-MM-DD}-{NNN}, sequencial por '
  'fazenda+tipo+data, protegida por advisory lock contra corrida entre '
  'chamadas concorrentes do mesmo tipo/dia/fazenda (achado do cyber_chief, '
  '2026-07-23). data_nascimento/peso_inicial_kg ficam NULL até '
  '"Individualizar Animal" completar. SECURITY INVOKER — RLS de transacoes/'
  'transacoes_detalhe/animais (admin/membro) já protege a escrita.';

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
  end as idade_meses_aquisicao,
  e.nome as especie_nome
from public.animais a
left join (
  select animal_id, count(*) as numero_pesagens
    from public.pesagens
   group by animal_id
) p on p.animal_id = a.id
left join public.transacoes t on t.id = a.transacao_origem_id
left join public.especies e on e.id = a.especie_id;

comment on view public.animais_com_detalhes is
  'Animais + idade/categoria/ganho/nº pesagens calculados (spec seção '
  '3.1) + origem rastreada (2026-07-23: origem_tipo_operacao/'
  'origem_outra_parte/origem_data_operacao/idade_meses_aquisicao) + '
  'especie_nome (2026-07-23, "Tipo de Animal" na lista) via especie_id. '
  'security_invoker=true — RLS de public.animais aplicada ao usuário que '
  'consulta a view, não ao dono da view (ver cabeçalho da migration '
  'original, decisão 7).';
