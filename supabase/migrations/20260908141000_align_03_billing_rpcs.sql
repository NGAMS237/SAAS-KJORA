begin;

-- =============================================================================
-- ALIGN-03 — RPC de facturation SaaS
-- =============================================================================
-- Toutes les fonctions : SECURITY DEFINER, search_path vide, anon révoqué,
-- capability revérifiée, Organization jamais déduite d'un paramètre client seul.
--
-- Invariant central : aucune de ces fonctions n'active un plan payant.
-- L'activation appartient à ALIGN-04, après confirmation de paiement vérifiée.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Usage courant d'une Organization — sert au contrôle de downgrade
-- ---------------------------------------------------------------------------

create or replace function private.billing_usage(target_organization_id uuid)
returns table (
  active_properties int,
  active_units int,
  collaborators int,
  organizations int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.properties p
      where p.organization_id = target_organization_id and p.status = 'active'),
    (select count(*)::int from public.units u
      where u.organization_id = target_organization_id and u.status = 'active'),
    (select count(*)::int from public.memberships m
      where m.organization_id = target_organization_id
        and m.status = 'active' and m.role <> 'organization_owner'),
    (select count(*)::int from public.memberships m
      where m.user_id = (
        select m2.user_id from public.memberships m2
        where m2.organization_id = target_organization_id
          and m2.role = 'organization_owner' and m2.status = 'active'
        limit 1)
        and m.role = 'organization_owner' and m.status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- Vue d'ensemble de la facturation
-- ---------------------------------------------------------------------------

create or replace function public.get_billing_overview(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  eff text;
  usg record;
  lim record;
  op  public.organization_plans;
begin
  if not private.has_capability(target_organization_id, 'billing.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id;

  op  := private.get_org_plan(target_organization_id);
  eff := op.plan;

  select * into usg from private.billing_usage(target_organization_id);
  select * into lim from private.plan_quota_limits(
    op.plan, op.custom_max_properties, op.custom_max_active_units,
    op.custom_max_collaborators, op.custom_max_organizations);

  return jsonb_build_object(
    'organizationId', target_organization_id,
    -- Plan EFFECTIF : celui qui gouverne réellement les entitlements (ALIGN-01)
    'effectivePlan', eff,
    'subscription', case when sub.organization_id is null then
      jsonb_build_object(
        'exists', false, 'status', 'free', 'plan', 'decouverte',
        'billingCycle', 'monthly', 'currency', 'XAF')
    else
      jsonb_build_object(
        'exists', true,
        'status', sub.status,
        'plan', sub.plan,
        'billingCycle', sub.billing_cycle,
        'currency', sub.currency,
        'currentPeriodStart', sub.current_period_start,
        'currentPeriodEnd', sub.current_period_end,
        'renewalDate', sub.renewal_date,
        'graceEndsOn', sub.grace_ends_on,
        'blockedAt', sub.blocked_at,
        'cancellationEffectiveOn', sub.cancellation_effective_on,
        'scheduledPlan', sub.scheduled_plan,
        'scheduledCycle', sub.scheduled_cycle,
        'scheduledEffectiveOn', sub.scheduled_effective_on,
        'pendingPlan', sub.pending_plan,
        'pendingCycle', sub.pending_cycle,
        'pendingAmountMinor', sub.pending_amount_minor,
        'provider', sub.provider,
        'paymentMethodBrand', sub.payment_method_brand,
        'paymentMethodLast4', sub.payment_method_last4,
        'paymentMethodExpiresOn', sub.payment_method_expires_on)
    end,
    'usage', jsonb_build_object(
      'activeProperties', usg.active_properties,
      'activeUnits', usg.active_units,
      'collaborators', usg.collaborators,
      'organizations', usg.organizations),
    'quotas', jsonb_build_object(
      'maxProperties', lim.max_properties,
      'maxActiveUnits', lim.max_active_units,
      'maxCollaborators', lim.max_collaborators,
      'maxOrganizations', lim.max_organizations)
  );
end;
$$;

revoke all on function public.get_billing_overview(uuid) from public, anon;
grant execute on function public.get_billing_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Factures de l'Organization
-- ---------------------------------------------------------------------------

create or replace function public.list_billing_invoices(target_organization_id uuid)
returns setof public.billing_invoices
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_capability(target_organization_id, 'billing.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select * from public.billing_invoices
     where organization_id = target_organization_id
     order by issued_on desc, created_at desc
     limit 200;
end;
$$;

revoke all on function public.list_billing_invoices(uuid) from public, anon;
grant execute on function public.list_billing_invoices(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Changement de plan
-- ---------------------------------------------------------------------------
-- Upgrade   : enregistre une INTENTION et renvoie un devis au prorata.
--             N'active RIEN. L'activation exige un paiement vérifié (ALIGN-04).
-- Downgrade : refusé si l'usage dépasse les quotas cibles ; sinon programmé
--             en fin de période payée. Aucune donnée n'est jamais supprimée.
-- ---------------------------------------------------------------------------

create or replace function public.request_plan_change(
  target_organization_id uuid,
  target_plan  text,
  target_cycle text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  current_plan text;
  rank_from int;
  rank_to   int;
  price_to   bigint;
  price_from bigint;
  period_days int;
  days_left   int;
  credit_minor bigint;
  charge_minor bigint;
  due_minor    bigint;
  usg record;
  lim record;
  blockers jsonb := '[]'::jsonb;
  effective date;
begin
  if not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure')
     or target_cycle not in ('monthly','annual') then
    raise exception 'invalid_plan_change' using errcode = '22023';
  end if;

  -- Sur mesure ne passe jamais par le self-service.
  if target_plan = 'sur_mesure' then
    return jsonb_build_object('outcome','quote_required',
      'message','Le plan Sur mesure fait l''objet d''un devis commercial.');
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null then
    insert into public.organization_subscriptions (organization_id)
    values (target_organization_id)
    returning * into sub;
  end if;

  if sub.status = 'billing_blocked' then
    return jsonb_build_object('outcome','blocked',
      'message','Réglez votre abonnement avant de changer de plan.');
  end if;

  current_plan := sub.plan;
  rank_from := case current_plan when 'decouverte' then 0 when 'essentiel' then 1
                 when 'avance' then 2 when 'patrimoine' then 3 else 4 end;
  rank_to   := case target_plan  when 'decouverte' then 0 when 'essentiel' then 1
                 when 'avance' then 2 when 'patrimoine' then 3 else 4 end;

  if rank_to = rank_from and target_cycle = sub.billing_cycle then
    return jsonb_build_object('outcome','unchanged');
  end if;

  select amount_minor into price_to from public.billing_prices
   where plan = target_plan and cycle = target_cycle and currency = sub.currency;
  select amount_minor into price_from from public.billing_prices
   where plan = current_plan and cycle = sub.billing_cycle and currency = sub.currency;

  -- ---------------------------------------------------------------- DOWNGRADE
  if rank_to < rank_from then
    select * into usg from private.billing_usage(target_organization_id);
    select * into lim from private.plan_quota_limits(target_plan, null, null, null, null);

    if lim.max_properties is not null and usg.active_properties > lim.max_properties then
      blockers := blockers || jsonb_build_object('quota','properties',
        'libelle','Biens','actuel',usg.active_properties,'limite',lim.max_properties);
    end if;
    if lim.max_active_units is not null and usg.active_units > lim.max_active_units then
      blockers := blockers || jsonb_build_object('quota','active_units',
        'libelle','Logements actifs','actuel',usg.active_units,'limite',lim.max_active_units);
    end if;
    if lim.max_collaborators is not null and usg.collaborators > lim.max_collaborators then
      blockers := blockers || jsonb_build_object('quota','collaborators',
        'libelle','Collaborateurs','actuel',usg.collaborators,'limite',lim.max_collaborators);
    end if;
    if lim.max_organizations is not null and usg.organizations > lim.max_organizations then
      blockers := blockers || jsonb_build_object('quota','organizations',
        'libelle','Organisations','actuel',usg.organizations,'limite',lim.max_organizations);
    end if;

    if jsonb_array_length(blockers) > 0 then
      -- Refus propre. Aucune donnée n'est supprimée ni archivée.
      return jsonb_build_object('outcome','downgrade_refused','blockers',blockers);
    end if;

    effective := coalesce(sub.current_period_end, current_date);

    update public.organization_subscriptions
       set scheduled_plan = target_plan,
           scheduled_cycle = target_cycle,
           scheduled_effective_on = effective
     where organization_id = target_organization_id;

    insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                       payload, actor_user_id)
    values (target_organization_id, 'downgrade_scheduled', sub.status, sub.status,
            jsonb_build_object('plan',target_plan,'cycle',target_cycle,'effectiveOn',effective),
            (select auth.uid()));

    return jsonb_build_object('outcome','downgrade_scheduled',
      'plan',target_plan,'cycle',target_cycle,'effectiveOn',effective);
  end if;

  -- ------------------------------------------------------------------ UPGRADE
  -- Devis au prorata calculé côté serveur ; le client n'envoie aucun montant.
  period_days := case
    when sub.current_period_start is not null and sub.current_period_end is not null
      then greatest(sub.current_period_end - sub.current_period_start, 1)
    else case when target_cycle = 'annual' then 365 else 30 end
  end;
  days_left := case
    when sub.current_period_end is not null
      then greatest(least(sub.current_period_end - current_date, period_days), 0)
    else period_days
  end;

  credit_minor := (coalesce(price_from, 0) * days_left) / period_days;
  charge_minor := (coalesce(price_to, 0)   * days_left) / period_days;
  due_minor    := greatest(charge_minor - credit_minor, 0);

  update public.organization_subscriptions
     set pending_plan = target_plan,
         pending_cycle = target_cycle,
         pending_amount_minor = due_minor,
         pending_requested_at = now()
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'upgrade_intent', sub.status, sub.status,
          jsonb_build_object('plan',target_plan,'cycle',target_cycle,
                             'amountMinor',due_minor,'currency',sub.currency),
          (select auth.uid()));

  -- Aucun débit, aucune activation : le plan effectif reste inchangé.
  return jsonb_build_object(
    'outcome','upgrade_intent_recorded',
    'plan',target_plan, 'cycle',target_cycle, 'currency',sub.currency,
    'daysInPeriod',period_days, 'daysRemaining',days_left,
    'creditMinor',credit_minor, 'chargeMinor',charge_minor, 'amountDueMinor',due_minor,
    'providerConfigured', false,
    'message','Aucun paiement n''est encore possible : le règlement en ligne arrive prochainement.');
end;
$$;

revoke all on function public.request_plan_change(uuid, text, text) from public, anon;
grant execute on function public.request_plan_change(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Annulation et reprise
-- ---------------------------------------------------------------------------

create or replace function public.cancel_subscription(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  effective date;
begin
  if not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status = 'free' then
    return jsonb_build_object('outcome','nothing_to_cancel');
  end if;
  if sub.status in ('cancelled','cancellation_scheduled') then
    return jsonb_build_object('outcome','already_cancelled',
      'effectiveOn', sub.cancellation_effective_on);
  end if;

  -- Accès complet jusqu'à la fin de la période payée. Aucun remboursement.
  effective := coalesce(sub.current_period_end, current_date);

  update public.organization_subscriptions
     set status = 'cancellation_scheduled',
         cancellation_requested_at = now(),
         cancellation_effective_on = effective
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'cancellation_scheduled', sub.status,
          'cancellation_scheduled',
          jsonb_build_object('effectiveOn', effective), (select auth.uid()));

  return jsonb_build_object('outcome','cancellation_scheduled','effectiveOn',effective);
end;
$$;

revoke all on function public.cancel_subscription(uuid) from public, anon;
grant execute on function public.cancel_subscription(uuid) to authenticated;

create or replace function public.resume_subscription(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  if not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status <> 'cancellation_scheduled' then
    return jsonb_build_object('outcome','not_scheduled');
  end if;

  update public.organization_subscriptions
     set status = 'active',
         cancellation_requested_at = null,
         cancellation_effective_on = null
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     actor_user_id)
  values (target_organization_id, 'cancellation_resumed', sub.status, 'active',
          (select auth.uid()));

  return jsonb_build_object('outcome','resumed');
end;
$$;

revoke all on function public.resume_subscription(uuid) from public, anon;
grant execute on function public.resume_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Réactivation — nouveau cycle uniquement, aucun rattrapage
-- ---------------------------------------------------------------------------

create or replace function public.request_reactivation(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare sub public.organization_subscriptions;
begin
  if not private.has_capability(target_organization_id, 'billing.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;

  if sub.organization_id is null or sub.status not in ('billing_blocked','cancelled') then
    return jsonb_build_object('outcome','not_reactivatable','status',
      coalesce(sub.status,'free'));
  end if;

  update public.organization_subscriptions
     set status = 'reactivation_pending',
         -- Les mois suspendus ne sont jamais facturés rétroactivement.
         grace_started_on = null,
         grace_ends_on = null,
         last_failure_on = null
   where organization_id = target_organization_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status,
                                     payload, actor_user_id)
  values (target_organization_id, 'reactivation_requested', sub.status, 'reactivation_pending',
          jsonb_build_object('retroactiveCharge', false), (select auth.uid()));

  return jsonb_build_object(
    'outcome','reactivation_pending',
    'retroactiveCharge', false,
    'providerConfigured', false,
    'message','Votre réactivation démarrera un nouveau cycle. Aucun mois suspendu ne sera facturé.');
end;
$$;

revoke all on function public.request_reactivation(uuid) from public, anon;
grant execute on function public.request_reactivation(uuid) to authenticated;

commit;
