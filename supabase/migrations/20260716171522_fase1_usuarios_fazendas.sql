-- ============================================================================
-- Migration: Fase 1 — Fundação de autenticação
-- Tabelas: usuarios, fazendas, usuarios_fazendas
-- Provisionamento de conta: trigger em auth.users (public.handle_new_user)
-- RLS: SELECT restrito ao próprio usuário/fazenda em todas as 3 tabelas;
--      UPDATE também, exceto em usuarios_fazendas (sem UPDATE — ver seção 3.3);
--      sem INSERT/DELETE para authenticated/anon (ver ADR-0001). usuarios e
--      fazendas têm ainda triggers de imutabilidade de coluna (seção 1) além
--      da RLS.
--
-- Referência: .agents/memory/adr/ADR-0001-provisionamento-conta.md
--             especificacao-sistema.md, seções 3.1 e 5.4
-- Autor: SOFIA (db_sage), a pedido do squad DMZ — 2026-07-16
-- Revisão de segurança: CONSTANTINE (cyber_chief) — 2026-07-16, ver
--   .agents/memory/log/2026-07-16-cyber_chief-review-fase1.md
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Função genérica de updated_at (padrão já usado no Eixo 1 original,
--    espec. seção 3.1: "trigger_set_updated_at()"). Criada aqui pois é a
--    primeira migration do projeto — nenhuma migration anterior a definiu.
-- ----------------------------------------------------------------------------
create or replace function public.trigger_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.trigger_set_updated_at() is
  'Trigger genérica: seta updated_at = now() em qualquer UPDATE. Reaproveitada '
  'em todas as tabelas do projeto que tiverem a coluna updated_at (padrão já '
  'usado no Eixo 1 original, ver especificacao-sistema.md secao 3.1).';


-- ============================================================================
-- 1. TABELAS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 public.usuarios
--     Espelha auth.users(id). Uma linha por usuário autenticado. Nunca é
--     criada pelo client (ver seção 4 desta migration) — só pela função de
--     provisionamento.
-- ----------------------------------------------------------------------------
create table public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.usuarios is
  'Espelho de auth.users, 1:1. Populada exclusivamente por public.handle_new_user() '
  '(trigger on_auth_user_created) — nenhum insert client-side é esperado ou permitido.';

create trigger set_updated_at
  before update on public.usuarios
  for each row
  execute function public.trigger_set_updated_at();

-- Guarda de imutabilidade — cyber_chief (Constantine), review de segurança
-- 2026-07-16: a policy usuarios_update_own (seção 3) autoriza UPDATE sem
-- restrição de coluna sobre a própria linha. `nome` é o único campo que a
-- aplicação legitimamente expõe como editável pelo próprio usuário. `id` é
-- FK 1:1 para auth.users e não deve mudar; `email` é espelho de
-- auth.users.email — se o client puder reescrevê-lo livremente, a linha em
-- public.usuarios pode divergir silenciosamente da identidade real em
-- auth.users, uma forma de spoofing de identidade em qualquer tela/relatório
-- futuro que exiba usuarios.email como se fosse a fonte da verdade;
-- `created_at` é dado de auditoria. Bloquear a mudança destes campos no
-- nível de trigger (não só via RLS) é defesa em profundidade: a garantia
-- sobrevive mesmo que uma migration futura afrouxe o WITH CHECK da policy
-- sem revisão de segurança.
create or replace function public.prevent_usuarios_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'usuarios.id não pode ser alterado';
  end if;
  if new.email is distinct from old.email then
    raise exception 'usuarios.email não pode ser alterado pelo client — é espelho de auth.users.email';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'usuarios.created_at não pode ser alterado';
  end if;
  return new;
end;
$$;

comment on function public.prevent_usuarios_identity_change() is
  'Guarda de imutabilidade para usuarios_update_own (RLS, seção 3): impede '
  'que o próprio usuário altere id/email/created_at via UPDATE, mesmo que a '
  'policy de RLS não restrinja colunas. email é espelho de auth.users; '
  'nome é o único campo pensado como editável pelo client. Achado do '
  'cyber_chief no security review de 2026-07-16, ver log correspondente.';

