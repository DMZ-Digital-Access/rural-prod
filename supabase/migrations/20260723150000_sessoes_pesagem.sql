-- ============================================================================
-- Migration: sessões de "Dia de Pesagem" — evento discreto de pesagem em
--            lote, com histórico e trava de uso concorrente (pedido de JP,
--            2026-07-23)
--
-- Contexto: "Dia de Pesagem" hoje só filtra pesagens por data_evento = hoje,
-- sem nenhum conceito de "evento" — insuficiente porque pode haver mais de
-- um evento de pesagem no mesmo dia (confirmado por JP). Esta migration cria
-- um registro próprio de sessão, permitindo: (1) um botão "Final da
-- pesagem" que fecha o evento; (2) histórico de eventos passados (data,
-- lote derivado, nº de animais, peso médio/total, quem registrou); (3)
-- travar que só UM usuário por fazenda tenha uma sessão em aberto por vez —
-- um segundo usuário tentando abrir a tela vê quem está com a sessão ativa
-- em vez de conseguir iniciar uma nova, em paralelo.
--
-- Decisões de JP: sessão nasce sozinha no 1º peso (sem botão de "iniciar"
-- explícito); some do live view assim que finalizada, vira histórico; lote
-- da sessão é DERIVADO dos animais pesados, não escolhido manualmente;
-- corrigir um peso (regra já existente de <=2 dias) numa sessão diferente
-- da original MOVE a pesagem pra sessão atual.
--
-- Padrão de segurança: `usuarios` não tem policy de SELECT para outros
-- membros da mesma fazenda (só a própria linha, Fase 1) — exatamente por
-- isso listar_membros_fazenda() (ADR-0002) já existe como RPC SECURITY
-- DEFINER. Como esta feature também precisa expor o NOME de quem iniciou
-- uma sessão (pedido de JP) pra qualquer colega autorizado da fazenda,
-- usamos o mesmo padrão aqui: RPCs SECURITY DEFINER com checagem
-- imperativa, não uma view security_invoker=true (que herdaria a mesma
-- restrição de RLS de `usuarios` e retornaria nome NULL pra sessões de
-- outros usuários).
--
-- Autor: SOFIA (db_sage) + RYAN (developer), a pedido do squad DMZ — 2026-07-23
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela sessoes_pesagem
-- ----------------------------------------------------------------------------

