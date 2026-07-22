-- ============================================================================
-- Migration: reestrutura declaracoes_rebanho — 1 declaração por (fazenda,
--            ano), com detalhamento de espécie/quantidade em tabela filha
--
-- CORREÇÃO DE MODELAGEM (pedido de JP, 2026-07-22, discussão de UX): a
-- Declaração Anual de Rebanho é entregue à Secretaria Estadual de
-- Agricultura como UM ÚNICO DOCUMENTO por ano, contemplando todas as
-- espécies do rebanho dentro dele. O desenho original (migration
-- 20260720150000_fase3_financeiro_declaracoes_prazos.sql) modelava errado —
-- uma linha por (fazenda, espécie, ano), cada uma com seu próprio status/
-- data de envio/PDF, como se cada espécie gerasse uma declaração separada.
-- Na prática isso faria o usuário "enviar" e anexar o MESMO comprovante uma
-- vez por espécie.
--
-- Migração limpa: tabela `declaracoes_rebanho` estava vazia em produção no
-- momento desta migration (confirmado por `select count(*)` antes de
-- escrever isto) — sem necessidade de migração de dado, só de schema.
--
-- Nova modelagem:
--   - `declaracoes_rebanho` (pai, alterada aqui): 1 linha por (fazenda,
--     ano) — status/data de envio/PDF vivem aqui, no documento como um
--     todo. Perde `especie_id`/`quantidade_declarada`.
--   - `declaracoes_rebanho_itens` (filha, nova): quantidade declarada por
--     espécie, N linhas por declaração — unique(declaracao_id, especie_id)
--     evita duplicar a mesma espécie duas vezes no mesmo documento.
--
-- DELETE em `declaracoes_rebanho_itens` é permitido pra quem pode editar a
-- declaração (admin/membro) — remover uma espécie do detalhamento (ex.:
-- incluída por engano) é diferente de apagar a declaração inteira, que
-- continua proibido no pai (spec, item 9 da seção 9 — decisão não revisada
-- por esta migration).
--
-- RPC `criar_declaracao_rebanho()` nova — cria o pai + N itens numa única
-- chamada atômica (cada invocação de RPC via PostgREST já roda dentro de
-- uma transação própria; sem isso, o client precisaria de 2+ chamadas
-- sequenciais com risco real de criar o pai e falhar nos itens, deixando
-- uma declaração "vazia" pra trás). SECURITY INVOKER — os INSERTs de
-- dentro da função continuam sujeitos às policies de RLS de quem chamou,
-- sem elevação de privilégio (mesmo princípio de mínimo privilégio já
-- usado em toda Edge Function/RPC deste projeto que não precisa de
-- SECURITY DEFINER).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reestrutura o pai.
-- ----------------------------------------------------------------------------
alter table public.declaracoes_rebanho
  drop constraint declaracoes_rebanho_fazenda_id_especie_id_ano_referencia_key;

alter table public.declaracoes_rebanho
  drop constraint declaracoes_rebanho_especie_id_fkey;

alter table public.declaracoes_rebanho
  drop constraint declaracoes_rebanho_quantidade_nao_negativa;

alter table public.declaracoes_rebanho
  drop column especie_id,
  drop column quantidade_declarada;

alter table public.declaracoes_rebanho
  add constraint declaracoes_rebanho_fazenda_id_ano_referencia_key
  unique (fazenda_id, ano_referencia);

comment on table public.declaracoes_rebanho is
  'Declaração Anual de Rebanho à Secretaria Estadual de Agricultura — UM '
  'DOCUMENTO por (fazenda, ano) (corrigido em 2026-07-22 — migration '
  '20260722100000; antes era uma linha por espécie/ano, modelagem errada). '
  'O detalhamento de quantidade por espécie vive em '
  '`declaracoes_rebanho_itens`. unique(fazenda_id, ano_referencia) — uma '
  'declaração por ano; correção é via UPDATE da própria linha/seus itens, '
  'nunca uma segunda linha pro mesmo ano. arquivo_pdf_path/status/data_envio '
  'descrevem o documento como um todo. SEM policy de DELETE (spec, item 9 '
  'da seção 9: "declarações anuais nunca devem ser apagáveis pelo '
  'usuário"). SELECT liberado pra papel=financeiro (spec 5.4), '
  'INSERT/UPDATE só admin/membro.';