create trigger prevent_identity_change
  before update on public.usuarios
  for each row
  execute function public.prevent_usuarios_identity_change();


-- ----------------------------------------------------------------------------
-- 1.2 public.fazendas
--     Propriedade rural. Modelo atual (Fase 1-5): 1 usuário dono = 1 fazenda,
--     criada automaticamente no signup. `usuario_id` aqui é o dono original/
--     criador da fazenda (mantido por simplicidade e rastreabilidade), mas o
--     vínculo de ACESSO efetivo (inclusive para o próprio dono) é sempre via
--     usuarios_fazendas — é essa tabela que as policies de RLS consultam,
--     nunca fazendas.usuario_id diretamente, para já suportar N:N desde a
--     Fase 6 (papel Financeiro/Contábil) sem precisar alterar predicados de
--     RLS existentes.
-- ----------------------------------------------------------------------------
create table public.fazendas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fazendas is
  'Propriedade rural. usuario_id = dono/criador original; controle de acesso '
  'efetivo (RLS) é sempre via usuarios_fazendas, não via esta coluna, para '
  'suportar múltiplos papéis por fazenda desde já (ver spec seção 5.4).';

create index idx_fazendas_usuario_id on public.fazendas(usuario_id);

create trigger set_updated_at
  before update on public.fazendas
  for each row
  execute function public.trigger_set_updated_at();

-- Guarda de imutabilidade — cyber_chief (Constantine), review de segurança
-- 2026-07-16: a policy fazendas_update_vinculada (seção 3) autoriza UPDATE
-- sem restrição de coluna sobre qualquer fazenda vinculada ao usuário
-- (WITH CHECK só valida que o `id` da linha continua entre as fazendas
-- vinculadas — não valida os demais valores da linha resultante). Hoje
-- fazendas.usuario_id não é consultado por nenhuma policy de RLS (o
-- controle de acesso é sempre via usuarios_fazendas, ver comentário da
-- tabela acima), então reescrevê-lo não abre um caminho de acesso *hoje*.
-- Mesmo assim é bloqueado aqui, porque: (1) é dado de proveniência/auditoria
-- ("dono/criador original") e nada na aplicação legitima o próprio usuário
-- reescrevê-lo para um uuid arbitrário de outro usuarios.id; (2) é
-- exatamente o tipo de campo que um código futuro pode vir a usar como
-- atalho de autorização (`where usuario_id = auth.uid()`) sem revisar que
-- ele é client-writable — não queremos essa premissa quebrada silenciosa e
-- retroativamente. `id`/`created_at` são estruturais/auditoria pelo mesmo
-- motivo do guard equivalente em usuarios. `nome` (e updated_at, já
-- garantido por trigger_set_updated_at) seguem livres — é o único campo
-- editável real hoje (spec seção 5.3).
create or replace function public.prevent_fazendas_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'fazendas.id não pode ser alterado';
  end if;
  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'fazendas.usuario_id não pode ser alterado pelo client';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'fazendas.created_at não pode ser alterado';
  end if;
  return new;
end;
$$;

comment on function public.prevent_fazendas_identity_change() is
  'Guarda de imutabilidade para fazendas_update_vinculada (RLS, seção 3): '
  'impede troca de id/usuario_id/created_at via UPDATE, mesmo que a policy '
  'de RLS não restrinja colunas. usuario_id não é hoje usado por nenhuma '
  'policy (RLS é sempre via usuarios_fazendas), mas é bloqueado como defesa '
  'em profundidade contra uso futuro indevido desse campo como atalho de '
  'autorização. Achado do cyber_chief no security review de 2026-07-16, ver '
  'log correspondente.';

create trigger prevent_identity_change
  before update on public.fazendas
  for each row
  execute function public.prevent_fazendas_identity_change();


