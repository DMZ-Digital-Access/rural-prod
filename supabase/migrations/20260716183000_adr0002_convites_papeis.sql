-- ============================================================================
-- Migration: ADR-0002 — Convites para fazenda existente + papel único
--            hierárquico (admin/membro/financeiro)
--
-- Escopo desta migration (ver
-- .agents/memory/adr/ADR-0002-convites-e-papeis-admin.md):
--   D1        — troca de 'dono' por 'admin'/'membro'/'financeiro' em
--               usuarios_fazendas.papel (ordem exata do D4 do ADR).
--   D2        — as 4 funções SECURITY DEFINER que passam a ser o ÚNICO
--               caminho de escrita em usuarios_fazendas/convites
--               (aceitar_convite, promover_papel, criar_convite,
--               cancelar_convite) + branch novo de convite_token em
--               handle_new_user().
--   D3 (parcial) — só o schema Postgres da tabela `convites` (fonte da
--               verdade de estado do convite). A Edge Function
--               `enviar-convite` (Deno/TS, envia o e-mail) NÃO está nesta
--               migration — é tarefa do `developer`, fora do escopo do
--               db_sage.
--   D4        — ordem obrigatória da migração de dados: drop constraint →
--               UPDATE papel='dono'→'admin' → add constraint nova.
--
-- Aditiva/alteração sobre 20260716171522_fase1_usuarios_fazendas.sql — não
-- recria nada, segue os mesmos padrões já estabelecidos e revisados pelo
-- cyber_chief naquela migration: search_path = '' em toda função nova,
-- referências sempre schema-qualificadas, comentários SQL extensos, RLS
-- default-deny (aqui generalizado: convites nasce com ZERO policy de
-- INSERT/UPDATE/DELETE para authenticated/anon, só SELECT — nenhuma tabela
-- cujas colunas codificam autorização ganha policy de escrita declarativa
-- neste projeto, ver ADR-0002 D2).
--
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-16
-- Revisão de segurança: CONCLUÍDA (cyber_chief) — 2026-07-16. Corrigidos
--   diretamente neste arquivo: (1) bug de comparação NULL-unsafe em
--   aceitar_convite() e handle_new_user() que permitia bypass da checagem
--   de destinatário do convite se auth.email()/new.email viesse NULL; (2)
--   condição de corrida (TOCTOU) em promover_papel() que permitia a
--   fazenda ficar com zero admins via duas chamadas concorrentes
--   rebaixando admins diferentes; (3) inconsistência de case-sensitivity
--   na policy convites_select_convidado. Detalhes completos em
--   .agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md. Liberada
--   para aplicação (`supabase db push`) do ponto de vista deste gate —
--   decisão de quando aplicar continua sendo humana/orchestrator.
-- ============================================================================


-- ============================================================================
-- 1. MIGRAÇÃO DO PAPEL (ADR-0002 D1 + D4)
--
-- Ordem EXATA exigida pelo ADR (D4): a constraint atual só aceita 'dono',
-- então o UPDATE para 'admin' falha se rodar antes do DROP. Fazer o DROP,
-- depois o UPDATE, depois recriar a constraint com os 3 valores novos.
-- ============================================================================

-- 1.1 Drop da constraint antiga (só aceitava 'dono').
alter table public.usuarios_fazendas
  drop constraint usuarios_fazendas_papel_check;

-- 1.2 Migração de dados: todo vínculo existente com papel='dono' vira
--     'admin' — quem criou a fazenda continua sendo o único admin dela até
--     que um convite/promoção mude isso (ADR-0002, decisão 1 e 2 de JP).
update public.usuarios_fazendas
   set papel = 'admin'
 where papel = 'dono';

-- 1.3 Constraint nova: papel único hierárquico. 'dono' deixa de ser um
--     valor válido a partir daqui.
alter table public.usuarios_fazendas
  add constraint usuarios_fazendas_papel_check
  check (papel in ('admin', 'membro', 'financeiro'));

