begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01C — Tests RLS/RPC exécutables
-- =============================================================================
-- Même convention que rls_revenue_01b_manual_invoicing.test.sql : transaction
-- annulée (rollback), rien ne survit. `p_as_of` est toujours passé
-- explicitement pour un résultat déterministe, indépendant de la date réelle
-- d'exécution.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (aucune base Postgres/Supabase
-- éphémère disponible, aucune migration distante autorisée ce tour-ci).
-- `select plan(17)` est vérifié statiquement contre le nombre réel
-- d'assertions ci-dessous, mais ce fichier n'est PAS déclaré PASS.
--
-- Isolation des identifiants : préfixe `rc` (Revenue 01C), réservé à ce fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('rc000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-rc01@kjora.test', now(), now(), now()),
  ('rc000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-rc01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('rc000000-0000-4000-8000-000000000001');

-- Org A : renouvellement dans 7 jours -> renewal_reminder_j7.
-- Org B : en grâce depuis 3 jours -> grace_reminder_j3.
-- Org C : grâce déjà expirée hier -> doit basculer billing_blocked (pas un rappel).
-- Org D : facture XAF 'open' arrivant à échéance dans 3 jours -> invoice_due_soon.
-- Org E : facture XAF 'open' en retard de 5 jours -> invoice_overdue.
insert into public.organizations (id, created_by, status) values
  ('rc100000-0000-4000-8000-00000000000a', 'rc000000-0000-4000-8000-000000000002', 'active'),
  ('rc100000-0000-4000-8000-00000000000b', 'rc000000-0000-4000-8000-000000000002', 'active'),
  ('rc100000-0000-4000-8000-00000000000c', 'rc000000-0000-4000-8000-000000000002', 'active'),
  ('rc100000-0000-4000-8000-00000000000d', 'rc000000-0000-4000-8000-000000000002', 'active'),
  ('rc100000-0000-4000-8000-00000000000e', 'rc000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('rc100000-0000-4000-8000-00000000000a', 'REVENUE-01C Org A'),
  ('rc100000-0000-4000-8000-00000000000b', 'REVENUE-01C Org B'),
  ('rc100000-0000-4000-8000-00000000000c', 'REVENUE-01C Org C'),
  ('rc100000-0000-4000-8000-00000000000d', 'REVENUE-01C Org D'),
  ('rc100000-0000-4000-8000-00000000000e', 'REVENUE-01C Org E');

insert into public.organization_subscriptions
  (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date, grace_started_on, grace_ends_on)
values
  ('rc100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF', 'CM', date '2026-10-22', null, null),
  ('rc100000-0000-4000-8000-00000000000b', 'grace',  'essentiel', 'monthly', 'XAF', 'CM', null, date '2026-10-12', date '2026-10-19'),
  ('rc100000-0000-4000-8000-00000000000c', 'grace',  'essentiel', 'monthly', 'XAF', 'CM', null, date '2026-10-07', date '2026-10-14'),
  ('rc100000-0000-4000-8000-00000000000d', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null, null),
  ('rc100000-0000-4000-8000-00000000000e', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null, null);

insert into public.billing_invoices (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on) values
  ('rc100000-0000-4000-8000-00000000000d', 'KJORA-TEST-000001', 'essentiel', 'monthly', 'XAF', 5900, '2026-09-15', '2026-10-18', 'open', '2026-09-15'),
  ('rc100000-0000-4000-8000-00000000000e', 'KJORA-TEST-000002', 'essentiel', 'monthly', 'XAF', 5900, '2026-09-10', '2026-10-10', 'open', '2026-09-10');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'rc000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Dry-run par défaut : rien n'est journalisé, rien n'est bloqué
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_run_billing_reminders('2026-10-15', true))->>'dryRun'),
  'true',
  'dry_run=true par défaut : la RPC le confirme dans sa réponse'
);

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', true))->>'reminderCandidates')::int),
  5,
  'les 5 scénarios (renouvellement, grâce, 2 factures) sont bien détectés comme candidats'
);

select is(
  (select count(*)::int from public.billing_reminder_log),
  0,
  'un dry-run ne journalise strictement rien'
);

select is(
  (select status from public.organization_subscriptions where organization_id = 'rc100000-0000-4000-8000-00000000000c'),
  'grace',
  'un dry-run ne fait basculer aucun compte en billing_blocked'
);

-- ---------------------------------------------------------------------------
-- 2. Exécution réelle (toujours locale à ce test, jamais un vrai envoi)
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'reminderLogged')::int),
  5,
  'les 5 rappels dus sont journalisés au premier passage'
);

select is(
  (select count(*)::int from public.billing_reminder_log),
  5,
  'billing_reminder_log contient exactement les 5 rappels journalisés'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'rc100000-0000-4000-8000-00000000000a' and reminder_type = 'renewal_reminder_j7'),
  'le rappel renewal_reminder_j7 est journalisé pour Org A'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'rc100000-0000-4000-8000-00000000000b' and reminder_type = 'grace_reminder_j3'),
  'le rappel grace_reminder_j3 est journalisé pour Org B'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'rc100000-0000-4000-8000-00000000000d' and reminder_type = 'invoice_due_soon'),
  'le rappel invoice_due_soon est journalisé pour Org D'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'rc100000-0000-4000-8000-00000000000e' and reminder_type = 'invoice_overdue'),
  'le rappel invoice_overdue est journalisé pour Org E'
);

select is(
  (select count(*)::int from public.billing_events
    where event_type in ('renewal_reminder_j7','grace_reminder_j3','invoice_due_soon','invoice_overdue')),
  4,
  'un billing_events est journalisé par rappel réellement nouveau (hors transition de blocage)'
);

-- Org C : grâce expirée -> bascule billing_blocked, jamais confondu avec un rappel.
select is(
  (select status from public.organization_subscriptions where organization_id = 'rc100000-0000-4000-8000-00000000000c'),
  'billing_blocked',
  'Org C bascule billing_blocked une fois sa grâce expirée'
);

select ok(
  (select blocked_at is not null from public.organization_subscriptions
    where organization_id = 'rc100000-0000-4000-8000-00000000000c'),
  'blocked_at est horodaté au passage billing_blocked'
);

select is(
  (select count(*)::int from public.billing_events
    where organization_id = 'rc100000-0000-4000-8000-00000000000c' and event_type = 'billing_blocked'),
  1,
  'le passage billing_blocked est journalisé exactement une fois'
);

-- ---------------------------------------------------------------------------
-- 3. Idempotence stricte : rejouer ne journalise jamais deux fois
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'reminderLogged')::int),
  0,
  'rejouer le même jour ne journalise plus rien de nouveau (idempotence stricte)'
);

select is(
  (select count(*)::int from public.billing_reminder_log),
  5,
  'billing_reminder_log ne grossit pas au rejeu : jamais de double rappel'
);

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'newlyBlocked')::int),
  0,
  'un compte déjà billing_blocked n''est plus jamais recompté comme nouvellement bloqué'
);

select * from finish();
rollback;