-- ----------------------------------------------------------------------------
-- 1.3 public.usuarios_fazendas
--     Tabela de vínculo N:N usuário↔fazenda com papel. Nasce pensada para o
--     papel "financeiro" da Fase 6 (spec seção 5.4), mesmo que hoje só
--     'dono' seja usado.
--
--     Decisão de modelagem — CHECK em vez de enum de banco para `papel`:
--     um `enum` do Postgres exige `ALTER TYPE ... ADD VALUE` para crescer, o
--     que (a) não pode rodar dentro de uma transação junto com outros
--     comandos DDL/DML na mesma migration em versões mais antigas do
--     Postgres, e (b) é uma alteração mais "pesada" de se revisar/reverter.
--     Um CHECK constraint sobre `text` é extensível trocando só a constraint
--     (uma migration pequena e reversível: `alter table ... drop constraint
--     ...; alter table ... add constraint ... check (papel in (...))`) sem
--     tocar no tipo de dado da coluna nem nas linhas existentes. Como a
--     Fase 6 já está mapeada para adicionar 'financeiro' a este mesmo campo,
--     CHECK é o trade-off certo aqui: menos "puro" que um enum, bem mais
--     barato de estender depois.
-- ----------------------------------------------------------------------------
create table public.usuarios_fazendas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  papel      text not null default 'dono'
             constraint usuarios_fazendas_papel_check
             check (papel in ('dono')),
             -- Fase 6 (spec seção 5.4): estender para
             -- check (papel in ('dono', 'financeiro'))
             -- via migration própria — não alterar o tipo da coluna, só a
             -- constraint (ver comentário acima).
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, fazenda_id)
);

comment on table public.usuarios_fazendas is
  'Vínculo N:N usuário↔fazenda com papel. Único registro por (usuario_id, '
  'fazenda_id). Hoje só papel=dono é criado (via handle_new_user); papel '
  'financeiro entra na Fase 6 (spec seção 5.4) estendendo a CHECK de papel, '
  'não o tipo da coluna.';