-- 1.4 Decisão de implementação não coberta pelos 3 passos do D4 (resolvida
--     aqui, fora do texto literal do ADR): o DEFAULT da coluna papel ainda
--     apontava para 'dono', que a partir do passo 1.3 é um valor
--     estruturalmente inválido para a própria coluna. Na prática esse
--     DEFAULT nunca é exercitado — todo INSERT em usuarios_fazendas passa
--     por handle_new_user()/aceitar_convite(), que sempre especificam
--     `papel` explicitamente (ver seções 3 e 4 abaixo) — mas deixar um
--     DEFAULT que viola a própria CHECK da coluna é dívida de schema
--     desnecessária. Trocado para 'membro' (o papel de MENOR privilégio),
--     não 'admin': mesmo raciocínio de least-privilege que rege o resto
--     deste ADR — se algum INSERT futuro chegar a omitir `papel` por
--     engano, o pior caso possível deve ser "sem nenhum privilégio
--     elevado", nunca "admin sem querer".
alter table public.usuarios_fazendas
  alter column papel set default 'membro';

comment on table public.usuarios_fazendas is
  'Vínculo N:N usuário↔fazenda com papel. Único registro por (usuario_id, '
  'fazenda_id). Papel único hierárquico: admin/membro/financeiro (ADR-0002 '
  'D1 — substituiu o valor único anterior ''dono''). Escrita EXCLUSIVAMENTE '
  'via handle_new_user() (signup, com ou sem convite), aceitar_convite() e '
  'promover_papel() — zero policy de INSERT/UPDATE/DELETE para '
  'authenticated/anon (ver seção RLS desta migration e da anterior, e '
  'ADR-0002 D2).';

comment on constraint usuarios_fazendas_papel_check on public.usuarios_fazendas is
  'Papel único hierárquico: admin/membro/financeiro (ADR-0002 D1). Qualquer '
  'admin da fazenda pode promover/rebaixar qualquer vínculo via '
  'promover_papel() — sem hierarquia especial para o criador original '
  '(decisão de produto de JP) — sujeito à guarda de "a fazenda nunca fica '
  'sem nenhum admin" implementada dentro da própria função, não aqui.';


-- ============================================================================
-- 2. TABELA convites (ADR-0002 D3, escopo parcial — só o schema Postgres)
--
-- Fonte da verdade do estado do convite. Segue a MESMA disciplina que a
-- correção do cyber_chief impôs a usuarios_fazendas na Fase 1, mas aplicada
-- de propósito desde o primeiro dia, não descoberta reativamente: nenhuma
-- policy de INSERT/UPDATE/DELETE para authenticated/anon. Toda escrita
-- passa pelas 4 funções SECURITY DEFINER da seção 3. Diferente de
-- usuarios/fazendas (Fase 1), esta tabela não precisa de trigger de
-- imutabilidade de coluna: lá, o client tinha UPDATE parcial liberado por
-- RLS (coluna `nome`) e a guarda protegia as demais colunas; aqui não há
-- NENHUMA policy de UPDATE para o client, então RLS default-deny já cobre
-- 100% das colunas sem necessidade de um trigger adicional.
-- ============================================================================

create table public.convites (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references public.fazendas(id) on delete cascade,
  convidado_email       text not null,
  convidado_usuario_id  uuid references public.usuarios(id) on delete set null,
  papel_oferecido       text not null
                        constraint convites_papel_oferecido_check
                        check (papel_oferecido in ('admin', 'membro', 'financeiro')),
  convidado_por         uuid not null references public.usuarios(id) on delete cascade,
  token                 uuid not null default gen_random_uuid(),
  status                text not null default 'pendente'
                        constraint convites_status_check
                        check (status in ('pendente', 'aceito', 'cancelado')),
  expires_at            timestamptz not null default (now() + interval '7 days'),
  accepted_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (token)
);

