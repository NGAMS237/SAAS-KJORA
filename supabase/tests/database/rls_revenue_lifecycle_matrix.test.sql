begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- =============================================================================
-- REVENUE-LAUNCH-01 v3 — Matrice du cycle de vie Organization — Tests pgTAP
-- =============================================================================
-- Transaction annulée (rollback), rien ne survit. RÉELLEMENT EXÉCUTÉ sur un
-- cluster PostgreSQL 16 local éphémère avec pgtap réel (jamais Supabase
-- distant) — le verdict officiel reste la CI Supabase éphémère.
--
-- Scénarios réels (jamais une lecture du texte source) :
--   §2 compteurs (total = active + suspended + archived) ;
--   §3 effets financiers (aucune facture/rappel hors Organization active,
--      signal fournisseur sans annulation automatique, historique intact) ;
--   §4 éligibilité marketing (statut exposé, archivée jamais éligible) ;
--   §5 matrice d'accès d'une Organization suspendue (11 domaines coupés,
--      identité minimale lisible) ;
--   §6 multi-Organizations (désactivation strictement locale, aucune
--      suppression dans auth.sessions, exactement un propriétaire actif) ;
--   §7 exceptions étroites v3 : Owner d'une Organization suspendue
--      (facturation + export lecture seule, jamais le ZIP), collaborateur
--      (aucune exception), Organization archivée (aucune exception),
--      locataire (portail fermé, message d'indisponibilité), utilisateur
--      multi-Organizations (actif normal + suspendue restreinte), et aucune
--      fuite de motif interne.
--
-- Isolation des identifiants : préfixe `d0`, réservé à ce fichier.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('d0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-active-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-suspended-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-archived-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'multi-org-user-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'transfer-target-d0@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('d0000000-0000-4000-8000-000000000001');

-- Org A : active, référence pour les contrôles positifs.
-- Org S : suspendue dès la fixture — matrice d'accès (§5) + effets financiers (§3).
-- Org R : archivée dès la fixture — idem, plus historique (§3) et marketing (§4).
-- Org M1 / Org M2 : multi-Organizations (§6), utilisateur membre des deux.
-- Org T : transfert de propriété (§6).
insert into public.organizations (id, created_by, status) values
  ('d0100000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000002', 'active'),
  ('d0100000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000003', 'suspended'),
  ('d0100000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000004', 'archived'),
  ('d0100000-0000-4000-8000-00000000000d', 'd0000000-0000-4000-8000-000000000005', 'active'),
  ('d0100000-0000-4000-8000-00000000000e', 'd0000000-0000-4000-8000-000000000005', 'active'),
  ('d0100000-0000-4000-8000-00000000000f', 'd0000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('d0100000-0000-4000-8000-00000000000a', 'D0 Org Active'),
  ('d0100000-0000-4000-8000-00000000000b', 'D0 Org Suspended'),
  ('d0100000-0000-4000-8000-00000000000c', 'D0 Org Archived'),
  ('d0100000-0000-4000-8000-00000000000d', 'D0 Org Multi 1'),
  ('d0100000-0000-4000-8000-00000000000e', 'D0 Org Multi 2'),
  ('d0100000-0000-4000-8000-00000000000f', 'D0 Org Transfer');

insert into public.memberships (organization_id, user_id, role, status) values
  ('d0100000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000002', 'organization_owner', 'active'),
  ('d0100000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000003', 'organization_owner', 'active'),
  ('d0100000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000004', 'organization_owner', 'active'),
  ('d0100000-0000-4000-8000-00000000000d', 'd0000000-0000-4000-8000-000000000005', 'viewer', 'active'),
  ('d0100000-0000-4000-8000-00000000000e', 'd0000000-0000-4000-8000-000000000005', 'viewer', 'active'),
  ('d0100000-0000-4000-8000-00000000000f', 'd0000000-0000-4000-8000-000000000002', 'organization_owner', 'active'),
  ('d0100000-0000-4000-8000-00000000000f', 'd0000000-0000-4000-8000-000000000006', 'manager', 'active');

-- §7 — Collaborateur (manager) de l'Organization suspendue ; Organization
-- active supplémentaire du même Owner (multi-Organizations) ; locataire
-- disposant d'un accès portail dans l'Organization suspendue ET dans une
-- Organization active.
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('d0000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'collab-suspended-d0@kjora.test', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'tenant-d0@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by, status) values
  ('d0100000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000003', 'active');
insert into public.organization_profiles (organization_id, name) values
  ('d0100000-0000-4000-8000-000000000010', 'D0 Org Owner Second Active');

insert into public.memberships (organization_id, user_id, role, status) values
  ('d0100000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000007', 'manager', 'active'),
  ('d0100000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000003', 'organization_owner', 'active');

update public.organizations set status_reason = 'Motif interne confidentiel D0'
 where id = 'd0100000-0000-4000-8000-00000000000b';

-- Plan Essentiel pour Org S : l'export (exports_standard) reste soumis à son
-- entitlement habituel, la suspension n'accorde aucun droit de plan en plus.
select private.assign_organization_plan('d0100000-0000-4000-8000-00000000000b', 'essentiel');

insert into public.tenants (id, organization_id, full_name, email, preferred_language, created_by) values
  ('d0200000-0000-4000-8000-00000000000b', 'd0100000-0000-4000-8000-00000000000b', 'Locataire D0 S', 'tenant-d0@kjora.test', 'fr', 'd0000000-0000-4000-8000-000000000003'),
  ('d0200000-0000-4000-8000-00000000000a', 'd0100000-0000-4000-8000-00000000000a', 'Locataire D0 A', 'tenant-d0@kjora.test', 'fr', 'd0000000-0000-4000-8000-000000000002');
insert into public.tenant_portal_accesses (id, organization_id, tenant_id, user_id, status, invited_email, preferred_language, invited_by, accepted_at) values
  ('d0300000-0000-4000-8000-00000000000b', 'd0100000-0000-4000-8000-00000000000b', 'd0200000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000008', 'active', 'tenant-d0@kjora.test', 'fr', 'd0000000-0000-4000-8000-000000000003', now()),
  ('d0300000-0000-4000-8000-00000000000a', 'd0100000-0000-4000-8000-00000000000a', 'd0200000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000008', 'active', 'tenant-d0@kjora.test', 'fr', 'd0000000-0000-4000-8000-000000000002', now());
insert into public.tenant_portal_sessions (organization_id, access_id, tenant_id, user_id, auth_session_id, expires_at) values
  ('d0100000-0000-4000-8000-00000000000b', 'd0300000-0000-4000-8000-00000000000b', 'd0200000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000008', 'session-d0-tenant', now() + interval '1 day'),
  ('d0100000-0000-4000-8000-00000000000a', 'd0300000-0000-4000-8000-00000000000a', 'd0200000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000008', 'session-d0-tenant', now() + interval '1 day');

-- Récupère UNE FOIS les id de membership nécessaires en paramètre RPC pendant
-- l'accès superuser initial (avant tout basculement `authenticated`) — même
-- convention que 01H : un platform_admin non membre ne peut pas relire
-- `memberships` lui-même pour les retrouver.
select set_config('kjora_test.d0_membership_multi1',
  (select id::text from public.memberships where organization_id = 'd0100000-0000-4000-8000-00000000000d'
     and user_id = 'd0000000-0000-4000-8000-000000000005'), false);
select set_config('kjora_test.d0_membership_transfer_target',
  (select id::text from public.memberships where organization_id = 'd0100000-0000-4000-8000-00000000000f'
     and user_id = 'd0000000-0000-4000-8000-000000000006'), false);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- §2 — Compteurs : total = active + suspended + archived, jamais une
-- Organization perdue silencieusement.
-- ---------------------------------------------------------------------------

select ok(
  (select (public.admin_platform_counters()->>'organizations_total')::int)
  = (select (public.admin_platform_counters()->>'organizations_active')::int)
  + (select (public.admin_platform_counters()->>'organizations_suspended')::int)
  + (select (public.admin_platform_counters()->>'organizations_archived')::int),
  'admin_platform_counters : organizations_total = active + suspended + archived'
);

select ok(
  (select (public.admin_platform_counters()->>'organizations_archived')::int) >= 1,
  'organizations_archived compte au moins l''Organization archivée de cette fixture (D0 Org Archived)'
);

-- ---------------------------------------------------------------------------
-- §3a — Facturation manuelle : aucune nouvelle facture hors Organization active
-- ---------------------------------------------------------------------------

select is(
  (select (public.admin_issue_manual_invoice(
    'd0100000-0000-4000-8000-00000000000b', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'd0-issue-key-suspended'
  ))->>'outcome'),
  'organization_not_active',
  'admin_issue_manual_invoice refuse une Organization suspendue'
);

select is(
  (select (public.admin_issue_manual_invoice(
    'd0100000-0000-4000-8000-00000000000c', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'd0-issue-key-archived'
  ))->>'outcome'),
  'organization_not_active',
  'admin_issue_manual_invoice refuse une Organization archivée'
);

select is(
  (select (public.admin_issue_manual_invoice(
    'd0100000-0000-4000-8000-00000000000a', 'essentiel', 'monthly',
    '2026-10-01', '2026-11-01', 'd0-issue-key-active'
  ))->>'outcome'),
  'issued',
  'admin_issue_manual_invoice reste fonctionnelle pour une Organization active'
);

-- ---------------------------------------------------------------------------
-- §3b — Rappels automatiques : jamais pour une Organization non active
-- ---------------------------------------------------------------------------

reset role;
-- Abonnement en renouvellement à J-7 pour Org S (suspendue) : candidat s'il
-- n'y avait pas le filtre organizations.status = 'active'.
insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date) values
  ('d0100000-0000-4000-8000-00000000000b', 'active', 'essentiel', 'monthly', 'XAF', 'CM', current_date + 7);
-- Même scénario pour Org A (active) : doit, lui, être détecté.
insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country, renewal_date) values
  ('d0100000-0000-4000-8000-00000000000d', 'active', 'essentiel', 'monthly', 'XAF', 'CM', current_date + 7);
-- private.compute_due_billing_reminders est révoquée pour anon/authenticated
-- (accès exclusif via admin_run_billing_reminders, security definer) : `reset
-- role` bascule sur le rôle de session (postgres) pour cette seule
-- vérification interne, jamais un chemin d'accès applicatif réel — même
-- convention que 01C.
reset role;
select is(
  (select count(*)::int from private.compute_due_billing_reminders(current_date)
    where organization_id = 'd0100000-0000-4000-8000-00000000000b'),
  0,
  'compute_due_billing_reminders exclut une Organization suspendue de tout rappel'
);

select is(
  (select count(*)::int from private.compute_due_billing_reminders(current_date)
    where organization_id = 'd0100000-0000-4000-8000-00000000000d'),
  1,
  'compute_due_billing_reminders détecte toujours le même scénario pour une Organization active'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- Grâce déjà expirée pour Org R (archivée) : ne doit jamais basculer
-- billing_blocked pendant qu'elle est gelée.
reset role;
insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country, grace_started_on, grace_ends_on) values
  ('d0100000-0000-4000-8000-00000000000c', 'grace', 'essentiel', 'monthly', 'XAF', 'CM', current_date - 20, current_date - 10);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select public.admin_run_billing_reminders(current_date, false);

reset role;
select is(
  (select status from public.organization_subscriptions where organization_id = 'd0100000-0000-4000-8000-00000000000c'),
  'grace',
  'une Organization archivée en grâce expirée ne bascule jamais billing_blocked automatiquement'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- §3c — Signal d'incohérence provider, jamais une annulation automatique
-- ---------------------------------------------------------------------------

reset role;
update public.organization_subscriptions
   set provider = 'stripe', provider_subscription_ref = 'sub_d0_test', status = 'active'
 where organization_id = 'd0100000-0000-4000-8000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select ok(
  (select (public.admin_platform_counters()->>'organizations_requiring_provider_action')::int) >= 1,
  'organizations_requiring_provider_action détecte Org S (suspendue, provider actif non annulé)'
);

select ok(
  (select (public.admin_get_organization_detail('d0100000-0000-4000-8000-00000000000b'))->>'providerActionRequired')::boolean,
  'admin_get_organization_detail signale providerActionRequired pour Org S'
);

select ok(
  not (select (public.admin_get_organization_detail('d0100000-0000-4000-8000-00000000000a'))->>'providerActionRequired')::boolean,
  'admin_get_organization_detail ne signale rien pour une Organization active sans incohérence'
);

reset role;
select is(
  (select status from public.organization_subscriptions where organization_id = 'd0100000-0000-4000-8000-00000000000b'),
  'active',
  'aucune annulation automatique n''est jamais appliquée à l''abonnement provider : signalé, jamais résolu tout seul'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- §3d — Historique de facturation : toujours visible après archivage
-- ---------------------------------------------------------------------------

reset role;
insert into public.billing_invoices
  (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on,
   paid_at, manual_payment_confirmed_by, manual_payment_confirmed_at) values
  ('d0100000-0000-4000-8000-00000000000c', 'KJORA-D0-C', 'essentiel', 'monthly', 'XAF', 5900, current_date - 60, current_date - 30, 'paid', current_date - 60,
   now() - interval '30 days', 'd0000000-0000-4000-8000-000000000001', now() - interval '30 days');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select is(
  (select ((public.admin_finance_billing_extension('all_time'))->'manual_invoicing'->>'payments_confirmed_count')::int
     >= 1),
  true,
  'la facture réglée d''une Organization désormais archivée reste comptée dans l''historique (admin_finance_billing_extension)'
);

-- ---------------------------------------------------------------------------
-- §4 — Contacts et marketing : statut exposé, éligibilité exacte
-- ---------------------------------------------------------------------------

select is(
  (select public.admin_upsert_organization_contact('d0100000-0000-4000-8000-00000000000a', null, 'Cameroun', 'fr') ->> 'outcome'),
  'saved',
  'fiche contact créée pour Org A (active)'
);
select is(
  (select public.admin_set_marketing_consent('d0100000-0000-4000-8000-00000000000a', true, 'admin_manual_entry', 'kjora-marketing-v1', 'Accord signé, formulaire D0-A') ->> 'outcome'),
  'consent_updated',
  'consentement positif enregistré pour Org A (active)'
);

select is(
  (select public.admin_upsert_organization_contact('d0100000-0000-4000-8000-00000000000c', null, 'Cameroun', 'fr') ->> 'outcome'),
  'saved',
  'fiche contact créée pour Org R (archivée)'
);
select is(
  (select public.admin_set_marketing_consent('d0100000-0000-4000-8000-00000000000c', true, 'admin_manual_entry', 'kjora-marketing-v1', 'Accord signé, formulaire D0-R') ->> 'outcome'),
  'consent_updated',
  'consentement positif enregistré pour Org R (archivée) : la fiche existe, seule l''éligibilité en tient compte'
);

select is(
  (select organization_status from public.admin_list_commercial_contacts_for_export() where organization_name = 'D0 Org Active'),
  'active',
  'admin_list_commercial_contacts_for_export expose organization_status'
);

select ok(
  (select marketing_eligible from public.admin_list_commercial_contacts_for_export() where organization_name = 'D0 Org Active'),
  'Org A (active, consentante, non désabonnée) est éligible marketing'
);

select ok(
  not (select marketing_eligible from public.admin_list_commercial_contacts_for_export() where organization_name = 'D0 Org Archived'),
  'Org R (archivée, pourtant consentante) n''est jamais éligible marketing : le statut prime'
);

select ok(
  ((public.admin_list_commercial_contacts(25, 0, 'D0 Org Active')->'rows'->0->>'marketing_eligible')::boolean),
  'admin_list_commercial_contacts (console paginée) calcule la même éligibilité que l''export'
);

-- ---------------------------------------------------------------------------
-- §5 — Matrice d'accès : Organization suspendue coupée partout, identité/
-- statut/aide restent lisibles.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);

select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'property.view')),
  'Org S suspendue : property.view coupé (biens)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'unit.view')),
  'Org S suspendue : unit.view coupé (logements)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'tenant.view')),
  'Org S suspendue : tenant.view coupé (locataires)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'lease.view')),
  'Org S suspendue : lease.view coupé (baux)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'due.view')),
  'Org S suspendue : due.view coupé (loyers)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'payment.view')),
  'Org S suspendue : payment.view coupé (paiements)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'receipt.view')),
  'Org S suspendue : receipt.view coupé (documents/reçus)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'contract.manage')),
  'Org S suspendue : contract.manage coupé (contrats)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'member.view')),
  'Org S suspendue : member.view coupé (membres)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'data_export.manage')),
  'Org S suspendue : data_export.manage coupé (exports)'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'billing.view')),
  'Org S suspendue : billing.view coupé (Billing) — aucune exception, contrairement au blocage facturation ALIGN-03'
);

