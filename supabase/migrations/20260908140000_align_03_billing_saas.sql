begin;

-- =============================================================================
-- ALIGN-03 — Domaine Billing SaaS
-- =============================================================================
-- Séparation stricte des domaines financiers :
--   • Loyer      : Locataire → Propriétaire   (payments / dues / ledger_entries)
--   • Abonnement : Organization → VERALUZ SARL (ce domaine)
-- Aucune table de ce lot ne référence payments, dues, ledger_entries ni
-- financial_documents. Aucun rapprochement entre les deux domaines.
--
-- `organization_plans` reste la vérité du plan EFFECTIF et des entitlements
-- (ALIGN-01). Ce lot porte le plan SOUSCRIT et l'état d'abonnement, et ne peut
-- activer un plan payant sans confirmation de paiement vérifiée (ALIGN-04).
--
-- Aucun provider réel n'est intégré ici.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Capabilities — la facturation relève de l'Organization Owner
-- ---------------------------------------------------------------------------

-- La colonne `capability` porte une contrainte énumérative : elle doit être
-- étendue avant d'insérer les deux nouvelles capacités. Les 23 capacités
-- existantes sont conservées à l'identique.
alter table public.role_capabilities
  drop constraint if exists role_capabilities_capability_check;

alter table public.role_capabilities
  add constraint role_capabilities_capability_check check (capability = any (array[
    'organization.view','organization.profile.manage',
    'member.view','member.manage',
    'property.view','property.manage',
    'unit.view','unit.manage',
    'tenant.view','tenant.manage',
    'lease.view','lease.manage',
    'due.view',
    'payment.view','payment.record','payment.correct','payment.correction.request',
    'receipt.view','receipt.share',
    'activity.view','audit.view',
    'tenant_portal.manage','contract.manage',
    -- ALIGN-03
    'billing.view','billing.manage'
  ]));

