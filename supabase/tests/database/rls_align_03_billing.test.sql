-- =============================================================================
-- pgTAP — ALIGN-03 Billing SaaS : structure, RLS, isolation, verrou de blocage
-- Transactionnel : aucun résidu en base (rollback final).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- ---------------------------------------------------------------------------
-- Fixture : deux Organizations distinctes + un manager sans billing.view
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('a3000000-0000-4000-8000-000000000001','authenticated','authenticated','ownA-a3@kjora.test',now(),now(),now()),
  ('a3000000-0000-4000-8000-000000000002','authenticated','authenticated','ownB-a3@kjora.test',now(),now(),now()),
  ('a3000000-0000-4000-8000-000000000003','authenticated','authenticated','mgrA-a3@kjora.test',now(),now(),now());

insert into public.organizations (id, created_by) values
  ('a3000000-0000-4000-8000-0000000000aa','a3000000-0000-4000-8000-000000000001'),
  ('a3000000-0000-4000-8000-0000000000bb','a3000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('a3000000-0000-4000-8000-0000000000aa','Org A3 A'),
  ('a3000000-0000-4000-8000-0000000000bb','Org A3 B');
insert into public.memberships (organization_id, user_id, role) values
  ('a3000000-0000-4000-8000-0000000000aa','a3000000-0000-4000-8000-000000000001','organization_owner'),
  ('a3000000-0000-4000-8000-0000000000bb','a3000000-0000-4000-8000-000000000002','organization_owner'),
  ('a3000000-0000-4000-8000-0000000000aa','a3000000-0000-4000-8000-000000000003','manager');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('a3000000-0000-4000-8000-0000000000c1','a3000000-0000-4000-8000-0000000000aa','Bien A3','Douala','house','a3000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------

select has_table('public','organization_subscriptions','table organization_subscriptions');
select has_table('public','billing_invoices','table billing_invoices');
select has_table('public','billing_payment_attempts','table billing_payment_attempts');
select has_table('public','billing_events','table billing_events');
select has_table('public','billing_prices','table billing_prices');
select col_is_pk('public','organization_subscriptions','organization_id','un abonnement par Organization');

select ok(
  (select relrowsecurity from pg_class where oid='public.organization_subscriptions'::regclass),
  'RLS active sur organization_subscriptions');
select ok(
  (select relrowsecurity from pg_class where oid='public.billing_invoices'::regclass),
  'RLS active sur billing_invoices');

-- ---------------------------------------------------------------------------
-- 2. Étanchéité avec le domaine loyer
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.constraint_column_usage ccu
     join information_schema.table_constraints tc
       on tc.constraint_name = ccu.constraint_name
   where tc.table_schema='public'
     and tc.table_name in ('organization_subscriptions','billing_invoices',
                           'billing_payment_attempts','billing_events')
     and tc.constraint_type='FOREIGN KEY'
     and ccu.table_name in ('payments','dues','ledger_entries','financial_documents')),
  0, 'aucune clé étrangère du billing vers le domaine loyer');

-- ---------------------------------------------------------------------------
-- 3. Prix canoniques
-- ---------------------------------------------------------------------------

select is((select amount_minor from public.billing_prices
  where plan='essentiel' and cycle='monthly' and currency='XAF'), 5900::bigint,
  'Essentiel mensuel XAF = 5 900');
select is((select amount_minor from public.billing_prices
  where plan='avance' and cycle='monthly' and currency='XAF'), 12900::bigint,
  'Avancé mensuel XAF = 12 900');
select is((select amount_minor from public.billing_prices
  where plan='patrimoine' and cycle='annual' and currency='XAF'), 249000::bigint,
  'Patrimoine annuel XAF = 249 000');
select is((select amount_minor from public.billing_prices
  where plan='essentiel' and cycle='annual' and currency='CAD'), 14990::bigint,
  'Essentiel annuel CAD = 149,90');
select ok((select amount_minor is null from public.billing_prices
  where plan='sur_mesure' and cycle='monthly' and currency='XAF'),
  'Sur mesure sans prix catalogue');
select is((select count(*)::int from public.billing_prices where currency not in ('XAF','CAD')),
  0, 'aucune devise non canonisée (ni EUR ni USD)');

-- ---------------------------------------------------------------------------
-- 4. Sécurité des fonctions
-- ---------------------------------------------------------------------------

select ok((select prosecdef from pg_proc
  where oid='public.get_billing_overview(uuid)'::regprocedure),
  'get_billing_overview est SECURITY DEFINER');
select ok((select prosecdef from pg_proc
  where oid='public.request_plan_change(uuid,text,text)'::regprocedure),
  'request_plan_change est SECURITY DEFINER');
select ok(not has_function_privilege('anon','public.request_plan_change(uuid,text,text)','execute'),
  'anon ne peut pas changer de plan');
select ok(not has_function_privilege('anon','public.cancel_subscription(uuid)','execute'),
  'anon ne peut pas annuler');