-- Lecture explicitement autorisée malgré la suspension : identité minimale et
-- statut (is_active_member, jamais has_capability — lot_5b, non modifié).
select is(
  (select status from public.organizations where id = 'd0100000-0000-4000-8000-00000000000b'),
  'suspended',
  'un membre actif d''une Organization suspendue peut toujours lire son statut (identité minimale)'
);
select is(
  (select name from public.organization_profiles where organization_id = 'd0100000-0000-4000-8000-00000000000b'),
  'D0 Org Suspended',
  'un membre actif d''une Organization suspendue peut toujours lire son nom (identité minimale)'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- §6 — Multi-Organizations : isolation stricte entre Organizations, jamais de
-- suppression directe dans auth.sessions, exactement un propriétaire actif.
-- ---------------------------------------------------------------------------

reset role;
insert into auth.sessions (id, user_id, not_after) values
  ('d0000000-0000-4000-8000-0000000000aa', 'd0000000-0000-4000-8000-000000000005', now() + interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_disable_member(
    'd0100000-0000-4000-8000-00000000000d',
    (current_setting('kjora_test.d0_membership_multi1'))::uuid,
    'Motif de test complément D0'
  )) ->> 'outcome'),
  'disabled',
  'admin_disable_member désactive le membre ciblé dans Org Multi 1'
);

