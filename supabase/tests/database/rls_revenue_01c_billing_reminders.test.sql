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
-- RÉELLEMENT EXÉCUTÉ (Complément REVENUE-LAUNCH-01, cluster PostgreSQL 16
-- local éphémère avec extension pgtap réelle — jamais Supabase distant) :
-- PASS confirmé, `select plan(17)` vérifié contre le nombre réel
-- d'assertions. Corrigé après cette exécution réelle : (1) trois occurrences
-- d'un compte attendu de 5 (reminderCandidates, reminderLogged, et le compte
-- billing_reminder_log après le premier passage) ramenées à 4 — Org C (grâce
-- déjà expirée) bascule billing_blocked et ne compte jamais comme un rappel,
-- le brouillon la comptait deux fois par erreur ; (2) les lectures de
-- vérification interne (billing_reminder_log, organization_subscriptions,
-- billing_events) passaient en direct par `authenticated`, alors que
-- billing_reminder_log n'accorde aucun privilège à ce rôle (accès exclusif
-- via RPC, par design) et qu'organization_subscriptions/billing_events sont
-- gardées par has_capability(organization_id, 'billing.view'), qui exige une
-- adhésion à l'Organization — jamais un simple statut platform_admin.
-- L'Admin de ce test n'est membre d'aucune de ces Organizations (comme en
-- production) : ces lectures utilisent désormais `reset role` (retour au
-- rôle de session, superuser) pour cette seule vérification interne, jamais
-- un chemin d'accès applicatif réel.
--
-- Isolation des identifiants : préfixe `c0` (Revenue 01C), réservé à ce fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-rc01@kjora.test', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-rc01@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('c0000000-0000-4000-8000-000000000001');

-- Org A : renouvellement dans 7 jours -> renewal_reminder_j7.
-- Org B : en grâce depuis 3 jours -> grace_reminder_j3.
-- Org C : grâce déjà expirée hier -> doit basculer billing_blocked (pas un rappel).
-- Org D : facture XAF 'open' arrivant à échéance dans 3 jours -> invoice_due_soon.
-- Org E : facture XAF 'open' en retard de 5 jours -> invoice_overdue.
insert into public.organizations (id, created_by, status) values
  ('c0100000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000002', 'active'),
  ('c0100000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000002', 'active'),
  ('c0100000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000002', 'active'),
  ('c0100000-0000-4000-8000-00000000000d', 'c0000000-0000-4000-8000-000000000002', 'active'),
  ('c0100000-0000-4000-8000-00000000000e', 'c0000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('c0100000-0000-4000-8000-00000000000a', 'REVENUE-01C Org A'),
  ('c0100000-0000-4000-8000-00000000000b', 'REVENUE-01C Org B'),
  ('c0100000-0000-4000-8000-00000000000c', 'REVENUE-01C Org C'),
  ('c0100000-0000-4000-8000-00000000000d', 'REVENUE-01C Org D'),
  ('c0100000-0000-4000-8000-00000000000e', 'REVENUE-01C Org E');

insert into public.organization_subscriptions
  (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date, grace_started_on, grace_ends_on)
values
  ('c0100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF', 'CM', date '2026-10-22', null, null),
  ('c0100000-0000-4000-8000-00000000000b', 'grace',  'essentiel', 'monthly', 'XAF', 'CM', null, date '2026-10-12', date '2026-10-19'),
  ('c0100000-0000-4000-8000-00000000000c', 'grace',  'essentiel', 'monthly', 'XAF', 'CM', null, date '2026-10-07', date '2026-10-14'),
  ('c0100000-0000-4000-8000-00000000000d', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null, null),
  ('c0100000-0000-4000-8000-00000000000e', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null, null);

insert into public.billing_invoices (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on) values
  ('c0100000-0000-4000-8000-00000000000d', 'KJORA-TEST-000001', 'essentiel', 'monthly', 'XAF', 5900, '2026-09-15', '2026-10-18', 'open', '2026-09-15'),
  ('c0100000-0000-4000-8000-00000000000e', 'KJORA-TEST-000002', 'essentiel', 'monthly', 'XAF', 5900, '2026-09-10', '2026-10-10', 'open', '2026-09-10');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Dry-run par défaut : rien n'est journalisé, rien n'est bloqué
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_run_billing_reminders('2026-10-15', true))->>'dryRun'),
  'true',
  'dry_run=true par défaut : la RPC le confirme dans sa réponse'
);

