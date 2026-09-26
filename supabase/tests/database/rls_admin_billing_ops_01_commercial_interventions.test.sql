begin;
create extension if not exists pgtap with schema extensions;
select plan(85);

-- =============================================================================
-- KJORA — ADMIN-BILLING-OPS-01 — Tests RLS/RPC exécutables (interventions
-- commerciales manuelles)
-- =============================================================================
-- Même convention que rls_admin_01_platform_admin.test.sql et
-- rls_admin_01_1_ux_quick_wins.test.sql : tout s'exécute dans une transaction
-- annulée (rollback) — aucune donnée ni aucun utilisateur créés par ce fichier
-- ne survit à son exécution. Seul le SCHÉMA (créé par les migrations,
-- appliquées séparément et en amont, jusqu'à
-- 20260926120000_admin_billing_ops_01_commercial_interventions.sql) doit déjà
-- être en place.
--
-- Prérequis pour exécuter ce fichier :
--   1. Toutes les migrations du dépôt jusqu'à
--      20260926120000_admin_billing_ops_01_commercial_interventions.sql
--      appliquées sur la base cible.
--   2. `create extension pgtap` disponible.
--   3. Exécuté par un rôle propriétaire des tables (ex. postgres via le SQL
--      Editor Supabase ou `supabase test db`) — jamais par la clé anon/service
--      d'une connexion applicative. C'est ce rôle par défaut, avant tout
--      `set local role`, qui octroie le premier platform_admin plus bas et
--      qui sert de point de lecture directe (hors RLS) pour vérifier l'état
--      interne des tables entre deux appels RPC.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session : aucune base Postgres/Supabase
-- éphémère n'est disponible dans ce bac à sable (ni Docker ni Podman — déjà
-- constaté lors du correctif IMPORT-01 de cette même session). Ce fichier est
-- prêt à l'emploi pour une exécution manuelle ou via la CI GitHub Actions
-- existante (Supabase isolée) dès que ce lot y sera soumis.
--
-- Isolation des identifiants : préfixe `cb` (Commercial Billing), family
-- réservée à ce fichier, pour ne jamais entrer en collision avec les préfixes
-- `ad…`/`ae…` déjà utilisés par les fixtures ADMIN-01/ADMIN-01.1 si les
-- fichiers sont un jour exécutés dans la même session pgTAP.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fixture — écrite par l'« acteur privilégié » (rôle de connexion par défaut)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('cb000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-cb01@kjora.test', now(), now(), now()),
  ('cb000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-cb01@kjora.test', now(), now(), now()),
  ('cb000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-cb01@kjora.test', now(), now(), now()),
  ('cb000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'tenant-cb01@kjora.test', now(), now(), now());

-- Org A : scénario de cycle de vie complet (octroi -> prolongation -> révocation).
-- Org B : scénario multi-types + isolation inter-Organizations.
insert into public.organizations (id, created_by, status) values
  ('cb100000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-000000000002', 'active'),
  ('cb100000-0000-4000-8000-00000000000b', 'cb000000-0000-4000-8000-000000000002', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('cb100000-0000-4000-8000-00000000000a', 'ADMIN-BILLING-OPS-01 Org A'),
  ('cb100000-0000-4000-8000-00000000000b', 'ADMIN-BILLING-OPS-01 Org B');

insert into public.memberships (organization_id, user_id, role) values
  ('cb100000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('cb100000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-000000000003', 'manager');

-- « Locataire » : identité portail, sans aucune Membership.
insert into public.tenants (id, organization_id, full_name, email, created_by) values
  ('cb200000-0000-4000-8000-00000000000a', 'cb100000-0000-4000-8000-00000000000a', 'ADMIN-BILLING-OPS-01 Locataire Test', 'tenant-cb01@kjora.test', 'cb000000-0000-4000-8000-000000000002');

-- Org A a un abonnement RÉELLEMENT enregistré ('essentiel'/actif) : sert à
-- vérifier que la révocation restaure bien CE plan (et non 'decouverte' par
-- défaut) et qu'un octroi manuel ne l'altère JAMAIS. Org B n'a délibérément
-- aucune ligne d'abonnement : vérifie le repli sur 'decouverte'.
insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency) values
  ('cb100000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF');

insert into public.platform_admins (user_id, note) values
  ('cb000000-0000-4000-8000-000000000001', 'ADMIN-BILLING-OPS-01 — fixture de test pgTAP');

-- Identifiant jamais inséré : sert à toutes les vérifications « Organization
-- inexistante ». Non un uuid choisi au hasard : préfixe reconnaissable.
select set_config('cb01.nonexistent_org', 'cb1fffff-0000-4000-8000-000000000000', true);
select set_config('cb01.org_a', 'cb100000-0000-4000-8000-00000000000a', true);
select set_config('cb01.org_b', 'cb100000-0000-4000-8000-00000000000b', true);

-- ---------------------------------------------------------------------------
-- 1. Anonyme — refus systématique sur les 3 mutations et les 2 lectures
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Geste commercial de test', current_date, current_date + 30,
      null, null, null, 'cb01-anon-grant')$$,
  '42501', null,
  'anonyme : admin_grant_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), current_date + 60, 'Prolongation test')$$,
  '42501', null,
  'anonyme : admin_extend_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), 'Révocation test')$$,
  '42501', null,
  'anonyme : admin_revoke_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_get_organization_detail(current_setting('cb01.org_a')::uuid)$$,
  '42501', null,
  'anonyme : admin_get_organization_detail refusé'
);
select throws_ok(
  $$select public.admin_commercial_intervention_counters()$$,
  '42501', null,
  'anonyme : admin_commercial_intervention_counters refusé'
);
select throws_ok(
  $$select * from public.commercial_interventions$$,
  '42501', null,
  'anonyme : lecture directe de commercial_interventions refusée'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. Owner d'Organization — aucune exception, même sur SA propre Organization
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Geste commercial de test', current_date, current_date + 30,
      null, null, null, 'cb01-owner-grant')$$,
  '42501', null,
  'owner : admin_grant_commercial_intervention refusé malgré organization_owner'
);
select throws_ok(
  $$select public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), current_date + 60, 'Prolongation test')$$,
  '42501', null,
  'owner : admin_extend_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), 'Révocation test')$$,
  '42501', null,
  'owner : admin_revoke_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_get_organization_detail(current_setting('cb01.org_a')::uuid)$$,
  '42501', null,
  'owner : admin_get_organization_detail refusé (aucun droit plateforme dérivé du rôle Owner)'
);
select throws_ok(
  $$select public.admin_commercial_intervention_counters()$$,
  '42501', null,
  'owner : admin_commercial_intervention_counters refusé'
);
select throws_ok(
  $$select * from public.commercial_interventions$$,
  '42501', null,
  'owner : lecture directe de commercial_interventions refusée'
);
-- Non-régression ADMIN-01 : le rôle Owner ne débloque toujours aucune RPC
-- plateforme existante après l'ajout de ce lot.
select throws_ok(
  $$select public.admin_platform_counters()$$,
  '42501', null,
  'owner : admin_platform_counters (ADMIN-01) toujours refusé après ce lot'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. Collaborateur (manager) — même refus, aucune exception de rôle
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Geste commercial de test', current_date, current_date + 30,
      null, null, null, 'cb01-manager-grant')$$,
  '42501', null,
  'manager : admin_grant_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), current_date + 60, 'Prolongation test')$$,
  '42501', null,
  'manager : admin_extend_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), 'Révocation test')$$,
  '42501', null,
  'manager : admin_revoke_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_get_organization_detail(current_setting('cb01.org_a')::uuid)$$,
  '42501', null,
  'manager : admin_get_organization_detail refusé'
);
select throws_ok(
  $$select public.admin_commercial_intervention_counters()$$,
  '42501', null,
  'manager : admin_commercial_intervention_counters refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. Locataire (portail, aucune Membership) — même refus
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Geste commercial de test', current_date, current_date + 30,
      null, null, null, 'cb01-tenant-grant')$$,
  '42501', null,
  'locataire : admin_grant_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), current_date + 60, 'Prolongation test')$$,
  '42501', null,
  'locataire : admin_extend_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, gen_random_uuid(), 'Révocation test')$$,
  '42501', null,
  'locataire : admin_revoke_commercial_intervention refusé'
);
select throws_ok(
  $$select public.admin_get_organization_detail(current_setting('cb01.org_a')::uuid)$$,
  '42501', null,
  'locataire : admin_get_organization_detail refusé'
);
select throws_ok(
  $$select public.admin_commercial_intervention_counters()$$,
  '42501', null,
  'locataire : admin_commercial_intervention_counters refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5. Platform admin — accès accordé, avec validation stricte de chaque champ
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select public.is_platform_admin_self()$$,
  array[true],
  'admin : is_platform_admin_self renvoie vrai'
);

