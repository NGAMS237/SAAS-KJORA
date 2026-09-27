begin;

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01B — Facturation manuelle Afrique
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante
-- n'est modifiée dans son comportement ni supprimée. Aucune ligne n'est jamais
-- supprimée par ce lot.
--
-- NON APPLIQUÉE à ce stade (ni sur KJORA Dev, ni sur KJORA Production) —
-- au même titre qu'ADMIN-BILLING-OPS-01 (20260926120000), en attente du
-- même point d'arrêt de revue avant application distante.
--
-- ---------------------------------------------------------------------------
-- CE QUE CE LOT N'EST PAS
-- ---------------------------------------------------------------------------
-- Ce n'est PAS un second mécanisme d'octroi commercial : `commercial_interventions`
-- (ADMIN-BILLING-OPS-01) reste réservée aux avantages discrétionnaires (cadeau,
-- promotion, partenariat, geste de support). Ce lot construit au contraire le
-- chemin de facturation SaaS RÉEL pour l'Afrique/Cameroun, quand aucun provider
-- automatisé n'est encore branché (ALIGN-04A, registre vide) : une facture
-- `billing_invoices` est émise, réglée hors ligne par le client, puis un
-- platform_admin confirme le règlement — exactement le rôle qu'un webhook
-- provider aurait joué (`webhook-rules.ts`, effet `activate_pending_plan`),
-- simplement avec une preuve humaine au lieu d'une preuve cryptographique.
--
-- Portée verrouillée : XAF uniquement. Le Canada/diaspora reste sur
-- l'architecture Stripe préparée (REVENUE-01F), sans confirmation manuelle —
-- décision produit verrouillée, non réexaminée ici.
--
-- Séparation intacte : ce lot ne touche ni payments, ni dues, ni
-- ledger_entries, ni financial_documents, ni commercial_interventions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. billing_invoices — champs de règlement manuel, additifs uniquement
-- ---------------------------------------------------------------------------
-- `provider_invoice_ref` (existant) reste réservé à une référence PROVIDER :
-- une facture réglée manuellement ne l'utilise jamais, pour ne jamais pouvoir
-- ressembler à une trace Stripe/Flutterwave. Le règlement manuel a ses propres
-- colonnes, distinctes et nommées sans ambiguïté.

alter table public.billing_invoices
  add column if not exists issue_idempotency_key text
    check (issue_idempotency_key is null or char_length(issue_idempotency_key) between 8 and 200),
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists manual_reference text
    check (manual_reference is null or char_length(manual_reference) <= 200),
  add column if not exists manual_payment_note text
    check (manual_payment_note is null or char_length(trim(manual_payment_note)) between 3 and 1000),
  add column if not exists manual_payment_confirmed_by uuid references auth.users (id),
  add column if not exists manual_payment_confirmed_at timestamptz;

alter table public.billing_invoices
  add constraint billing_invoices_manual_confirmation_pair check (
    (manual_payment_confirmed_by is null) = (manual_payment_confirmed_at is null)
  );

alter table public.billing_invoices
  add constraint billing_invoices_manual_confirmation_requires_paid check (
    manual_payment_confirmed_by is null or status = 'paid'
  );

create unique index if not exists billing_invoices_org_issue_idempotency_unique
  on public.billing_invoices (organization_id, issue_idempotency_key)
  where issue_idempotency_key is not null;

comment on column public.billing_invoices.manual_reference is
  'REVENUE-01B : libellé opaque choisi par un platform_admin (ex. numéro de reçu '
  'Mobile Money). Jamais un numéro de carte, de compte ou une référence provider.';

-- ---------------------------------------------------------------------------
-- 2. Émission d'une facture manuelle (platform_admin uniquement)
-- ---------------------------------------------------------------------------
-- N'active rien : une facture 'open' n'est qu'une demande de règlement. Seule
-- la confirmation (§3) a un effet sur l'abonnement — même invariant que
-- `request_plan_change` (ALIGN-03) : « aucune de ces fonctions n'active un
-- plan payant ».

