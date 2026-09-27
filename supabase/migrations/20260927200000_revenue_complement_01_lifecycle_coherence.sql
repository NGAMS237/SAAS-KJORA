begin;

-- =============================================================================
-- KJORA — REVENUE-LAUNCH-01 — Complément — Cohérence globale du cycle de vie
-- =============================================================================
-- MIGRATION ADDITIVE. Aucune table, colonne, policy ou fonction existante n'est
-- supprimée. Ce lot REMPLACE (`create or replace`) six fonctions déjà livrées
-- par REVENUE-LAUNCH-01 (01B, 01C, 01H, 01I) et ADMIN-01.1, pour combler des
-- manques identifiés par une relecture ciblée du cycle de vie Organization
-- (suspension/archivage) demandée après la livraison initiale de 01H/01I.
--
-- NON APPLIQUÉE à ce stade (ni Dev, ni Production) — même point d'arrêt que
-- tous les lots précédents de REVENUE-LAUNCH-01. RÉELLEMENT EXÉCUTÉE en local
-- (cluster PostgreSQL 16 éphémère + pgtap réel, voir
-- supabase/tests/database/rls_revenue_complement_01_lifecycle_coherence.test.sql) —
-- jamais sur un Supabase distant.
--
-- Dépendance : ce lot s'applique APRÈS les 5 migrations Revenue existantes
-- (01B 20260927150000, 01C 20260927160000, 01E 20260927170000, 01H
-- 20260927180000, 01I 20260927190000), et après ADMIN-01.1 (20260921120000)
-- dont il remplace à nouveau `admin_platform_counters`. Voir
-- docs/revenue-launch-01-migrations.md pour l'ordre complet et les
-- dépendances de toutes les migrations Revenue.
--
-- ---------------------------------------------------------------------------
-- CE QUE CE LOT CORRIGE, ET POURQUOI (audit du complément, section par section)
-- ---------------------------------------------------------------------------
-- §2 Compteurs — admin_platform_counters() exposait organizations_active et
--   organizations_suspended, jamais organizations_archived : une Organization
--   archivée restait comptée dans organizations_total (un simple count(*)),
--   mais ne réapparaissait dans AUCUNE ventilation par statut — la vue
--   d'ensemble « perdait » silencieusement ces Organizations dès qu'on
--   cherchait à vérifier total = active + suspended + archived.
--
-- §3 Effets financiers — ni admin_issue_manual_invoice (01B) ni
--   private.compute_due_billing_reminders (01C) ne consultaient jamais
--   organizations.status : une Organization suspendue ou archivée pouvait
--   continuer à recevoir une facture manuelle et des rappels automatiques,
--   alors que has_capability (01H) lui retire déjà tout accès applicatif —
--   incohérence entre « l'Organization ne peut plus rien voir » et
--   « la plateforme continue de lui facturer ». Corrigé par un filtre
--   organizations.status = 'active' ajouté aux deux. Complété par un signal
--   explicite d'incohérence (jamais une annulation automatique, qui exigerait
--   un vrai appel fournisseur, hors mandat) quand une Organization
--   suspendue/archivée a encore un abonnement lié à un provider réel non
--   annulé : `organizations_requiring_provider_action` (compteur) et
--   `providerActionRequired` (fiche Organization, admin_get_organization_detail).
--   Les factures et paiements historiques restent visibles sans changement :
--   admin_finance_billing_extension (01E) ne filtre jamais par
--   organizations.status et n'est pas touchée ici.
--
-- §4 Contacts et marketing — ni admin_list_commercial_contacts ni
--   admin_list_commercial_contacts_for_export (01I) n'exposaient le statut de
--   l'Organization, et aucune éligibilité marketing n'était calculée nulle
--   part. Ajouté : `organization_status` (les deux) et `marketing_eligible`
--   (les deux), calculé comme organization.status = 'active' ET
--   marketing_consent = true ET consent_source présent ET unsubscribed_at
--   null — les trois derniers termes sont déjà garantis équivalents à
--   marketing_consent = true par les contraintes de la table (voir 01I :
--   organization_commercial_contacts_consent_pair et
--   _consent_unsub_exclusive), mais la formule complète est conservée
--   explicitement pour rendre la règle auditable sans dépendre d'une
--   contrainte qui pourrait changer.
--
-- §5 Accès — private.has_capability (01H) reste l'unique point d'entrée
--   utilisé par ~25 RLS/RPC (biens, logements, locataires, baux, loyers,
--   paiements, documents, contrats, membres, exports, Billing) : AUCUN
--   changement n'est nécessaire ici, le filtre organizations.status = 'active'
--   qu'il applique déjà coupe tout uniformément. Ce que ce lot AJOUTE, c'est
--   la vérification RÉELLE par pgTAP (§8) que chacun de ces domaines est
--   effectivement coupé, jamais seulement supposé par la centralisation. La
--   seule vraie lacune trouvée était côté application (hors SQL) :
--   loadOrganizationContext() exclut toute Organization non active de la
--   liste retournée, ce qui rendait /api/support totalement inaccessible à
--   un membre d'une Organization suspendue/archivée — alors que le mandat
--   exige explicitement que l'aide/support reste accessible. Corrigé côté
--   application par une nouvelle fonction dédiée,
--   loadAnyMembershipOrganization() (src/core/organization/load-organization-context.ts),
--   utilisée uniquement par /api/support — zéro changement pour tout autre
--   appelant de loadOrganizationContext().
--
-- §6 Multi-Organizations — admin_disable_member (01H) était déjà correctement
--   borné à UNE SEULE ligne memberships (jamais de fuite vers les autres
--   Organizations d'un même utilisateur), et
--   admin_transfer_organization_ownership préserve déjà structurellement
--   exactement un propriétaire actif (une paire d'updates dans la même
--   transaction implicite de la fonction). La vraie lacune : private.
--   best_effort_revoke_sessions exécutait `delete from auth.sessions` — une
--   suppression DIRECTE dans une table interne de Supabase Auth, que le
--   mandat interdit désormais explicitement. Corrigée en supprimant cette
--   suppression : la fonction ne touche plus jamais auth.sessions et renvoie
--   toujours `false` (« non tentée au niveau base »). Aucune perte de
--   sécurité réelle : has_capability coupe l'accès immédiatement via
--   memberships.status = 'revoked', indépendamment de la validité d'une
--   session/JWT déjà émis — la révocation de session, si elle est un jour
--   nécessaire, relève de l'API Admin Auth de Supabase depuis le code
--   applicatif serveur, jamais d'un DELETE SQL direct.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Compteurs — organizations_archived + signal provider/action requise
-- -----------------------------------------------------------------------------

create or replace function public.admin_platform_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.assert_platform_admin();

  select jsonb_build_object(
    'organizations_total',     (select count(*) from public.organizations),
    'organizations_active',    (select count(*) from public.organizations where status = 'active'),
    'organizations_suspended', (select count(*) from public.organizations where status = 'suspended'),
    -- Complément REVENUE-LAUNCH-01 §2 : sans cette clé, une Organization
    -- archivée restait comptée dans organizations_total mais dans AUCUNE
    -- ventilation par statut — total = active + suspended + archived est
    -- désormais vérifiable, et vérifié par pgTAP (§8).
    'organizations_archived',  (select count(*) from public.organizations where status = 'archived'),

    -- Abonnements RÉELLEMENT enregistrés uniquement (organization_subscriptions).
    'subscriptions_free', (select count(*) from public.organization_subscriptions where plan = 'decouverte'),
    'subscriptions_paid', (select count(*) from public.organization_subscriptions where plan <> 'decouverte'),

    -- Ni gratuite ni payante : aucune ligne de facturation n'existe pour elle.
    'organizations_without_subscription', (
      select count(*) from public.organizations o
      where not exists (
        select 1 from public.organization_subscriptions s where s.organization_id = o.id
      )
    ),

    -- Incohérence RÉELLEMENT mesurée : une Organization a une ligne
    -- organization_subscriptions ET son classement gratuit/payant n'y
    -- correspond pas à celui de son forfait effectif (organization_plans).
    'plan_billing_mismatches', (
      select count(*)
      from public.organization_subscriptions s
      join public.organization_plans p on p.organization_id = s.organization_id
      where (p.plan = 'decouverte') <> (s.plan = 'decouverte')
    ),

    -- Complément REVENUE-LAUNCH-01 §3 : Organizations suspendues/archivées
    -- dont l'abonnement est encore lié à un provider réel non annulé — jamais
    -- annulé automatiquement (aucun appel fournisseur réel n'est autorisé),
    -- ce compteur EXPOSE l'incohérence pour une action manuelle. Un abonnement
    -- 'free' n'a jamais de provider (contrainte subscription_free_has_no_provider,
    -- ALIGN-03) : sans intérêt ici par construction.
    'organizations_requiring_provider_action', (
      select count(*)
      from public.organizations o
      join public.organization_subscriptions s on s.organization_id = o.id
      where o.status <> 'active'
        and s.provider is not null
        and s.status <> 'cancelled'
    ),

    'subscriptions_by_status', coalesce((
      select jsonb_object_agg(status, n)
      from (
        select status, count(*) as n
        from public.organization_subscriptions
        group by status
      ) s
    ), '{}'::jsonb),
    'subscriptions_by_plan', coalesce((
      select jsonb_object_agg(plan, n)
      from (
        select plan, count(*) as n
        from public.organization_subscriptions
        group by plan
      ) p
    ), '{}'::jsonb),
    'generated_at', now()
  )
  into result;

  return result;
end;
$$;

revoke all on function public.admin_platform_counters() from public, anon;
grant execute on function public.admin_platform_counters() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Facturation manuelle — aucune nouvelle facture hors Organization active
-- -----------------------------------------------------------------------------
-- Seul le garde-fou change : ajouté juste après la vérification d'existence,
-- avant toute autre validation (idempotence, plan, cycle, période...) — une
-- Organization suspendue/archivée est refusée immédiatement, sans jamais
-- consommer un jeton d'idempotence pour une émission qui n'aura pas lieu.

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
  org public.organizations;
  sub public.organization_subscriptions;
  existing_id uuid;
  existing_number text;
  price bigint;
  seq_value bigint;
  invoice_number text;
  new_id uuid;
begin
  perform private.assert_platform_admin();

  select * into org from public.organizations where id = target_organization_id for update;
  if org.id is null then
    return jsonb_build_object('outcome', 'organization_not_found');
  end if;

  -- Complément REVENUE-LAUNCH-01 §3 : une Organization suspendue ou archivée
  -- ne doit plus recevoir de nouvelle facture. Les factures déjà émises
  -- restent inchangées et visibles (aucune ligne touchée ici).
  if org.status <> 'active' then
    return jsonb_build_object('outcome', 'organization_not_active', 'status', org.status);
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
    'outcome', 'issued', 'invoiceId', new_id, 'number', invoice_number
  );
