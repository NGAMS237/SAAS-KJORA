begin;

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01B — Facturation manuelle Afrique
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune ligne n'est jamais supprimée par ce lot. Seules
-- des fonctions/policies ALIGN-03 sont remplacées, chacune une seule fois
-- dans toute la série REVENUE-LAUNCH-01 (nettoyage v3 : aucune fonction
-- Revenue n'est redéfinie par une migration Revenue ultérieure).
--
-- NON APPLIQUÉE à ce stade (ni sur KJORA Dev, ni sur KJORA Production).
--
-- ---------------------------------------------------------------------------
-- CE QUE CE LOT N'EST PAS
-- ---------------------------------------------------------------------------
-- Ce n'est PAS un second mécanisme d'octroi commercial : `commercial_interventions`
-- (ADMIN-BILLING-OPS-01) reste réservée aux avantages discrétionnaires. Ce lot
-- construit le chemin de facturation SaaS RÉEL pour l'Afrique/Cameroun, quand
-- aucun provider automatisé n'est branché : une facture `billing_invoices` est
-- émise, réglée hors ligne par le client, puis un platform_admin confirme le
-- règlement — le rôle qu'un webhook provider aurait joué, avec une preuve
-- humaine au lieu d'une preuve cryptographique.
--
-- Portée verrouillée : XAF uniquement, jamais un abonnement déjà géré par un
-- fournisseur (`organization_subscriptions.provider` non nul) — un tel
-- abonnement relève exclusivement de son fournisseur, jamais d'une facture
-- manuelle parallèle (refus explicite `provider_managed_subscription`).
--
-- Identité légale de l'émetteur : jamais codée ici. Le marchand légal
-- (décision non tranchée) est configuré côté application
-- (src/core/billing/legal-identity.ts) et n'apparaît que sur le PDF.
--
-- Séparation intacte : ce lot ne touche ni payments, ni dues, ni
-- ledger_entries, ni financial_documents, ni commercial_interventions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Accès restreint d'une Organization suspendue — primitives ÉTROITES
-- ---------------------------------------------------------------------------
-- private.has_capability reste STRICT (REVENUE-01H : toute capacité coupée
-- dès que organizations.status <> 'active'). Les seules exceptions décidées
-- pour une Organization SUSPENDUE (jamais archivée) sont énumérées ici, en
-- liste fermée, et ne sont utilisées que par les chemins qui en ont besoin
-- (lecture de facturation, export du propriétaire) — jamais par une policy
-- métier (biens, locataires, baux, paiements...).
--
--   • billing.view        — pour tout membre actif dont le rôle porte déjà
--                           cette capacité (Owner par défaut) : voir sa
--                           facturation pour régulariser.
--   • data_export.manage  — pour le SEUL organization_owner actif : export en
--                           lecture seule de ses propres données.
--
-- Organization archivée : aucune exception (restauration Admin préalable).

create or replace function private.has_restricted_capability(
  target_organization_id uuid,
  requested_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_capability in ('billing.view', 'data_export.manage')
    and exists (
      select 1
      from public.memberships m
      join public.role_capabilities rc on rc.role = m.role
      join public.organizations o on o.id = m.organization_id
      where m.organization_id = target_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and o.status = 'suspended'
        and rc.capability = requested_capability
        and (requested_capability <> 'data_export.manage' or m.role = 'organization_owner')
    );
$$;

comment on function private.has_restricted_capability(uuid, text) is
  'REVENUE-LAUNCH-01 v3 : exceptions fermées d''une Organization SUSPENDUE (billing.view ; data_export.manage pour le seul Owner actif). Jamais utilisée par une policy métier. Aucune exception pour une Organization archivée.';

create or replace function private.can_read_billing(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability(target_organization_id, 'billing.view')
      or private.has_restricted_capability(target_organization_id, 'billing.view');
$$;

create or replace function private.can_export_organization_data(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_capability(target_organization_id, 'data_export.manage')
      or private.has_restricted_capability(target_organization_id, 'data_export.manage');
$$;

revoke all on function private.has_restricted_capability(uuid, text) from public, anon;
revoke all on function private.can_read_billing(uuid) from public, anon;
revoke all on function private.can_export_organization_data(uuid) from public, anon;
grant execute on function private.has_restricted_capability(uuid, text) to authenticated;
grant execute on function private.can_read_billing(uuid) to authenticated;
grant execute on function private.can_export_organization_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. billing_invoices — règlement manuel, échéance, idempotence
-- ---------------------------------------------------------------------------
-- `provider_invoice_ref` (existant) reste réservé à une référence PROVIDER.
-- `due_on` : échéance de paiement explicite, distincte de la fin de période
-- de service (les rappels « bientôt due »/« en retard » se fondent sur elle).
-- `payment_idempotency_key` : jeton de la confirmation de règlement, unique
-- sur toute la table — un même jeton ne confirme jamais deux factures.

alter table public.billing_invoices
  add column if not exists issue_idempotency_key text
    check (issue_idempotency_key is null or char_length(issue_idempotency_key) between 8 and 200),
  add column if not exists due_on date,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists manual_reference text
    check (manual_reference is null or char_length(manual_reference) <= 200),
  add column if not exists manual_payment_note text
    check (manual_payment_note is null or char_length(trim(manual_payment_note)) between 3 and 1000),
  add column if not exists manual_payment_confirmed_by uuid references auth.users (id),
  add column if not exists manual_payment_confirmed_at timestamptz,
  add column if not exists payment_idempotency_key text
    check (payment_idempotency_key is null or char_length(payment_idempotency_key) between 8 and 200);

alter table public.billing_invoices
  add constraint billing_invoices_manual_confirmation_pair check (
    (manual_payment_confirmed_by is null) = (manual_payment_confirmed_at is null)
  );

alter table public.billing_invoices
  add constraint billing_invoices_manual_confirmation_requires_paid check (
    manual_payment_confirmed_by is null or status = 'paid'
  );

alter table public.billing_invoices
  add constraint billing_invoices_due_on_after_issue check (
    due_on is null or due_on >= issued_on
  );

create unique index if not exists billing_invoices_org_issue_idempotency_unique
  on public.billing_invoices (organization_id, issue_idempotency_key)
  where issue_idempotency_key is not null;

create unique index if not exists billing_invoices_payment_idempotency_unique
  on public.billing_invoices (payment_idempotency_key)
  where payment_idempotency_key is not null;

comment on column public.billing_invoices.due_on is
  'REVENUE-01B : échéance de paiement. Base des rappels invoice_due_soon/invoice_overdue (REVENUE-01C). Null uniquement pour une facture antérieure à ce lot (repli : period_end).';
comment on column public.billing_invoices.manual_reference is
  'REVENUE-01B : libellé opaque choisi par un platform_admin (ex. numéro de reçu Mobile Money). Jamais un numéro de carte, de compte ou une référence provider.';
comment on column public.billing_invoices.manual_payment_note is
  'REVENUE-01B : note INTERNE Admin. Jamais exposée à l''Organization (colonne non accordée à authenticated, absente de list_billing_invoices et de billing_events.payload).';

-- ---------------------------------------------------------------------------
-- 2. Données sensibles — jamais lisibles par l'Organization
-- ---------------------------------------------------------------------------
-- ALIGN-03 accordait `select` sur TOUTES les colonnes de billing_invoices et
-- billing_events à `authenticated`. Les colonnes ajoutées ci-dessus (note
-- interne, auteurs, jetons d'idempotence) deviendraient alors lisibles par
-- l'Owner. Les droits passent donc en liste explicite de colonnes.
--
-- billing_events : `payload`, `actor_user_id` et `provider_event_id` ne sont
-- plus lisibles par `authenticated` (un payload Admin peut contenir un motif
-- ou une note interne — voir aussi ADMIN-BILLING-OPS-01). L'Admin les lit via
-- ses RPC security definer, jamais par cette table.

revoke select on public.billing_invoices from authenticated;
grant select (
  id, organization_id, number, plan, billing_cycle, currency, amount_minor,
  period_start, period_end, status, issued_on, due_on, paid_at, created_at,
  manual_reference, manual_payment_confirmed_at
) on public.billing_invoices to authenticated;

revoke select on public.billing_events from authenticated;
grant select (
  id, organization_id, event_type, from_status, to_status, created_at
) on public.billing_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS facturation — lecture Owner, y compris Organization suspendue
-- ---------------------------------------------------------------------------
-- Remplace les quatre policies ALIGN-03 (même nom, même portée « select »),
-- en substituant private.can_read_billing à has_capability(..., 'billing.view') :
-- identique pour une Organization active, et l'unique exception fermée
-- (section 0) pour une Organization suspendue.

drop policy if exists organization_subscriptions_select on public.organization_subscriptions;
create policy organization_subscriptions_select on public.organization_subscriptions
  for select to authenticated
  using (private.can_read_billing(organization_id));

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices
  for select to authenticated
  using (private.can_read_billing(organization_id));

drop policy if exists billing_payment_attempts_select on public.billing_payment_attempts;
create policy billing_payment_attempts_select on public.billing_payment_attempts
  for select to authenticated
  using (private.can_read_billing(organization_id));

drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events
  for select to authenticated
  using (organization_id is not null and private.can_read_billing(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Lecture Owner — vue d'ensemble et factures (colonnes sûres uniquement)
-- ---------------------------------------------------------------------------
-- get_billing_overview : corps ALIGN-03 inchangé, seule la garde change.
-- list_billing_invoices : renvoyait `setof billing_invoices` (toutes les
-- colonnes, donc la note interne Admin et les jetons ajoutés ci-dessus) —
-- remplacée par une liste explicite de colonnes sûres.

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
  if not private.can_read_billing(target_organization_id) then
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

drop function if exists public.list_billing_invoices(uuid);

create function public.list_billing_invoices(target_organization_id uuid)
returns table (
  id uuid,
  number text,
  plan text,
  billing_cycle text,
  currency text,
  amount_minor bigint,
  period_start date,
  period_end date,
  due_on date,
  status text,
  issued_on date,
  paid_at timestamptz,
  manual_reference text,
  manual_payment_confirmed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_billing(target_organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select i.id, i.number, i.plan, i.billing_cycle, i.currency, i.amount_minor,
           i.period_start, i.period_end, i.due_on, i.status, i.issued_on, i.paid_at,
           i.manual_reference, i.manual_payment_confirmed_at
      from public.billing_invoices i
     where i.organization_id = target_organization_id
     order by i.issued_on desc, i.created_at desc
     limit 200;
end;
$$;

revoke all on function public.list_billing_invoices(uuid) from public, anon;
grant execute on function public.list_billing_invoices(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Émission d'une facture manuelle (platform_admin uniquement)
-- ---------------------------------------------------------------------------
-- N'active rien : une facture 'open' n'est qu'une demande de règlement.
--
-- Validation NULL-sûre : `p_cycle not in (...)` vaut NULL (donc « faux »)
-- quand p_cycle est NULL — chaque paramètre obligatoire est donc testé
-- explicitement `is null` d'abord, sans quoi un cycle NULL traversait la
-- validation puis échouait sur la contrainte NOT NULL (erreur 500 au lieu
-- d'un refus propre).
--
-- Idempotence réelle : un rejeu du même jeton avec les MÊMES paramètres
-- renvoie la facture existante (`already_issued`) ; avec des paramètres
-- différents, `issue_idempotency_conflict` — jamais une seconde facture,
-- jamais une réponse trompeuse.
--
-- Échéance : `p_due_on` optionnel ; à défaut, 7 jours après le début de
-- période (ou après aujourd'hui si la période a déjà commencé), borné à la
-- fin de période. Constante miroir : MANUAL_INVOICE_PAYMENT_TERM_DAYS
-- (src/core/billing/model.ts).

create or replace function public.admin_issue_manual_invoice(
  target_organization_id uuid,
  p_plan text,
  p_cycle text,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text,
  p_due_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
  sub public.organization_subscriptions;
  existing public.billing_invoices;
  price bigint;
  seq_value bigint;
  invoice_number text;
  effective_due date;
  new_id uuid;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  -- Une Organization suspendue ou archivée ne reçoit plus de nouvelle
  -- facture. Les factures déjà émises restent inchangées et visibles.
  if org.status <> 'active' then
    return jsonb_build_object('outcome', 'organization_not_active', 'status', org.status);
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    return jsonb_build_object('outcome', 'invalid_idempotency_key');
  end if;

  if p_plan is null or p_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure') then
    return jsonb_build_object('outcome', 'invalid_plan');
  end if;
  if p_plan = 'decouverte' then
    return jsonb_build_object('outcome', 'plan_is_free');
  end if;
  if p_plan = 'sur_mesure' then
    return jsonb_build_object('outcome', 'plan_requires_quote');
  end if;
  if p_cycle is null or p_cycle not in ('monthly','annual') then
    return jsonb_build_object('outcome', 'invalid_cycle');
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    return jsonb_build_object('outcome', 'invalid_period');
  end if;

  effective_due := coalesce(
    p_due_on,
    least(greatest(p_period_start, current_date) + 7, p_period_end)
  );
  if effective_due < current_date or effective_due > p_period_end then
    return jsonb_build_object('outcome', 'invalid_due_date');
  end if;

  select * into existing from public.billing_invoices
   where organization_id = target_organization_id and issue_idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.plan = p_plan and existing.billing_cycle = p_cycle
       and existing.period_start = p_period_start and existing.period_end = p_period_end
       and (p_due_on is null or existing.due_on = p_due_on) then
      return jsonb_build_object('outcome', 'already_issued', 'invoiceId', existing.id, 'number', existing.number);
    end if;
    return jsonb_build_object('outcome', 'issue_idempotency_conflict', 'invoiceId', existing.id);
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;
  if sub.organization_id is null then
    insert into public.organization_subscriptions (organization_id)
    values (target_organization_id)
    returning * into sub;
  end if;

  -- Un abonnement géré par un fournisseur n'est jamais facturé en parallèle
  -- à la main : il relève exclusivement de son fournisseur.
  if sub.provider is not null then
    return jsonb_build_object('outcome', 'provider_managed_subscription');
  end if;

  -- Portée verrouillée : Afrique/XAF uniquement.
  if sub.currency <> 'XAF' then
    return jsonb_build_object('outcome', 'currency_not_supported', 'currency', sub.currency);
  end if;

  select amount_minor into price from public.billing_prices
   where plan = p_plan and cycle = p_cycle and currency = 'XAF';
  if price is null then
    return jsonb_build_object('outcome', 'no_catalog_price');
  end if;

  seq_value := nextval('public.billing_invoice_sequence');
  invoice_number := 'KJORA-' || to_char(current_date, 'YYYY') || '-' || lpad(seq_value::text, 6, '0');

  begin
    insert into public.billing_invoices (
      organization_id, number, plan, billing_cycle, currency, amount_minor,
      period_start, period_end, due_on, status, issued_on, issue_idempotency_key, created_by
    ) values (
      target_organization_id, invoice_number, p_plan, p_cycle, 'XAF', price,
      p_period_start, p_period_end, effective_due, 'open', current_date, p_idempotency_key, (select auth.uid())
    )
    returning id into new_id;
  exception when unique_violation then
    -- Course entre deux soumissions simultanées du même jeton : jamais deux
    -- factures, la seconde voit la première.
    select * into existing from public.billing_invoices
     where organization_id = target_organization_id and issue_idempotency_key = p_idempotency_key;
    return jsonb_build_object('outcome', 'already_issued', 'invoiceId', existing.id, 'number', existing.number);
  end;

  -- Payload minimal : aucun nom, aucune note, aucun jeton.
  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    target_organization_id, 'invoice_manual_issued', sub.status, sub.status,
    jsonb_build_object(
      'invoiceId', new_id, 'number', invoice_number, 'plan', p_plan, 'cycle', p_cycle,
      'amountMinor', price, 'currency', 'XAF', 'periodStart', p_period_start,
      'periodEnd', p_period_end, 'dueOn', effective_due
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'outcome', 'issued', 'invoiceId', new_id, 'number', invoice_number,
    'amountMinor', price, 'currency', 'XAF', 'periodStart', p_period_start,
    'periodEnd', p_period_end, 'dueOn', effective_due
  );
end;
$$;

revoke all on function public.admin_issue_manual_invoice(
  uuid, text, text, date, date, text, date
) from public, anon;
grant execute on function public.admin_issue_manual_invoice(
  uuid, text, text, date, date, text, date
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Confirmation d'un règlement manuel (platform_admin uniquement)
-- ---------------------------------------------------------------------------
-- Le serveur ne recalcule jamais le montant sur la parole de l'appelant : ce
-- qui est déclaré reçu doit correspondre EXACTEMENT à la facture.
--
-- Idempotence réelle (jeton conservé, unique sur toute la table) :
--   • même jeton, même facture déjà payée par ce jeton -> `already_paid`
--     avec `replayed = true`, aucun effet rejoué ;
--   • jeton déjà utilisé pour une AUTRE facture -> `payment_idempotency_conflict` ;
--   • facture déjà payée par un autre jeton -> `already_paid`.
--
-- Cycle : l'abonnement reçoit TOUJOURS le cycle réellement facturé
-- (`inv.billing_cycle`, NOT NULL). L'ancienne version copiait
-- `sub.pending_cycle`, qui peut être NULL même quand le plan en attente
-- correspond — écrivant alors NULL dans organization_subscriptions.billing_cycle.
--
-- Une Organization suspendue peut régulariser (le règlement est confirmé,
-- l'abonnement redevient actif) ; elle reste suspendue : aucune réactivation
-- automatique de l'Organization. Une Organization archivée est refusée.
-- Un abonnement géré par un fournisseur est refusé.

create or replace function public.admin_confirm_manual_invoice_payment(
  target_invoice_id uuid,
  p_currency text,
  p_amount_minor bigint,
  p_manual_reference text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.billing_invoices;
  org public.organizations;
  sub public.organization_subscriptions;
  target_plan text;
  target_cycle text;
begin
  perform private.assert_platform_admin();

  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    return jsonb_build_object('outcome', 'invalid_idempotency_key');
  end if;

  select * into inv from public.billing_invoices where id = target_invoice_id for update;
  if inv.id is null then
    return jsonb_build_object('outcome', 'invoice_not_found');
  end if;

  if exists (
    select 1 from public.billing_invoices
     where payment_idempotency_key = p_idempotency_key and id <> inv.id
  ) then
    return jsonb_build_object('outcome', 'payment_idempotency_conflict');
  end if;

  if inv.status = 'paid' then
    return jsonb_build_object(
      'outcome', 'already_paid', 'invoiceId', inv.id, 'paidAt', inv.paid_at,
      'replayed', inv.payment_idempotency_key is not distinct from p_idempotency_key
    );
  end if;
  if inv.status <> 'open' then
    return jsonb_build_object('outcome', 'invoice_not_open', 'status', inv.status);
  end if;

  select * into org from public.organizations where id = inv.organization_id;
  if org.status = 'archived' then
    return jsonb_build_object('outcome', 'organization_archived');
  end if;

  if p_note is null or char_length(trim(p_note)) < 3 then
    return jsonb_build_object('outcome', 'note_required');
  end if;
  if p_manual_reference is not null and char_length(p_manual_reference) > 200 then
    return jsonb_build_object('outcome', 'invalid_reference');
  end if;

  if p_currency is distinct from inv.currency then
    return jsonb_build_object('outcome', 'currency_mismatch');
  end if;
  if p_amount_minor is distinct from inv.amount_minor then
    return jsonb_build_object('outcome', 'amount_mismatch');
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = inv.organization_id for update;
  if sub.organization_id is null then
    return jsonb_build_object('outcome', 'subscription_not_found');
  end if;
  if sub.provider is not null then
    return jsonb_build_object('outcome', 'provider_managed_subscription');
  end if;

  -- Plan : l'intention d'upgrade enregistrée est honorée si elle correspond
  -- exactement à la facture ; sinon, renouvellement au plan facturé. Cycle :
  -- toujours celui de la facture, jamais un pending_cycle éventuellement NULL.
  target_plan := inv.plan;
  target_cycle := inv.billing_cycle;

  begin
    update public.billing_invoices
       set status = 'paid',
           paid_at = now(),
           manual_reference = p_manual_reference,
           manual_payment_note = trim(p_note),
           manual_payment_confirmed_by = (select auth.uid()),
           manual_payment_confirmed_at = now(),
           payment_idempotency_key = p_idempotency_key
     where id = inv.id;
  exception when unique_violation then
    return jsonb_build_object('outcome', 'payment_idempotency_conflict');
  end;

  update public.organization_subscriptions
     set status = 'active',
         plan = target_plan,
         billing_cycle = target_cycle,
         current_period_start = inv.period_start,
         current_period_end = inv.period_end,
         renewal_date = inv.period_end,
         pending_plan = null, pending_cycle = null, pending_amount_minor = null, pending_requested_at = null,
         last_failure_on = null, grace_started_on = null, grace_ends_on = null, blocked_at = null,
         cancellation_requested_at = null, cancellation_effective_on = null, cancelled_at = null
   where organization_id = inv.organization_id;

  perform private.assign_organization_plan(inv.organization_id, target_plan);

  -- Payload minimal : jamais la note interne ni la référence de règlement
  -- (elles restent sur la facture, dans des colonnes non exposées pour la
  -- note, et visibles de l'Owner uniquement pour la référence qu'il a fournie).
  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    inv.organization_id, 'invoice_manual_payment_confirmed', sub.status, 'active',
    jsonb_build_object(
      'invoiceId', inv.id, 'number', inv.number, 'plan', target_plan, 'cycle', target_cycle,
      'amountMinor', inv.amount_minor, 'currency', inv.currency
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'outcome', 'confirmed', 'invoiceId', inv.id, 'effectivePlan', target_plan,
    'currentPeriodEnd', inv.period_end, 'renewalDate', inv.period_end
  );
end;
$$;

revoke all on function public.admin_confirm_manual_invoice_payment(
  uuid, text, bigint, text, text, text
) from public, anon;
grant execute on function public.admin_confirm_manual_invoice_payment(
  uuid, text, bigint, text, text, text
) to authenticated;

commit;
