begin;

-- =============================================================================
-- KJORA — ADMIN-BILLING-OPS-01 — Interventions commerciales manuelles
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante
-- n'est modifiée ni supprimée. Aucune Organization, utilisateur, abonnement
-- ou facture n'est jamais physiquement supprimé par ce lot.
--
-- NON APPLIQUÉE à ce stade (ni sur KJORA Dev, ni sur KJORA Production) —
-- conformément au point d'arrêt obligatoire du mandat ADMIN-BILLING-OPS-01.
--
-- ---------------------------------------------------------------------------
-- MODÈLE RETENU — quatre sources de vérité distinctes, jamais confondues
-- ---------------------------------------------------------------------------
--
--   1. Abonnement RÉELLEMENT enregistré  → organization_subscriptions (ALIGN-03)
--      Jamais écrit par ce lot. Restera la seule table que Stripe/Mobile Money
--      pourra un jour piloter automatiquement (ALIGN-04). Une intervention
--      manuelle ne s'y insère JAMAIS — c'est précisément ce qui garantit
--      qu'une future souscription Stripe ne pourra jamais être écrasée ou
--      confondue avec un geste commercial manuel.
--
--   2. Forfait EFFECTIF (entitlements)   → organization_plans (ALIGN-01)
--      C'est le SEUL champ que ce lot modifie pour changer les droits d'accès
--      réels d'une Organization. Il est mis à jour via la fonction interne
--      DÉJÀ EXISTANTE `private.assign_organization_plan(...)` (ALIGN-01,
--      §13 de 20260902200000) — jamais par une écriture directe. Ce choix
--      réutilise l'existant au lieu d'inventer un second mécanisme d'octroi.
--
--   3. Avantage commercial TEMPORAIRE    → public.commercial_interventions (NEW)
--      Une seule nouvelle table pour les cinq types d'intervention demandés
--      (complimentary / offline_payment / promotion / partnership /
--      support_adjustment). Aucune table par type : la distinction se fait
--      par la colonne `intervention_type`, pas par la structure.
--
--   4. Trace de chaque action            → public.billing_events (ALIGN-03, réutilisé)
--      Déjà lu par la console (`admin_recent_events`, ADMIN-01). Ce lot y
--      ajoute des événements `event_type` préfixés `admin_commercial_*` au
--      lieu de créer une deuxième table d'audit. `administrative_audit_log`
--      (Lot 5C) n'est PAS réutilisé ici : cette table est strictement
--      tenant-scopée (RLS conditionnée à `private.has_capability(...,
--      'audit.view')`, donc au rôle Owner) et sa contrainte `action` est
--      fermée sur des actions de gestion de membres — la réutiliser aurait
--      justement fait dépendre une action platform_admin du modèle RBAC par
--      Organization, ce que le mandat interdit explicitement.
--
-- RÈGLE DE SOURCE DE VÉRITÉ (garantie par construction) :
--   • Un forfait offert n'écrit jamais dans organization_subscriptions →
--     il ne peut donc jamais apparaître comme un paiement Stripe réussi.
--   • Un paiement hors ligne est enregistré UNIQUEMENT dans
--     commercial_interventions (intervention_type = 'offline_payment') →
--     son `provider` n'existe même pas comme colonne à cet endroit : il ne
--     peut structurellement jamais valoir 'stripe'.
--   • À l'expiration (ends_on dépassée) ou à la révocation, le forfait
--     effectif normal est recalculé comme
--     `coalesce(organization_subscriptions.plan, 'decouverte')` — c'est-à-dire
--     exactement ce que la facturation réelle implique, sans avoir besoin de
--     mémoriser un instantané séparé du forfait précédent (un tel instantané
--     serait une donnée dupliquée et potentiellement périmée). Aucune ligne
--     n'est jamais supprimée : `commercial_interventions` conserve
--     intégralement l'historique (statut `expired`/`revoked`), et
--     `organization_plans` garde son propre horodatage `assigned_at`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table — une seule ligne par intervention, jamais supprimée
-- ---------------------------------------------------------------------------

