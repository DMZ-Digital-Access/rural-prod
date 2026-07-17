-- ============================================================================
-- pgTAP: REGRESSÃO do achado nº 1 do gate cyber_chief no ADR-0002, aplicada
-- ao SEGUNDO local onde o mesmo bug existia — o branch de convite dentro de
-- handle_new_user() (trigger on_auth_user_created), não só aceitar_convite().
--
-- Bug original: `if new.email is null or lower(a) <> lower(new.email) then
-- raise exception` já tinha o `new.email is null` como primeira condição na
-- versão corrigida — mas a versão vulnerável testava só
-- `lower(a) <> lower(new.email)`, que com new.email NULL avalia NULL (não
-- dispara a exceção), permitindo que uma linha de auth.users criada SEM
-- e-mail entrasse na fazenda do convite sem nenhuma correspondência real de
-- identidade.
--
-- Cenário: convite pendente da fazenda-alvo, endereçado a um e-mail
-- específico. Inserimos uma linha em auth.users diretamente com email = NULL
-- e raw_user_meta_data->>'convite_token' apontando para esse convite —
-- dispara handle_new_user() na mesma transação do INSERT (AFTER INSERT ON
-- auth.users, mesma garantia de atomicidade do ADR-0001). Esperado: o INSERT
-- INTEIRO falha (a exceção propaga e reverte tudo, inclusive a linha de
-- auth.users — não sobra usuário órfão).
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(3);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin_vitima uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin_vitima, 'admin.vitima.005@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Vitima - 005', 'nome', 'Admin Vitima'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values ('admin_vitima', v_admin_vitima);
end;
$$;

insert into t_ids
select 'fazenda_vitima', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin_vitima');

create temporary table t_convite (id uuid, token uuid) on commit drop;
with ins as (
  insert into public.convites (fazenda_id, convidado_email, papel_oferecido, convidado_por)
  values (
    (select v from t_ids where k = 'fazenda_vitima'),
    'alvo.do.convite.005@teste.local',
    'admin',
    (select v from t_ids where k = 'admin_vitima')
  )
  returning id, token
)
insert into t_convite select id, token from ins;

select is(
  (select status from public.convites where id = (select id from t_convite)),
  'pendente',
  'setup: convite criado está pendente'
);

-- O TESTE MAIS IMPORTANTE deste arquivo: signup com convite_token válido,
-- mas new.email = NULL (linha de auth.users sem e-mail — hoje improvável
-- com signup por e-mail sendo o único provedor habilitado localmente, mas
-- não é uma garantia do schema, é só configuração — exatamente o ponto do
-- achado do cyber_chief). Deve falhar, e a falha deve reverter TUDO,
-- inclusive a própria linha de auth.users (garantia de atomicidade do
-- ADR-0001 preservada mesmo no caminho de erro).
select throws_ok(
  format(
    $$ insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
       values (gen_random_uuid(), null, jsonb_build_object('convite_token', %L::text),
               'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000') $$,
    (select token::text from t_convite)
  ),
  'P0001',
  'Convite não corresponde ao e-mail desta conta',
  'REGRESSÃO achado nº1 (cyber_chief/ADR-0002): handle_new_user() com new.email NULL e convite_token presente é rejeitado, não aceito silenciosamente'
);

-- Confirma que o convite continua pendente e não foi marcado como aceito —
-- a exceção reverteu tudo, sem efeito colateral algum (nem no convite, nem
-- em usuarios_fazendas).
select is(
  (select status from public.convites where id = (select id from t_convite)),
  'pendente',
  'convite continua pendente depois da tentativa de signup rejeitada (nenhum efeito colateral, atomicidade preservada)'
);

select * from finish();

rollback;
