begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01E — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01b_manual_invoicing.test.sql /
-- rls_revenue_01c_billing_reminders.test.sql : transaction annulée
-- (rollback), rien ne survit.
--
-- RÉELLEMENT EXÉCUTÉ (Complément REVENUE-LAUNCH-01, cluster PostgreSQL 16
-- local éphémère avec extension pgtap réelle — jamais Supabase distant) :
-- PASS confirmé, `select plan(12)` vérifié contre le nombre réel
-- d'assertions. Corrigé après cette exécution réelle : (1) fixture
-- `billing_invoices` : les lignes 'paid' (Org C, Org D) n'avaient pas
-- `paid_at` renseigné (seulement `manual_payment_confirmed_at`), violant la
-- contrainte `invoice_paid_has_timestamp` — ajouté, comme le fait réellement
-- `admin_confirm_manual_invoice_payment` ; (2) `due_by_currency.XAF` (2
-- occurrences) et `reminders.due_now` attendaient 1, corrigés à 2 : la RPC
-- compte TOUTE facture `status='open'` comme "due" (Org A et Org B), et
-- `private.compute_due_billing_reminders` détecte aussi Org B (facture en
-- retard) en plus d'Org E (renouvellement J-7) — le brouillon confondait
-- "due" et "due mais pas encore en retard".
--
-- Isolation des identifiants : préfixe `e0` (Revenue 01E), réservé à ce
-- fichier. `current_date`/`now()` sont utilisés directement (jamais une date
-- fixe passée en paramètre, contrairement à 01C) car cette RPC ne prend pas
-- `p_as_of` : les décalages (+7 jours, -400 jours...) sont donc relatifs à
-- l'exécution réelle du test, ce qui reste déterministe.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-re01@kjora.test', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-re01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('e0000000-0000-4000-8000-000000000001');

-- Org A : facture XAF 'open' à échéance future -> due, pas en retard.
-- Org B : facture XAF 'open' à échéance passée -> en retard.
-- Org C : facture XAF 'paid', confirmée MAINTENANT -> comptée en last_30_days et all_time.
-- Org D : facture XAF 'paid', confirmée il y a 400 jours -> comptée seulement en all_time.
-- Org E : abonnement actif renouvelant dans 7 jours -> candidat "rappel à envoyer" (dry-run).
insert into public.organizations (id, created_by, status) values
  ('e0100000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('e0100000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('e0100000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('e0100000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-000000000002', 'active'),
  ('e0100000-0000-4000-8000-00000000000e', 'e0000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('e0100000-0000-4000-8000-00000000000a', 'REVENUE-01E Org A'),
  ('e0100000-0000-4000-8000-00000000000b', 'REVENUE-01E Org B'),
  ('e0100000-0000-4000-8000-00000000000c', 'REVENUE-01E Org C'),
  ('e0100000-0000-4000-8000-00000000000d', 'REVENUE-01E Org D'),
  ('e0100000-0000-4000-8000-00000000000e', 'REVENUE-01E Org E');

insert into public.organization_subscriptions
  (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date) values
  ('e0100000-0000-4000-8000-00000000000e', 'active', 'essentiel', 'monthly', 'XAF', 'CM', current_date + 7);

insert into public.billing_invoices
  (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on) values
  ('e0100000-0000-4000-8000-00000000000a', 'KJORA-RE01-A', 'essentiel', 'monthly', 'XAF', 5900, current_date - 20, current_date + 10, 'open', current_date - 20),
  ('e0100000-0000-4000-8000-00000000000b', 'KJORA-RE01-B', 'essentiel', 'monthly', 'XAF', 5900, current_date - 40, current_date - 10, 'open', current_date - 40);

insert into public.billing_invoices
  (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on,
   paid_at, manual_payment_confirmed_by, manual_payment_confirmed_at) values
  ('e0100000-0000-4000-8000-00000000000c', 'KJORA-RE01-C', 'essentiel', 'monthly', 'XAF', 5900, current_date - 30, current_date, 'paid', current_date - 30,
   now(), 'e0000000-0000-4000-8000-000000000001', now()),
  ('e0100000-0000-4000-8000-00000000000d', 'KJORA-RE01-D', 'essentiel', 'monthly', 'XAF', 5900, current_date - 430, current_date - 400, 'paid', current_date - 430,
   now() - interval '400 days', 'e0000000-0000-4000-8000-000000000001', now() - interval '400 days');

insert into public.billing_reminder_log (organization_id, reminder_type, target_date, computed_at) values
  ('e0100000-0000-4000-8000-00000000000a', 'invoice_due_soon', current_date, now()),
  ('e0100000-0000-4000-8000-00000000000b', 'invoice_overdue', current_date - 40, now() - interval '400 days');

insert into public.billing_payment_attempts
  (organization_id, attempt_number, scheduled_on, status, idempotency_key, completed_at) values
  ('e0100000-0000-4000-8000-00000000000a', 1, current_date, 'failed', 're01-attempt-recent', now()),
  ('e0100000-0000-4000-8000-00000000000b', 1, current_date - 400, 'failed', 're01-attempt-old', now() - interval '400 days');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Factures dues / en retard — état courant, indépendant de la période
-- ---------------------------------------------------------------------------

-- "Due" = statut 'open' (voir commentaire de la RPC) : englobe Org A
-- (échéance future) ET Org B (déjà en retard, qui est aussi 'open') -> 2,
-- pas seulement Org A. Valeur corrigée après exécution réelle (pgTAP) : le
-- brouillon initial confondait "due" (ouvert) et "due mais pas encore en
-- retard".
select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->'due_by_currency'->>'XAF')::int),
  2,
  'Org A et Org B (toutes deux open) sont comptées dans les factures dues XAF'
);

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->'overdue_by_currency'->>'XAF')::int),
  1,
  'Org B (échéance passée, open) est comptée dans les factures en retard XAF'
);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->'manual_invoicing'->'due_by_currency'->>'XAF')::int),
  2,
  'les factures dues restent identiques quel que soit le filtre de période (état courant)'
);

