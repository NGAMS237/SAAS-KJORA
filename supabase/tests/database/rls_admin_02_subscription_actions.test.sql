begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- =============================================================================
-- KJORA — ADMIN-02 — Tests RLS/RPC des actions contrôlées sur l'abonnement
-- =============================================================================
-- Convention identique à rls_admin_01_1_ux_quick_wins.test.sql : transaction
-- annulée (rollback), fixture dédiée, préfixe UUID propre (`ae2…`).
--
-- Prérequis : migrations jusqu'à 20260925120000_admin_02_subscription_actions.sql
-- appliquées sur la base cible.
--
-- N'A PAS ÉTÉ EXÉCUTÉ dans cette session (aucune base Postgres/Supabase
-- éphémère disponible — même limite documentée pour ADMIN-01 et ADMIN-01.1).
-- Prêt à l'emploi pour la CI éphémère existante.
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('ae200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-ae02@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by, status) values
  ('ae210000-0000-4000-8000-00000000000a', 'ae200000-0000-4000-8000-000000000001', 'active'),
  ('ae210000-0000-4000-8000-00000000000b', 'ae200000-0000-4000-8000-000000000001', 'active');

insert into public.organization_profiles (organization_id, name) values
  ('ae210000-0000-4000-8000-00000000000a', 'Kjora Test Admin02 A'),
  ('ae210000-0000-4000-8000-00000000000b', 'Kjora Test Admin02 B');

insert into public.organization_plans (organization_id, plan) values
  ('ae210000-0000-4000-8000-00000000000a', 'essentiel'),
  ('ae210000-0000-4000-8000-00000000000b', 'decouverte');

-- Org A : abonnement payant actif, période en cours — sert au parcours complet
-- suspendre → réactiver → résilier → annuler → archiver (refusé tant qu'actif).
insert into public.organization_subscriptions
  (organization_id, status, plan, billing_cycle, currency, current_period_start, current_period_end)
values
  ('ae210000-0000-4000-8000-00000000000a', 'active', 'essentiel', 'monthly', 'XAF',
   current_date - 10, current_date + 20);

insert into public.platform_admins (user_id, note) values
  ('ae200000-0000-4000-8000-000000000001', 'ADMIN-02 — fixture de test pgTAP');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae200000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 1. Détail — abonnement existant vs inexistant
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_get_subscription('ae210000-0000-4000-8000-00000000000a') ->> 'found')::boolean$$,
  array[true],
  'admin : le détail d''un abonnement existant est trouvé'
);
select results_eq(
  $$select (public.admin_get_subscription('ae210000-0000-4000-8000-00000000000b') ->> 'found')::boolean$$,
  array[false],
  'admin : Org B n''a aucun abonnement enregistré — le détail le signale honnêtement (found=false), sans en créer un'
);

-- ---------------------------------------------------------------------------
-- 2. Changement de forfait — valeurs canoniques, refus si invalide
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_change_subscription_plan('ae210000-0000-4000-8000-00000000000a', 'invalide', 'monthly', null) ->> 'outcome')$$,
  array['invalid_plan'],
  'admin : un forfait hors catalogue est refusé proprement'
);
select results_eq(
  $$select (public.admin_change_subscription_plan('ae210000-0000-4000-8000-00000000000a', 'avance', 'monthly', 'correction manuelle') ->> 'outcome')$$,
  array['plan_changed'],
  'admin : un changement de forfait canonique valide est appliqué'
);
select results_eq(
  $$select plan from public.organization_subscriptions where organization_id = 'ae210000-0000-4000-8000-00000000000a'$$,
  array['avance'],
  'admin : le forfait enregistré reflète bien le changement'
);

-- ---------------------------------------------------------------------------
-- 3. Suspendre / Réactiver — réutilise billing_blocked
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_suspend_subscription('ae210000-0000-4000-8000-00000000000a', 'impayé constaté') ->> 'outcome')$$,
  array['suspended'],
  'admin : la suspension aboutit'
);
select results_eq(
  $$select status from public.organization_subscriptions where organization_id = 'ae210000-0000-4000-8000-00000000000a'$$,
  array['billing_blocked'],
  'admin : la suspension pose le statut billing_blocked existant, pas un nouveau statut'
);
select results_eq(
  $$select (public.admin_suspend_subscription('ae210000-0000-4000-8000-00000000000a', null) ->> 'outcome')$$,
  array['already_suspended'],
  'admin : une double suspension est gérée proprement, sans erreur'
);
select results_eq(
  $$select (public.admin_reactivate_subscription('ae210000-0000-4000-8000-00000000000a', 'régularisé') ->> 'outcome')$$,
  array['reactivated'],
  'admin : la réactivation aboutit depuis billing_blocked'
);
select results_eq(
  $$select status from public.organization_subscriptions where organization_id = 'ae210000-0000-4000-8000-00000000000a'$$,
  array['active'],
  'admin : la réactivation restaure le statut active'
);