-- --- 5.1 Organization inexistante ------------------------------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.nonexistent_org')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Geste sur Organization inexistante', current_date, current_date + 30,
      null, null, null, 'cb01-nonexistent-grant') ->> 'outcome'),
  'organization_not_found',
  'admin : octroi sur une Organization inexistante refusé explicitement (organization_not_found)'
);
select is(
  (select public.admin_revoke_commercial_intervention(
      current_setting('cb01.nonexistent_org')::uuid, gen_random_uuid(), 'Révocation sur Organization inexistante') ->> 'outcome'),
  'organization_not_found',
  'admin : révocation sur une Organization inexistante refusée explicitement'
);
select is(
  (select public.admin_extend_commercial_intervention(
      current_setting('cb01.nonexistent_org')::uuid, gen_random_uuid(), current_date + 30, 'Prolongation sur Organization inexistante') ->> 'outcome'),
  'organization_not_found',
  'admin : prolongation sur une Organization inexistante refusée explicitement'
);
select is(
  (select public.admin_get_organization_detail(current_setting('cb01.nonexistent_org')::uuid) ->> 'found'),
  'false',
  'admin : fiche d''une Organization inexistante renvoie found:false, jamais d''exception'
);

-- --- 5.2 Validation stricte du type d'intervention -------------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'lifetime_deal', 'essentiel', 'sales_gift',
      'Type inconnu', current_date, current_date + 30,
      null, null, null, 'cb01-invalid-type') ->> 'outcome'),
  'invalid_type',
  'admin : type d''intervention inconnu rejeté (invalid_type)'
);

