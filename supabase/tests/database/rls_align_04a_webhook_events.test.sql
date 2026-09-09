-- =============================================================================
-- pgTAP — ALIGN-04A.2 : journal des webhooks provider (billing_webhook_events)
-- Transactionnel : la migration est appliquée ICI, testée, puis annulée.
-- Aucun résidu en base quelle que soit l'issue (rollback final).
-- Validé 21/21 en transaction annulée contre le schéma Production réel avant
-- déploiement (voir docs/product/KJORA-BILLING-PROVIDER-ARCHITECTURE-v0.1.md §12).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Migration ALIGN-04A sous test (corps identique à
-- supabase/migrations/20260909120000_align_04a_billing_webhook_events.sql,
-- sans son propre begin/commit puisque cette transaction les fournit).
-- ---------------------------------------------------------------------------

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    constraint billing_webhook_events_provider_check
    check (provider in ('stripe','campay','flutterwave','payunit','elyonpay','notchpay')),
  provider_event_id text not null,
  event_type text not null,
  mode text not null default 'sandbox'
    constraint billing_webhook_events_mode_check check (mode in ('sandbox','live')),
  organization_id uuid references public.organizations (id) on delete set null,
  disposition text not null
    constraint billing_webhook_events_disposition_check
    check (disposition in ('ignore_duplicate','acknowledge_unhandled','reject','apply')),
  disposition_reason text,
  payload_digest text not null,
  signature_verified boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_webhook_events_unique_event unique (provider, provider_event_id)
);

create index if not exists billing_webhook_events_org_idx
  on public.billing_webhook_events (organization_id, received_at desc)
  where organization_id is not null;

create index if not exists billing_webhook_events_received_idx
  on public.billing_webhook_events (received_at desc);

alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;

comment on table public.billing_webhook_events is
  'ALIGN-04A — journal des webhooks provider. Unicité (provider, provider_event_id) '
  'garantissant l''idempotence. Aucun accès client. Aucun secret stocké.';

select plan(21);

-- ---------------------------------------------------------------------------
-- Fixture : une Organization de test dédiée, isolée par préfixe a4a
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('a4a00000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a4a@kjora.test',now(),now(),now());
insert into public.organizations (id, created_by) values
  ('a4a00000-0000-4000-8000-0000000000aa','a4a00000-0000-4000-8000-000000000001');
insert into public.organization_profiles (organization_id, name) values
  ('a4a00000-0000-4000-8000-0000000000aa','Org A4A Webhook Test');
insert into public.memberships (organization_id, user_id, role) values
  ('a4a00000-0000-4000-8000-0000000000aa','a4a00000-0000-4000-8000-000000000001','organization_owner');

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------

select has_table('public','billing_webhook_events','table billing_webhook_events');
select col_is_pk('public','billing_webhook_events','id','id est la clé primaire');
select has_index('public','billing_webhook_events','billing_webhook_events_org_idx','index organisation');
select has_index('public','billing_webhook_events','billing_webhook_events_received_idx','index réception');

select ok(
  (select relrowsecurity from pg_class where oid='public.billing_webhook_events'::regclass),
  'RLS active sur billing_webhook_events');

select is(
  (select count(*)::int from pg_policies where schemaname='public' and tablename='billing_webhook_events'),
  0, 'aucune policy — RLS + zéro policy interdit tout accès sans rôle élevé');

select ok(not has_table_privilege('anon','public.billing_webhook_events','select'),
  'anon ne peut pas lire le journal');
select ok(not has_table_privilege('anon','public.billing_webhook_events','insert'),
  'anon ne peut pas écrire le journal');
select ok(not has_table_privilege('authenticated','public.billing_webhook_events','select'),
  'authenticated ne peut pas lire le journal');
select ok(not has_table_privilege('authenticated','public.billing_webhook_events','insert'),
  'authenticated ne peut pas écrire le journal');