comment on table public.convites is
  'Fonte da verdade de convites para fazenda existente (ADR-0002 D3). '
  'convidado_usuario_id é resolvido em criar_convite() se já existir conta '
  'com o e-mail (fica null até então, ou até aceitar_convite()/'
  'handle_new_user() preenchê-lo no aceite). status: pendente (default) → '
  'aceito|cancelado. Sem job de expiração ativo — convites vencidos '
  'continuam status=''pendente'' no banco, ficam inutilizáveis só porque '
  'aceitar_convite()/handle_new_user() checam expires_at > now() no momento '
  'do uso (ADR-0002, Riscos a monitorar). Escrita EXCLUSIVAMENTE via '
  'criar_convite(), cancelar_convite(), aceitar_convite() e '
  'handle_new_user() — zero policy de INSERT/UPDATE/DELETE para '
  'authenticated/anon (ver seção RLS abaixo).';

comment on column public.convites.convidado_usuario_id is
  'Preenchido em criar_convite() (lookup por e-mail) se a conta já existir '
  'no momento do convite; senão fica null e é preenchido no aceite '
  '(aceitar_convite() ou o branch de convite em handle_new_user(), para '
  'quem ainda não tinha conta). on delete set null (não cascade): perder a '
  'conta do convidado não deve apagar o histórico do convite.';

comment on column public.convites.convidado_por is
  'Admin que criou o convite (auth.uid() no momento de criar_convite()). '
  'on delete cascade, mesmo padrão de FK já usado em toda a Fase 1 — se a '
  'conta do admin for removida, o convite que ele criou é removido junto.';

-- Índices para os predicados usados pelas policies de SELECT (seção abaixo)
-- e pelas 4 funções da seção 3 (lookup por fazenda/e-mail/usuário).
create index idx_convites_fazenda_id on public.convites(fazenda_id);
create index idx_convites_convidado_email on public.convites(convidado_email);
create index idx_convites_convidado_usuario_id on public.convites(convidado_usuario_id);

create trigger set_updated_at
  before update on public.convites
  for each row
  execute function public.trigger_set_updated_at();

alter table public.convites enable row level security;

-- ----------------------------------------------------------------------------
-- RLS de convites — apenas SELECT (leitura não concede privilégio, é seguro
-- expressá-la declarativamente — ADR-0002 D2). Zero policy de INSERT/
-- UPDATE/DELETE para authenticated/anon: RLS default-deny cobre toda
-- escrita direta do client; as únicas escritas válidas são as 4 funções
-- SECURITY DEFINER da seção 3, que fazem sua própria checagem de permissão
-- dentro do corpo (bypassando RLS de propósito, como SECURITY DEFINER faz),
-- nunca delegada a uma policy `WITH CHECK` declarativa — a mesma lição que
-- gerou o achado nº 1 do cyber_chief na Fase 1 (ver
-- .agents/memory/log/2026-07-16-cyber_chief-review-fase1.md), aplicada aqui
-- preventivamente em vez de corrigida depois.
-- ----------------------------------------------------------------------------

create policy convites_select_admin
  on public.convites
  for select
  to authenticated
  using (
    fazenda_id in (
      select fazenda_id
      from public.usuarios_fazendas
      where usuario_id = auth.uid()
        and papel = 'admin'
    )
  );

-- CORREÇÃO cyber_chief (gate ADR-0002, endurecimento): comparação original
-- (`convidado_email = auth.email()`) era case-sensitive, enquanto
-- convidado_email é sempre normalizado para lower() em criar_convite() e
-- toda comparação equivalente em PL/pgSQL (aceitar_convite(),
-- handle_new_user()) já usa lower() nos dois lados. Se auth.email()
-- retornar o e-mail com capitalização diferente da que o usuário digitou
-- no signup (comportamento não garantido de todo provedor/versão do
-- GoTrue), esta policy falhava para o lado seguro (convidado não via o
-- próprio convite pendente via SELECT) — não era uma brecha de acesso,
-- mas era uma inconsistência que quebraria a UI sem motivo. Alinhado com
-- lower() dos dois lados por conformidade com o resto do desenho.
create policy convites_select_convidado
  on public.convites
  for select
  to authenticated
  using (
    lower(convidado_email) = lower(auth.email())
    or convidado_usuario_id = auth.uid()
  );