select ok(not has_table_privilege('authenticated','public.organization_subscriptions','insert'),
  'aucune écriture client directe sur les abonnements');
select ok(not has_table_privilege('authenticated','public.billing_invoices','update'),
  'aucune modification client directe des factures');

-- ---------------------------------------------------------------------------
-- 5. Comportement — Owner A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select public.get_billing_overview('a3000000-0000-4000-8000-0000000000aa') ->> 'effectivePlan'),
  'decouverte', 'plan effectif par défaut = Découverte');

select is(
  (select public.get_billing_overview('a3000000-0000-4000-8000-0000000000aa')
     -> 'subscription' ->> 'status'),
  'free', 'statut par défaut = free, sans provider ni carte');

-- Upgrade : intention enregistrée, aucun plan activé
select is(
  (select public.request_plan_change('a3000000-0000-4000-8000-0000000000aa','avance','monthly')
     ->> 'outcome'),
  'upgrade_intent_recorded', 'un upgrade enregistre une intention');

select is(
  (select plan from public.organization_plans
    where organization_id='a3000000-0000-4000-8000-0000000000aa'),
  'decouverte', 'le plan EFFECTIF reste inchangé après une intention d''upgrade');

select is(
  (select public.get_billing_overview('a3000000-0000-4000-8000-0000000000aa')
     -> 'subscription' ->> 'pendingPlan'),
  'avance', 'l''intention est conservée');

-- Sur mesure : devis commercial
select is(
  (select public.request_plan_change('a3000000-0000-4000-8000-0000000000aa','sur_mesure','monthly')
     ->> 'outcome'),
  'quote_required', 'Sur mesure passe par un devis');

-- ---------------------------------------------------------------------------
-- 6. Isolation entre Organizations
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$ select public.get_billing_overview('a3000000-0000-4000-8000-0000000000bb') $q$,
  '42501', null, 'Owner A ne lit pas la facturation d''Owner B');

select throws_ok(
  $q$ select public.request_plan_change('a3000000-0000-4000-8000-0000000000bb','avance','monthly') $q$,
  '42501', null, 'Owner A ne modifie pas l''abonnement d''Owner B');

select is((select count(*)::int from public.organization_subscriptions), 1,
  'Owner A ne voit que son propre abonnement');

-- Le manager n'a pas billing.view
set local request.jwt.claims to '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.organization_subscriptions), 0,
  'un manager sans billing.view ne voit aucun abonnement');
select throws_ok(
  $q$ select public.get_billing_overview('a3000000-0000-4000-8000-0000000000aa') $q$,
  '42501', null, 'un manager ne consulte pas la facturation');

-- ---------------------------------------------------------------------------
-- 7. Verrou de blocage
-- ---------------------------------------------------------------------------

reset role;
update public.organization_subscriptions
   set status='billing_blocked', blocked_at=now()
 where organization_id='a3000000-0000-4000-8000-0000000000aa';

select is(private.billing_status('a3000000-0000-4000-8000-0000000000aa'), 'billing_blocked',
  'le compte est bloqué');

select throws_ok(
  $q$ insert into public.properties (organization_id, name, locality, type, created_by)
      values ('a3000000-0000-4000-8000-0000000000aa','Bien interdit','Douala','house',
              'a3000000-0000-4000-8000-000000000001') $q$,
  'P0001', 'BILLING_BLOCKED', 'aucune création de bien pendant le blocage');

-- Fixture volontairement valide : on teste le verrou, pas une contrainte NOT NULL.
select throws_ok(
  $q$ insert into public.tenants (organization_id, full_name, created_by)
      values ('a3000000-0000-4000-8000-0000000000aa','Locataire interdit',
              'a3000000-0000-4000-8000-000000000001') $q$,
  'P0001', 'BILLING_BLOCKED', 'aucune création de locataire pendant le blocage');

-- Le verrou est bien posé sur les tables du domaine loyer, y compris payments.
select is(
  (select count(*)::int from pg_trigger t
    where t.tgname = 'billing_blocked_insert_guard'
      and t.tgrelid in ('public.payments'::regclass, 'public.dues'::regclass,
                        'public.ledger_entries'::regclass, 'public.payment_allocations'::regclass)),
  4, 'le verrou couvre payments, dues, ledger_entries et payment_allocations');

select is(
  (select count(*)::int from pg_trigger t
    where t.tgname = 'billing_blocked_update_guard'
      and t.tgrelid = 'public.ledger_entries'::regclass),
  1, 'le Ledger est aussi protégé en modification');

select is(
  (select count(*)::int from public.properties
    where organization_id='a3000000-0000-4000-8000-0000000000aa'),
  1, 'les données existantes sont conservées pendant le blocage');

select ok(not private.is_billing_blocked('a3000000-0000-4000-8000-0000000000bb'),
  'le blocage d''une Organization n''affecte pas les autres');

select * from finish();
rollback;