create table public.commercial_interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  intervention_type text not null check (intervention_type in (
    'complimentary', 'offline_payment', 'promotion', 'partnership', 'support_adjustment'
  )),

  -- Motif NORMALISÉ (liste fermée) — distinct de la note libre ci-dessous.
  reason_code text not null check (reason_code in (
    'sales_gift', 'partner_offer', 'manual_payment_received',
    'promotional_campaign', 'support_goodwill', 'other'
  )),

  -- Note administrative libre. Toujours obligatoire : sert de motif du geste
  -- initial (les révocations/prolongations portent leur propre motif, voir
  -- §3/§4, sans jamais réécrire cette note d'origine).
  admin_note text not null check (char_length(trim(admin_note)) between 3 and 1000),

  -- Forfait accordé — toujours l'un des cinq forfaits canoniques ALIGN-00.
  -- Jamais 'sur_mesure' ici : un Sur mesure reste un devis commercial validé
  -- par ailleurs, jamais un octroi manuel improvisé depuis cette console.
  granted_plan text not null check (granted_plan in (
    'decouverte', 'essentiel', 'avance', 'patrimoine'
  )),

  starts_on date not null default current_date,
  ends_on   date,

  -- Paiement hors ligne uniquement. Jamais de moyen de paiement, jamais de
  -- référence fournisseur : `manual_reference` est un simple libellé opaque
  -- choisi par l'administrateur (ex. numéro de reçu papier), jamais un numéro
  -- de carte, de compte Mobile Money ou bancaire.
  currency        text check (currency is null or currency in ('XAF', 'CAD')),
  amount_minor    bigint check (amount_minor is null or amount_minor > 0),
  manual_reference text check (manual_reference is null or char_length(manual_reference) <= 200),

  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),

  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),

  revoked_at    timestamptz,
  revoked_by    uuid references auth.users (id),
  revoke_reason text check (revoke_reason is null or char_length(trim(revoke_reason)) between 3 and 1000),

  extended_at      timestamptz,
  extension_count  integer not null default 0 check (extension_count >= 0),

  -- Protection contre la double soumission : un même jeton ne crée jamais
  -- deux interventions pour la même Organization (voir RPC §7).
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),

  constraint commercial_interventions_end_required_by_type check (
    intervention_type not in ('complimentary', 'promotion', 'partnership')
    or ends_on is not null
  ),
  constraint commercial_interventions_period_ordered check (
    ends_on is null or ends_on > starts_on
  ),
  constraint commercial_interventions_offline_payment_amount check (
    intervention_type <> 'offline_payment'
    or (currency is not null and amount_minor is not null)
  ),
  constraint commercial_interventions_non_offline_has_no_amount check (
    intervention_type = 'offline_payment'
    or (currency is null and amount_minor is null and manual_reference is null)
  ),
  constraint commercial_interventions_revoked_has_reason check (
    status <> 'revoked' or (revoked_at is not null and revoked_by is not null and revoke_reason is not null)
  ),

  constraint commercial_interventions_org_idempotency_unique
    unique (organization_id, idempotency_key)
);

comment on table public.commercial_interventions is
  'ADMIN-BILLING-OPS-01 : intervention commerciale manuelle sur le forfait '
  'effectif d''une Organization (cadeau, paiement hors ligne, promotion, '
  'partenariat, correction commerciale). Ne remplace jamais organization_subscriptions '
  '(vérité de facturation réelle, réservée à un futur provider automatisé) ni '
  'organization_plans (vérité d''entitlement, mise à jour via la fonction '
  'existante private.assign_organization_plan). Aucune ligne n''est jamais '
  'supprimée : une intervention terminée passe à expired ou revoked.';

create index commercial_interventions_org_status_idx
  on public.commercial_interventions (organization_id, status);
create index commercial_interventions_active_ends_idx
  on public.commercial_interventions (ends_on)
  where status = 'active' and ends_on is not null;