-- ============================================================================
-- 3. FUNÇÕES SECURITY DEFINER (ADR-0002 D2)
--
-- As 4 funções abaixo são o único caminho de escrita em usuarios_fazendas
-- (a partir de agora) e em convites. Todas: SECURITY DEFINER,
-- set search_path = '' (mesmo hardening que o cyber_chief aplicou em
-- handle_new_user() na Fase 1 — toda referência a tabela é
-- schema-qualificada por isso), REVOKE ALL FROM PUBLIC + GRANT EXECUTE só
-- para authenticated (nunca anon — todas exigem auth.uid()/auth.email()
-- válidos, que só existem para sessão autenticada).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 public.aceitar_convite(p_token uuid) RETURNS uuid (fazenda_id)
--
-- Valida o convite (status pendente + não expirado + destinatário correto)
-- e, na mesma transação da chamada RPC: insere o vínculo em
-- usuarios_fazendas e marca o convite como aceito. Atômico por construção
-- — elimina o risco de replay/double-accept que uma abordagem em dois
-- passos client-side teria (ADR-0002, Alternativa 2 rejeitada).
--
-- `for update` no SELECT do convite: lock de linha para que duas chamadas
-- concorrentes com o mesmo token não passem ambas pela checagem de status
-- antes de qualquer uma marcar o convite como aceito.
-- ----------------------------------------------------------------------------
create or replace function public.aceitar_convite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite      public.convites%rowtype;
  v_ja_vinculado boolean;
  v_email_bate   boolean;
  v_uuid_bate    boolean;
begin
  select *
    into v_convite
    from public.convites
   where token = p_token
   for update;

  if not found then
    raise exception 'Convite não encontrado';
  end if;

  if v_convite.status <> 'pendente' then
    raise exception 'Convite não está mais pendente (status atual: %)', v_convite.status;
  end if;

  if v_convite.expires_at <= now() then
    raise exception 'Convite expirado';
  end if;

  -- Destinatário correto: e-mail do chamador (auth.email(), claim já
  -- validado pelo GoTrue, não uma query direta a auth.users — ADR-0002 D2)
  -- bate com convidado_email, OU o convite já tinha convidado_usuario_id
  -- resolvido para este auth.uid() na criação (ver criar_convite()).
  --
  -- CORREÇÃO cyber_chief (gate ADR-0002, achado crítico): a forma original
  -- desta checagem (`lower(a) <> lower(b) and (... or ...)`) tinha um bug
  -- de lógica trivalente do SQL. Se auth.email() for NULL (provedor de
  -- auth sem claim de e-mail — hoje telefone/anônimo estão desabilitados
  -- em supabase/config.toml, mas isso é configuração, não garantia
  -- estrutural do schema), `lower(x) <> NULL` avalia para NULL, e
  -- `if NULL then` em PL/pgSQL é tratado como FALSE — a exceção NÃO
  -- dispararia, e um chamador autenticado com e-mail nulo passaria esta
  -- checagem para QUALQUER convite pendente cujo convidado_usuario_id
  -- ainda seja NULL (pessoa não pré-resolvida), entrando na fazenda com o
  -- papel oferecido sem nenhuma correspondência real de identidade —
  -- elevação de privilégio (inclusive a 'admin', se for o papel
  -- oferecido). Reescrito com duas variáveis booleanas explicitamente
  -- NULL-safe (NULL nunca avalia como TRUE em nenhum dos dois lados),
  -- fechando essa classe de bug preventivamente — mesmo padrão de "não
  -- aprovar controle de acesso que só é seguro por acidente de
  -- configuração externa" já registrado no review de segurança da Fase 1.
  v_email_bate := auth.email() is not null
                  and lower(v_convite.convidado_email) = lower(auth.email());

  v_uuid_bate := v_convite.convidado_usuario_id is not null
                 and v_convite.convidado_usuario_id = auth.uid();

  if not (v_email_bate or v_uuid_bate) then
    raise exception 'Este convite não é endereçado ao usuário autenticado';
  end if;

  -- Checagem de conflito ANTES do insert, para devolver erro claro em vez
  -- de sucesso silencioso enganoso via ON CONFLICT DO NOTHING.
  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = v_convite.fazenda_id
  ) into v_ja_vinculado;

  if v_ja_vinculado then
    raise exception 'Usuário já vinculado a esta fazenda';
  end if;

  insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
  values (auth.uid(), v_convite.fazenda_id, v_convite.papel_oferecido)
  on conflict (usuario_id, fazenda_id) do nothing;

  -- Checagem de conflito DEPOIS do insert também: ON CONFLICT DO NOTHING
  -- pode ter sido acionado por uma corrida entre a checagem acima e este
  -- insert (usuarios_fazendas não está sob o mesmo lock do convite).
  -- Confirma que o vínculo existe antes de declarar sucesso.
  if not exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = v_convite.fazenda_id
  ) then
    raise exception 'Falha ao vincular usuário à fazenda (corrida de aceite concorrente)';
  end if;

  update public.convites
     set status = 'aceito',
         accepted_at = now(),
         convidado_usuario_id = auth.uid()
   where id = v_convite.id;

  return v_convite.fazenda_id;
