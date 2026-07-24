-- ============================================================================
-- Migration: Controle Sanitário — registro de vacinas/medicamentos aplicados
--            a animais individuais (pedido de JP, 2026-07-24)
--
-- Uma pesagem "sessão de vacinação" (Dia de Vacinação) aplica N vacinas de
-- uma vez no MESMO animal — cada vacina vira uma linha própria em
-- `vacinacoes` (mesma data/observações/usuário, tipo_vacina diferente),
-- pra a página de detalhes do animal listar cada vacina individualmente
-- (spec do pedido: "lista das vacinas que tomou... podendo abrir cada uma").
--
-- tipo_vacina é sempre texto livre — tanto pra uma vacina do catálogo fixo
-- por espécie (hardcoded no frontend, ex.: "Brucelose") quanto pro texto
-- digitado em "Outras vacinas ou medicamentos". Sem catálogo formal no
-- banco: a lista por espécie é fixa e pequena, sem necessidade de tabela
-- (mesma filosofia de não criar abstração antes de precisar de verdade).
--
-- registrar_vacinacao() é o único caminho de escrita — mesmo padrão de
-- registrar_pesagem(): SECURITY DEFINER (vacinacoes não tem policy de
-- INSERT/UPDATE/DELETE pra authenticated, só SELECT), autorização (vínculo
-- com a fazenda do animal + papel <> financeiro) checada explicitamente no
-- corpo. Aceita N vacinas de uma vez via dois arrays paralelos
-- (tipos/enfermidades, unnest com iteração pareada) — evita N chamadas
-- separadas (N round-trips) pra registrar as vacinas de UM animal.
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-24
-- ============================================================================

create table public.vacinacoes (
  id                 uuid primary key default gen_random_uuid(),
  animal_id          uuid not null references public.animais(id) on delete cascade,
  tipo_vacina        text not null,
  enfermidade_tratada text,
  observacoes        text,
  usuario_id         uuid not null references public.usuarios(id),
  data_aplicacao     date not null default current_date,
  created_at         timestamptz not null default now()
);

create index idx_vacinacoes_animal_id on public.vacinacoes(animal_id);

comment on table public.vacinacoes is
  '2026-07-24: vacinas/medicamentos aplicados a um animal individual (Dia de '
  'Vacinação). Cada linha é UMA vacina — várias vacinas aplicadas ao mesmo '
  'animal no mesmo evento viram várias linhas com o mesmo animal_id/'
  'data_aplicacao/usuario_id/observacoes. tipo_vacina é sempre texto livre '
  '(catálogo fixo por espécie vive no frontend, sem tabela — ou o texto '
  'digitado em "Outras vacinas ou medicamentos"). enfermidade_tratada só é '
  'preenchida pra "Outras" (vacinas do catálogo já têm o nome '
  'autoexplicativo). Única via de escrita: registrar_vacinacao().';

alter table public.vacinacoes enable row level security;

-- Mesmo padrão de pesagens_select_vinculada (Fase 2): financeiro não vê
-- nada de manejo individual de animal.
create policy vacinacoes_select_vinculada
  on public.vacinacoes
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

revoke all on public.vacinacoes from public;
grant select on public.vacinacoes to authenticated;

create or replace function public.registrar_vacinacao(
  p_animal_id      uuid,
  p_tipos_vacina   text[],
  p_enfermidades   text[],
  p_observacoes    text default null,
  p_data_aplicacao date default current_date
)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id        uuid;
  v_animal_encontrado boolean;
  v_autorizado        boolean;