-- ---------------------------------------------------------------------------
-- 2. Paiements manuels confirmés — bornés à la période choisie
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->>'payments_confirmed_count')::int),
  1,
  'last_30_days : seule Org C (confirmée maintenant) est comptée'
);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->'manual_invoicing'->>'payments_confirmed_count')::int),
  2,
  'all_time : Org C et Org D (confirmée il y a 400 jours) sont toutes deux comptées'
);

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->'payments_confirmed_by_currency'->>'XAF')::int),
  5900,
  'le montant XAF encaissé via facturation manuelle correspond à la facture Org C uniquement'
);

-- ---------------------------------------------------------------------------
-- 3. Rappels envoyés (bornés à la période) / à envoyer maintenant (dry-run)
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'reminders'->>'sent_in_period')::int),
  1,
  'last_30_days : seul le rappel journalisé pour Org A (maintenant) est compté'
);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->'reminders'->>'sent_in_period')::int),
  2,
  'all_time : les deux rappels journalisés (Org A et Org B) sont comptés'
);

-- private.compute_due_billing_reminders (REVENUE-01C) détecte aussi la
-- facture Org B en retard ('invoice_overdue', sans condition de délai) en
-- plus du renouvellement Org E à J-7 -> 2, pas seulement Org E. Valeur
-- corrigée après exécution réelle (pgTAP).
select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'reminders'->>'due_now')::int),
  2,
  'Org E (renouvellement dans 7 jours) et Org B (facture en retard) sont détectées comme rappels à envoyer maintenant'
);

-- ---------------------------------------------------------------------------
-- 4. Échecs de paiement — bornés à la période choisie
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->>'payment_failures_in_period')::int),
  1,
  'last_30_days : seul l''échec récent (Org A) est compté'
);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->>'payment_failures_in_period')::int),
  2,
  'all_time : les deux échecs (Org A et Org B) sont comptés'
);

-- ---------------------------------------------------------------------------
-- 5. Sécurité — un compte non-admin ne peut pas appeler cette RPC
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_finance_billing_extension('last_30_days')$$,
  '42501', null,
  'un Owner (non platform_admin) ne peut pas appeler admin_finance_billing_extension'
);

select * from finish();
rollback;
