begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01B — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_admin_billing_ops_01_commercial_interventions.test.sql
-- et rls_finance_admin_01_read_model.test.sql : tout s'exécute dans une
-- transaction annulée (rollback). Aucune donnée créée ici ne survit.
--
-- Prérequis pour exécuter ce fichier :
--   1. Toutes les migrations du dépôt jusqu'à
--      20260927150000_revenue_01b_manual_invoicing_africa.sql appliquées.
--   2. `create extension pgtap` disponible.
--   3. Exécuté par un rôle propriétaire des tables, jamais anon/service.
--
-- RÉELLEMENT EXÉCUTÉ (Complément REVENUE-LAUNCH-01, cluster PostgreSQL 16
-- local éphémère avec extension pgtap réelle — jamais Supabase distant) :
-- PASS confirmé, `select plan(18)` vérifié contre le nombre réel
-- d'assertions. Corrigé après cette exécution réelle : (1) trois littéraux
-- `\'...\'` (échappement backslash, invalide en SQL standard) remplacés par
-- le doublement `''...''` ; (2) les lectures de vérification interne
-- (billing_invoices, organization_subscriptions, organization_plans,
-- commercial_interventions, billing_events) passaient en direct par
-- `authenticated`, alors que leur RLS exige une adhésion à l'Organization —
-- jamais un simple statut platform_admin — ce qui provoquait un accès vide
-- (`permission denied` ou lignes invisibles) jamais détecté tant que ce
-- fichier n'avait été que lu. Ces lectures utilisent désormais `reset role`
-- (retour au rôle de session, superuser) pour cette seule vérification
-- interne, jamais un chemin d'accès applicatif réel.
--
-- Isolation des identifiants : préfixe `b0` (Revenue 01B), réservé à ce
-- fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('b0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-rb01@kjora.test', now(), now(), now()),
  ('b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-rb01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('b0000000-0000-4000-8000-000000000001');

-- Org A : abonnement XAF actif, plan essentiel -> cible du parcours nominal.
-- Org B : abonnement CAD -> hors périmètre (Canada reste sur Stripe préparé).
insert into public.organizations (id, created_by, status) values
  ('b0100000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'active'),
  ('b0100000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('b0100000-0000-4000-8000-00000000000a', 'REVENUE-01B Org A'),
  ('b0100000-0000-4000-8000-00000000000b', 'REVENUE-01B Org B');

insert into public.memberships (organization_id, user_id, role) values
  ('b0100000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('b0100000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'organization_owner');

insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country) values
  ('b0100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF', 'CM'),
  ('b0100000-0000-4000-8000-00000000000b', 'active', 'essentiel', 'monthly', 'CAD', 'CA');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Émission — portée XAF uniquement, idempotente
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_issue_manual_invoice(
    'b0100000-0000-4000-8000-00000000000b', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'rb-issue-key-canada'
  ))->>'outcome'),
  'currency_not_supported',
  'une Organization CAD est refusée par la facturation manuelle Afrique'
);

select is(
  (select (public.admin_issue_manual_invoice(
    'b0100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'rb-issue-key-1'
  ))->>'outcome'),
  'issued',
  'une facture XAF valide est émise pour Org A'
);

select is(
  (select (public.admin_issue_manual_invoice(
    'b0100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'rb-issue-key-1'
  ))->>'outcome'),
  'already_issued',
  'rejouer le même jeton d''émission ne crée pas une seconde facture'
);