comment on constraint usuarios_fazendas_papel_check on public.usuarios_fazendas is
  'Restringe papel aos valores válidos hoje. Extensível: Fase 6 adiciona '
  '''financeiro'' trocando esta constraint (drop + add), sem migração de '
  'dados nem mudança de tipo — ver ADR-0001, critério de revisão 1.';

create index idx_usuarios_fazendas_usuario_id on public.usuarios_fazendas(usuario_id);
create index idx_usuarios_fazendas_fazenda_id on public.usuarios_fazendas(fazenda_id);

create trigger set_updated_at
  before update on public.usuarios_fazendas
  for each row
  execute function public.trigger_set_updated_at();


-- ============================================================================
-- 2. FUNÇÃO DE PROVISIONAMENTO (ADR-0001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.handle_new_user()
--
-- Executa em AFTER INSERT ON auth.users, como SECURITY DEFINER (role owner
-- da função, tipicamente postgres/supabase_admin nas migrations do Supabase,
-- que tem BYPASSRLS). Cria, na MESMA transação do insert em auth.users:
--   1. public.usuarios   (id = new.id)
--   2. public.fazendas   (nome vindo de raw_user_meta_data->>'nome_fazenda')
--   3. public.usuarios_fazendas (papel = 'dono', ligando as duas linhas acima)
--
-- Atomicidade: qualquer exceção aqui propaga e reverte TUDO, inclusive a
-- própria linha de auth.users (garantia do ADR-0001, seção [CONSEQUÊNCIAS]).
--
-- Decisão de implementação — fallback do nome da fazenda (ponto que o
-- ADR-0001 deixa em aberto, seção [Riscos a monitorar]):
--   Escolhido FALLBACK ('Minha Fazenda'), não erro bloqueante. Motivo: o
--   ADR já identifica que a alternativa ao trigger (Edge Function) foi
--   rejeitada justamente por criar uma janela onde auth.users existe sem as
--   3 linhas correspondentes; um `RAISE EXCEPTION` aqui por causa de um
--   campo de UX secundário (nome_fazenda ausente/vazio) reintroduziria esse
--   MESMO risco por outra porta — o usuário ficaria com um erro genérico de
--   signup do GoTrue e, pior, se o client não estiver 100% sincronizado
--   com o formulário (ex.: signup via magic link, criação administrativa
--   pelo dashboard, ou uma versão futura do form que esqueça de popular
--   `options.data`), o cadastro simplesmente nunca funcionaria — sem
--   nenhum caminho de recuperação para o usuário, que não tem como "tentar
--   de novo com o campo certo" numa tela que nem sabe que esse campo é
--   obrigatório no banco. Um fallback sensato é reversível e barato: o nome
--   da fazenda é um dado editável a qualquer momento em Configurações
--   (spec seção 5.3), então perder o nome "certo" no primeiro segundo não é
--   uma perda de integridade de dado, é só uma UX levemente pior num caso
--   de borda. Bloquear o signup inteiro por isso não seria proporcional ao
--   risco. Se o formulário de signup (Fase 1, `developer`) sempre popular
--   `options.data.nome_fazenda` corretamente, este fallback nunca deve
--   disparar na prática — é rede de segurança, não comportamento esperado.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome_fazenda text;
  v_fazenda_id   uuid;
begin
  -- Fallback do nome da fazenda: ver justificativa no comentário acima da
  -- função. NULLIF trata tanto ausência da chave quanto string vazia ('')
  -- como "não informado".
  v_nome_fazenda := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nome_fazenda'), ''),
    'Minha Fazenda'
  );

  -- 1. usuarios
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'nome'), ''),
    new.email
  );

  -- 2. fazendas
  insert into public.fazendas (usuario_id, nome)
  values (new.id, v_nome_fazenda)
  returning id into v_fazenda_id;

  -- 3. usuarios_fazendas — vínculo dono, mesma transação (ADR-0001)
  insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel)
  values (new.id, v_fazenda_id, 'dono');

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Provisionamento de conta (ADR-0001). SECURITY DEFINER, chamada por '
  'on_auth_user_created (AFTER INSERT ON auth.users). Cria usuarios + '
  'fazendas + usuarios_fazendas(papel=dono) na mesma transação do signup. '
  'Fallback de nome_fazenda = ''Minha Fazenda'' quando raw_user_meta_data '
  'não traz o campo (decisão documentada no corpo da função). ATENÇÃO: '
  'assume que todo signup cria fazenda nova — critério de revisão nº 1 do '
  'ADR-0001 quando o papel Financeiro/Contábil (Fase 6) for implementado.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

alter table public.usuarios enable row level security;
alter table public.fazendas enable row level security;
alter table public.usuarios_fazendas enable row level security;

-- ----------------------------------------------------------------------------
-- Ausência deliberada de policies de INSERT e DELETE (ADR-0001)
--
-- Nenhuma policy de INSERT ou DELETE é criada para os roles authenticated/
-- anon em usuarios, fazendas ou usuarios_fazendas. Isto NÃO é uma omissão:
-- é a decisão central do ADR-0001. As três tabelas são populadas
-- exclusivamente por public.handle_new_user(), que roda como SECURITY
-- DEFINER sob um role com BYPASSRLS (owner da função) — não como o usuário
-- final autenticado. RLS é default-deny no Postgres: sem uma policy
-- explícita de INSERT/DELETE para authenticated/anon, qualquer tentativa de
-- insert/delete direto do client nessas tabelas falha por padrão. Isso é o
-- comportamento desejado (elimina estruturalmente o risco nº 1 do
-- protótipo, ver ADR-0001 seção [CONSEQUÊNCIAS]) e deve ser validado por um
-- caso de teste explícito do cyber_chief ("insert direto do client
-- autenticado nessas 3 tabelas deve falhar"), não assumido implicitamente.
-- Se algum dia for necessário permitir DELETE de fazenda pelo próprio dono
-- (ex.: "excluir minha fazenda"), isso deve ser uma decisão nova, revisada
-- por db_sage + cyber_chief, não uma extensão automática das policies daqui.
-- ----------------------------------------------------------------------------

-- 3.1 usuarios — SELECT/UPDATE restritos à própria linha (auth.uid())
create policy usuarios_select_own
  on public.usuarios
  for select
  to authenticated
  using (id = auth.uid());

create policy usuarios_update_own
  on public.usuarios
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 3.2 fazendas — SELECT/UPDATE restritos às fazendas vinculadas ao usuário
--     via usuarios_fazendas (qualquer papel vinculado, não só 'dono' — a
--     Fase 6 adiciona 'financeiro' com acesso de leitura mais restrito por
--     módulo na camada de aplicação/telas, não nesta policy de tabela).
create policy fazendas_select_vinculada
  on public.fazendas
  for select
  to authenticated
  using (
    id in (
      select fazenda_id
      from public.usuarios_fazendas
      where usuario_id = auth.uid()
    )
  );

create policy fazendas_update_vinculada
  on public.fazendas
  for update
  to authenticated
  using (
    id in (
      select fazenda_id
      from public.usuarios_fazendas
      where usuario_id = auth.uid()
    )
  )
  with check (
    id in (
      select fazenda_id
      from public.usuarios_fazendas
      where usuario_id = auth.uid()
    )
  );

-- 3.3 usuarios_fazendas — SELECT restrito aos próprios vínculos do usuário
--     autenticado.
--
--     Ausência deliberada de policy de UPDATE (achado do cyber_chief,
--     security review de 2026-07-16 — ver
--     .agents/memory/log/2026-07-16-cyber_chief-review-fase1.md):
--
--     Uma versão anterior desta migration tinha uma policy
--     usuarios_fazendas_update_own permitindo UPDATE sem restrição de
--     coluna sobre a própria linha, incluindo a coluna `papel`. Hoje isso é
--     inofensivo porque usuarios_fazendas_papel_check só aceita
--     papel = 'dono' — não há para onde escalar. Mas o próprio critério de
--     revisão nº 1 do ADR-0001 e a spec seção 5.4 já mapeiam a Fase 6
--     estendendo essa CHECK para incluir 'financeiro' (papel de CONSULTA
--     restrita — sem acesso a manejo/GTAs/transações). No momento em que
--     essa CHECK for estendida, a policy antiga (como estava) deixaria
--     QUALQUER usuário com papel='financeiro' fazer, via API REST do
--     Supabase, um único UPDATE trocando seu próprio vínculo para
--     papel='dono' — escalação de privilégio horizontal→vertical dentro da
--     própria fazenda, contornando por completo a restrição de acesso que a
--     Fase 6 existe para impor. STRIDE: Elevation of Privilege. Impacto
--     hoje = zero (constraint bloqueia); impacto no dia em que a Fase 6 for
--     implementada sem revisitar esta policy = crítico.
--
--     Decisão: remover a policy de UPDATE inteiramente, não restringi-la
--     coluna a coluna. Motivo: não existe hoje (nem está previsto) nenhum
--     campo do próprio vínculo que o usuário deva poder editar por conta
--     própria — mudança de papel é sempre operação administrativa/de fluxo
--     de convite (Fase 6), nunca self-service. RLS é default-deny: sem
--     policy de UPDATE para authenticated/anon, qualquer tentativa de
--     UPDATE direto do client nesta tabela falha por padrão — mesmo padrão
--     já usado para INSERT/DELETE nesta mesma seção. Se um caso de uso real
--     de self-service update surgir no futuro (nenhum campo candidato
--     identificado até esta revisão), a policy deve ser recriada com
--     `with check` explícito por coluna sensível (nunca um `with check
--     (usuario_id = auth.uid())` genérico como antes) e revisada de novo
--     pelo cyber_chief antes de entrar — não reintroduzida por
--     conveniência/padronização com outras tabelas.
create policy usuarios_fazendas_select_own
  on public.usuarios_fazendas
  for select
  to authenticated
  using (usuario_id = auth.uid());