reset role;
select is(
  (select status from public.memberships where organization_id = 'd0100000-0000-4000-8000-00000000000d'
     and user_id = 'd0000000-0000-4000-8000-000000000005'),
  'revoked',
  'la désactivation s''applique bien à Org Multi 1'
);
select is(
  (select status from public.memberships where organization_id = 'd0100000-0000-4000-8000-00000000000e'
     and user_id = 'd0000000-0000-4000-8000-000000000005'),
  'active',
  'la désactivation dans Org Multi 1 ne touche jamais le membership du même utilisateur dans Org Multi 2'
);
select ok(
  exists(select 1 from auth.users where id = 'd0000000-0000-4000-8000-000000000005'),
  'désactiver un membre ne supprime jamais son compte auth.users'
);
select ok(
  exists(select 1 from auth.sessions where id = 'd0000000-0000-4000-8000-0000000000aa'),
  'désactiver un membre ne supprime plus jamais directement une ligne auth.sessions (complément §6)'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_transfer_organization_ownership(
    'd0100000-0000-4000-8000-00000000000f',
    (current_setting('kjora_test.d0_membership_transfer_target'))::uuid,
    'Motif de test complément D0'
  )) ->> 'outcome'),
  'transferred',
  'admin_transfer_organization_ownership transfère la propriété d''Org Transfer'
);