create or replace function public.admin_issue_manual_invoice(
  target_organization_id uuid,
  p_plan text,
  p_cycle text,
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.organization_subscriptions;
  existing_id uuid;
  existing_number text;
  price bigint;
  seq_value bigint;
  invoice_number text;
  new_id uuid;
begin
  perform private.assert_platform_admin();

  perform 1 from public.organizations where id = target_organization_id for update;
  if not found then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    return jsonb_build_object('outcome', 'invalid_idempotency_key');
  end if;

  if p_plan not in ('decouverte','essentiel','avance','patrimoine','sur_mesure') then
    return jsonb_build_object('outcome', 'invalid_plan');
  end if;
  if p_plan = 'decouverte' then
    return jsonb_build_object('outcome', 'plan_is_free');
  end if;
  if p_plan = 'sur_mesure' then
    return jsonb_build_object('outcome', 'plan_requires_quote');
  end if;
  if p_cycle not in ('monthly','annual') then
    return jsonb_build_object('outcome', 'invalid_cycle');
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    return jsonb_build_object('outcome', 'invalid_period');
  end if;

  -- Idempotence : un rejeu du même jeton pour cette Organization renvoie la
  -- facture déjà émise, sans jamais en créer une seconde.
  select id, number into existing_id, existing_number from public.billing_invoices
   where organization_id = target_organization_id and issue_idempotency_key = p_idempotency_key;
  if existing_id is not null then
    return jsonb_build_object('outcome', 'already_issued', 'invoiceId', existing_id, 'number', existing_number);
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;
  if sub.organization_id is null then
    insert into public.organization_subscriptions (organization_id)
    values (target_organization_id)
    returning * into sub;
  end if;

  -- Portée verrouillée : Afrique/XAF uniquement. Le Canada reste sur
  -- l'architecture Stripe préparée (REVENUE-01F), jamais sur ce chemin manuel.
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

  insert into public.billing_invoices (
    organization_id, number, plan, billing_cycle, currency, amount_minor,
    period_start, period_end, status, issued_on, issue_idempotency_key, created_by
  ) values (
    target_organization_id, invoice_number, p_plan, p_cycle, 'XAF', price,
    p_period_start, p_period_end, 'open', current_date, p_idempotency_key, (select auth.uid())
  )
  returning id into new_id;

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    target_organization_id, 'invoice_manual_issued', sub.status, sub.status,
    jsonb_build_object(
      'invoiceId', new_id, 'number', invoice_number, 'plan', p_plan, 'cycle', p_cycle,
      'amountMinor', price, 'currency', 'XAF', 'periodStart', p_period_start, 'periodEnd', p_period_end
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'outcome', 'issued', 'invoiceId', new_id, 'number', invoice_number,
    'amountMinor', price, 'currency', 'XAF', 'periodStart', p_period_start, 'periodEnd', p_period_end
  );
end;
$$;

revoke all on function public.admin_issue_manual_invoice(
  uuid, text, text, date, date, text
) from public, anon;
grant execute on function public.admin_issue_manual_invoice(
  uuid, text, text, date, date, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirmation d'un règlement manuel (platform_admin uniquement)
-- ---------------------------------------------------------------------------
-- Effet strictement calqué sur `activate_pending_plan` (webhook-rules.ts) :
-- le serveur ne recalcule jamais le montant sur la parole de l'appelant — il
-- exige que ce qui est déclaré reçu corresponde EXACTEMENT à la facture, sinon
-- il refuse. Idempotent par l'état : rejouer sur une facture déjà 'paid'
-- renvoie proprement 'already_paid', sans réappliquer l'effet une seconde fois.

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
  sub public.organization_subscriptions;
  target_plan text;
  target_cycle text;
begin
  perform private.assert_platform_admin();

  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    return jsonb_build_object('outcome', 'invalid_idempotency_key');
  end if;

  select * into inv from public.billing_invoices where id = target_invoice_id for update;
  if inv.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if inv.status = 'paid' then
    return jsonb_build_object('outcome', 'already_paid', 'invoiceId', inv.id, 'paidAt', inv.paid_at);
  end if;
  if inv.status <> 'open' then
    return jsonb_build_object('outcome', 'invoice_not_open', 'status', inv.status);
  end if;

  if p_note is null or char_length(trim(p_note)) < 3 then
    return jsonb_build_object('outcome', 'note_required');
  end if;
  if p_manual_reference is not null and char_length(p_manual_reference) > 200 then
    return jsonb_build_object('outcome', 'invalid_reference');
  end if;

  -- Le serveur ne fait jamais confiance à un montant/devise déclaré seul :
  -- il doit correspondre exactement à ce que KJORA a lui-même facturé.
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

  -- Si la facture correspond à une intention d'upgrade déjà enregistrée
  -- (request_plan_change), on l'honore ; sinon c'est un renouvellement au
  -- plan déjà facturé. Dans les deux cas, jamais un plan différent de celui
  -- réellement facturé.
  if sub.pending_plan = inv.plan and coalesce(sub.pending_cycle, sub.billing_cycle) = inv.billing_cycle then
    target_plan := sub.pending_plan;
    target_cycle := sub.pending_cycle;
  else
    target_plan := inv.plan;
    target_cycle := inv.billing_cycle;
  end if;

  update public.billing_invoices
     set status = 'paid',
         paid_at = now(),
         manual_reference = p_manual_reference,
         manual_payment_note = trim(p_note),
         manual_payment_confirmed_by = (select auth.uid()),
         manual_payment_confirmed_at = now()
   where id = inv.id;

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

  -- Entitlements effectifs (ALIGN-01) tenus synchronisés, même fonction que
  -- réutilise déjà ADMIN-BILLING-OPS-01 — pas de deuxième mécanisme d'octroi.
  perform private.assign_organization_plan(inv.organization_id, target_plan);

  insert into public.billing_events (organization_id, event_type, from_status, to_status, payload, actor_user_id)
  values (
    inv.organization_id, 'invoice_manual_payment_confirmed', sub.status, 'active',
    jsonb_build_object(
      'invoiceId', inv.id, 'number', inv.number, 'plan', target_plan, 'cycle', target_cycle,
      'amountMinor', inv.amount_minor, 'currency', inv.currency,
      'manualReference', p_manual_reference, 'note', trim(p_note)
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
