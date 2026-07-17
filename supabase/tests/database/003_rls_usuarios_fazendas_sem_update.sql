-- ============================================================================
-- pgTAP: usuarios_fazendas nunca aceita UPDATE direto do client — nenhuma
-- policy de UPDATE existe (achado nº 1 do gate cyber_chief da Fase 1: a
-- policy antiga `usuarios_fazendas_update_own` foi removida por completo, não
-- restringida coluna a coluna, ver
-- .agents/memory/log/2026-07-16-cyber_chief-review-fase1.md). Testamos que
-- mesmo o próprio dono do vínculo, tentando mudar só `papel` (o campo que
-- seria a escalação de privilégio horizontal->vertical se a policy antiga
-- ainda existisse), é bloqueado — e que a mudança de papel só é possível via
-- promover_papel() (SECURITY DEFINER, testado em outro arquivo).
--
-- Nota de implementação: diferente de INSERT (arquivo 001, onde a ausência
-- de policy gera um erro 42501 explícito, porque a linha nova precisa passar
-- por um WITH CHECK que não existe), a ausência de policy de UPDATE não gera
-- exceção nenhuma — a cláusula USING implícita filtra a linha alvo para
-- "nenhuma linha visível", e o UPDATE simplesmente afeta 0 linhas, sem erro
-- (mesmo comportamento de um SELECT sem policy aplicável). Por isso os
-- testes abaixo não usam throws_ok(): verificam que o valor da coluna
-- permanece inalterado depois da tentativa de UPDATE, não que uma exceção
-- foi lançada.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(3);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_user_a uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_user_a, 'admin.a.003@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda A - 003', 'nome', 'Admin A'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('user_a', v_user_a);
end;
$$;

insert into t_ids
select 'fazenda_a', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'user_a');

grant select on t_ids to authenticated;

-- Sanity check do setup: handle_new_user() cria o vínculo com papel='admin'
-- (ADR-0002 D1/D2) — confirma que o cenário de teste está correto antes de
-- testar a ausência de UPDATE.
select is(
  (select papel from public.usuarios_fazendas
    where usuario_id = (select v from t_ids where k = 'user_a')),
  'admin',
  'setup: vínculo criado por handle_new_user() nasce com papel=admin'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'user_a'),
    'email', 'admin.a.003@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Tentativa mais "inofensiva" possível (mudar só updated_at) — mesmo assim
-- não deve ter efeito nenhum: sem policy de UPDATE, USING filtra a linha
-- para "não visível", o UPDATE roda mas afeta 0 linhas, sem erro.
update public.usuarios_fazendas
   set updated_at = now() + interval '1 day'
 where usuario_id = (select v from t_ids where k = 'user_a');

select ok(
  (select updated_at <= now()
     from public.usuarios_fazendas
    where usuario_id = (select v from t_ids where k = 'user_a')),
  'update trivial (updated_at) em usuarios_fazendas não teve efeito — sem policy de UPDATE nenhuma (RLS default-deny), updated_at não foi movido para o futuro'
);

-- A tentativa que a policy antiga (removida pelo cyber_chief) teria
-- permitido: o próprio usuário promovendo a si mesmo trocando `papel`
-- diretamente, sem passar por promover_papel(). Precisa continuar
-- impossível, com ou sem CHECK de papel estendida no futuro.
update public.usuarios_fazendas
   set papel = 'admin'  -- já é admin; o ponto é que mesmo um UPDATE "idempotente" não deve rodar de verdade
 where usuario_id = (select v from t_ids where k = 'user_a');

-- Reset role para conseguir alterar o cenário de forma controlada e provar
-- que a tabela de fato não mudou via nenhum caminho client-side: usamos uma
-- tentativa real de rebaixamento (que seria a exploração real do achado
-- nº 1) e confirmamos que continua 'admin' depois.
set local role authenticated;
update public.usuarios_fazendas
   set papel = 'membro'
 where usuario_id = (select v from t_ids where k = 'user_a');

select is(
  (select papel from public.usuarios_fazendas
    where usuario_id = (select v from t_ids where k = 'user_a')),
  'admin',
  'update de usuarios_fazendas.papel pelo próprio usuário não teve efeito nenhum — regressão do achado nº 1 (elevação de privilégio horizontal->vertical) do gate cyber_chief Fase 1'
);

select * from finish();

rollback;