-- 4 candidats, pas 5 : Org A (renouvellement), Org B (grâce), Org D et E
-- (factures) -> 4. Org C est en grâce EXPIRÉE (elle bascule billing_blocked,
-- ce n'est jamais un rappel) : elle ne compte pour aucun des deux. Valeur
-- corrigée après exécution réelle (pgTAP) — le brouillon comptait Org C deux
-- fois par erreur.
select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', true))->>'reminderCandidates')::int),
  4,
  'les 4 scénarios (renouvellement, grâce, 2 factures) sont bien détectés comme candidats'
);

-- billing_reminder_log n'accorde aucun privilège à `authenticated` (accès
-- exclusif via RPC, par design, comme organization_commercial_contacts en
-- 01I) : `reset role` bascule temporairement sur le rôle de session
-- (postgres) pour cette seule vérification interne, jamais un chemin
-- d'accès applicatif réel.
reset role;
select is(
  (select count(*)::int from public.billing_reminder_log),
  0,
  'un dry-run ne journalise strictement rien'
);
set local role authenticated;

-- organization_subscriptions est lisible par `authenticated` uniquement via
-- has_capability(organization_id, 'billing.view') (ALIGN-03), qui exige une
-- adhésion à l'Organization — jamais un simple statut platform_admin. Ce
-- test agit délibérément SANS adhésion (l'Admin n'est membre d'aucune de ces
-- Organizations, exactement comme en production) : `reset role` bascule
-- donc sur le rôle de session pour cette vérification interne, comme pour
-- billing_reminder_log ci-dessus.
reset role;
select is(
  (select status from public.organization_subscriptions where organization_id = 'c0100000-0000-4000-8000-00000000000c'),
  'grace',
  'un dry-run ne fait basculer aucun compte en billing_blocked'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Exécution réelle (toujours locale à ce test, jamais un vrai envoi)
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'reminderLogged')::int),
  4,
  'les 4 rappels dus sont journalisés au premier passage'
);

reset role;
select is(
  (select count(*)::int from public.billing_reminder_log),
  4,
  'billing_reminder_log contient exactement les 4 rappels journalisés'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'c0100000-0000-4000-8000-00000000000a' and reminder_type = 'renewal_reminder_j7'),
  'le rappel renewal_reminder_j7 est journalisé pour Org A'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'c0100000-0000-4000-8000-00000000000b' and reminder_type = 'grace_reminder_j3'),
  'le rappel grace_reminder_j3 est journalisé pour Org B'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'c0100000-0000-4000-8000-00000000000d' and reminder_type = 'invoice_due_soon'),
  'le rappel invoice_due_soon est journalisé pour Org D'
);

select ok(
  exists(select 1 from public.billing_reminder_log
          where organization_id = 'c0100000-0000-4000-8000-00000000000e' and reminder_type = 'invoice_overdue'),
  'le rappel invoice_overdue est journalisé pour Org E'
);
-- billing_events est lisible par `authenticated` sous la même garde
-- has_capability(organization_id, 'billing.view') qu'organization_subscriptions
-- ci-dessus : même bascule `reset role` pour ces vérifications internes,
-- jamais un chemin d'accès applicatif réel (l'Admin n'est membre d'aucune de
-- ces Organizations).
reset role;
select is(
  (select count(*)::int from public.billing_events
    where event_type in ('renewal_reminder_j7','grace_reminder_j3','invoice_due_soon','invoice_overdue')),
  4,
  'un billing_events est journalisé par rappel réellement nouveau (hors transition de blocage)'
);

-- Org C : grâce expirée -> bascule billing_blocked, jamais confondu avec un rappel.
select is(
  (select status from public.organization_subscriptions where organization_id = 'c0100000-0000-4000-8000-00000000000c'),
  'billing_blocked',
  'Org C bascule billing_blocked une fois sa grâce expirée'
);

select ok(
  (select blocked_at is not null from public.organization_subscriptions
    where organization_id = 'c0100000-0000-4000-8000-00000000000c'),
  'blocked_at est horodaté au passage billing_blocked'
);

select is(
  (select count(*)::int from public.billing_events
    where organization_id = 'c0100000-0000-4000-8000-00000000000c' and event_type = 'billing_blocked'),
  1,
  'le passage billing_blocked est journalisé exactement une fois'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 3. Idempotence stricte : rejouer ne journalise jamais deux fois
-- ---------------------------------------------------------------------------

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'reminderLogged')::int),
  0,
  'rejouer le même jour ne journalise plus rien de nouveau (idempotence stricte)'
);

reset role;
select is(
  (select count(*)::int from public.billing_reminder_log),
  4,
  'billing_reminder_log ne grossit pas au rejeu : jamais de double rappel'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);

select is(
  (select ((public.admin_run_billing_reminders('2026-10-15', false))->>'newlyBlocked')::int),
  0,
  'un compte déjà billing_blocked n''est plus jamais recompté comme nouvellement bloqué'
);

select * from finish();
rollback;