-- ----------------------------------------------------------------------------
-- 2. Tabela filha — quantidade declarada por espécie, dentro de uma
--    declaração.
-- ----------------------------------------------------------------------------
create table public.declaracoes_rebanho_itens (
  id                   uuid primary key default gen_random_uuid(),
  declaracao_id        uuid not null references public.declaracoes_rebanho(id) on delete cascade,
  especie_id           uuid not null references public.especies(id) on delete restrict,
  quantidade_declarada integer not null
                       constraint declaracoes_rebanho_itens_quantidade_nao_negativa
                       check (quantidade_declarada >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (declaracao_id, especie_id)
);

comment on table public.declaracoes_rebanho_itens is
  'Quantidade declarada por espécie, dentro de uma Declaração Anual '
  '(public.declaracoes_rebanho) — várias linhas por declaração, uma por '
  'espécie incluída no documento. unique(declaracao_id, especie_id) — não '
  'duplica a mesma espécie duas vezes na mesma declaração. DELETE permitido '
  'pra quem pode editar a declaração (admin/membro): remover uma espécie do '
  'detalhamento é diferente de apagar a declaração inteira (proibido no '
  'pai).';

create index idx_declaracoes_rebanho_itens_declaracao_id
  on public.declaracoes_rebanho_itens(declaracao_id);
create index idx_declaracoes_rebanho_itens_especie_id
  on public.declaracoes_rebanho_itens(especie_id);

create trigger set_updated_at
  before update on public.declaracoes_rebanho_itens
  for each row
  execute function public.trigger_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS da tabela filha — mesma fronteira do pai (financeiro só SELECT,
--    admin/membro escreve), via join em declaracao_id (a filha não tem
--    fazenda_id direto, então a policy verifica através do pai).
-- ----------------------------------------------------------------------------
alter table public.declaracoes_rebanho_itens enable row level security;

create policy declaracoes_rebanho_itens_select_vinculada
  on public.declaracoes_rebanho_itens
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.declaracoes_rebanho d
       where d.id = declaracao_id
         and d.fazenda_id in (
           select fazenda_id from public.usuarios_fazendas
            where usuario_id = auth.uid()
         )
    )
  );

create policy declaracoes_rebanho_itens_insert_vinculada
  on public.declaracoes_rebanho_itens
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.declaracoes_rebanho d
       where d.id = declaracao_id
         and d.fazenda_id in (
           select fazenda_id from public.usuarios_fazendas
            where usuario_id = auth.uid() and papel <> 'financeiro'
         )
    )
  );

create policy declaracoes_rebanho_itens_update_vinculada
  on public.declaracoes_rebanho_itens
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.declaracoes_rebanho d
       where d.id = declaracao_id
         and d.fazenda_id in (
           select fazenda_id from public.usuarios_fazendas
            where usuario_id = auth.uid() and papel <> 'financeiro'
         )
    )
  )
  with check (
    exists (
      select 1
        from public.declaracoes_rebanho d
       where d.id = declaracao_id
         and d.fazenda_id in (
           select fazenda_id from public.usuarios_fazendas
            where usuario_id = auth.uid() and papel <> 'financeiro'
         )
    )
  );

create policy declaracoes_rebanho_itens_delete_vinculada
  on public.declaracoes_rebanho_itens
  for delete
  to authenticated
  using (
    exists (
      select 1
        from public.declaracoes_rebanho d
       where d.id = declaracao_id
         and d.fazenda_id in (
           select fazenda_id from public.usuarios_fazendas
            where usuario_id = auth.uid() and papel <> 'financeiro'
         )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. criar_declaracao_rebanho() — cria o pai + N itens atomicamente.
--    SECURITY INVOKER: os INSERTs continuam sujeitos às policies de RLS de
--    quem chamou (sem elevação de privilégio) — a função só existe pra
--    empacotar as duas escritas na mesma transação da chamada RPC.
-- ----------------------------------------------------------------------------
create or replace function public.criar_declaracao_rebanho(
  p_fazenda_id      uuid,
  p_ano_referencia  integer,
  p_data_declaracao date,
  p_itens           jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_declaracao_id uuid;
  v_item          jsonb;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'informe ao menos uma espécie com quantidade declarada';
  end if;

  insert into public.declaracoes_rebanho (fazenda_id, ano_referencia, data_declaracao)
  values (p_fazenda_id, p_ano_referencia, p_data_declaracao)
  returning id into v_declaracao_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.declaracoes_rebanho_itens (declaracao_id, especie_id, quantidade_declarada)
    values (
      v_declaracao_id,
      (v_item ->> 'especie_id')::uuid,
      (v_item ->> 'quantidade_declarada')::integer
    );
  end loop;

  return v_declaracao_id;
end;
$$;

comment on function public.criar_declaracao_rebanho(uuid, integer, date, jsonb) is
  'Cria uma declaração anual (pai) + seus itens de espécie/quantidade '
  '(filhos) numa única chamada atômica — evita o risco de criar o pai e '
  'falhar nos itens em chamadas separadas, deixando uma declaração vazia. '
  'SECURITY INVOKER: os 2 INSERTs continuam sujeitos à RLS de quem chamou '
  '(policies "_insert_vinculada" de ambas as tabelas), sem elevação de '
  'privilégio. `p_itens` é um array JSON de '
  '{"especie_id": "...", "quantidade_declarada": N}.';

revoke all on function public.criar_declaracao_rebanho(uuid, integer, date, jsonb) from public;
grant execute on function public.criar_declaracao_rebanho(uuid, integer, date, jsonb) to authenticated;
