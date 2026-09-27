begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- =============================================================================
-- REVENUE-LAUNCH-01 v3 — Intégrité de la facturation manuelle — Tests pgTAP
-- =============================================================================
-- Transaction annulée (rollback), rien ne survit. RÉELLEMENT EXÉCUTÉ sur un
-- cluster PostgreSQL 16 local éphémère avec pgtap réel (jamais Supabase
-- distant). Couvre les corrections obligatoires v3 de 01B/01C :
--   • validation NULL-sûre (cycle/plan NULL) et cycle jamais NULL à la
--     confirmation (pending_cycle NULL) ;
--   • idempotence réelle de l'émission et de la confirmation ;
--   • échéance `due_on` et rappels fondés sur elle ;
--   • dédoublonnage des rappels PAR FACTURE ;
--   • refus des abonnements gérés par un fournisseur ;
--   • aucune donnée sensible dans billing_events.payload ni dans les colonnes
--     lisibles par l'Organization ;
--   • régularisation d'une Organization suspendue (sans réactivation
--     automatique), refus pour une Organization archivée.
--
-- Isolation des identifiants : préfixe `da`, réservé à ce fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('da000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-da@kjora.test', now(), now(), now()),
  ('da000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-da@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('da000000-0000-4000-8000-000000000001');

-- P : active, XAF, sans fournisseur (parcours nominal).
-- Q : active, abonnement géré par un fournisseur.
-- R : archivée, facture ouverte.
-- S : suspendue, facture ouverte (régularisation).
-- T : active, deux factures de même échéance (dédoublonnage par facture).
insert into public.organizations (id, created_by, status) values
  ('da100000-0000-4000-8000-00000000000a', 'da000000-0000-4000-8000-000000000002', 'active'),
  ('da100000-0000-4000-8000-00000000000b', 'da000000-0000-4000-8000-000000000002', 'active'),
  ('da100000-0000-4000-8000-00000000000c', 'da000000-0000-4000-8000-000000000002', 'archived'),
  ('da100000-0000-4000-8000-00000000000d', 'da000000-0000-4000-8000-000000000002', 'suspended'),
  ('da100000-0000-4000-8000-00000000000e', 'da000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('da100000-0000-4000-8000-00000000000a', 'DA Org P'),
  ('da100000-0000-4000-8000-00000000000b', 'DA Org Q'),
  ('da100000-0000-4000-8000-00000000000c', 'DA Org R'),
  ('da100000-0000-4000-8000-00000000000d', 'DA Org S'),
  ('da100000-0000-4000-8000-00000000000e', 'DA Org T');

insert into public.memberships (organization_id, user_id, role, status) values
  ('da100000-0000-4000-8000-00000000000a', 'da000000-0000-4000-8000-000000000002', 'organization_owner', 'active');

insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country, provider, provider_subscription_ref) values
  ('da100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null),
  ('da100000-0000-4000-8000-00000000000b', 'active', 'essentiel', 'monthly', 'XAF', 'CM', 'stripe', 'sub_da_test'),
  ('da100000-0000-4000-8000-00000000000c', 'active', 'essentiel', 'monthly', 'XAF', 'CM', null, null),
  ('da100000-0000-4000-8000-00000000000d', 'grace', 'essentiel', 'monthly', 'XAF', 'CM', null, null);

insert into public.billing_invoices (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on, due_on) values
  ('da100000-0000-4000-8000-00000000000c', 'KJORA-DA-R', 'essentiel', 'monthly', 'XAF', 5900, current_date - 10, current_date + 20, 'open', current_date - 10, current_date),
  ('da100000-0000-4000-8000-00000000000d', 'KJORA-DA-S', 'essentiel', 'monthly', 'XAF', 5900, current_date - 10, current_date + 20, 'open', current_date - 10, current_date),
  ('da100000-0000-4000-8000-00000000000e', 'KJORA-DA-T1', 'essentiel', 'monthly', 'XAF', 5900, current_date - 30, current_date + 5, 'open', current_date - 30, current_date - 2),
  ('da100000-0000-4000-8000-00000000000e', 'KJORA-DA-T2', 'essentiel', 'monthly', 'XAF', 5900, current_date - 30, current_date + 5, 'open', current_date - 30, current_date - 2),
  -- Période déjà terminée MAIS échéance future : jamais « en retard ».
  ('da100000-0000-4000-8000-00000000000e', 'KJORA-DA-T3', 'essentiel', 'monthly', 'XAF', 5900, current_date - 60, current_date - 1, 'open', current_date - 60, current_date + 10);

select set_config('kjora_test.da_invoice_r', (select id::text from public.billing_invoices where number = 'KJORA-DA-R'), false);
select set_config('kjora_test.da_invoice_s', (select id::text from public.billing_invoices where number = 'KJORA-DA-S'), false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Émission — validation NULL-sûre, échéance, idempotence, fournisseur
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', null,
    current_date + 10, current_date + 40, 'da-issue-key-null-cycle') ->> 'outcome'),
  'invalid_cycle',
  'un cycle NULL est refusé proprement (plus d''erreur de contrainte NOT NULL)'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', null, 'monthly',
    current_date + 10, current_date + 40, 'da-issue-key-null-plan') ->> 'outcome'),
  'invalid_plan',
  'un plan NULL est refusé proprement'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    current_date + 10, current_date + 40, 'da-issue-key-1', current_date - 1) ->> 'outcome'),
  'invalid_due_date',
  'une échéance antérieure à l''émission est refusée'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    current_date + 10, current_date + 40, 'da-issue-key-1') ->> 'outcome'),
  'issued',
  'une facture valide est émise'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    current_date + 10, current_date + 40, 'da-issue-key-1') ->> 'outcome'),
  'already_issued',
  'rejouer le même jeton avec les mêmes paramètres renvoie la facture existante'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    current_date + 11, current_date + 41, 'da-issue-key-1') ->> 'outcome'),
  'issue_idempotency_conflict',
  'rejouer le même jeton avec d''autres paramètres est un conflit, jamais une réponse trompeuse'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000b', 'essentiel', 'monthly',
    current_date + 10, current_date + 40, 'da-issue-key-provider') ->> 'outcome'),
  'provider_managed_subscription',
  'un abonnement géré par un fournisseur n''est jamais facturé manuellement'
);

