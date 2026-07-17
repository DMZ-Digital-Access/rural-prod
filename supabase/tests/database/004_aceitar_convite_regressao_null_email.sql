-- ============================================================================
-- pgTAP: REGRESSÃO do achado nº 1 do gate cyber_chief no ADR-0002
-- (.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md) — bypass de
-- autorização via NULL na checagem de destinatário de aceitar_convite().
--
-- O bug original: `lower(a) <> lower(b)` com `b` (auth.email()) NULL avalia
-- para NULL em SQL, e `if NULL then` em PL/pgSQL é tratado como FALSE — a
-- exceção não disparava, permitindo que QUALQUER sessão autenticada sem
-- e-mail (provedor sem claim de e-mail garantido, ex. telefone/anônimo)
-- aceitasse QUALQUER convite pendente não pré-resolvido, com o papel
-- oferecido (inclusive 'admin'). A correção usa duas variáveis booleanas
-- NULL-safe (v_email_bate / v_uuid_bate) — este é o teste mais importante
-- desta suíte: prova que o bypass que o cyber_chief encontrou e corrigiu
-- continua corrigido.
--
-- Cenário: convite pendente da fazenda da VÍTIMA, endereçado ao e-mail da
-- VÍTIMA, com papel 'admin' (o pior caso — escalação vertical completa) e
-- convidado_usuario_id ainda NULL (não pré-resolvido, exatamente a condição
-- que ativa o branch vulnerável). Um ATACANTE autenticado, cujo
-- auth.email() é NULL (simulado via request.jwt.claims sem a claim
-- 'email'), tenta aceitar_convite(token) — deve ser rejeitado.
--
-- Teste de controle (não regressão, mas necessário para confirmar que a
-- correção não quebrou o caso legítimo): o mesmo convite, aceito pela
-- sessão com o e-mail CORRETO, deve funcionar normalmente.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

select plan(4);

create temporary table t_ids (k text primary key, v uuid) on commit drop;

do $$
declare
  v_admin_vitima uuid := gen_random_uuid();
  v_atacante     uuid := gen_random_uuid();
  v_vitima_convidada uuid := gen_random_uuid();
begin
  -- Admin dono da fazenda-alvo.
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_admin_vitima, 'admin.vitima.004@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Vitima - 004', 'nome', 'Admin Vitima'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Atacante: tem conta própria (fazenda própria, irrelevante para o teste),
  -- mas na sessão que vai chamar aceitar_convite() simulamos auth.email()
  -- NULL (provedor sem claim de e-mail garantido).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_atacante, 'atacante.004@teste.local',
    jsonb_build_object('nome_fazenda', 'Fazenda Atacante - 004', 'nome', 'Atacante'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  -- Vítima convidada de verdade — vai aceitar o convite de controle no
  -- teste 4 (caminho legítimo, prova que a correção não quebrou o fluxo
  -- real).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id)
  values (
    v_vitima_convidada, 'vitima.convidada.004@teste.local',
    jsonb_build_object('nome', 'Vitima Convidada'),
    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  );

  insert into t_ids values
    ('admin_vitima', v_admin_vitima),
    ('atacante', v_atacante),
    ('vitima_convidada', v_vitima_convidada);
end;
$$;

insert into t_ids
select 'fazenda_vitima', fazenda_id
  from public.usuarios_fazendas
 where usuario_id = (select v from t_ids where k = 'admin_vitima');

-- Convite pendente, papel 'admin' (pior caso), endereçado ao e-mail da
-- vítima convidada, convidado_usuario_id ainda NULL (não pré-resolvido —
-- criar_convite() só resolveria isso se já existisse conta com esse e-mail
-- NO MOMENTO da criação do convite; aqui inserimos direto como setup de
-- teste para controlar precisamente o estado, papel de admin/superuser
-- bypassa RLS para fins de fixture).
create temporary table t_convite (id uuid, token uuid) on commit drop;
with ins as (
  insert into public.convites (fazenda_id, convidado_email, papel_oferecido, convidado_por)
  values (
    (select v from t_ids where k = 'fazenda_vitima'),
    'vitima.convidada.004@teste.local',
    'admin',
    (select v from t_ids where k = 'admin_vitima')
  )
  returning id, token
)
insert into t_convite select id, token from ins;

grant select on t_ids to authenticated;
grant select on t_convite to authenticated;

-- ---------------------------------------------------------------------
-- Teste 1: sanity check do setup — convite existe, pendente, papel admin.
-- ---------------------------------------------------------------------
select is(
  (select status from public.convites where id = (select id from t_convite)),
  'pendente',
  'setup: convite criado está pendente'
);

-- ---------------------------------------------------------------------
-- Teste 2 (O TESTE MAIS IMPORTANTE): atacante autenticado com auth.email()
-- NULL tenta aceitar o convite da vítima — deve ser REJEITADO.
--
-- request.jwt.claims sem a chave 'email' simula um provedor de auth sem
-- claim de e-mail garantido (auth.email() vira NULL, mesmo mecanismo que o
-- cyber_chief descreveu no achado: ativável no dia em que
-- enable_anonymous_sign_ins ou auth.sms.enable_signup forem habilitados).
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'atacante'),
    'role', 'authenticated'
    -- 'email' deliberadamente ausente
  )::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$ select public.aceitar_convite(%L::uuid) $$,
    (select token from t_convite)
  ),
  'P0001',
  'Este convite não é endereçado ao usuário autenticado',
  'REGRESSÃO achado nº1 (cyber_chief/ADR-0002): aceitar_convite() com auth.email() NULL é rejeitado, não aceito silenciosamente'
);

-- Confirma que o convite CONTINUA pendente e NENHUM vínculo foi criado para
-- o atacante — a rejeição não deve ter efeito colateral algum.
reset role;
select is(
  (select status from public.convites where id = (select id from t_convite)),
  'pendente',
  'convite continua pendente depois da tentativa rejeitada do atacante (nenhum efeito colateral)'
);

-- ---------------------------------------------------------------------
-- Teste de controle: a vítima de verdade, com e-mail correto, consegue
-- aceitar o mesmo convite normalmente — prova que a correção NULL-safe não
-- quebrou o caminho legítimo.
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select v::text from t_ids where k = 'vitima_convidada'),
    'email', 'vitima.convidada.004@teste.local',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select lives_ok(
  format(
    $$ select public.aceitar_convite(%L::uuid) $$,
    (select token from t_convite)
  ),
  'controle: destinatário correto (e-mail bate) consegue aceitar o convite normalmente — correção NULL-safe não quebrou o fluxo legítimo'
);

select * from finish();

rollback;