-- --- 5.3 Validation stricte du forfait --------------------------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'ultra_premium', 'sales_gift',
      'Forfait inconnu', current_date, current_date + 30,
      null, null, null, 'cb01-invalid-plan') ->> 'outcome'),
  'invalid_plan',
  'admin : forfait invalide rejeté (invalid_plan)'
);
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'sur_mesure', 'sales_gift',
      'Sur mesure exclu des octrois manuels', current_date, current_date + 30,
      null, null, null, 'cb01-sur-mesure') ->> 'outcome'),
  'invalid_plan',
  'admin : ''sur_mesure'' refusé comme forfait octroyé manuellement (exclusion volontaire du mandat)'
);

-- --- 5.4 Validation stricte du motif normalisé ------------------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'motif_inconnu',
      'Motif inconnu', current_date, current_date + 30,
      null, null, null, 'cb01-invalid-reason') ->> 'outcome'),
  'invalid_reason',
  'admin : motif normalisé inconnu rejeté (invalid_reason)'
);

-- --- 5.5 Note administrative obligatoire ------------------------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'x', current_date, current_date + 30,
      null, null, null, 'cb01-note-too-short') ->> 'outcome'),
  'note_required',
  'admin : note administrative trop courte rejetée (note_required)'
);

-- --- 5.6 Date de fin obligatoire pour cadeau/promotion/partenariat ----------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Cadeau sans date de fin', current_date, null,
      null, null, null, 'cb01-end-date-required') ->> 'outcome'),
  'end_date_required',
  'admin : date de fin manquante rejetée pour un type qui l''exige (end_date_required)'
);

-- --- 5.7 Période invalide (fin non postérieure au début) --------------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Période invalide', current_date, current_date,
      null, null, null, 'cb01-invalid-period') ->> 'outcome'),
  'invalid_period',
  'admin : date de fin égale à la date de début rejetée (invalid_period)'
);