reset role;
select is(
  (select due_on from public.billing_invoices where issue_idempotency_key = 'da-issue-key-1'),
  current_date + 17,
  'échéance par défaut : début de période + 7 jours'
);
select is(
  (select count(*)::int from public.billing_invoices where organization_id = 'da100000-0000-4000-8000-00000000000a'),
  1,
  'une seule facture malgré le rejeu et le conflit'
);
select set_config('kjora_test.da_invoice_p1', (select id::text from public.billing_invoices where issue_idempotency_key = 'da-issue-key-1'), false);
-- Intention d'upgrade avec pending_cycle NULL : l'ancienne confirmation
-- recopiait ce NULL dans organization_subscriptions.billing_cycle.
update public.organization_subscriptions
   set pending_plan = 'essentiel', pending_cycle = null, pending_requested_at = now()
 where organization_id = 'da100000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Confirmation — introuvable, cycle, idempotence réelle, payload
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_confirm_manual_invoice_payment('da100000-0000-4000-8000-0000000000ff', 'XAF', 5900,
    null, 'Reçu Mobile Money', 'da-pay-key-unknown') ->> 'outcome'),
  'invoice_not_found',
  'une facture inconnue renvoie invoice_not_found'
);

select is(
  (select public.admin_confirm_manual_invoice_payment((current_setting('kjora_test.da_invoice_p1'))::uuid, 'XAF', 5900,
    'OM-DA-1', 'Reçu Mobile Money, note interne', 'da-pay-key-1') ->> 'outcome'),
  'confirmed',
  'le règlement exact est confirmé malgré un pending_cycle NULL'
);