create table public.sessoes_pesagem (
  id            uuid primary key default gen_random_uuid(),
  fazenda_id    uuid not null references public.fazendas(id) on delete cascade,
  usuario_id    uuid not null default auth.uid() references public.usuarios(id),
  iniciada_em   timestamptz not null default now(),
  finalizada_em timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.sessoes_pesagem is
  '"Dia de Pesagem" (2026-07-23) — um evento de pesagem em lote. Nasce no 1º '
  'peso registrado (sem ação explícita de "iniciar"), fica em aberto '
  '(finalizada_em is null) até o usuário apertar "Final da pesagem". Só UMA '
  'sessão em aberto por fazenda por vez (ver criar_sessao_pesagem) — um '
  'segundo usuário não consegue iniciar uma nova enquanto a de outro '
  'colega segue ativa.';

comment on column public.sessoes_pesagem.usuario_id is
  'Quem iniciou a sessão — também serve de "dono" pra travar uso '
  'concorrente (criar_sessao_pesagem bloqueia um SEGUNDO usuário enquanto '
  'esta sessão está aberta). default auth.uid() + WITH CHECK da policy de '
  'INSERT reforçam que não pode ser forjado pelo client.';

create index idx_sessoes_pesagem_fazenda_id on public.sessoes_pesagem(fazenda_id);

create trigger set_updated_at
  before update on public.sessoes_pesagem
  for each row
  execute function public.trigger_set_updated_at();

alter table public.sessoes_pesagem enable row level security;

create policy sessoes_pesagem_select_vinculada
  on public.sessoes_pesagem
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

create policy sessoes_pesagem_insert_vinculada
  on public.sessoes_pesagem
  for insert
  to authenticated
  with check (
    usuario_id = auth.uid()
    and fazenda_id in (
      select fazenda_id from public.usuarios_fazendas
       where usuario_id = auth.uid() and papel <> 'financeiro'
    )
  );

-- UPDATE (finalizar) permitido a qualquer membro autorizado da fazenda, não
-- só ao dono da sessão — pragmático (ex.: dono não consegue voltar ao
-- celular, outro admin fecha o evento), mesma fronteira das demais tabelas.
create policy sessoes_pesagem_update_vinculada
  on public.sessoes_pesagem
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
-- 2. pesagens.sessao_pesagem_id — nullable: pesagens de OUTROS fluxos
--    (RegistrarPesagemForm em AnimalDetailPage, dado histórico) não
--    pertencem a nenhuma sessão.
-- ----------------------------------------------------------------------------

alter table public.pesagens
  add column sessao_pesagem_id uuid references public.sessoes_pesagem(id) on delete set null;

comment on column public.pesagens.sessao_pesagem_id is
  'Sessão de "Dia de Pesagem" que originou este registro (2026-07-23) — '
  'NULL para pesagens de outros fluxos (tela de detalhe do animal). Numa '
  'correção (<=2 dias, ver registrar_pesagem) que acontece numa sessão '
  'diferente da original, este campo migra pra sessão ATUAL — decisão de '
  'JP, reflete a ação mais recente.';

-- ----------------------------------------------------------------------------
-- 3. criar_sessao_pesagem() — get-or-create atômico + trava de concorrência
-- ----------------------------------------------------------------------------

create or replace function public.criar_sessao_pesagem(p_fazenda_id uuid)
returns public.sessoes_pesagem
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autorizado       boolean;
  v_sessao_existente public.sessoes_pesagem;
  v_nova_sessao      public.sessoes_pesagem;
  v_nome_outro       text;
begin
  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = p_fazenda_id
       and uf.papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Você não tem permissão para iniciar uma pesagem nesta fazenda.';
  end if;

  -- Trava por fazenda ANTES de checar/criar — fecha a corrida entre dois
  -- usuários abrindo a tela ao mesmo tempo (mesmo raciocínio do advisory
  -- lock de registrar_entrada_saida_lote, 2026-07-23).
  perform pg_advisory_xact_lock(hashtext(p_fazenda_id::text || 'sessao_pesagem'));

  select * into v_sessao_existente
    from public.sessoes_pesagem
   where fazenda_id = p_fazenda_id
     and finalizada_em is null
   order by iniciada_em desc
   limit 1;

  if found and v_sessao_existente.usuario_id <> auth.uid() then
    select nome into v_nome_outro from public.usuarios where id = v_sessao_existente.usuario_id;
    raise exception 'Existe uma pesagem sendo registrada nesse momento nesta fazenda, por %.',
      coalesce(v_nome_outro, 'outro usuário');
  end if;

  if found then
    return v_sessao_existente;
  end if;

  insert into public.sessoes_pesagem (fazenda_id, usuario_id)
  values (p_fazenda_id, auth.uid())
  returning * into v_nova_sessao;

  return v_nova_sessao;
end;
$$;

comment on function public.criar_sessao_pesagem(uuid) is
  'Get-or-create de sessão de pesagem ativa (2026-07-23). Se já existe uma '
  'sessão em aberto do MESMO usuário, reaproveita (permite sair/voltar no '
  'mesmo dia sem perder o evento). Se existe uma sessão em aberto de OUTRO '
  'usuário, bloqueia com mensagem clara — só uma pessoa por vez pesando '
  'nesta fazenda. Advisory lock fecha a corrida de duas aberturas '
  'simultâneas.';

revoke all on function public.criar_sessao_pesagem(uuid) from public;
grant execute on function public.criar_sessao_pesagem(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. obter_sessao_pesagem_ativa() — expõe a sessão ativa (se houver) + nome
--    de quem a iniciou, pra qualquer colega autorizado ver quem está
--    pesando agora (não só o próprio dono).
-- ----------------------------------------------------------------------------

create or replace function public.obter_sessao_pesagem_ativa(p_fazenda_id uuid)
returns table (
  id            uuid,
  usuario_id    uuid,
  usuario_nome  text,
  iniciada_em   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = p_fazenda_id
       and uf.papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Você não tem permissão para ver pesagens desta fazenda.';
  end if;

  return query
    select s.id, s.usuario_id, u.nome, s.iniciada_em
      from public.sessoes_pesagem s
      join public.usuarios u on u.id = s.usuario_id
     where s.fazenda_id = p_fazenda_id
       and s.finalizada_em is null
     order by s.iniciada_em desc
     limit 1;
end;
$$;

comment on function public.obter_sessao_pesagem_ativa(uuid) is
  '2026-07-23 — sessão de pesagem em aberto (se houver) + nome de quem a '
  'iniciou. SECURITY DEFINER: usuarios não tem SELECT declarativo entre '
  'colegas da mesma fazenda (só a própria linha, Fase 1), mesmo motivo de '
  'listar_membros_fazenda (ADR-0002).';

revoke all on function public.obter_sessao_pesagem_ativa(uuid) from public;
grant execute on function public.obter_sessao_pesagem_ativa(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. listar_sessoes_pesagem_finalizadas() — histórico com estatísticas
-- ----------------------------------------------------------------------------

create or replace function public.listar_sessoes_pesagem_finalizadas(p_fazenda_id uuid)
returns table (
  id                 uuid,
  iniciada_em        timestamptz,
  finalizada_em      timestamptz,
  usuario_nome       text,
  quantidade_animais bigint,
  peso_medio_kg      numeric,
  peso_total_kg      numeric,
  lote_nome          text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autorizado boolean;
begin
  select exists (
    select 1
      from public.usuarios_fazendas uf
     where uf.usuario_id = auth.uid()
       and uf.fazenda_id = p_fazenda_id
       and uf.papel <> 'financeiro'
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'Você não tem permissão para ver pesagens desta fazenda.';
  end if;

  return query
    select
      s.id,
      s.iniciada_em,
      s.finalizada_em,
      u.nome as usuario_nome,
      coalesce(stats.quantidade, 0)::bigint as quantidade_animais,
      stats.peso_medio_kg,
      stats.peso_total_kg,
      lote.lote_nome
    from public.sessoes_pesagem s
    join public.usuarios u on u.id = s.usuario_id
    left join lateral (
      select
        count(*) as quantidade,
        avg(p.peso_kg) as peso_medio_kg,
        sum(p.peso_kg) as peso_total_kg
      from public.pesagens p
     where p.sessao_pesagem_id = s.id
    ) stats on true
      -- "Mesmo lote" exige TODOS os animais pesados com o MESMO lote_id —
      -- um com lote_id null e outro com lote real NÃO conta como "mesmo
      -- lote" (achado real ao testar: count(distinct a.lote_id) ignora
      -- NULL por definição, então "1 sem lote + 1 com Lote X" contava
      -- como 1 valor distinto e mostrava "Lote X" incorretamente — por
      -- isso o coalesce pro sentinela, que trata "sem lote" como seu
      -- próprio grupo distinto em vez de ser descartado pela agregação).
    left join lateral (
      select
        case
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 0 then null
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 1
               and bool_and(a.lote_id is null) then null
          when count(distinct coalesce(a.lote_id::text, '__sem_lote__')) = 1 then max(l.nome)
          else 'Vários'
        end as lote_nome
      from public.pesagens p
      join public.animais a on a.id = p.animal_id
      left join public.lotes l on l.id = a.lote_id
     where p.sessao_pesagem_id = s.id
    ) lote on true
   where s.fazenda_id = p_fazenda_id
     and s.finalizada_em is not null
   order by s.iniciada_em desc;
end;
$$;

comment on function public.listar_sessoes_pesagem_finalizadas(uuid) is
  '2026-07-23 — histórico de "Dia de Pesagem" (aba Histórico): data, quem '
  'registrou, lote derivado (todos os animais da sessão do mesmo lote → '
  'nome; nenhum lote → null; lotes diferentes → "Vários"), nº de animais, '
  'peso médio/total. SECURITY DEFINER pelo mesmo motivo de '
  'obter_sessao_pesagem_ativa (expor nome de usuário entre colegas).';

revoke all on function public.listar_sessoes_pesagem_finalizadas(uuid) from public;
grant execute on function public.listar_sessoes_pesagem_finalizadas(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. registrar_pesagem() — ganha p_sessao_pesagem_id (default null,
--    compatível com todo chamador existente). Precisa de DROP explícito
--    antes: acrescentar um parâmetro (mesmo com default) muda a
--    assinatura da função — CREATE OR REPLACE sozinho criaria um SEGUNDO
--    overload em vez de substituir o original, e uma chamada com 3
--    argumentos passaria a bater em ambos (erro real encontrado ao rodar
--    a suíte pgTAP local antes de aplicar no remoto: "function ... is not
--    unique").
-- ----------------------------------------------------------------------------

drop function if exists public.registrar_pesagem(uuid, date, numeric);

create or replace function public.registrar_pesagem(
  p_animal_id         uuid,
  p_data_evento       date,
  p_peso_kg           numeric,
  p_sessao_pesagem_id uuid default null
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
  v_sessao_valida         boolean;
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

  -- 2026-07-23: se veio de "Dia de Pesagem", valida que a sessão existe,
  -- é da MESMA fazenda do animal, está em aberto e pertence ao chamador —
  -- nunca confia cegamente num id vindo do client (SECURITY DEFINER).
  if p_sessao_pesagem_id is not null then
    select exists (
      select 1
        from public.sessoes_pesagem s
       where s.id = p_sessao_pesagem_id
         and s.fazenda_id = v_fazenda_id
         and s.finalizada_em is null
         and s.usuario_id = auth.uid()
    ) into v_sessao_valida;

    if not v_sessao_valida then
      raise exception 'Sessão de pesagem inválida, encerrada ou de outro usuário.';
    end if;
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
    -- sessao_pesagem_id só é sobrescrito quando o chamador informou uma
    -- sessão (2026-07-23, decisão de JP: correção entre sessões migra pra
    -- a ATUAL) — chamadas do fluxo antigo (sem sessão) não mexem no que
    -- já estava lá.
    update public.pesagens
       set data_evento = p_data_evento,
           peso_kg = p_peso_kg,
           sessao_pesagem_id = coalesce(p_sessao_pesagem_id, sessao_pesagem_id)
     where id = v_pesagem_recente_id
    returning id into v_pesagem_id;
  else
    -- Fora da janela de correção (ou primeira pesagem do animal): novo
    -- registro histórico.
    insert into public.pesagens (animal_id, data_evento, peso_kg, sessao_pesagem_id)
    values (p_animal_id, p_data_evento, p_peso_kg, p_sessao_pesagem_id)
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

comment on function public.registrar_pesagem(uuid, date, numeric, uuid) is
  'Único caminho de escrita em pesagens (spec seção 4.1). SECURITY '
  'DEFINER — autorização (usuario_fazendas) checada explicitamente no '
  'corpo. Decide UPDATE (correção, <= 2 dias da última pesagem) vs. '
  'INSERT (novo histórico). 2026-07-23: p_sessao_pesagem_id opcional '
  '(default null, compatível com todo chamador existente) — quando '
  'informado, valida fazenda/aberta/dono antes de gravar; numa correção, '
  'migra sessao_pesagem_id pra sessão atual.';