-- --- 5.8 Paiement hors ligne : devise et montant obligatoires ---------------
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'offline_payment', 'essentiel', 'manual_payment_received',
      'Paiement hors ligne sans devise', current_date, null,
      null, 50000, null, 'cb01-invalid-currency') ->> 'outcome'),
  'invalid_currency',
  'admin : paiement hors ligne sans devise valide rejeté (invalid_currency)'
);
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'offline_payment', 'essentiel', 'manual_payment_received',
      'Paiement hors ligne sans montant', current_date, null,
      'XAF', null, null, 'cb01-invalid-amount') ->> 'outcome'),
  'invalid_amount',
  'admin : paiement hors ligne sans montant positif rejeté (invalid_amount)'
);
select is(
  (select public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'offline_payment', 'essentiel', 'manual_payment_received',
      'Paiement hors ligne montant négatif', current_date, null,
      'XAF', -100, null, 'cb01-negative-amount') ->> 'outcome'),
  'invalid_amount',
  'admin : montant négatif rejeté pour un paiement hors ligne (invalid_amount)'
);

-- --- 5.9 Aucune ligne parasite créée par les tentatives refusées ci-dessus --
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id = current_setting('cb01.org_a')::uuid),
  0,
  'admin : aucune des tentatives refusées ci-dessus n''a créé de ligne'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6. Cycle de vie complet sur Org A — octroi, audit, idempotence, doublon,
--    prolongation, révocation non destructive
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

-- --- 6.1 Octroi réussi (type complimentary) ---------------------------------
select set_config(
  'cb01.granted_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'avance', 'sales_gift',
      'Cadeau commercial de bienvenue', current_date, current_date + 30,
      null, null, null, 'cb01-org-a-lifecycle') ->> 'interventionId')),
  true
);
select isnt(
  current_setting('cb01.granted_id'),
  null,
  'admin : octroi réussi renvoie un identifiant d''intervention'
);

reset role;

-- --- 6.2 Le forfait effectif est bien mis à jour, l'abonnement réel jamais --
select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_a')::uuid),
  'avance',
  'admin : le forfait effectif (organization_plans) est mis à jour par l''octroi'
);
select is(
  (select plan from public.organization_subscriptions where organization_id = current_setting('cb01.org_a')::uuid),
  'essentiel',
  'admin : l''abonnement RÉELLEMENT enregistré n''est jamais modifié par un octroi manuel'
);
select is(
  (select status from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  'active',
  'admin : l''intervention créée est bien à l''état actif'
);

-- --- 6.3 Trace d'audit complète ---------------------------------------------
select ok(
  exists (
    select 1 from public.billing_events
    where organization_id = current_setting('cb01.org_a')::uuid
      and event_type = 'admin_commercial_intervention_granted'
      and payload ->> 'interventionId' = current_setting('cb01.granted_id')
  ),
  'admin : un événement d''audit complet (interventionId inclus) est écrit pour l''octroi'
);
select ok(
  not exists (
    select 1 from public.billing_events
    where organization_id = current_setting('cb01.org_a')::uuid
      and event_type = 'admin_commercial_intervention_granted'
      and (payload ? 'payment_method_last4' or payload ? 'provider_subscription_ref')
  ),
  'admin : l''événement d''audit ne contient jamais de donnée de moyen de paiement'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

-- --- 6.4 Idempotence : rejeu du même jeton = même résultat, aucun doublon --
select is(
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'avance', 'sales_gift',
      'Cadeau commercial de bienvenue', current_date, current_date + 30,
      null, null, null, 'cb01-org-a-lifecycle') ->> 'outcome')),
  'already_recorded',
  'admin : le rejeu du même jeton d''idempotence renvoie already_recorded'
);
select is(
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'complimentary', 'avance', 'sales_gift',
      'Cadeau commercial de bienvenue', current_date, current_date + 30,
      null, null, null, 'cb01-org-a-lifecycle') ->> 'interventionId')),
  current_setting('cb01.granted_id'),
  'admin : le rejeu du même jeton renvoie exactement le même identifiant d''intervention'
);

