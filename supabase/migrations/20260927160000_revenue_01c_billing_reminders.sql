begin;

-- =============================================================================
-- REVENUE-LAUNCH-01 — Sous-lot 01C — Rappels automatiques
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante
-- n'est modifiée dans son comportement ni supprimée.
--
-- NON APPLIQUÉE à ce stade (ni sur KJORA Dev, ni sur KJORA Production) — même
-- point d'arrêt qu'ADMIN-BILLING-OPS-01 et REVENUE-01B.
--
-- CRON PRÉPARÉ, NON DÉPLOYÉ : ce lot construit la RPC et sa table
-- d'idempotence, prêtes à être appelées par un job pg_cron ou une route Vercel
-- Cron. Aucune des deux n'est câblée ici — `vercel.json` n'est pas modifié et
-- aucun `cron.schedule(...)` n'est ajouté. Le paramètre `p_dry_run` vaut
-- `true` par défaut : un appel sans argument ne journalise et n'envoie RIEN,
-- il ne fait que compter ce qui serait dû.
--
-- AUCUN ENVOI RÉEL : ce lot ne contient aucun appel Resend ni aucun code
-- d'envoi d'email. Il calcule quels rappels sont dus et les journalise pour
-- qu'un futur mécanisme d'envoi (hors périmètre de ce lot) puisse les
-- consommer sans jamais en envoyer deux fois pour la même occurrence.
--
-- Idempotence stricte : `billing_reminder_log` porte une contrainte unique
-- (organization_id, reminder_type, target_date). Rejouer ce calcul un nombre
-- quelconque de fois pour la même date ne journalise jamais deux fois le même
-- rappel — donc ne peut jamais produire un double courriel une fois l'envoi
-- réel branché.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Journal d'idempotence des rappels — aucun contenu sensible
-- ---------------------------------------------------------------------------
-- Ne porte ni email, ni montant, ni référence de paiement : uniquement de quoi
-- garantir qu'un rappel donné n'est jamais journalisé deux fois.

create table if not exists public.billing_reminder_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reminder_type text not null,
  target_date date not null,
  invoice_id uuid references public.billing_invoices (id) on delete set null,
  computed_at timestamptz not null default now(),
  constraint billing_reminder_log_unique unique (organization_id, reminder_type, target_date)
);

comment on table public.billing_reminder_log is
  'REVENUE-01C : journal d''idempotence des rappels de facturation. Ne journalise '
  'jamais deux fois le même (organization_id, reminder_type, target_date). Ne '
  'contient aucun email, montant ni référence de paiement.';

create index if not exists billing_reminder_log_org_idx
  on public.billing_reminder_log (organization_id, computed_at desc);

alter table public.billing_reminder_log enable row level security;
revoke all on public.billing_reminder_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Calcul pur des rappels dus — aucun effet de bord
-- ---------------------------------------------------------------------------
-- Les décalages (7/3/1, 1/3/6, 30/7, 3) reproduisent exactement les constantes
-- canoniques de src/core/billing/model.ts (RENEWAL_REMINDER_OFFSETS,
-- GRACE_REMINDER_OFFSETS, PAYMENT_METHOD_EXPIRY_OFFSETS,
-- INVOICE_DUE_SOON_OFFSET_DAYS) — testé par revenue-01c-billing-reminders
-- .test.ts, source unique de vérité côté TypeScript.

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
    cross join (values (7),(3),(1)) as d(offset_days)
   where s.status = 'active'
     and s.renewal_date is not null
     and s.renewal_date - p_as_of = d.offset_days

  union all

  -- Tolérance : J+1, J+3, J+6 après le début de la grâce, toujours en grâce.
  select s.organization_id, 'grace_reminder_j' || d.offset_days::text,
         s.grace_started_on + d.offset_days, null::uuid
    from public.organization_subscriptions s
    cross join (values (1),(3),(6)) as d(offset_days)
   where s.status = 'grace'
     and s.grace_started_on is not null
     and p_as_of - s.grace_started_on = d.offset_days

  union all

  -- Expiration du moyen de paiement : J-30, J-7. Sans candidat tant qu'aucun
  -- provider n'écrit payment_method_expires_on (ALIGN-04A, registre vide).
  select s.organization_id, 'payment_method_expiring_j' || d.offset_days::text,
         s.payment_method_expires_on, null::uuid
    from public.organization_subscriptions s
    cross join (values (30),(7)) as d(offset_days)
   where s.payment_method_expires_on is not null
     and s.payment_method_expires_on - p_as_of = d.offset_days

  union all

  -- Facture Afrique arrivant à échéance : J-3 avant la fin de période, encore 'open'.
  select i.organization_id, 'invoice_due_soon', i.period_end, i.id
    from public.billing_invoices i
   where i.status = 'open'
     and i.period_end - p_as_of = 3

  union all

  -- Facture Afrique en retard : dès que period_end est dépassée. target_date
  -- reste fixée à period_end, donc l'unicité de billing_reminder_log garantit
  -- un seul rappel journalisé, pas un par jour de retard.
  select i.organization_id, 'invoice_overdue', i.period_end, i.id
    from public.billing_invoices i
   where i.status = 'open'
     and i.period_end < p_as_of;
$$;

revoke all on function private.compute_due_billing_reminders(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Exécution — dry-run par défaut, platform_admin uniquement
-- ---------------------------------------------------------------------------
-- p_dry_run = true (défaut) : compte ce qui serait journalisé, n'écrit rien.
-- p_dry_run = false : journalise chaque rappel nouvellement dû dans
--   billing_reminder_log (idempotent par la contrainte unique) et n'insère un
--   billing_events correspondant QUE pour ce qui vient réellement d'être
--   journalisé — jamais un doublon. Applique aussi, dans le même appel, le
--   passage grace -> billing_blocked pour toute grâce expirée (même logique
--   d'idempotence : un compte déjà billing_blocked ne matche plus le filtre).
--
-- N'envoie aucun email : ceci reste hors périmètre de ce lot.

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
  already_logged int;
begin
  perform private.assert_platform_admin();

  for rec in select * from private.compute_due_billing_reminders(p_as_of) loop
    reminder_total := reminder_total + 1;
    counts := jsonb_set(
      counts, array[rec.reminder_type],
      to_jsonb(coalesce((counts ->> rec.reminder_type)::int, 0) + 1)
    );

    if not p_dry_run then
      select count(*) into already_logged from public.billing_reminder_log
       where organization_id = rec.organization_id
         and reminder_type = rec.reminder_type
         and target_date = rec.target_date;

      if already_logged = 0 then
        insert into public.billing_reminder_log (organization_id, reminder_type, target_date, invoice_id)
        values (rec.organization_id, rec.reminder_type, rec.target_date, rec.invoice_id)
        on conflict (organization_id, reminder_type, target_date) do nothing;

        if found then
          logged_total := logged_total + 1;
          insert into public.billing_events (organization_id, event_type, payload)
          values (
            rec.organization_id, rec.reminder_type,
            jsonb_build_object('targetDate', rec.target_date, 'invoiceId', rec.invoice_id)
          );
        end if;
      end if;
    end if;
  end loop;

  if not p_dry_run then
    for blocked_org in
      select organization_id from public.organization_subscriptions
       where status = 'grace' and grace_ends_on is not null and grace_ends_on < p_as_of
       for update
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