reset role;
select is(
  (select count(*)::int from public.memberships
    where organization_id = 'd0100000-0000-4000-8000-00000000000f'
      and role = 'organization_owner' and status = 'active'),
  1,
  'exactement un propriétaire actif subsiste dans Org Transfer après le transfert'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- §7 — Exceptions étroites v3 (Owner, collaborateur, archivée, locataire,
-- multi-Organizations)
-- ---------------------------------------------------------------------------

-- Owner de l'Organization suspendue S (user 03), aussi Owner d'une
-- Organization active (multi-Organizations).
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);

select ok(
  (select private.can_read_billing('d0100000-0000-4000-8000-00000000000b')),
  'Owner d''une Organization suspendue : lecture de facturation accordée (régularisation)'
);
select is(
  (select public.get_billing_overview('d0100000-0000-4000-8000-00000000000b') ->> 'organizationId'),
  'd0100000-0000-4000-8000-00000000000b',
  'Owner d''une Organization suspendue : get_billing_overview répond'
);
select ok(
  (select private.can_export_organization_data('d0100000-0000-4000-8000-00000000000b')),
  'Owner d''une Organization suspendue : export autorisé'
);
select is(
  (select public.export_restricted_owner_source('d0100000-0000-4000-8000-00000000000b', 'tenants') -> 0 ->> 'full_name'),
  'Locataire D0 S',
  'Owner d''une Organization suspendue : la source d''export dédiée renvoie ses propres données'
);
select is(
  (select jsonb_array_length(public.export_restricted_owner_source('d0100000-0000-4000-8000-00000000000b', 'tenants'))),
  1,
  'la source d''export dédiée reste strictement bornée à cette Organization'
);
select ok(
  (select public.request_data_export('d0100000-0000-4000-8000-00000000000b', 'xlsx', array['properties']) is not null),
  'Owner d''une Organization suspendue : un export XLSX est journalisé'
);
select throws_ok(
  $$select public.request_data_export('d0100000-0000-4000-8000-00000000000b', 'zip', array['properties'])$$,
  '22023', 'export_format_unavailable_while_suspended',
  'Owner d''une Organization suspendue : le ZIP (matérialisation de PDF) est refusé'
);
select ok(
  not (select private.has_capability('d0100000-0000-4000-8000-00000000000b', 'billing.manage')),
  'Owner d''une Organization suspendue : aucune mutation de facturation (billing.manage coupé)'
);
select ok(
  (select private.has_capability('d0100000-0000-4000-8000-000000000010', 'property.view')),
  'multi-Organizations : l''Organization active du même Owner reste pleinement accessible'
);
select is(
  (select count(*)::int from public.list_my_restricted_organizations()),
  1,
  'multi-Organizations : seule l''Organization suspendue apparaît dans le contexte limité'
);
select is(
  (select count(*)::int from public.list_my_restricted_organizations() r
    where to_jsonb(r)::text like '%confidentiel%'),
  0,
  'le contexte limité n''expose jamais le motif interne de suspension'
);