-- --- 6.5 Refus d'empiler une seconde intervention active sur la même org ---
select is(
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_a')::uuid, 'promotion', 'patrimoine', 'promotional_campaign',
      'Deuxième octroi pendant que le premier est actif', current_date, current_date + 60,
      null, null, null, 'cb01-org-a-second-attempt') ->> 'outcome')),
  'intervention_already_active',
  'admin : une seconde intervention active sur la même Organization est refusée (intervention_already_active)'
);

reset role;

select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id = current_setting('cb01.org_a')::uuid),
  1,
  'admin : ni le rejeu idempotent ni le refus d''empilement n''ont créé de ligne supplémentaire'
);

-- --- 6.6 Prolongation --------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, current_setting('cb01.granted_id')::uuid,
      current_date + 5, 'Nouvelle date de fin antérieure à l''actuelle') ->> 'outcome')),
  'invalid_period',
  'admin : prolongation vers une date antérieure ou égale à l''actuelle rejetée (invalid_period)'
);
select is(
  (select (public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, current_setting('cb01.granted_id')::uuid,
      current_date + 90, 'Extension de la période promotionnelle') ->> 'outcome')),
  'extended',
  'admin : prolongation valide acceptée (extended)'
);

reset role;

select is(
  (select ends_on from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  (current_date + 90),
  'admin : la nouvelle date de fin est bien enregistrée'
);
select is(
  (select extension_count from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  1,
  'admin : le compteur de prolongations est incrémenté (une seule fois, malgré la tentative rejetée)'
);
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id = current_setting('cb01.org_a')::uuid),
  1,
  'admin : la prolongation ne crée jamais de ligne supplémentaire (pas de doublon)'
);
select ok(
  exists (
    select 1 from public.billing_events
    where organization_id = current_setting('cb01.org_a')::uuid
      and event_type = 'admin_commercial_intervention_extended'
      and payload ->> 'interventionId' = current_setting('cb01.granted_id')
  ),
  'admin : un événement d''audit est écrit pour la prolongation'
);

-- --- 6.7 Révocation non destructive -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, current_setting('cb01.granted_id')::uuid,
      'Fin anticipée du geste commercial') ->> 'outcome')),
  'revoked',
  'admin : révocation d''une intervention active acceptée (revoked)'
);

reset role;

select is(
  (select count(*)::int from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  1,
  'admin : la révocation NE SUPPRIME JAMAIS la ligne — elle existe toujours'
);
select is(
  (select status from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  'revoked',
  'admin : le statut passe à revoked'
);
select ok(
  (select revoked_at is not null and revoked_by is not null and revoke_reason is not null
     from public.commercial_interventions where id = current_setting('cb01.granted_id')::uuid),
  'admin : horodatage, acteur et motif de révocation sont enregistrés'
);
select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_a')::uuid),
  'essentiel',
  'admin : la révocation restaure le forfait effectif tiré de l''abonnement RÉELLEMENT enregistré (pas ''decouverte'' par défaut)'
);
select ok(
  exists (
    select 1 from public.billing_events
    where organization_id = current_setting('cb01.org_a')::uuid
      and event_type = 'admin_commercial_intervention_revoked'
      and payload ->> 'interventionId' = current_setting('cb01.granted_id')
  ),
  'admin : un événement d''audit est écrit pour la révocation'
);

-- --- 6.8 Révocation idempotente : rejouer sur une intervention déjà révoquée
set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select is(
  (select (public.admin_revoke_commercial_intervention(
      current_setting('cb01.org_a')::uuid, current_setting('cb01.granted_id')::uuid,
      'Second appel après révocation') ->> 'outcome')),
  'not_active',
  'admin : révoquer une intervention déjà révoquée est idempotent (not_active, aucune erreur)'
);
select is(
  (select (public.admin_extend_commercial_intervention(
      current_setting('cb01.org_a')::uuid, current_setting('cb01.granted_id')::uuid,
      current_date + 120, 'Tentative de prolongation après révocation') ->> 'outcome')),
  'not_active',
  'admin : prolonger une intervention déjà révoquée est refusé proprement (not_active)'
);

reset role;

select is(
  (select count(*)::int from public.billing_events
    where organization_id = current_setting('cb01.org_a')::uuid
      and event_type = 'admin_commercial_intervention_revoked'),
  1,
  'admin : le rejeu idempotent de la révocation n''écrit pas d''audit supplémentaire'
);

-- ---------------------------------------------------------------------------
-- 7. Org B — les 5 types d'intervention octroyables, chacun validé puis
--    révoqué, sans jamais laisser l'Organization sans avantage explicable
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select set_config(
  'cb01.type_complimentary_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_b')::uuid, 'complimentary', 'essentiel', 'sales_gift',
      'Type complimentary', current_date, current_date + 15,
      null, null, null, 'cb01-org-b-complimentary') ->> 'interventionId')),
  true
);