begin
  if coalesce(array_length(p_tipos_vacina, 1), 0) = 0 then
    raise exception 'informe ao menos uma vacina ou medicamento';
  end if;

  if array_length(p_tipos_vacina, 1) <> array_length(p_enfermidades, 1) then
    raise exception 'tipos_vacina e enfermidades precisam ter o mesmo tamanho';
  end if;

  if exists (select 1 from unnest(p_tipos_vacina) t where t is null or btrim(t) = '') then
    raise exception 'todo item de tipos_vacina precisa ter um nome não vazio';
  end if;

  if p_data_aplicacao is null then
    raise exception 'data_aplicacao é obrigatória';
  end if;

  if p_data_aplicacao > current_date then
    raise exception 'data_aplicacao não pode ser no futuro';
  end if;

  select fazenda_id
    into v_fazenda_id
    from public.animais
   where id = p_animal_id
   for update;

  v_animal_encontrado := found;

  -- Mesmo padrão de registrar_pesagem(): mensagem única pra "animal não
  -- existe" e "existe mas sem permissão" — evita oráculo de existência de
  -- UUID entre fazendas.
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

  if not v_animal_encontrado or not v_autorizado then
    raise exception 'Animal não encontrado ou você não tem permissão para registrar vacinação nele';
  end if;

  return query
    insert into public.vacinacoes (
      animal_id, tipo_vacina, enfermidade_tratada, observacoes, usuario_id, data_aplicacao
    )
    select p_animal_id, btrim(t), nullif(btrim(coalesce(e, '')), ''), p_observacoes, auth.uid(), p_data_aplicacao
      from unnest(p_tipos_vacina, p_enfermidades) as x(t, e)
    returning id;
end;
$$;

comment on function public.registrar_vacinacao(uuid, text[], text[], text, date) is
  '2026-07-24: registra N vacinas/medicamentos de uma vez pro mesmo animal '
  '(Dia de Vacinação) — uma linha em vacinacoes por elemento de '
  'p_tipos_vacina (pareado por posição com p_enfermidades via unnest '
  'paralelo). SECURITY DEFINER: vacinacoes não tem policy de INSERT pra '
  'authenticated. Autorização (vínculo com a fazenda do animal, papel <> '
  'financeiro) checada explicitamente, mesmo padrão de registrar_pesagem().';

revoke all on function public.registrar_vacinacao(uuid, text[], text[], text, date) from public;
grant execute on function public.registrar_vacinacao(uuid, text[], text[], text, date) to authenticated;

-- ----------------------------------------------------------------------------
-- listar_vacinacoes_animal() — histórico de vacinas do animal (Controle
-- Sanitário, página de detalhe do animal), com o NOME de quem registrou.
--
-- `usuarios_select_own` (Fase 1) só deixa cada usuário ver a própria linha
-- (id = auth.uid()) — um embed direto (`vacinacoes.select("*, usuarios(nome)")`)
-- devolveria null pro nome de qualquer colega que não seja o próprio
-- chamador. Mesmo motivo/padrão de obter_sessao_pesagem_ativa()/
-- listar_membros_fazenda() (ADR-0002): SECURITY DEFINER pra ler usuarios
-- através da fronteira de vínculo de fazenda, não de auth.uid() individual.
-- ----------------------------------------------------------------------------

create or replace function public.listar_vacinacoes_animal(p_animal_id uuid)
returns table (
  id                  uuid,
  tipo_vacina         text,
  enfermidade_tratada text,
  observacoes         text,
  data_aplicacao      date,
  usuario_nome        text,
  created_at          timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id uuid;
  v_autorizado boolean;
begin
  select a.fazenda_id into v_fazenda_id from public.animais a where a.id = p_animal_id;

  if not found then
    raise exception 'Animal não encontrado ou você não tem permissão para ver a vacinação dele';
  end if;

  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = v_fazenda_id
       and uf.papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Animal não encontrado ou você não tem permissão para ver a vacinação dele';
  end if;

  return query
    select
      v.id,
      v.tipo_vacina,
      v.enfermidade_tratada,
      v.observacoes,
      v.data_aplicacao,
      u.nome as usuario_nome,
      v.created_at
    from public.vacinacoes v
    join public.usuarios u on u.id = v.usuario_id
   where v.animal_id = p_animal_id
   order by v.data_aplicacao desc, v.created_at desc;
end;
$$;

comment on function public.listar_vacinacoes_animal(uuid) is
  '2026-07-24: histórico de vacinas/medicamentos de um animal (Controle '
  'Sanitário), com o nome de quem registrou cada uma — SECURITY DEFINER '
  'pelo mesmo motivo de obter_sessao_pesagem_ativa()/listar_membros_fazenda() '
  '(expor nome de usuário entre colegas da fazenda, além do que '
  'usuarios_select_own permite sozinha).';

revoke all on function public.listar_vacinacoes_animal(uuid) from public;
grant execute on function public.listar_vacinacoes_animal(uuid) to authenticated;