-- À partir d'ici, chaque vérification lit directement une table dont la RLS
-- (ALIGN-03/lot_5c) exige une adhésion à l'Organization via has_capability —
-- jamais un simple statut platform_admin. L'Admin de ce test n'est membre
-- d'aucune Organization (exactement comme en production) : `reset role`
-- bascule sur le rôle de session (postgres) pour ces seules vérifications
-- internes, jamais un chemin d'accès applicatif réel. Même convention que
-- rls_revenue_01c_billing_reminders.test.sql.
reset role;
select is(
  (select count(*)::int from public.billing_invoices
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  1,
  'une seule ligne billing_invoices existe pour Org A malgré le rejeu'
);

select is(
  (select amount_minor from public.billing_invoices
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  5900::bigint,
  'le montant facturé correspond exactement au catalogue essentiel/monthly/XAF (jamais divisé par 100)'
);

select is(
  (select status from public.billing_invoices
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'open',
  'la facture émise est ''open'' : rien n''est encore activé'
);

select is(
  (select status from public.organization_subscriptions
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'active',
  'émettre une facture n''altère pas le statut d''abonnement déjà en place'
);

-- Récupère UNE FOIS l'id de la facture pendant qu'on a encore un accès
-- superuser (reset role), et le stocke dans un GUC de session : les RPC de
-- confirmation ci-dessous en ont besoin en paramètre, mais un `authenticated`
-- non-membre ne peut pas relire `billing_invoices` pour le retrouver
-- lui-même (voir commentaire ci-dessus).
select set_config(
  'kjora_test.rb01_invoice_id',
  (select id::text from public.billing_invoices where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  false
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Confirmation — jamais sans correspondance exacte montant/devise
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_confirm_manual_invoice_payment(
    (current_setting('kjora_test.rb01_invoice_id'))::uuid,
    'XAF', 1::bigint, 'REF-1', current_date, 'Paiement Orange Money reçu', 'rb-confirm-key-bad-amount'
  ))->>'outcome'),
  'amount_mismatch',
  'un montant déclaré différent de la facture est refusé'
);

select is(
  (select (public.admin_confirm_manual_invoice_payment(
    (current_setting('kjora_test.rb01_invoice_id'))::uuid,
    'CAD', 5900::bigint, 'REF-1', current_date, 'Paiement Orange Money reçu', 'rb-confirm-key-bad-currency'
  ))->>'outcome'),
  'currency_mismatch',
  'une devise déclarée différente de la facture est refusée'
);

select is(
  (select (public.admin_confirm_manual_invoice_payment(
    (current_setting('kjora_test.rb01_invoice_id'))::uuid,
    'XAF', 5900::bigint, 'REF-1', current_date, 'x', 'rb-confirm-key-bad-note'
  ))->>'outcome'),
  'note_required',
  'une note administrative de moins de 3 caractères est refusée'
);

select is(
  (select (public.admin_confirm_manual_invoice_payment(
    (current_setting('kjora_test.rb01_invoice_id'))::uuid,
    'XAF', 5900::bigint, 'REF-OM-2026-10', current_date, 'Paiement Orange Money reçu, capture jointe', 'rb-confirm-key-1'
  ))->>'outcome'),
  'confirmed',
  'un règlement manuel exact (devise + montant) est confirmé'
);

reset role;
select is(
  (select status from public.billing_invoices
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'paid',
  'la facture passe à ''paid'' après confirmation'
);

select ok(
  (select manual_payment_confirmed_by is not null and manual_payment_confirmed_at is not null
     from public.billing_invoices
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'auteur et horodatage de la confirmation sont enregistrés'
);

select is(
  (select status from public.organization_subscriptions
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'active',
  'l''abonnement passe/reste ''active'' après confirmation du règlement manuel'
);

select is(
  (select plan from public.organization_plans
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  'essentiel',
  'les entitlements effectifs (organization_plans) sont synchronisés sur le plan facturé'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_confirm_manual_invoice_payment(
    (current_setting('kjora_test.rb01_invoice_id'))::uuid,
    'XAF', 5900::bigint, 'REF-OM-2026-10', current_date, 'Rejeu après confirmation', 'rb-confirm-key-1'
  ))->>'outcome'),
  'already_paid',
  'reconfirmer une facture déjà payée est idempotent, sans réappliquer l''effet'
);

reset role;
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'),
  0,
  'la facturation manuelle Afrique n''écrit jamais dans commercial_interventions'
);

select is(
  (select count(*)::int from public.billing_events
    where organization_id = 'b0100000-0000-4000-8000-00000000000a'
      and event_type in ('invoice_manual_issued', 'invoice_manual_payment_confirmed')),
  2,
  'émission et confirmation sont toutes deux journalisées dans billing_events'
);

select * from finish();
rollback;