reset role;

select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_b')::uuid),
  'essentiel',
  'admin : type complimentary accordé avec succès sur Org B'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);
select public.admin_revoke_commercial_intervention(
  current_setting('cb01.org_b')::uuid, current_setting('cb01.type_complimentary_id')::uuid, 'Libère Org B pour le type suivant');

select set_config(
  'cb01.type_promotion_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_b')::uuid, 'promotion', 'avance', 'promotional_campaign',
      'Type promotion', current_date, current_date + 15,
      null, null, null, 'cb01-org-b-promotion') ->> 'interventionId')),
  true
);
reset role;
select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_b')::uuid),
  'avance',
  'admin : type promotion accordé avec succès sur Org B'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);
select public.admin_revoke_commercial_intervention(
  current_setting('cb01.org_b')::uuid, current_setting('cb01.type_promotion_id')::uuid, 'Libère Org B pour le type suivant');

select set_config(
  'cb01.type_partnership_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_b')::uuid, 'partnership', 'patrimoine', 'partner_offer',
      'Type partnership', current_date, current_date + 15,
      null, null, null, 'cb01-org-b-partnership') ->> 'interventionId')),
  true
);
reset role;
select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_b')::uuid),
  'patrimoine',
  'admin : type partnership accordé avec succès sur Org B'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);
select public.admin_revoke_commercial_intervention(
  current_setting('cb01.org_b')::uuid, current_setting('cb01.type_partnership_id')::uuid, 'Libère Org B pour le type suivant');

select set_config(
  'cb01.type_support_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_b')::uuid, 'support_adjustment', 'essentiel', 'support_goodwill',
      'Type support_adjustment, sans date de fin', current_date, null,
      null, null, null, 'cb01-org-b-support') ->> 'interventionId')),
  true
);
reset role;
select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_b')::uuid),
  'essentiel',
  'admin : type support_adjustment accordé avec succès, sans date de fin obligatoire'
);
select is(
  (select ends_on from public.commercial_interventions where id = current_setting('cb01.type_support_id')::uuid),
  null::date,
  'admin : support_adjustment n''exige effectivement aucune date de fin en base'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);
select public.admin_revoke_commercial_intervention(
  current_setting('cb01.org_b')::uuid, current_setting('cb01.type_support_id')::uuid, 'Libère Org B pour le type suivant');

-- --- Type offline_payment : devise, montant, référence, échéance -30j -------
select set_config(
  'cb01.type_offline_id',
  (select (public.admin_grant_commercial_intervention(
      current_setting('cb01.org_b')::uuid, 'offline_payment', 'avance', 'manual_payment_received',
      'Paiement Mobile Money reçu hors Stripe', current_date, current_date + 25,
      'XAF', 80000, 'RECU-2026-0142', 'cb01-org-b-offline-payment') ->> 'interventionId')),
  true
);
reset role;

select is(
  (select plan from public.organization_plans where organization_id = current_setting('cb01.org_b')::uuid),
  'avance',
  'admin : type offline_payment accordé avec succès sur Org B'
);
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'commercial_interventions' and column_name = 'provider'),
  0,
  'admin : commercial_interventions ne porte structurellement aucune colonne provider — un paiement hors ligne ne peut donc jamais valoir stripe'
);
select ok(
  (select currency = 'XAF' and amount_minor = 80000 and manual_reference = 'RECU-2026-0142'
     from public.commercial_interventions where id = current_setting('cb01.type_offline_id')::uuid),
  'admin : devise, montant et référence manuelle du paiement hors ligne sont enregistrés fidèlement'
);