end;
$$;

revoke all on function public.admin_issue_manual_invoice(uuid, text, text, date, date, text) from public, anon;
grant execute on function public.admin_issue_manual_invoice(uuid, text, text, date, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Rappels automatiques — jamais pour une Organization non active
-- -----------------------------------------------------------------------------
-- Chaque branche du UNION ALL rejoint désormais public.organizations et exige
-- status = 'active'. Même filtre appliqué à la bascule grace -> billing_blocked
-- dans admin_run_billing_reminders (§4 ci-dessous) : une Organization
-- suspendue/archivée ne doit plus voir sa facturation évoluer automatiquement
-- pendant qu'elle est gelée, cohérent avec « ne doit plus recevoir de rappel
-- automatique ».

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

  -- Expiration du moyen de paiement : J-30, J-7. Sans candidat tant qu'aucun
  -- provider n'écrit payment_method_expires_on (ALIGN-04A, registre vide).
  select s.organization_id, 'payment_method_expiring_j' || d.offset_days::text,
         s.payment_method_expires_on, null::uuid
    from public.organization_subscriptions s
    join public.organizations o on o.id = s.organization_id
    cross join (values (30),(7)) as d(offset_days)
   where o.status = 'active'
     and s.payment_method_expires_on is not null
     and s.payment_method_expires_on - p_as_of = d.offset_days

  union all

  -- Facture Afrique arrivant à échéance : J-3 avant la fin de période, encore 'open'.
  select i.organization_id, 'invoice_due_soon', i.period_end, i.id
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
   where i.status = 'open'
     and o.status = 'active'
     and i.period_end - p_as_of = 3

  union all

  -- Facture Afrique en retard : dès que period_end est dépassée. target_date
  -- reste fixée à period_end, donc l'unicité de billing_reminder_log garantit
  -- un seul rappel journalisé, pas un par jour de retard.
  select i.organization_id, 'invoice_overdue', i.period_end, i.id
    from public.billing_invoices i
    join public.organizations o on o.id = i.organization_id
   where i.status = 'open'
     and o.status = 'active'
     and i.period_end < p_as_of;
$$;

revoke all on function private.compute_due_billing_reminders(date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Bascule grace -> billing_blocked — jamais pour une Organization gelée
-- -----------------------------------------------------------------------------
-- Signature strictement inchangée : `create or replace`, admin_run_billing_reminders
-- garde le même contrat vis-à-vis de son appelant. Seule la boucle de bascule
-- gagne un filtre sur organizations.status = 'active', par cohérence avec
-- compute_due_billing_reminders ci-dessus (§3) : une Organization déjà
-- suspendue/archivée par un Admin ne doit pas voir sa facturation continuer
-- d'évoluer automatiquement en son absence.

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
      select s.organization_id from public.organization_subscriptions s
      join public.organizations o on o.id = s.organization_id
       where s.status = 'grace' and s.grace_ends_on is not null and s.grace_ends_on < p_as_of
         and o.status = 'active'
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

-- -----------------------------------------------------------------------------
-- 5. Fiche Organization — signal d'incohérence provider/statut
-- -----------------------------------------------------------------------------
-- Signature inchangée (uuid) -> jsonb : simple ajout d'une clé dans l'objet
-- renvoyé. Aucun appelant existant n'est cassé par une clé jsonb en plus.

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
  provider_action_required boolean;
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
  mismatch := (eff_plan <> fallback_plan) and (active_intervention is null);

  -- Complément REVENUE-LAUNCH-01 §3 : signal d'incohérence, jamais une
  -- annulation automatique. Vrai uniquement si l'Organization est
  -- suspendue/archivée ET que son abonnement est encore lié à un provider réel
  -- non annulé (voir admin_platform_counters, même formule).
  provider_action_required := org.status <> 'active'
    and sub.provider is not null
    and sub.status <> 'cancelled';

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
        'provider', sub.provider)
    end,
    'planBillingMismatch', mismatch,
    'providerActionRequired', provider_action_required,
    'activeIntervention', active_intervention,
    'recentAdminEvents', recent_events
  );