create index commercial_interventions_org_created_idx
  on public.commercial_interventions (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS — zéro accès direct, même en lecture. Tout passe par les RPC.
-- ---------------------------------------------------------------------------
-- Même posture que public.platform_admins (ADMIN-01, §3) : la RLS est activée
-- sans aucune policy, et le revoke explicite est une seconde barrière contre
-- un grant accordé par erreur plus tard. Aucune fonctionnalité de cette
-- version n'a besoin de lire cette table directement depuis le navigateur —
-- platform_admin inclus.

alter table public.commercial_interventions enable row level security;

revoke all on public.commercial_interventions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC — fiche Organization complète (platform_admin uniquement)
-- ---------------------------------------------------------------------------
-- Un identifiant d'Organization inexistant renvoie {found:false} plutôt que
-- de lever une exception : un lien copié-collé vers une Organization
-- supprimée par ailleurs ne doit jamais ressembler à un incident technique.
--
-- N'expose JAMAIS : provider_customer_ref, provider_subscription_ref, marque
-- ou 4 derniers chiffres du moyen de paiement, jeton, secret, contenu de
-- webhook, ni aucune donnée d'une autre Organization. `provider` (générique,
-- ex. 'stripe' ou null) reste le seul champ fournisseur exposé — jamais une
-- référence.

create or replace function public.admin_get_organization_detail(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org      public.organizations;
  profile  public.organization_profiles;
  sub      public.organization_subscriptions;
  eff_plan text;
  owner_email text;
  active_members int;
  properties_count int;
  units_count int;
  active_intervention jsonb;
  recent_events jsonb;
  fallback_plan text;
  mismatch boolean;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id;
  if org.id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into profile from public.organization_profiles where organization_id = target_organization_id;
  select * into sub from public.organization_subscriptions where organization_id = target_organization_id;

  select coalesce(op.plan, 'decouverte') into eff_plan
  from public.organization_plans op where op.organization_id = target_organization_id;
  eff_plan := coalesce(eff_plan, 'decouverte');

  select u.email::text into owner_email
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = target_organization_id
    and m.role = 'organization_owner' and m.status = 'active'
  order by m.created_at asc
  limit 1;

  select count(*) into active_members
  from public.memberships where organization_id = target_organization_id and status = 'active';

  select count(*) into properties_count
  from public.properties where organization_id = target_organization_id and status = 'active';

  select count(*) into units_count
  from public.units where organization_id = target_organization_id and status = 'active';

  select jsonb_build_object(
    'interventionId', ci.id,
    'interventionType', ci.intervention_type,
    'reasonCode', ci.reason_code,
    'adminNote', ci.admin_note,
    'grantedPlan', ci.granted_plan,
    'startsOn', ci.starts_on,
    'endsOn', ci.ends_on,
    'currency', ci.currency,
    'amountMinor', ci.amount_minor,
    'manualReference', ci.manual_reference,
    'createdByEmail', (select email::text from auth.users where id = ci.created_by),
    'createdAt', ci.created_at,
    'extensionCount', ci.extension_count,
    -- L'intervention peut être physiquement encore 'active' en base tout en
    -- étant déjà arrivée à échéance : la réconciliation (§8) ne s'exécute que
    -- lors d'un passage périodique. La fiche affiche donc l'état RÉEL calculé
    -- ici, jamais uniquement la colonne `status`, pour ne jamais afficher un
    -- avantage expiré comme actif entre deux réconciliations.
    'effectivelyExpired', (ci.ends_on is not null and ci.ends_on < current_date)
  )
  into active_intervention
  from public.commercial_interventions ci
  where ci.organization_id = target_organization_id and ci.status = 'active'
  order by ci.created_at desc
  limit 1;

  select coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) into recent_events
  from (
    select
      be.id as event_id,
      be.event_type,
      be.payload,
      be.created_at,
      u.email::text as actor_email
    from public.billing_events be
    left join auth.users u on u.id = be.actor_user_id
    where be.organization_id = target_organization_id
      and be.event_type like 'admin_commercial_%'
    order by be.created_at desc
    limit 20
  ) e;

  fallback_plan := coalesce(sub.plan, 'decouverte');
  -- Incohérence signalée uniquement quand elle N'EST PAS expliquée par une
  -- intervention manuelle active : un forfait effectif "avance" alors que la
  -- facturation réelle dit "decouverte" est normal et voulu s'il vient d'un
  -- cadeau commercial actif — ce n'est une anomalie que si RIEN ne l'explique.
  mismatch := (eff_plan <> fallback_plan) and (active_intervention is null);

  return jsonb_build_object(
    'found', true,
    'organizationId', org.id,
    'name', coalesce(profile.name, ''),
    'status', org.status,
    'createdAt', org.created_at,
    'ownerEmail', owner_email,
    'activeMemberCount', active_members,
    'propertiesCount', properties_count,
    'unitsCount', units_count,
    'effectivePlan', eff_plan,
    'subscription', case when sub.organization_id is null then
      jsonb_build_object('exists', false, 'status', 'free', 'plan', 'decouverte',
        'billingCycle', 'monthly', 'currency', 'XAF', 'provider', null)
    else
      jsonb_build_object(
        'exists', true,
        'status', sub.status,
        'plan', sub.plan,
        'billingCycle', sub.billing_cycle,
        'currency', sub.currency,
        'currentPeriodEnd', sub.current_period_end,
        'renewalDate', sub.renewal_date,
        -- Générique uniquement : jamais provider_customer_ref/provider_subscription_ref.
        'provider', sub.provider)
    end,
    'planBillingMismatch', mismatch,
    'activeIntervention', active_intervention,
    'recentAdminEvents', recent_events
  );