-- --- 8. Isolation inter-Organizations ---------------------------------------
-- Org B a un avantage actif (offline_payment) ; Org A n'en a plus (révoqué au
-- §6.7). Vérifie qu'aucune fiche ne mélange les deux.
select ok(
  (select public.admin_get_organization_detail(current_setting('cb01.org_a')::uuid) -> 'activeIntervention') = 'null'::jsonb,
  'admin : la fiche Org A ne montre aucune intervention active (la sienne a été révoquée)'
);
select is(
  (select public.admin_get_organization_detail(current_setting('cb01.org_b')::uuid) -> 'activeIntervention' ->> 'interventionId'),
  current_setting('cb01.type_offline_id'),
  'admin : la fiche Org B montre exactement SA propre intervention active, jamais celle d''Org A'
);
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id = current_setting('cb01.org_a')::uuid and status = 'active'),
  0,
  'admin : aucune intervention active ne fuit d''Org B vers le décompte d''Org A'
);

reset role;

-- ---------------------------------------------------------------------------
-- 9. Compteurs — reflètent fidèlement octroi / prolongation / révocation
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

-- État courant après §6-8 : Org A n'a plus rien d'actif ; Org B a un
-- offline_payment actif expirant dans 25 jours (donc dans les 30 prochains
-- jours). C'est la seule intervention active de tout le fichier à ce stade.
select is(
  (select (public.admin_commercial_intervention_counters() ->> 'activeInterventions')::int),
  1,
  'admin : activeInterventions reflète exactement l''unique intervention active restante'
);
select is(
  (select (public.admin_commercial_intervention_counters() ->> 'offlinePaymentsActive')::int),
  1,
  'admin : offlinePaymentsActive compte le paiement hors ligne actif d''Org B'
);
select is(
  (select (public.admin_commercial_intervention_counters() ->> 'complimentaryActive')::int),
  0,
  'admin : complimentaryActive à zéro (le seul cadeau du fichier a été révoqué)'
);
select is(
  (select (public.admin_commercial_intervention_counters() ->> 'expiringNext30Days')::int),
  1,
  'admin : expiringNext30Days compte le paiement hors ligne d''Org B (échéance à +25 jours)'
);

-- --- Révocation finale d'Org B : les compteurs retombent à zéro -----------
select public.admin_revoke_commercial_intervention(
  current_setting('cb01.org_b')::uuid, current_setting('cb01.type_offline_id')::uuid, 'Fin du scénario de test');

select is(
  (select (public.admin_commercial_intervention_counters() ->> 'activeInterventions')::int),
  0,
  'admin : après révocation finale, activeInterventions retombe à zéro'
);
select is(
  (select (public.admin_commercial_intervention_counters() ->> 'offlinePaymentsActive')::int),
  0,
  'admin : après révocation finale, offlinePaymentsActive retombe à zéro'
);

reset role;

-- --- Historique intégralement conservé malgré les révocations --------------
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id in (current_setting('cb01.org_a')::uuid, current_setting('cb01.org_b')::uuid)),
  6,
  'admin : les 6 interventions créées au total (1 sur Org A + 5 sur Org B) existent toujours, aucune n''a été supprimée'
);
select is(
  (select count(*)::int from public.commercial_interventions
    where organization_id in (current_setting('cb01.org_a')::uuid, current_setting('cb01.org_b')::uuid)
      and status = 'revoked'),
  6,
  'admin : toutes sont désormais à l''état revoked, jamais supprimées de l''historique'
);

-- ---------------------------------------------------------------------------
-- 10. Réconciliation d'expiration — idempotente, ne casse rien d'existant
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cb000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.admin_reconcile_expired_interventions()$$,
  'admin : admin_reconcile_expired_interventions s''exécute sans erreur'
);
select is(
  (select (public.admin_reconcile_expired_interventions() ->> 'count')::int),
  0,
  'admin : la réconciliation ne trouve rien à faire (aucune intervention active expirée dans ce fichier) et reste idempotente'
);

reset role;

select * from finish();
rollback;