end;
$$;

revoke all on function public.admin_get_organization_detail(uuid) from public, anon;
grant execute on function public.admin_get_organization_detail(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Contacts commerciaux — statut de l'Organization + éligibilité marketing
-- -----------------------------------------------------------------------------
-- `admin_list_commercial_contacts` renvoie un objet jsonb : ajout de deux
-- clés dans les lignes, signature inchangée. `admin_list_commercial_contacts_
-- for_export` renvoie `returns table (...)` : le type de retour change, donc
-- `drop function` d'abord (même raison qu'ADMIN-01.1 §2 pour
-- admin_list_organizations : PostgREST ne résout jamais deux surcharges).

drop function if exists public.admin_list_commercial_contacts_for_export();

create or replace function public.admin_list_commercial_contacts(
  page_limit  integer default 25,
  page_offset integer default 0,
  search_term text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit  integer;
  safe_offset integer;
  safe_search text;
  total       bigint;
  page_rows   jsonb;
begin
  perform private.assert_platform_admin();

  safe_limit  := least(greatest(coalesce(page_limit, 25), 1), 100);
  safe_offset := greatest(coalesce(page_offset, 0), 0);
  safe_search := nullif(trim(coalesce(search_term, '')), '');

  select count(*) into total
  from public.organizations o
  left join public.organization_profiles p on p.organization_id = o.id
  left join lateral (
    select u.email::text as owner_email
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
    order by m.created_at asc
    limit 1
  ) owner on true
  where (
    safe_search is null
    or p.name ilike '%' || safe_search || '%'
    or owner.owner_email ilike '%' || safe_search || '%'
  );

  select coalesce(jsonb_agg(row_to_json(page)), '[]'::jsonb)
  into page_rows
  from (
    select
      o.id as organization_id,
      coalesce(p.name, '')::text as organization_name,
      -- Complément REVENUE-LAUNCH-01 §4 : statut requis dans la liste, jamais
      -- absent — c'est précisément ce qui permet à un Admin de repérer une
      -- Organization archivée avant de l'exporter vers une campagne.
      o.status::text as organization_status,
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false) as marketing_consent,
      c.marketing_consent_at,
      c.consent_source,
      c.unsubscribed_at,
      -- Complément REVENUE-LAUNCH-01 §4 : éligibilité marketing = Organization
      -- active ET consentement positif ET preuve (source) présente ET jamais
      -- désabonnée. Les trois derniers termes sont déjà garantis équivalents à
      -- marketing_consent = true par les contraintes de la table (voir 01I),
      -- mais la formule complète est explicite plutôt qu'implicite.
      (o.status = 'active'
        and coalesce(c.marketing_consent, false)
        and c.consent_source is not null
        and c.unsubscribed_at is null) as marketing_eligible
    from public.organizations o
    left join public.organization_profiles p on p.organization_id = o.id
    left join public.organization_commercial_contacts c on c.organization_id = o.id
    left join lateral (
      select u.email::text as owner_email
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) owner on true
    where (
      safe_search is null
      or p.name ilike '%' || safe_search || '%'
      or owner.owner_email ilike '%' || safe_search || '%'
    )
    order by p.name nulls last, o.id
    limit safe_limit offset safe_offset
  ) page;

  return jsonb_build_object(
    'rows', page_rows,
    'total_count', total,
    'limit', safe_limit,
    'offset', safe_offset
  );