insert into public.role_capabilities (role, capability) values
  ('organization_owner', 'billing.view'),
  ('organization_owner', 'billing.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Catalogue de prix — valeurs canoniques ALIGN-00, en unité mineure
--    XAF : entier (0 décimale). CAD : centimes (2 décimales).
--    EUR et USD ne sont pas canonisés : ils ne figurent pas ici.
-- ---------------------------------------------------------------------------

create table if not exists public.billing_prices (
  plan     text not null check (plan in ('decouverte','essentiel','avance','patrimoine','sur_mesure')),
  cycle    text not null check (cycle in ('monthly','annual')),
  currency text not null check (currency in ('XAF','CAD')),
  -- null = pas de prix catalogue (Sur mesure : devis commercial)
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  primary key (plan, cycle, currency)
);

comment on table public.billing_prices is
  'ALIGN-03 : catalogue de prix SaaS. Annuel = 12 mois pour le prix de 10 (ALIGN-00).';

insert into public.billing_prices (plan, cycle, currency, amount_minor) values
  ('decouverte','monthly','XAF',0),      ('decouverte','annual','XAF',0),
  ('essentiel','monthly','XAF',5900),    ('essentiel','annual','XAF',59000),
  ('avance','monthly','XAF',12900),      ('avance','annual','XAF',129000),
  ('patrimoine','monthly','XAF',24900),  ('patrimoine','annual','XAF',249000),
  ('sur_mesure','monthly','XAF',null),   ('sur_mesure','annual','XAF',null),
  ('decouverte','monthly','CAD',0),      ('decouverte','annual','CAD',0),
  ('essentiel','monthly','CAD',1499),    ('essentiel','annual','CAD',14990),
  ('avance','monthly','CAD',3199),       ('avance','annual','CAD',31990),
  ('patrimoine','monthly','CAD',6199),   ('patrimoine','annual','CAD',61990),
  ('sur_mesure','monthly','CAD',null),   ('sur_mesure','annual','CAD',null)
on conflict (plan, cycle, currency) do nothing;

alter table public.billing_prices enable row level security;

drop policy if exists billing_prices_read on public.billing_prices;
create policy billing_prices_read on public.billing_prices
  for select to authenticated using (true);

revoke all on public.billing_prices from anon, authenticated;
grant select (plan, cycle, currency, amount_minor) on public.billing_prices to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Abonnement — une ligne par Organization
-- ---------------------------------------------------------------------------

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,

  status text not null default 'free' check (status in (
    'free','active','payment_failed','grace','billing_blocked',
    'cancellation_scheduled','cancelled','reactivation_pending')),

  -- Plan SOUSCRIT. Le plan EFFECTIF reste organization_plans.plan.
  plan text not null default 'decouverte'
    check (plan in ('decouverte','essentiel','avance','patrimoine','sur_mesure')),

  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  currency      text not null default 'XAF'     check (currency in ('XAF','CAD')),

  current_period_start date,
  current_period_end   date,
  renewal_date         date,

  -- Échec de paiement et tolérance
  last_failure_on date,
  grace_started_on date,
  grace_ends_on    date,
  blocked_at       timestamptz,

  -- Annulation
  cancellation_requested_at timestamptz,
  cancellation_effective_on date,
  cancelled_at              timestamptz,

  -- Changement programmé (downgrade en fin de période)
  scheduled_plan         text check (scheduled_plan is null or scheduled_plan in
    ('decouverte','essentiel','avance','patrimoine','sur_mesure')),
  scheduled_cycle        text check (scheduled_cycle is null or scheduled_cycle in ('monthly','annual')),
  scheduled_effective_on date,

  -- Intention d'upgrade : enregistrée, JAMAIS activée sans paiement vérifié
  pending_plan         text check (pending_plan is null or pending_plan in
    ('decouverte','essentiel','avance','patrimoine','sur_mesure')),
  pending_cycle        text check (pending_cycle is null or pending_cycle in ('monthly','annual')),
  pending_amount_minor bigint check (pending_amount_minor is null or pending_amount_minor >= 0),
  pending_requested_at timestamptz,

  -- Références provider : opaques et non sensibles. Nulles tant qu'ALIGN-04 absent.
  provider                  text,
  provider_customer_ref     text,
  provider_subscription_ref text,

  -- Moyen de paiement : marque et 4 derniers chiffres uniquement.
  payment_method_brand      text,
  payment_method_last4      text check (payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'),
  payment_method_expires_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Découverte n'a ni provider, ni carte, ni période facturée.
  constraint subscription_free_has_no_provider check (
    status <> 'free' or (provider is null and provider_subscription_ref is null)
  ),
  constraint subscription_blocked_has_timestamp check (
    status <> 'billing_blocked' or blocked_at is not null
  ),
  constraint subscription_cancellation_scheduled_has_date check (
    status <> 'cancellation_scheduled' or cancellation_effective_on is not null
  )
);

comment on table public.organization_subscriptions is
  'ALIGN-03 : abonnement SaaS d''une Organization. Porte le plan SOUSCRIT et l''état ; '
  'le plan EFFECTIF et les entitlements restent dans organization_plans (ALIGN-01).';

create index if not exists organization_subscriptions_status_idx
  on public.organization_subscriptions (status);
create index if not exists organization_subscriptions_renewal_idx
  on public.organization_subscriptions (renewal_date) where renewal_date is not null;

-- ---------------------------------------------------------------------------
-- 4. Factures SaaS
-- ---------------------------------------------------------------------------

create sequence if not exists public.billing_invoice_sequence;

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null unique,
  plan text not null check (plan in ('decouverte','essentiel','avance','patrimoine','sur_mesure')),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),
  currency text not null check (currency in ('XAF','CAD')),
  amount_minor bigint not null check (amount_minor >= 0),
  period_start date not null,
  period_end   date not null,
  status text not null default 'draft'
    check (status in ('draft','open','paid','void','uncollectible')),
  issued_on date not null default current_date,
  paid_at timestamptz,
  provider_invoice_ref text,
  created_at timestamptz not null default now(),
  constraint invoice_period_ordered check (period_end > period_start),
  constraint invoice_paid_has_timestamp check (status <> 'paid' or paid_at is not null)
);

comment on table public.billing_invoices is
  'ALIGN-03 : facture d''abonnement SaaS émise par STE VERALUZ SARL. '
  'Sans rapport avec les reçus et quittances de loyer (financial_documents). '
  'Le format n''est pas encore validé fiscalement.';

create index if not exists billing_invoices_organization_idx
  on public.billing_invoices (organization_id, issued_on desc);

-- ---------------------------------------------------------------------------
-- 5. Tentatives de paiement — relances J0, J+1, J+3, J+6
-- ---------------------------------------------------------------------------

create table if not exists public.billing_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid references public.billing_invoices (id) on delete set null,
  attempt_number int not null check (attempt_number between 0 and 3),
  scheduled_on date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','succeeded','failed','cancelled')),
  failure_code text,
  provider_attempt_ref text,
  idempotency_key text not null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, idempotency_key)
);

create index if not exists billing_payment_attempts_org_idx
  on public.billing_payment_attempts (organization_id, scheduled_on desc);

-- ---------------------------------------------------------------------------
-- 6. Journal des faits de facturation + idempotence des webhooks
-- ---------------------------------------------------------------------------

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status   text,
  payload jsonb not null default '{}'::jsonb,
  -- Identifiant d'événement provider : un rejeu est refusé par l'index unique.
  provider_event_id text,
  actor_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index if not exists billing_events_provider_event_unique
  on public.billing_events (provider_event_id) where provider_event_id is not null;

