begin;

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01C — Rappels automatiques
-- =============================================================================
-- MIGRATION ADDITIVE. NON APPLIQUÉE à ce stade (ni Dev, ni Production).
--
-- CRON PRÉPARÉ, NON DÉPLOYÉ : ce lot construit la RPC et sa table
-- d'idempotence, prêtes à être appelées par un job pg_cron ou une route Vercel
-- Cron. Aucune des deux n'est câblée ici. `p_dry_run` vaut `true` par défaut.
--
-- AUCUN ENVOI RÉEL : aucun appel Resend, aucun code d'envoi. Le calcul
-- journalise ce qui est dû, pour qu'un futur mécanisme d'envoi ne puisse
-- jamais envoyer deux fois la même occurrence.
--
-- Règles finales (nettoyage v3, chacune définie une seule fois ici) :
--   • jamais de rappel pour une Organization suspendue ou archivée, et jamais
--     de bascule automatique grace -> billing_blocked pendant qu'elle est gelée ;
--   • les rappels de facture se fondent sur `billing_invoices.due_on`
--     (REVENUE-01B), avec repli sur period_end pour une facture antérieure ;
--   • dédoublonnage PAR FACTURE : deux factures distinctes d'une même
--     Organization ayant la même échéance reçoivent chacune leur rappel
--     (l'ancienne clé unique (organization_id, reminder_type, target_date)
--     aurait silencieusement supprimé le second).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Journal d'idempotence des rappels — aucun contenu sensible
-- ---------------------------------------------------------------------------

create table if not exists public.billing_reminder_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reminder_type text not null,
  target_date date not null,
  invoice_id uuid references public.billing_invoices (id) on delete set null,
  computed_at timestamptz not null default now()
);

comment on table public.billing_reminder_log is
  'REVENUE-01C : journal d''idempotence des rappels de facturation. Un rappel de facture est unique par (invoice_id, reminder_type) ; un rappel d''abonnement par (organization_id, reminder_type, target_date). Aucun email, montant ni référence de paiement.';

-- Rappels liés à une facture : un seul par facture et par type.
create unique index if not exists billing_reminder_log_invoice_unique
  on public.billing_reminder_log (invoice_id, reminder_type)
  where invoice_id is not null;

-- Rappels d'abonnement (renouvellement, grâce, moyen de paiement) : un seul
-- par Organization, type et date cible.
create unique index if not exists billing_reminder_log_subscription_unique
  on public.billing_reminder_log (organization_id, reminder_type, target_date)
  where invoice_id is null;

create index if not exists billing_reminder_log_org_idx
  on public.billing_reminder_log (organization_id, computed_at desc);

alter table public.billing_reminder_log enable row level security;
revoke all on public.billing_reminder_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Calcul pur des rappels dus — aucun effet de bord
-- ---------------------------------------------------------------------------
-- Les décalages (7/3/1, 1/3/6, 30/7, 3) reproduisent exactement les constantes
-- canoniques de src/core/billing/model.ts.