end;
$$;

revoke all on function public.admin_get_organization_detail(uuid) from public, anon;
grant execute on function public.admin_get_organization_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC — accorder une intervention (« Accorder un forfait »)
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant_commercial_intervention(
  target_organization_id uuid,
  p_intervention_type text,
  p_granted_plan text,
  p_reason_code text,
  p_admin_note text,
  p_starts_on date,
  p_ends_on date,
  p_currency text default null,
  p_amount_minor bigint default null,
  p_manual_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
  active_id uuid;
  new_id uuid;
  effective_currency text;
  effective_amount bigint;
  effective_reference text;
  effective_starts date;
begin
  perform private.assert_platform_admin();

  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    return jsonb_build_object('outcome', 'invalid_idempotency_key');
  end if;

  -- Verrou de ligne : sérialise deux interventions concurrentes sur la même
  -- Organization (double-clic, deux administrateurs).
  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_intervention_type not in
     ('complimentary', 'offline_payment', 'promotion', 'partnership', 'support_adjustment')
  then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;

  if p_granted_plan not in ('decouverte', 'essentiel', 'avance', 'patrimoine') then
    return jsonb_build_object('outcome', 'invalid_plan');
  end if;

  if p_reason_code not in
     ('sales_gift', 'partner_offer', 'manual_payment_received', 'promotional_campaign',
      'support_goodwill', 'other')
  then
    return jsonb_build_object('outcome', 'invalid_reason');
  end if;

  if p_admin_note is null or char_length(trim(p_admin_note)) < 3 then
    return jsonb_build_object('outcome', 'note_required');
  end if;

  effective_starts := coalesce(p_starts_on, current_date);

  if p_intervention_type in ('complimentary', 'promotion', 'partnership') then
    if p_ends_on is null then
      return jsonb_build_object('outcome', 'end_date_required');
    end if;
  end if;

  if p_ends_on is not null and p_ends_on <= effective_starts then
    return jsonb_build_object('outcome', 'invalid_period');
  end if;

  -- Le serveur DÉCIDE seul ce qui est retenu pour le montant/la devise/la
  -- référence : jamais les valeurs du client au-delà de ce que le type
  -- d'intervention autorise réellement.
  if p_intervention_type = 'offline_payment' then
    effective_currency := p_currency;
    effective_amount := p_amount_minor;
    effective_reference := p_manual_reference;
    if effective_currency is null or effective_currency not in ('XAF', 'CAD') then
      return jsonb_build_object('outcome', 'invalid_currency');
    end if;
    if effective_amount is null or effective_amount <= 0 then
      return jsonb_build_object('outcome', 'invalid_amount');
    end if;
  else
    effective_currency := null;
    effective_amount := null;
    effective_reference := null;
  end if;

  -- Idempotence : un rejeu du même jeton pour cette Organization renvoie le
  -- résultat déjà produit, sans jamais créer une seconde ligne ni ré-écrire
  -- le forfait effectif ou l'audit une seconde fois.
  select id into existing_id from public.commercial_interventions
   where organization_id = target_organization_id and idempotency_key = p_idempotency_key;
  if existing_id is not null then
    return jsonb_build_object('outcome', 'already_recorded', 'interventionId', existing_id);
  end if;

  -- Une seule intervention active à la fois : la mandat impose de passer par
  -- « Révoquer » ou « Prolonger » plutôt que d'empiler des octrois silencieux.
  select id into active_id from public.commercial_interventions
   where organization_id = target_organization_id and status = 'active';
  if active_id is not null then
    return jsonb_build_object('outcome', 'intervention_already_active', 'interventionId', active_id);
  end if;

  insert into public.commercial_interventions (
    organization_id, intervention_type, reason_code, admin_note, granted_plan,
    starts_on, ends_on, currency, amount_minor, manual_reference,
    created_by, idempotency_key
  ) values (
    target_organization_id, p_intervention_type, p_reason_code, trim(p_admin_note), p_granted_plan,
    effective_starts, p_ends_on, effective_currency, effective_amount, effective_reference,
    (select auth.uid()), p_idempotency_key
  )
  returning id into new_id;

  perform private.assign_organization_plan(target_organization_id, p_granted_plan);

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    target_organization_id, 'admin_commercial_intervention_granted', null, 'active',
    jsonb_build_object(
      'interventionId', new_id,
      'interventionType', p_intervention_type,
      'reasonCode', p_reason_code,
      'note', trim(p_admin_note),
      'grantedPlan', p_granted_plan,
      'startsOn', effective_starts,
      'endsOn', p_ends_on,
      'currency', effective_currency,
      'amountMinor', effective_amount
    ),
    (select auth.uid())
  );

  return jsonb_build_object('outcome', 'granted', 'interventionId', new_id, 'effectivePlan', p_granted_plan);