end;
$$;

comment on function public.aceitar_convite(uuid) is
  'ADR-0002 D2. SECURITY DEFINER. Valida convite (pendente, não expirado, '
  'destinatário = auth.email()/auth.uid()), insere usuarios_fazendas e '
  'marca o convite aceito, tudo na mesma transação — atômico, sem risco de '
  'replay/double-accept. RETURNS fazenda_id.';

revoke all on function public.aceitar_convite(uuid) from public;
grant execute on function public.aceitar_convite(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3.2 public.promover_papel(p_fazenda_id uuid, p_usuario_id uuid,
--     p_novo_papel text) RETURNS void
--
-- Só admin da fazenda pode chamar. Só muda papel de quem JÁ está vinculado
-- (nunca cria vínculo novo — isso é sempre via aceitar_convite()). Guarda
-- de integridade operacional: a fazenda nunca pode ficar com zero admins
-- (ADR-0002 D2, item 2) — sem essa guarda, ninguém mais conseguiria
-- promover ninguém de volta.
-- ----------------------------------------------------------------------------
create or replace function public.promover_papel(
  p_fazenda_id uuid,
  p_usuario_id uuid,
  p_novo_papel text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamador_e_admin boolean;
  v_papel_atual      text;
  v_admins_restantes integer;
begin
  if p_novo_papel not in ('admin', 'membro', 'financeiro') then
    raise exception 'Papel inválido: %', p_novo_papel;
  end if;

  -- Checagem imperativa de permissão, dentro do corpo da função — nunca
  -- delegada a uma policy `WITH CHECK` declarativa (ADR-0002 D2, mesma
  -- lição do achado nº 1 do cyber_chief na Fase 1). SECURITY DEFINER
  -- bypassa RLS, então esta query enxerga todos os vínculos, não só os do
  -- chamador — é por isso que a validação abaixo é obrigatória.
  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = p_fazenda_id
       and papel = 'admin'
  ) into v_chamador_e_admin;

  if not v_chamador_e_admin then
    raise exception 'Apenas admins da fazenda podem promover/rebaixar papéis';
  end if;

  select papel into v_papel_atual
    from public.usuarios_fazendas
   where usuario_id = p_usuario_id
     and fazenda_id = p_fazenda_id;

  if not found then
    raise exception 'Usuário não está vinculado a esta fazenda';
  end if;

  if v_papel_atual = p_novo_papel then
    -- Idempotente: nada a fazer, sem erro (evita um caso de borda chato no
    -- client — "promover para o papel que já é" não deveria ser exceção).
    return;
  end if;

  -- Guarda: a fazenda nunca pode ficar com zero vínculos papel='admin'.
  --
  -- CORREÇÃO cyber_chief (gate ADR-0002, achado de corrida): a forma
  -- original desta guarda contava os admins restantes com um SELECT COUNT
  -- simples, sem lock. Sob READ COMMITTED (isolamento padrão do Postgres),
  -- duas chamadas concorrentes de promover_papel() rebaixando DOIS ADMINS
  -- DIFERENTES da mesma fazenda (ex.: só existem 2 admins, X e Y; uma
  -- transação rebaixa X, outra rebaixa Y, ao mesmo tempo) não enxergam a
  -- mudança uma da outra até o commit — cada uma conta "1 admin restante"
  -- (o outro, ainda não commitado) e as DUAS passam pela guarda, deixando
  -- a fazenda com ZERO admins depois que ambas commitarem. `for update`
  -- nas linhas admin da fazenda ANTES de contar fecha essa janela: a
  -- segunda transação bloqueia até a primeira commitar, e ao ser liberada
  -- reavalia o WHERE contra o dado já committed (papel já alterado pela
  -- primeira chamada), então a contagem seguinte reflete a realidade.
  if v_papel_atual = 'admin' and p_novo_papel <> 'admin' then
    perform 1
      from public.usuarios_fazendas
     where fazenda_id = p_fazenda_id
       and papel = 'admin'
     for update;

    select count(*) into v_admins_restantes
      from public.usuarios_fazendas
     where fazenda_id = p_fazenda_id
       and papel = 'admin'
       and usuario_id <> p_usuario_id;

    if v_admins_restantes = 0 then
      raise exception 'Operação bloqueada: a fazenda ficaria sem nenhum admin';
    end if;
  end if;

  update public.usuarios_fazendas
     set papel = p_novo_papel
   where usuario_id = p_usuario_id
     and fazenda_id = p_fazenda_id;
end;
$$;

comment on function public.promover_papel(uuid, uuid, text) is
  'ADR-0002 D2. SECURITY DEFINER. Só admin da fazenda pode chamar; só '
  'muda papel de quem já está vinculado (nunca cria vínculo). Guarda: '
  'rejeita se a mudança deixaria a fazenda com zero admins. Qualquer admin '
  'pode promover/rebaixar qualquer outro, inclusive o criador original '
  '(decisão de produto de JP, sem hierarquia especial).';

revoke all on function public.promover_papel(uuid, uuid, text) from public;
grant execute on function public.promover_papel(uuid, uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3.3 public.criar_convite(p_fazenda_id uuid, p_email text, p_papel text)
--     RETURNS uuid (token)
--
-- Só admin da fazenda pode chamar. Resolve convidado_usuario_id por lookup
-- em public.usuarios (não usa Admin API só para essa checagem — ADR-0002
-- D2/D3). Não envia e-mail — isso é responsabilidade do client/Edge
-- Function enviar-convite (D3, fora do escopo desta migration).
-- ----------------------------------------------------------------------------
create or replace function public.criar_convite(
  p_fazenda_id uuid,
  p_email text,
  p_papel text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamador_e_admin  boolean;
  v_email_normalizado text;
  v_usuario_existente uuid;
  v_token             uuid;
begin
  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = p_fazenda_id
       and papel = 'admin'
  ) into v_chamador_e_admin;

  if not v_chamador_e_admin then
    raise exception 'Apenas admins da fazenda podem criar convites';
  end if;

  if p_papel not in ('admin', 'membro', 'financeiro') then
    raise exception 'Papel inválido: %', p_papel;
  end if;

  v_email_normalizado := lower(trim(p_email));

  if v_email_normalizado is null or v_email_normalizado = '' then
    raise exception 'E-mail do convidado não pode ser vazio';
  end if;

  -- Se já existe conta com este e-mail, populamos convidado_usuario_id já
  -- na criação — é assim que a Edge Function enviar-convite (D3) e a
  -- policy convites_select_convidado sabem diferenciar "pessoa nova" de
  -- "pessoa já cadastrada" sem precisar da Admin API só para essa checagem.
  select id into v_usuario_existente
    from public.usuarios
   where lower(email) = v_email_normalizado
   limit 1;

  insert into public.convites (
    fazenda_id, convidado_email, convidado_usuario_id,
    papel_oferecido, convidado_por
  )
  values (
    p_fazenda_id, v_email_normalizado, v_usuario_existente,
    p_papel, auth.uid()
  )
  returning token into v_token;

  return v_token;
end;
$$;

comment on function public.criar_convite(uuid, text, text) is
  'ADR-0002 D2/D3. SECURITY DEFINER. Só admin da fazenda pode chamar. '
  'Normaliza e-mail, resolve convidado_usuario_id por lookup em '
  'public.usuarios (null se conta não existir), insere em convites '
  '(status=pendente, expires_at=now()+7 dias por default da tabela). Não '
  'envia e-mail — isso é a Edge Function enviar-convite (fora desta '
  'migration). RETURNS token.';

revoke all on function public.criar_convite(uuid, text, text) from public;
grant execute on function public.criar_convite(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3.4 public.cancelar_convite(p_convite_id uuid) RETURNS void
--
-- Só admin da fazenda do convite pode chamar. Idempotente/seguro: só age
-- se status ainda for 'pendente' (não falha se já foi aceito/cancelado,
-- simplesmente não faz nada nesse caso).
-- ----------------------------------------------------------------------------
create or replace function public.cancelar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fazenda_id       uuid;
  v_chamador_e_admin boolean;
begin
  select fazenda_id into v_fazenda_id
    from public.convites
   where id = p_convite_id;

  if not found then
    raise exception 'Convite não encontrado';
  end if;

  select exists (
    select 1
      from public.usuarios_fazendas
     where usuario_id = auth.uid()
       and fazenda_id = v_fazenda_id
       and papel = 'admin'
  ) into v_chamador_e_admin;

  if not v_chamador_e_admin then
    raise exception 'Apenas admins da fazenda podem cancelar convites';
  end if;

  update public.convites
     set status = 'cancelado'
   where id = p_convite_id
     and status = 'pendente';
end;
$$;

comment on function public.cancelar_convite(uuid) is
  'ADR-0002 D2. SECURITY DEFINER. Só admin da fazenda do convite pode '
  'chamar. Idempotente: só atualiza se status ainda for pendente (seguro '
  'se já aceito/cancelado).';

revoke all on function public.cancelar_convite(uuid) from public;
grant execute on function public.cancelar_convite(uuid) to authenticated;


-- ============================================================================
-- 4. ATUALIZAÇÃO DE handle_new_user() (ADR-0002 D2)
--
-- CREATE OR REPLACE sobre a função já existente (criada em
-- 20260716171522_fase1_usuarios_fazendas.sql). Ganha um branch novo no
-- início: se new.raw_user_meta_data->>'convite_token' vier presente,
-- entra na fazenda existente do convite em vez de criar uma nova. Token
-- ausente preserva o comportamento do ADR-0001, só trocando papel='dono'
-- por papel='admin' (ADR-0002 D1). Token presente mas
-- inválido/expirado/e-mail que não bate: RAISE EXCEPTION, bloqueando o
-- signup (decisão deliberada do ADR-0002 D2 — diferente do fallback
-- silencioso usado para nome_fazenda, ver ADR-0001).
--
-- Atomicidade preservada: toda a lógica (branch de convite ou não) roda
-- dentro da mesma function body, disparada por AFTER INSERT ON auth.users
-- — mesma garantia central do ADR-0001 (qualquer exceção reverte tudo,
-- inclusive a linha de auth.users).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome_fazenda  text;
  v_fazenda_id    uuid;
  v_convite_token text;
  v_convite       public.convites%rowtype;
begin
  -- 1. usuarios — sempre criado, independente do branch de convite abaixo.
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'nome'), ''),
    new.email
  );

  v_convite_token := nullif(trim(new.raw_user_meta_data->>'convite_token'), '');

  if v_convite_token is not null then
    -- Signup com convite pendente (ADR-0002 D2): entra na fazenda
    -- existente do convite, não cria fazenda nova. `for update` trava a
    -- linha do convite pelo resto desta transação — mesma cautela contra
    -- corrida usada em aceitar_convite() (seção 3.1).
    begin
      select *
        into v_convite
        from public.convites
       where token = v_convite_token::uuid
       for update;
    exception
      when invalid_text_representation then
        raise exception 'convite_token inválido (formato incorreto)';
    end;

    if not found then
      raise exception 'Convite não encontrado para o token informado';
    end if;

    if v_convite.status <> 'pendente' then
      raise exception 'Convite não está mais pendente (status atual: %)', v_convite.status;
    end if;

    if v_convite.expires_at <= now() then
      raise exception 'Convite expirado';
    end if;

    -- Comparação contra new.email (dado da própria linha sendo inserida
    -- pelo GoTrue, não algo que o client possa forjar independentemente
    -- do e-mail real da conta) — ADR-0002 D2.
    --
    -- CORREÇÃO cyber_chief (gate ADR-0002): mesma classe de bug de NULL
    -- corrigida em aceitar_convite() (seção 3.1) — se new.email vier NULL
    -- (linha de auth.users criada sem e-mail; hoje improvável com signup
    -- por e-mail sendo o único provedor habilitado, mas não uma garantia
    -- do schema), `lower(NULL) <> lower(x)` avalia NULL, e `if NULL then`
    -- não dispara a exceção — permitiria entrar na fazenda do convite sem
    -- nenhuma correspondência real de e-mail. `new.email is null` checado
    -- explicitamente primeiro, fail-safe.
    if new.email is null or lower(v_convite.convidado_email) <> lower(new.email) then
      raise exception 'Convite não corresponde ao e-mail desta conta';
    end if;

    insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
    values (new.id, v_convite.fazenda_id, v_convite.papel_oferecido);

    update public.convites
       set status = 'aceito',
           accepted_at = now(),
           convidado_usuario_id = new.id
     where id = v_convite.id;

  else
    -- Sem convite pendente: comportamento do ADR-0001 preservado
    -- integralmente, com a única mudança sendo papel='admin' em vez de
    -- 'dono' (ADR-0002 D1). Fallback de nome_fazenda mantém a mesma
    -- justificativa já documentada na migration da Fase 1: bloquear o
    -- signup por um campo de UX secundário reintroduziria o mesmo risco
    -- que o trigger existe para eliminar.
    v_nome_fazenda := coalesce(
      nullif(trim(new.raw_user_meta_data->>'nome_fazenda'), ''),
      'Minha Fazenda'
    );

    insert into public.fazendas (usuario_id, nome)
    values (new.id, v_nome_fazenda)
    returning id into v_fazenda_id;

    insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
    values (new.id, v_fazenda_id, 'admin');
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Provisionamento de conta (ADR-0001, estendido por ADR-0002 D2). '
  'SECURITY DEFINER, chamada por on_auth_user_created (AFTER INSERT ON '
  'auth.users). Se raw_user_meta_data->>''convite_token'' presente: valida '
  '(pendente, não expirado, e-mail bate com new.email) e entra na fazenda '
  'existente do convite (papel = convite.papel_oferecido), marcando o '
  'convite como aceito — RAISE EXCEPTION bloqueia o signup se o token vier '
  'inválido/expirado/e-mail não bate. Se ausente: cria usuarios + fazendas '
  '+ usuarios_fazendas(papel=admin) na mesma transação do signup '
  '(comportamento original do ADR-0001, só papel=admin em vez de dono). '
  'Fallback de nome_fazenda = ''Minha Fazenda'' quando ausente/vazio '
  '(decisão do ADR-0001, inalterada).';