select is(
  (select public.admin_confirm_manual_invoice_payment((current_setting('kjora_test.da_invoice_p1'))::uuid, 'XAF', 5900,
    'OM-DA-1', 'Rejeu', 'da-pay-key-1') ->> 'replayed'),
  'true',
  'rejouer le même jeton est reconnu comme un rejeu (already_paid, replayed=true), sans effet'
);

select is(
  (select public.admin_issue_manual_invoice('da100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    current_date + 41, current_date + 71, 'da-issue-key-2') ->> 'outcome'),
  'issued',
  'une seconde facture est émise pour P'
);

reset role;
select is(
  (select billing_cycle from public.organization_subscriptions where organization_id = 'da100000-0000-4000-8000-00000000000a'),
  'monthly',
  'le cycle de l''abonnement est celui de la facture, jamais NULL'
);
select set_config('kjora_test.da_invoice_p2', (select id::text from public.billing_invoices where issue_idempotency_key = 'da-issue-key-2'), false);
select ok(
  not exists (
    select 1 from public.billing_events
     where organization_id = 'da100000-0000-4000-8000-00000000000a'
       and event_type = 'invoice_manual_payment_confirmed'
       and (payload ? 'note' or payload ? 'manualReference')
  ),
  'billing_events.payload ne contient jamais la note interne ni la référence de règlement'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);

select is(
  (select public.admin_confirm_manual_invoice_payment((current_setting('kjora_test.da_invoice_p2'))::uuid, 'XAF', 5900,
    null, 'Tentative avec un jeton déjà utilisé', 'da-pay-key-1') ->> 'outcome'),
  'payment_idempotency_conflict',
  'un jeton de confirmation déjà utilisé pour une autre facture est refusé'
);

select is(
  (select public.admin_confirm_manual_invoice_payment((current_setting('kjora_test.da_invoice_r'))::uuid, 'XAF', 5900,
    null, 'Règlement reçu', 'da-pay-key-r') ->> 'outcome'),
  'organization_archived',
  'aucune confirmation pour une Organization archivée'
);

select is(
  (select public.admin_confirm_manual_invoice_payment((current_setting('kjora_test.da_invoice_s'))::uuid, 'XAF', 5900,
    null, 'Régularisation reçue', 'da-pay-key-s') ->> 'outcome'),
  'confirmed',
  'une Organization suspendue peut régulariser sa facture'
);

reset role;
select is(
  (select status from public.organizations where id = 'da100000-0000-4000-8000-00000000000d'),
  'suspended',
  'la régularisation ne réactive jamais automatiquement l''Organization'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 3. Colonnes sensibles — jamais lisibles par l'Organization
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.billing_invoices where organization_id = 'da100000-0000-4000-8000-00000000000a'),
  2,
  'l''Owner lit ses factures (colonnes sûres)'
);

select throws_ok(
  $$select manual_payment_note from public.billing_invoices$$,
  '42501', null,
  'la note interne Admin n''est jamais lisible par l''Owner'
);

select throws_ok(
  $$select payload from public.billing_events$$,
  '42501', null,
  'billing_events.payload n''est jamais lisible par l''Owner'
);

select throws_ok(
  $$select manual_payment_note from public.list_billing_invoices('da100000-0000-4000-8000-00000000000a')$$,
  '42703', null,
  'list_billing_invoices ne renvoie plus la note interne (colonne absente)'
);

select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 4. Rappels — échéance due_on, dédoublonnage par facture
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_run_billing_reminders(current_date, false) -> 'byType' ->> 'invoice_overdue')::int),
  2,
  'deux factures distinctes de même échéance reçoivent chacune leur rappel (T1, T2), T3 (échéance future) aucun'
);

reset role;
select is(
  (select count(*)::int from public.billing_reminder_log
    where organization_id = 'da100000-0000-4000-8000-00000000000e' and reminder_type = 'invoice_overdue'),
  2,
  'deux rappels invoice_overdue journalisés pour T, un par facture'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_run_billing_reminders(current_date, false) ->> 'reminderLogged')::int),
  0,
  'rejouer ne journalise jamais un second rappel pour la même facture'
);

select * from finish();
rollback;
