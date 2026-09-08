-- =============================================================================
-- pgTAP — ALIGN-02 : onboarding_states, RLS, idempotence, quota Organizations
-- Transactionnel : aucun résidu en base (rollback final).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('a2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a2@kjora.test', now(), now(), now()),
  ('a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'other-a2@kjora.test', now(), now(), now()),
  ('a2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'unverified-a2@kjora.test', null, now(), now());

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------

select has_table('public', 'onboarding_states', 'onboarding_states existe');
select col_is_pk('public', 'onboarding_states', 'user_id', 'user_id est la clé primaire (une ligne par User)');
select has_column('public', 'onboarding_states', 'plan_intent', 'colonne plan_intent');
select has_column('public', 'onboarding_states', 'rent_collection_method', 'colonne rent_collection_method');
select has_column('public', 'onboarding_states', 'organization_id', 'colonne organization_id');
select has_column('public', 'onboarding_states', 'first_property_id', 'colonne first_property_id');
select has_column('public', 'onboarding_states', 'first_unit_id', 'colonne first_unit_id');
select has_column('public', 'onboarding_states', 'step', 'colonne step');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.onboarding_states'::regclass),
  'RLS activée sur onboarding_states'
);

select has_column('public', 'organization_profiles', 'rent_collection_method',
  'rent_collection_method ajoutée à organization_profiles');

-- ---------------------------------------------------------------------------
-- 2. Sécurité des fonctions
-- ---------------------------------------------------------------------------

select ok(
  (select prosecdef from pg_proc where oid = 'public.get_onboarding_state()'::regprocedure),
  'get_onboarding_state est SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.upsert_onboarding_state(text,text,uuid,uuid,uuid,text)'::regprocedure),
  'upsert_onboarding_state est SECURITY DEFINER'
);
select ok(
  (select proconfig::text like '%search_path=%'
   from pg_proc where oid = 'public.get_onboarding_state()'::regprocedure),
  'get_onboarding_state fixe search_path'
);
select ok(
  not has_function_privilege('anon', 'public.get_onboarding_state()', 'execute'),
  'anon ne peut pas exécuter get_onboarding_state'
);
select ok(
  not has_function_privilege('anon',
    'public.upsert_onboarding_state(text,text,uuid,uuid,uuid,text)', 'execute'),
  'anon ne peut pas exécuter upsert_onboarding_state'
);
select ok(
  not has_table_privilege('anon', 'public.onboarding_states', 'insert'),
  'anon ne peut pas insérer dans onboarding_states'
);
select ok(
  not has_table_privilege('authenticated', 'public.onboarding_states', 'insert'),
  'authenticated ne peut pas insérer directement (RPC obligatoire)'
);
select ok(
  not has_table_privilege('authenticated', 'public.onboarding_states', 'update'),
  'authenticated ne peut pas modifier directement (RPC obligatoire)'
);

-- ---------------------------------------------------------------------------
-- 3. Comportement du RPC — session User A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- État initial : aucune ligne
select is(
  (select public.get_onboarding_state() ->> 'exists'), 'false',
  'état initial : aucune ligne d''onboarding'
);
select is(
  (select public.get_onboarding_state() ->> 'step'), 'plan_intent',
  'étape initiale par défaut'
);

-- plan_intent valide enregistré
select is(
  (select public.upsert_onboarding_state(p_plan_intent := 'avance') ->> 'plan_intent'), 'avance',
  'un plan_intent valide est enregistré'
);

-- plan_intent invalide ignoré silencieusement, sans effacer l'existant
select is(
  (select public.upsert_onboarding_state(p_plan_intent := 'hacker_plan') ->> 'plan_intent'), 'avance',
  'un plan_intent invalide est ignoré sans erreur ni écrasement'
);

-- L'intention n'accorde aucun plan effectif
select is(
  (select count(*)::int from public.organization_plans
   where plan in ('essentiel', 'avance', 'patrimoine')
     and organization_id in (
       select organization_id from public.memberships
       where user_id = 'a2000000-0000-4000-8000-000000000001'
     )),
  0,
  'une intention payante n''active aucun plan payant'
);

-- Méthode d'encaissement invalide ignorée
select is(
  (select public.upsert_onboarding_state(p_rent_collection_method := 'bitcoin')
     ->> 'rent_collection_method'),
  null,
  'une méthode d''encaissement invalide est ignorée'
);
select is(
  (select public.upsert_onboarding_state(p_rent_collection_method := 'mtn_momo')
     ->> 'rent_collection_method'),
  'mtn_momo',
  'une méthode d''encaissement valide est enregistrée'
);

-- L'étape avance
select is(
  (select public.upsert_onboarding_state(p_step := 'property') ->> 'step'), 'property',
  'l''étape avance vers property'
);
-- ... mais ne recule jamais
select is(
  (select public.upsert_onboarding_state(p_step := 'organization') ->> 'step'), 'property',
  'l''étape ne recule jamais'
);

-- Organization non possédée refusée
select throws_ok(
  $$ select public.upsert_onboarding_state(
       p_organization_id := '26000000-0000-4000-8000-0000000000ff') $$,
  '42501',
  null,
  'une Organization non possédée est refusée'
);

-- ---------------------------------------------------------------------------
-- 4. Isolation entre Users
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select public.get_onboarding_state() ->> 'exists'), 'false',
  'un autre User ne voit pas l''état d''onboarding du premier'
);
select is(
  (select count(*)::int from public.onboarding_states), 0,
  'RLS : un User ne lit aucune ligne appartenant à autrui'
);

-- ---------------------------------------------------------------------------
-- 5. Quota Organizations sur create_organization
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Première Organization : toujours autorisée
select lives_ok(
  $$ select public.create_organization('Org ALIGN-02 A', 'fr', 'Africa/Douala') $$,
  'la première Organization est toujours autorisée'
);

-- Découverte attribué automatiquement par le trigger ALIGN-01
select is(
  (select p.plan from public.organization_plans p
   join public.memberships m on m.organization_id = p.organization_id
   where m.user_id = 'a2000000-0000-4000-8000-000000000001'
   order by p.assigned_at desc limit 1),
  'decouverte',
  'le plan Découverte est attribué automatiquement'
);

-- Seconde Organization : quota Découverte = 1 → refus
select throws_ok(
  $$ select public.create_organization('Org ALIGN-02 B', 'fr', 'Africa/Douala') $$,
  'P0001',
  'PLAN_ORGANIZATION_LIMIT_REACHED',
  'le quota Organizations est enforced sur create_organization'
);

-- Aucune Organization détruite par le refus
select is(
  (select count(*)::int from public.memberships
   where user_id = 'a2000000-0000-4000-8000-000000000001'
     and role = 'organization_owner' and status = 'active'),
  1,
  'le refus de quota ne supprime aucune Organization existante'
);

-- ---------------------------------------------------------------------------
-- 6. Identité non vérifiée
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.create_organization('Org non vérifiée', 'fr', 'Africa/Douala') $$,
  '42501',
  null,
  'une identité non vérifiée ne peut pas créer d''Organization'
);

reset role;

select * from finish();
rollback;
