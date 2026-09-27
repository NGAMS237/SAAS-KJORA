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
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (aucune base Postgres/Supabase
-- éphémère disponible, aucune migration distante autorisée ce tour-ci).
-- `select plan(12)` est vérifié statiquement contre le nombre réel
-- d'assertions ci-dessous, mais ce fichier n'est PAS déclaré PASS.
--
-- Isolation des identifiants : préfixe `re` (Revenue 01E), réservé à ce
-- fichier. `current_date`/`now()` sont utilisés directement (jamais une date
-- fixe passée en paramètre, contrairement à 01C) car cette RPC ne prend pas
-- `p_as_of` : les décalages (+7 jours, -400 jours...) sont donc relatifs à
-- l'exécution réelle du test, ce qui reste déterministe.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('re000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-re01@kjora.test', now(), now(), now()),
  ('re000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-re01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('re000000-0000-4000-8000-000000000001');

-- Org A : facture XAF 'open' à échéance future -> due, pas en retard.
-- Org B : facture XAF 'open' à échéance passée -> en retard.
-- Org C : facture XAF 'paid', confirmée MAINTENANT -> comptée en last_30_days et all_time.
-- Org D : facture XAF 'paid', confirmée il y a 400 jours -> comptée seulement en all_time.
-- Org E : abonnement actif renouvelant dans 7 jours -> candidat "rappel à envoyer" (dry-run).
insert into public.organizations (id, created_by, status) values
  ('re100000-0000-4000-8000-00000000000a', 're000000-0000-4000-8000-000000000002', 'active'),
  ('re100000-0000-4000-8000-00000000000b', 're000000-0000-4000-8000-000000000002', 'active'),
  ('re100000-0000-4000-8000-00000000000c', 're000000-0000-4000-8000-000000000002', 'active'),
  ('re100000-0000-4000-8000-00000000000d', 're000000-0000-4000-8000-000000000002', 'active'),
  ('re100000-0000-4000-8000-00000000000e', 're000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('re100000-0000-4000-8000-00000000000a', 'REVENUE-01E Org A'),
  ('re100000-0000-4000-8000-00000000000b', 'REVENUE-01E Org B'),
  ('re100000-0000-4000-8000-00000000000c', 'REVENUE-01E Org C'),
  ('re100000-0000-4000-8000-00000000000d', 'REVENUE-01E Org D'),
  ('re100000-0000-4000-8000-00000000000e', 'REVENUE-01E Org E');

insert into public.organization_subscriptions
  (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date) values
  ('re100000-0000-4000-8000-00000000000e', 'active', 'essentiel', 'monthly', 'XAF', 'CM', current_date + 7);

insert into public.billing_invoices
  (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on) values
  ('re100000-0000-4000-8000-00000000000a', 'KJORA-RE01-A', 'essentiel', 'monthly', 'XAF', 5900, current_date - 20, current_date + 10, 'open', current_date - 20),
  ('re100000-0000-4000-8000-00000000000b', 'KJORA-RE01-B', 'essentiel', 'monthly', 'XAF', 5900, current_date - 40, current_date - 10, 'open', current_date - 40);

insert into public.billing_invoices
  (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on,
   manual_payment_confirmed_by, manual_payment_confirmed_at) values
  ('re100000-0000-4000-8000-00000000000c', 'KJORA-RE01-C', 'essentiel', 'monthly', 'XAF', 5900, current_date - 30, current_date, 'paid', current_date - 30,
   're000000-0000-4000-8000-000000000001', now()),
  ('re100000-0000-4000-8000-00000000000d', 'KJORA-RE01-D', 'essentiel', 'monthly', 'XAF', 5900, current_date - 430, current_date - 400, 'paid', current_date - 430,
   're000000-0000-4000-8000-000000000001', now() - interval '400 days');

insert into public.billing_reminder_log (organization_id, reminder_type, target_date, computed_at) values
  ('re100000-0000-4000-8000-00000000000a', 'invoice_due_soon', current_date, now()),
  ('re100000-0000-4000-8000-00000000000b', 'invoice_overdue', current_date - 40, now() - interval '400 days');

insert into public.billing_payment_attempts
  (organization_id, attempt_number, scheduled_on, status, idempotency_key, completed_at) values
  ('re100000-0000-4000-8000-00000000000a', 1, current_date, 'failed', 're01-attempt-recent', now()),
  ('re100000-0000-4000-8000-00000000000b', 1, current_date - 400, 'failed', 're01-attempt-old', now() - interval '400 days');

set local role authenticated;
select set_config('request.jwt.claim.sub', 're000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Factures dues / en retard — état courant, indépendant de la période
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->'due_by_currency'->>'XAF')::int),
  1,
  'Org A (échéance future, open) est comptée dans les factures dues XAF'
);

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'manual_invoicing'->'overdue_by_currency'->>'XAF')::int),
  1,
  'Org B (échéance passée, open) est comptée dans les factures en retard XAF'
);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->'manual_invoicing'->'due_by_currency'->>'XAF')::int),
  1,
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

select is(
  (select ((public.admin_finance_billing_extension('last_30_days'))->'reminders'->>'due_now')::int),
  1,
  'Org E (renouvellement dans 7 jours) est détectée comme rappel à envoyer maintenant'
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

select set_config('request.jwt.claim.sub', 're000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_finance_billing_extension('last_30_days')$$,
  '42501', null,
  'un Owner (non platform_admin) ne peut pas appeler admin_finance_billing_extension'
);

select * from finish();
rollback;