-- Collaborateur (manager) de l'Organization suspendue : aucune exception.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000007', true);
select ok(
  not (select private.can_read_billing('d0100000-0000-4000-8000-00000000000b')),
  'collaborateur d''une Organization suspendue : aucune lecture de facturation'
);
select throws_ok(
  $$select public.export_restricted_owner_source('d0100000-0000-4000-8000-00000000000b', 'properties')$$,
  '42501', null,
  'collaborateur d''une Organization suspendue : aucun export'
);

-- Owner de l'Organization archivée R : aucune exception.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.get_billing_overview('d0100000-0000-4000-8000-00000000000c')$$,
  '42501', null,
  'Organization archivée : aucune lecture de facturation self-service'
);
select throws_ok(
  $$select public.request_data_export('d0100000-0000-4000-8000-00000000000c', 'xlsx', array['properties'])$$,
  '42501', null,
  'Organization archivée : aucun export self-service (restauration préalable)'
);

-- Locataire : portail fermé pour l'Organization suspendue, ouvert pour
-- l'Organization active ; message d'indisponibilité ; aucune exception.
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000008', true);
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000008","role":"authenticated","session_id":"session-d0-tenant"}', true);
select throws_ok(
  $$select public.get_tenant_portal_home('d0300000-0000-4000-8000-00000000000b')$$,
  '42501', 'not_found',
  'locataire : le portail d''une Organization suspendue est fermé'
);
select is(
  (select public.get_tenant_portal_home('d0300000-0000-4000-8000-00000000000a') ->> 'organizationName'),
  'D0 Org Active',
  'locataire : le portail d''une Organization active reste ouvert'
);
select is(
  (select organization_status from public.list_my_unavailable_tenant_portal_organizations()
    where organization_name = 'D0 Org Suspended'),
  'suspended',
  'locataire : l''indisponibilité est signalée (nom + statut, jamais un motif)'
);
select ok(
  not (select private.can_export_organization_data('d0100000-0000-4000-8000-00000000000b')),
  'locataire : aucune exception d''export'
);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

select * from finish();
rollback;
