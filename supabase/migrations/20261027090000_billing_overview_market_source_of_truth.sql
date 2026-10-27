-- KJORA — BILLING MARKET SOURCE OF TRUTH
-- Additive: exposes the already-stored subscription billing country to its
-- authorized owner view. No table, entitlement, payment, or provider changes.

begin;

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
  op public.organization_plans;
begin
  if not private.can_read_billing(target_organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into sub from public.organization_subscriptions where organization_id = target_organization_id;
  op := private.get_org_plan(target_organization_id);
  eff := op.plan;
  select * into usg from private.billing_usage(target_organization_id);
  select * into lim from private.plan_quota_limits(op.plan, op.custom_max_properties, op.custom_max_active_units, op.custom_max_collaborators, op.custom_max_organizations);

  return jsonb_build_object(
    'organizationId', target_organization_id,
    'effectivePlan', eff,
    'subscription', case when sub.organization_id is null then
      jsonb_build_object('exists', false, 'status', 'free', 'plan', 'decouverte', 'billingCycle', 'monthly', 'billingCountry', 'CM', 'currency', 'XAF')
    else jsonb_build_object(
      'exists', true, 'status', sub.status, 'plan', sub.plan,
      'billingCycle', sub.billing_cycle, 'billingCountry', sub.billing_country, 'currency', sub.currency,
      'currentPeriodStart', sub.current_period_start, 'currentPeriodEnd', sub.current_period_end, 'renewalDate', sub.renewal_date,
      'graceEndsOn', sub.grace_ends_on, 'blockedAt', sub.blocked_at, 'cancellationEffectiveOn', sub.cancellation_effective_on,
      'scheduledPlan', sub.scheduled_plan, 'scheduledCycle', sub.scheduled_cycle, 'scheduledEffectiveOn', sub.scheduled_effective_on,
      'pendingPlan', sub.pending_plan, 'pendingCycle', sub.pending_cycle, 'pendingAmountMinor', sub.pending_amount_minor,
      'provider', sub.provider, 'paymentMethodBrand', sub.payment_method_brand, 'paymentMethodLast4', sub.payment_method_last4,
      'paymentMethodExpiresOn', sub.payment_method_expires_on, 'lastPaymentState', sub.last_payment_state,
      'lastPaymentAt', sub.last_payment_at, 'lastProviderSyncAt', sub.last_provider_sync_at)
    end,
    'usage', jsonb_build_object('activeProperties', usg.active_properties, 'activeUnits', usg.active_units, 'collaborators', usg.collaborators, 'organizations', usg.organizations),
    'quotas', jsonb_build_object('maxProperties', lim.max_properties, 'maxActiveUnits', lim.max_active_units, 'maxCollaborators', lim.max_collaborators, 'maxOrganizations', lim.max_organizations)
  );
end;
$$;

revoke all on function public.get_billing_overview(uuid) from public, anon;
grant execute on function public.get_billing_overview(uuid) to authenticated;

commit;