end;
$$;

revoke all on function public.admin_list_commercial_contacts(integer, integer, text) from public, anon;
grant execute on function public.admin_list_commercial_contacts(integer, integer, text) to authenticated;

-- Export Admin MINIMAL : mêmes colonnes que la console (+ organization_status,
-- marketing_eligible), jamais de champ absent du reste de la console. Non
-- paginé mais borné (5000 lignes) — inchangé.
create or replace function public.admin_list_commercial_contacts_for_export()
returns table (
  organization_name text,
  organization_status text,
  owner_email text,
  phone text,
  country text,
  language text,
  marketing_consent boolean,
  marketing_consent_at timestamptz,
  consent_source text,
  unsubscribed_at timestamptz,
  marketing_eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select
      coalesce(p.name, '')::text,
      o.status::text,
      owner.owner_email,
      c.phone,
      c.country,
      c.language,
      coalesce(c.marketing_consent, false),
      c.marketing_consent_at,
      c.consent_source,
      c.unsubscribed_at,
      (o.status = 'active'
        and coalesce(c.marketing_consent, false)
        and c.consent_source is not null
        and c.unsubscribed_at is null)
    from public.organizations o
    left join public.organization_profiles p on p.organization_id = o.id
    left join public.organization_commercial_contacts c on c.organization_id = o.id
    left join lateral (
      select u.email::text as owner_email
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'organization_owner' and m.status = 'active'
      order by m.created_at asc
      limit 1
    ) owner on true
    order by p.name nulls last, o.id
    limit 5000;
end;
$$;

revoke all on function public.admin_list_commercial_contacts_for_export() from public, anon;
grant execute on function public.admin_list_commercial_contacts_for_export() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Désactivation de membre — plus jamais de DELETE direct dans auth.sessions
-- -----------------------------------------------------------------------------
-- Complément REVENUE-LAUNCH-01 §6 : le mandat interdit désormais explicitement
-- toute suppression directe dans auth.sessions. La fonction ne touche plus
-- cette table : elle renvoie toujours `false` (« non tentée au niveau base »).
-- admin_disable_member (01H, non modifiée ici) continue de journaliser
-- `sessionsRevoked` avec cette valeur — son véritable effet de sécurité,
-- memberships.status = 'revoked' coupant immédiatement has_capability,
-- n'a jamais dépendu de cette étape annexe (voir la note de tête de fichier
-- de 20260927180000_revenue_01h_admin_lifecycle.sql, §5).

create or replace function private.best_effort_revoke_sessions(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Volontairement un no-op : voir le commentaire de section ci-dessus et la
  -- note en tête de ce fichier (§6). La révocation de session, si elle
  -- s'avère un jour nécessaire, doit passer par l'API Admin Auth de Supabase
  -- depuis du code serveur — jamais par une suppression SQL directe dans une
  -- table interne de Supabase Auth.
  return false;
end;
$$;

revoke all on function private.best_effort_revoke_sessions(uuid) from public, anon, authenticated;

commit;
