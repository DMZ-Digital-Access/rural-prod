-- ============================================================================
-- Migration: ADR-0006 — animais pendentes de individualização a partir de
--            Entradas de Lote (Compra/Nascimento/Entrada de Pastoreio)
--
-- Reabre (de forma aditiva) o schema de animais (Fase 2, já gateado) e a
-- função registrar_entrada_saida_lote() (ADR-0005) — nenhuma migration
-- anterior é editada.
--
-- Decisões completas: .agents/memory/adr/ADR-0006-animais-pendentes-de-
-- individualizacao.md (D1-D4). Resumo do que muda no SQL:
--
-- 1. D1 — animais.data_nascimento e animais.peso_inicial_kg viram NULLABLE.
--    "Pendente de individualização" = qualquer um dos dois nulo (derivado,
--    sem coluna de status nova).
-- 2. D2 — calcular_categoria_animal() ganha um `when p_idade_meses is null
--    then null` explícito — sem isso, o CASE cairia no ELSE e fabricaria
--    uma categoria de animal adulto para idade desconhecida.
-- 3. D3/D4 — registrar_entrada_saida_lote() (ADR-0005) cria N linhas em
--    animais (N = quantidade_machos + quantidade_femeas) quando
--    tipo_operacao in ('compra', 'nascimento', 'entrada_pastoreio') —
--    identificacao = {TIPO}-{AAAA-MM-DD}-{NNN}, sequencial por
--    fazenda+tipo+data (não reinicia em 001 numa segunda operação do
--    mesmo tipo no mesmo dia). Para os demais tipos (saídas), nenhuma
--    linha nova — comportamento inalterado.
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-20
-- ============================================================================


-- ============================================================================
-- 1. animais.data_nascimento / peso_inicial_kg viram NULLABLE (ADR-0006 D1)
-- ============================================================================

alter table public.animais
  alter column data_nascimento drop not null,
  alter column peso_inicial_kg drop not null;

comment on column public.animais.data_nascimento is
  'ADR-0006: NULLABLE (era NOT NULL na Fase 2) — animal criado por Entrada '
  'de Lote (Compra/Nascimento/Entrada de Pastoreio) nasce sem esse dado, '
  'preenchido depois via "Individualizar Animal". "Pendente de '
  'individualização" = data_nascimento is null or peso_inicial_kg is null.';

comment on column public.animais.peso_inicial_kg is
  'Peso capturado na CRIAÇÃO do animal no sistema — não necessariamente ao '
  'nascer (um animal pode ser cadastrado já adulto). Base para o cálculo '
  'de GMD (peso_atual - peso_inicial) / dias_totais, onde dias_totais usa '
  'created_at do animal, não data_nascimento. ADR-0006: NULLABLE (era '
  'NOT NULL na Fase 2) — ver comentário de data_nascimento.';


-- ============================================================================
-- 2. calcular_categoria_animal() NULL-safe (ADR-0006 D2) — achado próprio
--    desta tarefa: sem o `when ... is null`, o CASE cairia no ELSE e
--    fabricaria uma categoria de animal ADULTO para idade desconhecida.
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
    when p_idade_meses is null then null
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
  'ADR-0006: retorna NULL explicitamente quando p_idade_meses é NULL '
  '(animal pendente de individualização, data_nascimento ainda não '
  'preenchida) — sem essa checagem, o CASE cairia no ELSE e fabricaria uma '
  'categoria de animal adulto (Boi/Vaca) para uma idade que na verdade é '
  'desconhecida, não necessariamente adulta.';


-- ============================================================================
-- 3. registrar_entrada_saida_lote() (ADR-0005) estendida — cria animais
--    pendentes para as 3 operações de entrada (ADR-0006 D3/D4).
-- ============================================================================

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
      insert into public.animais (fazenda_id, identificacao, sexo)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'macho');
    end loop;

    for v_i in 1..p_quantidade_femeas loop
      v_proximo_numero := v_proximo_numero + 1;
      insert into public.animais (fazenda_id, identificacao, sexo)
      values (p_fazenda_id, v_prefixo || lpad(v_proximo_numero::text, 3, '0'), 'femea');
    end loop;
  end if;

  return v_transacao;
end;
$$;

comment on function public.registrar_entrada_saida_lote(uuid, text, uuid, text, date, integer, integer, numeric, numeric) is
  'ADR-0005 + ADR-0006. Insere transacao + transacoes_detalhe atomicamente '
  '(ADR-0005) e, para as 3 operações de entrada (compra/nascimento/'
  'entrada_pastoreio), cria N linhas pendentes em animais (ADR-0006 D3/D4) '
  '— identificacao {TIPO}-{AAAA-MM-DD}-{NNN}, sequencial por '
  'fazenda+tipo+data (não reinicia em 001 numa segunda operação do mesmo '
  'tipo no mesmo dia). data_nascimento/peso_inicial_kg ficam NULL até '
  '"Individualizar Animal" completar. SECURITY INVOKER — RLS de '
  'transacoes/transacoes_detalhe/animais (admin/membro) já protege a '
  'escrita.';