-- ---------------------------------------------------------------------------
-- 2. Étanchéité avec le domaine loyer (même contrôle qu'ALIGN-03)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from information_schema.constraint_column_usage ccu
     join information_schema.table_constraints tc
       on tc.constraint_name = ccu.constraint_name
   where tc.table_schema='public'
     and tc.table_name = 'billing_webhook_events'
     and tc.constraint_type='FOREIGN KEY'
     and ccu.table_name in ('payments','dues','ledger_entries','financial_documents')),
  0, 'aucune clé étrangère du journal webhook vers le domaine loyer');

-- ---------------------------------------------------------------------------
-- 3. Contraintes — provider, mode, disposition, unicité
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$ insert into public.billing_webhook_events
      (provider, provider_event_id, event_type, disposition, payload_digest)
      values ('unknown_provider','evt_x','payment_succeeded','apply','deadbeef') $q$,
  '23514', null, 'un provider hors liste fermée est rejeté');

-- 'live' est une valeur STRUCTURELLEMENT valide pour la colonne `mode` (elle
-- sert à distinguer après coup un événement une fois qu'ALIGN-04B existera).
-- Le refus du mode live est un choix applicatif — providerMode() et
-- isLiveModeAllowed() dans provider-config.ts — jamais une contrainte SQL.
select lives_ok(
  $q$ insert into public.billing_webhook_events
      (provider, provider_event_id, event_type, mode, disposition, payload_digest)
      values ('flutterwave','evt_live_x','payment_succeeded','live','apply','deadbeef') $q$,
  'mode live est stockable structurellement ; le refus est applicatif, pas SQL');

insert into public.billing_webhook_events
  (provider, provider_event_id, event_type, organization_id, disposition, payload_digest, signature_verified)
  values ('flutterwave','evt_a4a_001','charge.completed','a4a00000-0000-4000-8000-0000000000aa','apply','digest-001',true);

select throws_ok(
  $q$ insert into public.billing_webhook_events
      (provider, provider_event_id, event_type, disposition, payload_digest)
      values ('flutterwave','evt_a4a_001','charge.completed','apply','digest-002') $q$,
  '23505', null, 'un même (provider, provider_event_id) rejoué viole l''unicité — c''est le mécanisme d''idempotence');

-- Un autre provider peut réutiliser le même provider_event_id : la clé est composite.
select lives_ok(
  $q$ insert into public.billing_webhook_events
      (provider, provider_event_id, event_type, disposition, payload_digest)
      values ('campay','evt_a4a_001','payment_pending','acknowledge_unhandled','digest-003') $q$,
  'un autre provider peut réutiliser le même identifiant d''événement');

select is(
  (select mode from public.billing_webhook_events where provider_event_id='evt_a4a_001' and provider='flutterwave'),
  'sandbox', 'mode par défaut = sandbox');

select is(
  (select signature_verified from public.billing_webhook_events where provider_event_id='evt_a4a_001' and provider='campay'),
  false, 'signature_verified par défaut = false');

-- ---------------------------------------------------------------------------
-- 4. Comportement on delete set null — structurel, sans toucher au trigger
-- protect_last_organization_owner (hors périmètre de ce test)
-- ---------------------------------------------------------------------------

select is(
  (select rc.delete_rule from information_schema.referential_constraints rc
     join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
   where tc.table_name='billing_webhook_events' and tc.constraint_type='FOREIGN KEY'),
  'SET NULL', 'la FK organization_id est ON DELETE SET NULL — l''historique survit à une Organization supprimée');

select is((select count(*)::int from public.billing_webhook_events), 3,
  'les trois événements de test sont journalisés');

-- ---------------------------------------------------------------------------
-- 5. Non-activation — aucun comportement commercial déclenché par ce journal
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.organization_subscriptions), 0,
  'aucune subscription créée ou modifiée par cette migration');
select is((select count(*)::int from information_schema.triggers
    where event_object_table='billing_webhook_events'),
  0, 'aucun trigger sur ce journal — aucune activation automatique de plan');

select * from finish();
rollback;