-- ---------------------------------------------------------------------------
-- 4. Résiliation programmée / annulation
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_schedule_subscription_cancellation('ae210000-0000-4000-8000-00000000000a', null) ->> 'outcome')$$,
  array['cancellation_scheduled'],
  'admin : la résiliation programmée aboutit'
);
select results_eq(
  $$select status from public.organization_subscriptions where organization_id = 'ae210000-0000-4000-8000-00000000000a'$$,
  array['cancellation_scheduled'],
  'admin : le statut reflète la résiliation programmée'
);
select isnt(
  (select current_period_end from public.organization_subscriptions
    where organization_id = 'ae210000-0000-4000-8000-00000000000a'),
  null,
  'admin : la fin de période payée reste préservée après résiliation programmée'
);
select results_eq(
  $$select (public.admin_revoke_subscription_cancellation('ae210000-0000-4000-8000-00000000000a', 'annulée par le client') ->> 'outcome')$$,
  array['cancellation_revoked'],
  'admin : l''annulation de la résiliation programmée aboutit'
);
select results_eq(
  $$select status from public.organization_subscriptions where organization_id = 'ae210000-0000-4000-8000-00000000000a'$$,
  array['active'],
  'admin : l''abonnement redevient actif après annulation de la résiliation'
);

-- ---------------------------------------------------------------------------
-- 5. Archivage — refusé tant qu'actif, accepté après résiliation
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_archive_subscription('ae210000-0000-4000-8000-00000000000a', null) ->> 'outcome')$$,
  array['archive_refused'],
  'admin : un abonnement actif ne peut pas être archivé directement'
);
select ok(
  (select public.admin_schedule_subscription_cancellation('ae210000-0000-4000-8000-00000000000a', null) ->> 'outcome') = 'cancellation_scheduled',
  'admin : résiliation reprogrammée avant archivage'
);
select results_eq(
  $$select (public.admin_archive_subscription('ae210000-0000-4000-8000-00000000000a', 'nettoyage console') ->> 'outcome')$$,
  array['archived'],
  'admin : l''archivage aboutit une fois l''abonnement résilié'
);
select isnt(
  (select archived_at from public.organization_subscriptions
    where organization_id = 'ae210000-0000-4000-8000-00000000000a'),
  null,
  'admin : archived_at est renseigné, la ligne n''est jamais supprimée'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, null, null, null, 'active') ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : l''abonnement archivé disparaît de la liste active par défaut (seule Org B y reste)'
);
select results_eq(
  $$select (public.admin_list_subscriptions(25, 0, null, null, null, null, 'archived') ->> 'total_count')::bigint$$,
  array[1::bigint],
  'admin : l''abonnement archivé reste retrouvable via le filtre archivés'
);

-- ---------------------------------------------------------------------------
-- 6. Audit — chaque mutation a produit un événement exploitable
-- ---------------------------------------------------------------------------

select cmp_ok(
  (select count(*) from public.billing_events
    where organization_id = 'ae210000-0000-4000-8000-00000000000a'
      and event_type like 'admin_%'),
  '>=',
  6::bigint,
  'admin : au moins six événements d''audit admin_* ont été journalisés pour Org A'
);

-- ---------------------------------------------------------------------------
-- 7. Isolation — l'action sur Org A n'a jamais touché Org B
-- ---------------------------------------------------------------------------

select results_eq(
  $$select (public.admin_get_subscription('ae210000-0000-4000-8000-00000000000b') ->> 'found')::boolean$$,
  array[false],
  'admin : après sept mutations sur Org A, Org B n''a toujours aucun abonnement enregistré — isolation totale'
);

-- ---------------------------------------------------------------------------
-- 8. Refus — anonyme jamais autorisé, même avec des paramètres valides
-- ---------------------------------------------------------------------------

reset role;
set local role anon;

select throws_ok(
  $$select public.admin_suspend_subscription('ae210000-0000-4000-8000-00000000000a', null)$$,
  '42501', null,
  'anonyme : admin_suspend_subscription toujours refusé'
);
select throws_ok(
  $$select public.admin_change_subscription_plan('ae210000-0000-4000-8000-00000000000a', 'avance', 'monthly', null)$$,
  '42501', null,
  'anonyme : admin_change_subscription_plan toujours refusé'
);

reset role;

select * from finish();
rollback;