end;
$$;

revoke all on function public.admin_grant_commercial_intervention(
  uuid, text, text, text, text, date, date, text, bigint, text, text
) from public, anon;
grant execute on function public.admin_grant_commercial_intervention(
  uuid, text, text, text, text, date, date, text, bigint, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC — révoquer une intervention active (« Révoquer l'avantage »)
-- ---------------------------------------------------------------------------
-- Ne supprime jamais la ligne : marque revoked + restaure le calcul normal du
-- forfait effectif (celui qu'implique la facturation réellement enregistrée).

create or replace function public.admin_revoke_commercial_intervention(
  target_organization_id uuid,
  target_intervention_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ci public.commercial_interventions;
  fallback_plan text;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  select * into ci from public.commercial_interventions
   where id = target_intervention_id and organization_id = target_organization_id
   for update;

  if ci.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- Idempotent : un second appel (double-clic) sur une intervention déjà
  -- révoquée ou expirée renvoie proprement 'not_active', sans erreur.
  if ci.status <> 'active' then
    return jsonb_build_object('outcome', 'not_active', 'status', ci.status);
  end if;

  select coalesce(s.plan, 'decouverte') into fallback_plan
  from public.organization_subscriptions s where s.organization_id = target_organization_id;
  fallback_plan := coalesce(fallback_plan, 'decouverte');

  update public.commercial_interventions
     set status = 'revoked',
         revoked_at = now(),
         revoked_by = (select auth.uid()),
         revoke_reason = trim(p_reason)
   where id = ci.id;

  perform private.assign_organization_plan(target_organization_id, fallback_plan);

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    target_organization_id, 'admin_commercial_intervention_revoked', 'active', 'revoked',
    jsonb_build_object(
      'interventionId', ci.id,
      'reason', trim(p_reason),
      'planBefore', ci.granted_plan,
      'planAfter', fallback_plan
    ),
    (select auth.uid())
  );

  return jsonb_build_object('outcome', 'revoked', 'effectivePlan', fallback_plan);
end;
$$;

revoke all on function public.admin_revoke_commercial_intervention(uuid, uuid, text) from public, anon;
grant execute on function public.admin_revoke_commercial_intervention(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC — prolonger une intervention active (« Prolonger »)
-- ---------------------------------------------------------------------------

create or replace function public.admin_extend_commercial_intervention(
  target_organization_id uuid,
  target_intervention_id uuid,
  new_ends_on date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ci public.commercial_interventions;
  minimum_bound date;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  select * into ci from public.commercial_interventions
   where id = target_intervention_id and organization_id = target_organization_id
   for update;

  if ci.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if ci.status <> 'active' then
    return jsonb_build_object('outcome', 'not_active', 'status', ci.status);
  end if;

  minimum_bound := coalesce(ci.ends_on, current_date);
  if new_ends_on is null or new_ends_on <= minimum_bound then
    return jsonb_build_object('outcome', 'invalid_period');
  end if;

  update public.commercial_interventions
     set ends_on = new_ends_on,
         extended_at = now(),
         extension_count = extension_count + 1
   where id = ci.id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    target_organization_id, 'admin_commercial_intervention_extended', 'active', 'active',
    jsonb_build_object(
      'interventionId', ci.id,
      'reason', trim(p_reason),
      'endsOnBefore', ci.ends_on,
      'endsOnAfter', new_ends_on
    ),
    (select auth.uid())
  );

  return jsonb_build_object('outcome', 'extended', 'endsOn', new_ends_on);
end;
$$;

revoke all on function public.admin_extend_commercial_intervention(uuid, uuid, date, text) from public, anon;
grant execute on function public.admin_extend_commercial_intervention(uuid, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC de maintenance — réconciliation des interventions expirées
-- ---------------------------------------------------------------------------
-- N'est PAS câblée sur le cron quotidien existant dans ce lot (voir rapport,
-- section « étapes nécessaires avant application sur KJORA Dev ») : ce lot ne
-- modifie aucun déploiement Vercel. Cette RPC est prête à être appelée par ce
-- cron, ou manuellement par un platform_admin, sans dépendre de son câblage.
-- Idempotente : ré-exécuter sur une intervention déjà réconciliée est un no-op.

create or replace function public.admin_reconcile_expired_interventions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  reconciled_count integer := 0;
  fallback_plan text;
begin
  perform private.assert_platform_admin();

  for rec in
    select * from public.commercial_interventions
     where status = 'active' and ends_on is not null and ends_on < current_date
     order by organization_id
     for update
  loop
    select coalesce(s.plan, 'decouverte') into fallback_plan
    from public.organization_subscriptions s where s.organization_id = rec.organization_id;
    fallback_plan := coalesce(fallback_plan, 'decouverte');

    update public.commercial_interventions set status = 'expired' where id = rec.id;

    perform private.assign_organization_plan(rec.organization_id, fallback_plan);

    insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
    values (
      rec.organization_id, 'admin_commercial_intervention_expired', 'active', 'expired',
      jsonb_build_object('interventionId', rec.id, 'planBefore', rec.granted_plan, 'planAfter', fallback_plan),
      (select auth.uid())
    );

    reconciled_count := reconciled_count + 1;
  end loop;

  return jsonb_build_object('outcome', 'reconciled', 'count', reconciled_count);
end;
$$;

revoke all on function public.admin_reconcile_expired_interventions() from public, anon;
grant execute on function public.admin_reconcile_expired_interventions() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC de lecture — compteurs pour la vue d'ensemble (§7 du mandat)
-- ---------------------------------------------------------------------------

create or replace function public.admin_commercial_intervention_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();

  return jsonb_build_object(
    'activeInterventions', (
      select count(*) from public.commercial_interventions where status = 'active'
    ),
    'complimentaryActive', (
      select count(*) from public.commercial_interventions
       where status = 'active' and intervention_type in ('complimentary', 'promotion', 'partnership')
    ),
    'offlinePaymentsActive', (
      select count(*) from public.commercial_interventions
       where status = 'active' and intervention_type = 'offline_payment'
    ),
    'expiringNext30Days', (
      select count(*) from public.commercial_interventions
       where status = 'active' and ends_on is not null
         and ends_on between current_date and current_date + interval '30 days'
    )
  );
end;
$$;

revoke all on function public.admin_commercial_intervention_counters() from public, anon;
grant execute on function public.admin_commercial_intervention_counters() to authenticated;

commit;