create or replace function private.compute_due_billing_reminders(p_as_of date)
returns table (
  organization_id uuid,
  reminder_type text,
  target_date date,
  invoice_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Renouvellement : J-7, J-3, J-1 avant renewal_date, abonnement actif.
  select s.organization_id, 'renewal_reminder_j' || d.offset_days::text, s.renewal_date, null::uuid
    from public.organization_subscriptions s
    join public.organizations o on o.id = s.organization_id
    cross join (values (7),(3),(1)) as d(offset_days)
   where s.status = 'active'
     and o.status = 'active'
     and s.renewal_date is not null
     and s.renewal_date - p_as_of = d.offset_days

  union all

  -- Tolérance : J+1, J+3, J+6 après le début de la grâce, toujours en grâce.
  select s.organization_id, 'grace_reminder_j' || d.offset_days::text,
         s.grace_started_on + d.offset_days, null::uuid
    from public.organization_subscriptions s
    join public.organizations o on o.id = s.organization_id
    cross join (values (1),(3),(6)) as d(offset_days)
   where s.status = 'grace'
     and o.status = 'active'
     and s.grace_started_on is not null
     and p_as_of - s.grace_started_on = d.offset_days

  union all

  -- Expiration du moyen de paiement : J-30, J-7.
  select s.organization_id, 'payment_method_expiring_j' || d.offset_days::text,
         s.payment_method_expires_on, null::uuid
    from public.organization_subscriptions s
    join public.organizations o on o.id = s.organization_id
    cross join (values (30),(7)) as d(offset_days)
   where o.status = 'active'
     and s.payment_method_expires_on is not null
     and s.payment_method_expires_on - p_as_of = d.offset_days

  union all

  -- Facture arrivant à échéance : J-3 avant due_on, encore 'open'.
  select i.organization_id, 'invoice_due_soon', coalesce(i.due_on, i.period_end), i.id
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
   where i.status = 'open'
     and o.status = 'active'
     and coalesce(i.due_on, i.period_end) - p_as_of = 3

  union all

  -- Facture en retard : dès que l'échéance est dépassée. Un seul rappel par
  -- facture (index billing_reminder_log_invoice_unique), pas un par jour.
  select i.organization_id, 'invoice_overdue', coalesce(i.due_on, i.period_end), i.id
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
   where i.status = 'open'
     and o.status = 'active'
     and coalesce(i.due_on, i.period_end) < p_as_of;
$$;

revoke all on function private.compute_due_billing_reminders(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Exécution — dry-run par défaut, platform_admin uniquement
-- ---------------------------------------------------------------------------

create or replace function public.admin_run_billing_reminders(
  p_as_of date default current_date,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  blocked_org record;
  reminder_total int := 0;
  logged_total int := 0;
  blocked_count int := 0;
  counts jsonb := '{}'::jsonb;
  inserted_id uuid;
begin
  perform private.assert_platform_admin();

  for rec in select * from private.compute_due_billing_reminders(p_as_of) loop
    reminder_total := reminder_total + 1;
    counts := jsonb_set(
      counts, array[rec.reminder_type],
      to_jsonb(coalesce((counts ->> rec.reminder_type)::int, 0) + 1)
    );

    if not p_dry_run then
      inserted_id := null;
      -- Sans cible de conflit : chacun des deux index partiels (par facture /
      -- par abonnement) suffit à refuser un doublon.
      insert into public.billing_reminder_log (organization_id, reminder_type, target_date, invoice_id)
      values (rec.organization_id, rec.reminder_type, rec.target_date, rec.invoice_id)
      on conflict do nothing
      returning id into inserted_id;

      if inserted_id is not null then
        logged_total := logged_total + 1;
        insert into public.billing_events (organization_id, event_type, payload)
        values (
          rec.organization_id, rec.reminder_type,
          jsonb_build_object('targetDate', rec.target_date, 'invoiceId', rec.invoice_id)
        );
      end if;
    end if;
  end loop;

  if not p_dry_run then
    for blocked_org in
      select s.organization_id
        from public.organization_subscriptions s
        join public.organizations o on o.id = s.organization_id
       where s.status = 'grace' and s.grace_ends_on is not null and s.grace_ends_on < p_as_of
         and o.status = 'active'
       for update of s
    loop
      update public.organization_subscriptions
         set status = 'billing_blocked', blocked_at = now()
       where organization_id = blocked_org.organization_id;

      insert into public.billing_events (organization_id, event_type, from_status, to_status)
      values (blocked_org.organization_id, 'billing_blocked', 'grace', 'billing_blocked');

      blocked_count := blocked_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'outcome', 'computed', 'dryRun', p_dry_run, 'asOf', p_as_of,
    'reminderCandidates', reminder_total, 'reminderLogged', logged_total,
    'byType', counts, 'newlyBlocked', blocked_count
  );
end;
$$;

revoke all on function public.admin_run_billing_reminders(date, boolean) from public, anon;
grant execute on function public.admin_run_billing_reminders(date, boolean) to authenticated;

commit;