create index if not exists billing_events_organization_idx
  on public.billing_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. RLS — lecture pour les porteurs de billing.view, aucune écriture client
-- ---------------------------------------------------------------------------

alter table public.organization_subscriptions enable row level security;
alter table public.billing_invoices           enable row level security;
alter table public.billing_payment_attempts   enable row level security;
alter table public.billing_events             enable row level security;

drop policy if exists organization_subscriptions_select on public.organization_subscriptions;
create policy organization_subscriptions_select on public.organization_subscriptions
  for select to authenticated
  using (private.has_capability(organization_id, 'billing.view'));

drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices
  for select to authenticated
  using (private.has_capability(organization_id, 'billing.view'));

drop policy if exists billing_payment_attempts_select on public.billing_payment_attempts;
create policy billing_payment_attempts_select on public.billing_payment_attempts
  for select to authenticated
  using (private.has_capability(organization_id, 'billing.view'));

drop policy if exists billing_events_select on public.billing_events;
create policy billing_events_select on public.billing_events
  for select to authenticated
  using (organization_id is not null and private.has_capability(organization_id, 'billing.view'));

-- Aucune policy insert/update/delete : toute écriture passe par les RPC.
revoke all on public.organization_subscriptions, public.billing_invoices,
              public.billing_payment_attempts, public.billing_events
  from anon, authenticated;

grant select on public.organization_subscriptions to authenticated;
grant select on public.billing_invoices           to authenticated;
grant select on public.billing_payment_attempts   to authenticated;
grant select on public.billing_events             to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Statut de facturation et verrou de blocage
-- ---------------------------------------------------------------------------

create or replace function private.billing_status(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.status from public.organization_subscriptions s
      where s.organization_id = target_organization_id),
    'free'
  );
$$;

create or replace function private.is_billing_blocked(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.billing_status(target_organization_id) = 'billing_blocked';
$$;

create or replace function public.is_billing_blocked(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.has_capability(target_organization_id, 'organization.view')
      then private.is_billing_blocked(target_organization_id)
    else false
  end;
$$;

revoke all on function public.is_billing_blocked(uuid) from public, anon;
grant execute on function public.is_billing_blocked(uuid) to authenticated;

-- Trigger générique : refuse toute écriture métier sur une Organization bloquée.
create or replace function private.reject_when_billing_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.organization_id, old.organization_id);
begin
  if target is not null and private.is_billing_blocked(target) then
    raise exception 'BILLING_BLOCKED'
      using errcode = 'P0001',
            detail = format('{"code":"BILLING_BLOCKED","table":"%s"}', tg_table_name);
  end if;
  return new;
end;
$$;

comment on function private.reject_when_billing_blocked() is
  'ALIGN-03 : verrou base. Un compte billing_blocked ne peut plus créer de donnée '
  'métier ni modifier la vérité financière, quel que soit l''appelant — y compris '
  'un RPC SECURITY DEFINER ou un appel REST direct. Aucune donnée n''est supprimée.';

-- Aucune création de donnée métier lorsque le compte est bloqué.
do $$
declare t text;
begin
  foreach t in array array[
    'properties','units','tenants','leases','lease_financial_terms',
    'dues','ledger_entries','payments','payment_allocations',
    'financial_documents','financial_document_payments','message_deliveries',
    'lease_contracts','contract_signatures','contract_templates','contract_amendments',
    'membership_invitations','memberships',
    'tenant_portal_invitations','tenant_portal_lease_accesses'
  ] loop
    execute format(
      'drop trigger if exists billing_blocked_insert_guard on public.%I', t);
    execute format(
      'create trigger billing_blocked_insert_guard before insert on public.%I
       for each row execute function private.reject_when_billing_blocked()', t);
  end loop;
end $$;

-- Aucune mutation de la vérité financière ou contractuelle lorsque bloqué.
-- Les UPDATE restent permis sur properties/units/tenants/leases et memberships
-- afin que le propriétaire puisse encore ranger son espace et révoquer un accès.
do $$
declare t text;
begin
  foreach t in array array[
    'dues','ledger_entries','payments','payment_allocations',
    'financial_documents','financial_document_payments',
    'lease_contracts','contract_signatures','contract_amendments'
  ] loop
    execute format(
      'drop trigger if exists billing_blocked_update_guard on public.%I', t);
    execute format(
      'create trigger billing_blocked_update_guard before update on public.%I
       for each row execute function private.reject_when_billing_blocked()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Horodatage
-- ---------------------------------------------------------------------------

create or replace function private.billing_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organization_subscriptions_touch on public.organization_subscriptions;
create trigger organization_subscriptions_touch
before update on public.organization_subscriptions
for each row execute function private.billing_touch_updated_at();

commit;
