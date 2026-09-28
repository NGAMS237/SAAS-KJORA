begin;

-- =============================================================================
-- KJORA — NOTIFICATIONS-COMMUNICATIONS-E2E-01
-- =============================================================================
-- NON APPLIQUÉE à distance (ni Dev, ni Production). Rejouée et testée sur un
-- PostgreSQL 16 local éphémère (pgtap réel) : voir
-- supabase/tests/database/rls_notifications_communications_e2e_01.test.sql.
--
-- Constats (audit KJORA Dev, lecture seule) et réponse de ce lot :
--   1. Notifications jamais marquées lues à l'ouverture : l'ouverture passe
--      désormais par public.open_notification, qui marque la notification lue
--      (idempotent) ET renvoie une destination FERMÉE, vérifiée en base
--      (§1) — jamais une URL construite depuis un payload.
--   2. « Ressource introuvable » après un clic : la destination n'est plus
--      déduite côté client ; ressource disparue ou inaccessible → repli
--      explicite (§1).
--   3. Avis d'échéance manqués : l'ancien calcul exigeait notice_date = run_on,
--      si bien qu'une échéance créée avec un avis déjà passé (bail antidaté) ou
--      un jour de cron manqué ne recevait jamais d'avis. Rattrapage borné dans
--      le passage quotidien + réconciliation Admin batchée, dry-run par défaut,
--      sans jamais envoyer de courriel pour un avis tardif (§2).
--   4. Aucune file de courriels : aucune ligne organization_communication_settings
--      ne pouvait être créée (seule une policy UPDATE existait). RPC
--      propriétaire d'enregistrement explicite (§3).
--   5. Aucun expéditeur automatique : réservation atomique ; au plus UNE
--      tentative automatique susceptible d'avoir été acceptée par ligne ;
--      tout résultat ambigu (délai, 5xx, crash avant finalisation, bail
--      expiré après le début de l'envoi) passe en revue Admin explicite et
--      auditée — jamais ré-expédié automatiquement. Pas d'« exactly-once »
--      (§4, §7). Résultats du fournisseur via webhook signé (§6).
--   6. Aucune facture SaaS XAF automatique : génération quotidienne séparée,
--      idempotente par période, file de courriels dédiée au domaine SaaS —
--      jamais mêlée aux documents locatifs (§5).
--   7. Aucun suivi : journal d'exécutions et vue Admin agrégée, sans contenu de
--      message ni adresse complète (§6).
--
-- Principes : additif, aucune suppression de données, aucune écriture dans
-- auth.*, aucun appel réseau depuis la base, aucune activation de fournisseur
-- de paiement. Les courriels restent transactionnels : aucun consentement
-- marketing n'est lu ni réutilisé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Outils communs
-- -----------------------------------------------------------------------------

create or replace function private.is_deliverable_email(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
    and char_length(value) between 6 and 320
    and value = lower(trim(value))
    and value ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$';
$$;

create or replace function private.email_fingerprint(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(lower(trim(coalesce(value, ''))), 'sha256'), 'hex');
$$;

-- Adresse masquée pour les vues de supervision (« b***@domaine.cm ») : la
-- vue Admin des opérations n'affiche jamais une adresse complète.
create or replace function private.mask_email(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or position('@' in value) < 2 then null
    else left(lower(trim(value)), 1) || '***@' || split_part(lower(trim(value)), '@', 2)
  end;
$$;

revoke all on function private.mask_email(text) from public, anon, authenticated;
revoke all on function private.is_deliverable_email(text) from public, anon, authenticated;
revoke all on function private.email_fingerprint(text) from public, anon, authenticated;

-- Liste de suppression (rebond/plainte/suppression fournisseur) : empreinte
-- uniquement, jamais l'adresse en clair.
create table private.email_suppressions (
  email_fingerprint text primary key check (email_fingerprint ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('bounced', 'complained', 'suppressed')),
  created_at timestamptz not null default now()
);

-- Idempotence ET historique des webhooks fournisseur : type, file associée
-- et effet produit — jamais l'adresse, le sujet ni le contenu.
create table private.email_provider_events (
  event_id text primary key check (char_length(event_id) between 3 and 200),
  event_type text not null check (char_length(event_type) between 3 and 80),
  matched_queue text check (matched_queue is null or matched_queue in ('rent', 'saas')),
  outcome text not null check (outcome in (
    'status_updated', 'information_recorded', 'review_resolved', 'no_matching_delivery', 'transition_refused',
    'generation_mismatch'
  )),
  received_at timestamptz not null default now()
);

create index email_provider_events_received_idx on private.email_provider_events (received_at desc);

-- Journal des exécutions (quotidien, réconciliation, relance) : compteurs
-- uniquement, jamais de contenu de message ni d'adresse.
create table private.platform_operation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in (
    'communications_daily', 'due_notice_reconciliation', 'retry_failed_deliveries', 'delivery_review'
  )),
  trigger_source text not null check (trigger_source in ('cron', 'admin')),
  dry_run boolean not null,
  actor_user_id uuid references auth.users (id),
  run_on date not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index platform_operation_runs_started_idx
  on private.platform_operation_runs (started_at desc);

-- Unicité de l'identifiant fournisseur, TOUTES FILES CONFONDUES (v4).
-- Mécanisme COMMUN à tous les chemins qui affectent un provider_message_id
-- (complete_message_delivery, complete_billing_email_delivery,
-- admin_resolve_delivery_review/confirm_sent, apply_provider_event_to_queue) :
--   1. verrou transactionnel déterministe dérivé de l'identifiant
--      (pg_catalog.pg_advisory_xact_lock + pg_catalog.hashtextextended),
--      qui sérialise toute affectation concurrente du MÊME identifiant ;
--   2. vérification des DEUX tables sous ce verrou (READ COMMITTED : la
--      requête suivant l'acquisition voit ce que l'autre transaction a validé) ;
--   3. seule la ligne cible est exclue ;
--   4. faux si l'identifiant appartient déjà à une autre ligne.
-- Aucun index inter-tables n'existant en PostgreSQL, c'est ce verrou — et non
-- un simple EXISTS — qui garantit l'unicité en concurrence. Le verrou est
-- libéré à la fin de la transaction appelante.
create or replace function private.reserve_provider_message_id(
  p_provider_message_id text,
  p_queue text,
  p_delivery_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_provider_message_id is null or pg_catalog.char_length(p_provider_message_id) not between 1 and 200
     or p_queue is null or p_queue not in ('rent', 'saas') or p_delivery_id is null then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.concat('kjora.provider_message_id:', p_provider_message_id), 0::bigint)
  );
  return not exists (
      select 1 from public.message_deliveries md
       where md.provider_message_id = p_provider_message_id
         and not (p_queue = 'rent' and md.id = p_delivery_id)
    )
    and not exists (
      select 1 from public.billing_email_deliveries bd
       where bd.provider_message_id = p_provider_message_id
         and not (p_queue = 'saas' and bd.id = p_delivery_id)
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Notifications — lecture enrichie, ouverture = lecture + destination fermée
-- -----------------------------------------------------------------------------
-- list_my_notifications : mêmes gardes que la policy RLS (destinataire +
-- capacité requise, donc aucune notification pour une Organization non
-- active), enrichie du nom du locataire, du bien et du logement pour
-- distinguer des alertes répétées — jamais une adresse électronique, jamais
-- le payload brut au-delà des champs d'affichage déjà présents.

create or replace function public.list_my_notifications(
  target_organization_id uuid,
  result_limit integer default 100
)
returns table (
  id uuid,
  notification_type text,
  title_code text,
  payload jsonb,
  document_id uuid,
  tenant_id uuid,
  lease_id uuid,
  tenant_name text,
  property_name text,
  unit_label text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.notification_type, n.title_code,
         n.payload - 'tenant_email' - 'recipient_email' - 'email',
         n.document_id, n.tenant_id, n.lease_id,
         t.full_name::text, p.name::text, u.label::text,
         n.read_at, n.created_at
    from public.notifications n
    left join public.tenants t on t.organization_id = n.organization_id and t.id = n.tenant_id
    left join public.leases l on l.organization_id = n.organization_id and l.id = n.lease_id
    left join public.properties p on p.organization_id = l.organization_id and p.id = l.property_id
    left join public.units u on u.organization_id = l.organization_id and u.id = l.unit_id
   where n.organization_id = target_organization_id
     and n.recipient_user_id = (select auth.uid())
     and (select private.has_capability(n.organization_id, n.required_capability))
   order by n.created_at desc, n.id desc
   limit greatest(1, least(coalesce(result_limit, 100), 200));
$$;

-- Destination d'une notification : UNIQUEMENT des identifiants re-vérifiés
-- en base, par type fermé. Ne lève jamais d'erreur pour une notification
-- absente/étrangère : found=false, pour ne rien révéler de son existence.
create or replace function private.notification_destination(target_notification_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n public.notifications%rowtype;
  doc public.financial_documents%rowtype;
  doc_capability text;
  document_available boolean := false;
  tenant_available boolean := false;
  lease_available boolean := false;
begin
  if (select auth.uid()) is null or target_notification_id is null then
    return jsonb_build_object('found', false);
  end if;

  select * into n from public.notifications
   where id = target_notification_id and recipient_user_id = (select auth.uid());
  if n.id is null or not (select private.has_capability(n.organization_id, n.required_capability)) then
    return jsonb_build_object('found', false);
  end if;

  if n.document_id is not null then
    select * into doc from public.financial_documents
     where organization_id = n.organization_id and id = n.document_id;
    doc_capability := case when doc.document_type in ('payment_receipt', 'rent_receipt')
      then 'receipt.view' else 'due.view' end;
    document_available := doc.id is not null and doc.status <> 'invalidated'
      and (select private.has_capability(n.organization_id, doc_capability));
  end if;

  if n.tenant_id is not null then
    tenant_available := exists (
      select 1 from public.tenants t where t.organization_id = n.organization_id and t.id = n.tenant_id
    ) and (select private.has_capability(n.organization_id, 'tenant.view'))
      and (select private.has_capability(n.organization_id, 'due.view'));
  end if;

  if n.lease_id is not null then
    lease_available := exists (
      select 1 from public.leases l where l.organization_id = n.organization_id and l.id = n.lease_id
    ) and (select private.has_capability(n.organization_id, 'lease.view'));
  end if;

  return jsonb_build_object(
    'found', true,
    'organization_id', n.organization_id,
    'notification_type', n.notification_type,
    'document_id', case when document_available then n.document_id end,
    'tenant_id', case when tenant_available then n.tenant_id end,
    'lease_id', case when lease_available then n.lease_id end,
    'can_view_payments', (select private.has_capability(n.organization_id, 'payment.view')),
    'can_view_contracts', (select private.has_capability(n.organization_id, 'contract.manage'))
  );
end;
$$;

revoke all on function private.notification_destination(uuid) from public, anon, authenticated;

-- open_notification : marque lue (idempotent) puis renvoie la destination.
-- Appelée seulement pour une navigation de confiance (Sec-Fetch-Site :
-- same-origin ou none).
create or replace function public.open_notification(target_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare destination jsonb;
begin
  destination := private.notification_destination(target_notification_id);
  if (destination ->> 'found')::boolean then
    update public.notifications set read_at = coalesce(read_at, now())
     where id = target_notification_id and recipient_user_id = (select auth.uid());
  end if;
  return destination;
end;
$$;

-- peek_notification : même destination, AUCUNE écriture. Utilisée quand la
-- navigation ne peut pas être authentifiée (en-tête Sec-Fetch-Site absent) :
-- fail-closed pour l'écriture, la lecture reste gardée par la capacité.
create or replace function public.peek_notification(target_notification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.notification_destination(target_notification_id);
$$;

-- Marquer lue devient strictement idempotent : une notification déjà lue
-- conserve sa date de première lecture (même signature, mêmes droits).
create or replace function public.set_notification_read_state(
  target_notification_id uuid,
  target_is_read boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare selected_notification public.notifications%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into selected_notification
  from public.notifications n
  where n.id = target_notification_id
    and n.recipient_user_id = (select auth.uid());
  if selected_notification.id is null
    or not (select private.has_capability(selected_notification.organization_id, selected_notification.required_capability)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = case when coalesce(target_is_read, false) then coalesce(read_at, now()) else null end
  where id = selected_notification.id;
  return selected_notification.id;
end;
$$;

revoke all on function public.list_my_notifications(uuid, integer) from public, anon;
revoke all on function public.open_notification(uuid) from public, anon;
revoke all on function public.peek_notification(uuid) from public, anon;
grant execute on function public.peek_notification(uuid) to authenticated;
grant execute on function public.list_my_notifications(uuid, integer) to authenticated;
grant execute on function public.open_notification(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Avis d'échéance — rattrapage borné et réconciliation contrôlée
-- -----------------------------------------------------------------------------
-- Règles :
--   • quotidien : notice_date <= run_on, dans une fenêtre de 7 jours (jours de
--     cron manqués) OU pour une échéance créée depuis la veille (bail créé
--     avec des avis déjà passés) ;
--   • seulement si AUCUN due_notice n'existe pour l'échéance (source_key
--     inchangé : 'due_notice:<due_id>', contrainte unique existante) ;
--   • jamais pour une échéance annulée, d'ajustement ou soldée, ni pour une
--     Organization non active ;
--   • courriel automatique UNIQUEMENT pour un avis à l'heure
--     (notice_date = run_on). Un avis tardif crée le document et la
--     notification, jamais un courriel : l'envoi reste une action explicite.
--   • l'historique plus ancien relève de private.reconcile_due_notices
--     (Admin, dry-run par défaut, par lots, jamais de courriel).

create or replace function private.create_due_notice_document(
  target_due_id uuid,
  run_on date,
  allow_email boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  selected_language text;
  new_document_id uuid;
begin
  select d.*, ds.remaining_amount_xaf
    into item
    from public.dues d
    join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
    join public.organizations o on o.id = d.organization_id
   where d.id = target_due_id and d.cancelled_at is null and d.kind <> 'adjustment'
     and ds.remaining_amount_xaf > 0 and o.status = 'active';
  if item.id is null then return null; end if;

  select coalesce(t.preferred_language, op.language) into selected_language
    from public.tenants t join public.organization_profiles op on op.organization_id = t.organization_id
   where t.organization_id = item.organization_id and t.id = item.tenant_id;

  insert into public.financial_documents (
    organization_id, tenant_id, lease_id, due_id, document_type, source_key, reference,
    language, issued_on, period_start, period_end, snapshot, created_by
  ) values (
    item.organization_id, item.tenant_id, item.lease_id, item.id, 'due_notice',
    'due_notice:' || item.id::text, 'AVI-' || item.reference, selected_language,
    run_on, item.period_start, item.period_end,
    private.document_snapshot_for_due(item.id)
      || jsonb_build_object('issued_late', item.notice_date < run_on),
    item.created_by
  ) on conflict (organization_id, source_key) do nothing
  returning id into new_document_id;

  if new_document_id is not null then
    perform private.notify_authorized_members(
      item.organization_id, 'due.view', 'due_notice_ready', 'due_notice_ready:' || item.id::text,
      'due_notice_ready', jsonb_build_object('due_reference', item.reference, 'due_date', item.due_date,
        'remaining_xaf', item.remaining_amount_xaf), new_document_id, item.tenant_id, item.lease_id
    );
    if allow_email then
      perform private.queue_automatic_delivery(new_document_id);
    end if;
  end if;
  return new_document_id;
end;
$$;

revoke all on function private.create_due_notice_document(uuid, date, boolean) from public, anon, authenticated;

create or replace function private.prepare_financial_communications(run_on date default current_date)
returns table (
  due_notices integer,
  overdue_notifications integer,
  prepaid_notifications integer,
  low_credit_notifications integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  notices integer := 0;
  reminders integer := 0;
  prepaid_alerts integer := 0;
  low_credit_alerts integer := 0;
begin
  for item in
    select d.id, d.notice_date
      from public.dues d
      join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
      join public.organizations o on o.id = d.organization_id
     where d.notice_date <= run_on
       and (d.notice_date >= run_on - 7 or d.created_at >= run_on::timestamptz - interval '1 day')
       and d.cancelled_at is null and d.kind <> 'adjustment' and ds.remaining_amount_xaf > 0
       and o.status = 'active'
       and not exists (
         select 1 from public.financial_documents fd
          where fd.organization_id = d.organization_id and fd.due_id = d.id and fd.document_type = 'due_notice'
       )
     order by d.notice_date, d.id
  loop
    if private.create_due_notice_document(item.id, run_on, item.notice_date = run_on) is not null then
      notices := notices + 1;
    end if;
  end loop;

  for item in
    select ds.id, ds.organization_id, ds.tenant_id, ds.lease_id, ds.reference,
      ds.due_date, ds.remaining_amount_xaf, d.created_by
    from public.dues_with_status ds
    join public.dues d on d.organization_id = ds.organization_id and d.id = ds.id
    join public.organizations o on o.id = ds.organization_id
    where ds.next_reminder_date = run_on and ds.remaining_amount_xaf > 0 and ds.derived_status = 'overdue'
      and o.status = 'active'
  loop
    perform private.notify_authorized_members(
      item.organization_id, 'due.view', 'payment_overdue',
      'payment_overdue:' || item.id::text || ':' || run_on::text, 'payment_overdue',
      jsonb_build_object('due_reference', item.reference, 'due_date', item.due_date,
        'remaining_xaf', item.remaining_amount_xaf, 'reminder_date', run_on),
      null, item.tenant_id, item.lease_id
    );
    insert into public.message_deliveries (
      organization_id, document_id, tenant_id, recipient_email, language, template_key,
      idempotency_key, trigger_type, next_attempt_at
    )
    select item.organization_id, d.id, item.tenant_id, lower(trim(t.email)),
      coalesce(t.preferred_language, op.language), 'overdue_reminder',
      'automatic:overdue:' || item.id::text || ':' || run_on::text,
      'automatic', now()
    from public.financial_documents d
    join public.tenants t on t.organization_id = item.organization_id and t.id = item.tenant_id
    join public.organization_profiles op on op.organization_id = item.organization_id
    join public.organization_communication_settings s on s.organization_id = item.organization_id
    where d.organization_id = item.organization_id and d.due_id = item.id
      and d.document_type = 'due_notice' and d.status <> 'invalidated'
      and private.is_deliverable_email(lower(trim(t.email))) and s.overdue_reminder_email_enabled
    on conflict (organization_id, idempotency_key) do nothing;
    reminders := reminders + 1;
  end loop;

  for item in
    select d.id, d.organization_id, d.tenant_id, d.lease_id, d.reference,
      d.period_start, d.due_date,
      d.expected_amount_xaf, ds.remaining_amount_xaf,
      (ds.covered_by_opening_credit_xaf + ds.covered_by_payment_credit_xaf)::bigint as credit_applied_xaf,
      (
        select count(*)::integer from public.dues_with_status previous_due
        where previous_due.organization_id = d.organization_id
          and previous_due.lease_id = d.lease_id
          and previous_due.kind in ('periodic', 'initial_prorata')
          and previous_due.remaining_amount_xaf = 0
          and previous_due.covered_by_opening_credit_xaf + previous_due.covered_by_payment_credit_xaf > 0
      ) as prepaid_covered_periods,
      (
        select max(previous_due.period_end) from public.dues_with_status previous_due
        where previous_due.organization_id = d.organization_id
          and previous_due.lease_id = d.lease_id
          and previous_due.kind in ('periodic', 'initial_prorata')
          and previous_due.remaining_amount_xaf = 0
          and previous_due.covered_by_opening_credit_xaf + previous_due.covered_by_payment_credit_xaf > 0
      ) as last_prepaid_period_end,
      fp.next_uncovered_due_date
    from public.dues d
    join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
    join public.tenant_financial_positions fp on fp.organization_id = d.organization_id and fp.tenant_id = d.tenant_id
    join public.organizations o on o.id = d.organization_id
    where d.notice_date = run_on
      and d.cancelled_at is null
      and d.kind in ('periodic', 'initial_prorata')
      and ds.remaining_amount_xaf > 0
      and o.status = 'active'
  loop
    if item.prepaid_covered_periods > 0 and item.last_prepaid_period_end is not null
      and item.period_start = item.last_prepaid_period_end + 1
      and item.next_uncovered_due_date = item.due_date then
      perform private.notify_authorized_members(
        item.organization_id, 'due.view', 'last_prepaid_period',
        'last_prepaid_period:' || item.lease_id::text || ':' || item.last_prepaid_period_end::text
          || ':' || item.due_date::text,
        'last_prepaid_period',
        jsonb_build_object(
          'due_reference', item.reference,
          'covered_periods', item.prepaid_covered_periods,
          'last_covered_period_end', item.last_prepaid_period_end,
          'next_uncovered_due_date', item.due_date,
          'remaining_xaf', item.remaining_amount_xaf
        ),
        null, item.tenant_id, item.lease_id
      );
      prepaid_alerts := prepaid_alerts + 1;
    end if;

    if item.credit_applied_xaf > 0 and item.remaining_amount_xaf > 0 then
      perform private.notify_authorized_members(
        item.organization_id, 'due.view', 'low_credit',
        'low_credit:' || item.id::text || ':' || run_on::text,
        'low_credit',
        jsonb_build_object(
          'due_reference', item.reference,
          'credit_applied_xaf', item.credit_applied_xaf,
          'next_due_amount_xaf', item.expected_amount_xaf,
          'expected_remainder_xaf', item.remaining_amount_xaf,
          'next_uncovered_due_date', item.due_date
        ),
        null, item.tenant_id, item.lease_id
      );
      low_credit_alerts := low_credit_alerts + 1;
    end if;
  end loop;

  return query select notices, reminders, prepaid_alerts, low_credit_alerts;
end;
$$;

-- Réconciliation historique : bornée (1..500 par lot), dry-run par défaut,
-- jamais de courriel, jamais de suppression, jamais de réémission.
create or replace function private.reconcile_due_notices(
  run_on date default current_date,
  batch_limit integer default 50,
  dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  candidate_total integer := 0;
  created_total integer := 0;
  ignored_total integer := 0;
  error_total integer := 0;
  created_id uuid;
begin
  if batch_limit is null or batch_limit not between 1 and 500 then
    raise exception 'invalid_batch_limit' using errcode = '22023';
  end if;

  for item in
    select d.id
      from public.dues d
      join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
      join public.organizations o on o.id = d.organization_id
     where d.notice_date <= run_on
       and d.cancelled_at is null and d.kind <> 'adjustment' and ds.remaining_amount_xaf > 0
       and o.status = 'active'
       and not exists (
         select 1 from public.financial_documents fd
          where fd.organization_id = d.organization_id and fd.due_id = d.id and fd.document_type = 'due_notice'
       )
     order by d.notice_date, d.id
     limit batch_limit
  loop
    candidate_total := candidate_total + 1;
    if not dry_run then
      begin
        created_id := private.create_due_notice_document(item.id, run_on, false);
        if created_id is null then ignored_total := ignored_total + 1;
        else created_total := created_total + 1; end if;
      exception when others then
        error_total := error_total + 1;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'dry_run', dry_run, 'run_on', run_on, 'batch_limit', batch_limit,
    'candidates', candidate_total, 'created', created_total,
    'ignored', ignored_total, 'errors', error_total,
    'emails_queued', 0
  );
end;
$$;

revoke all on function private.prepare_financial_communications(date) from public, anon, authenticated;
revoke all on function private.reconcile_due_notices(date, integer, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Paramètres de communication propriétaire
-- -----------------------------------------------------------------------------

alter table public.organization_communication_settings
  add column if not exists owner_copy_enabled boolean not null default false,
  add column if not exists configured_at timestamptz;

comment on table public.organization_communication_settings is
  'Réglages de courriels TRANSACTIONNELS par Organization (avis, rappels, reçus, quittances, copie propriétaire). Jamais marketing. Tout est désactivé par défaut ; enregistrement par le seul propriétaire via save_organization_communication_settings.';

alter table public.administrative_audit_log drop constraint administrative_audit_log_action_check;
alter table public.administrative_audit_log add constraint administrative_audit_log_action_check check (action in (
  'member.invited','member.invitation_resent','member.invitation_revoked','member.invitation_accepted',
  'member.role_changed','member.revoked','owner.transferred','payment.reversed','document.invalidated',
  'tenant_portal.invited','tenant_portal.invitation_resent','tenant_portal.invitation_accepted',
  'tenant_portal.revoked','tenant_portal.reactivated','contract.generated','contract.validated',
  'contract.owner_signed','contract.sent','contract.tenant_viewed','contract.tenant_signed',
  'contract.finalized','contract.cancelled',
  'organization.suspended','organization.reactivated','organization.archived','organization.restored',
  'member.disabled_by_admin','member.reactivated_by_admin','owner.transferred_by_admin','admin.note_added',
  'contact.updated','contact.marketing_consent_changed',
  -- NOTIFICATIONS-COMMUNICATIONS-E2E-01
  'communication.settings_updated', 'communication.delivery_review_resolved'
));

create or replace function public.get_organization_communication_settings(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.organization_communication_settings%rowtype;
  owner_email text;
begin
  if (select auth.uid()) is null
    or not (select private.is_organization_owner(target_organization_id))
    or not exists (select 1 from public.organizations where id = target_organization_id and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from public.organization_communication_settings where organization_id = target_organization_id;
  select u.email::text into owner_email from auth.users u where u.id = (select auth.uid());
  return jsonb_build_object(
    'configured', s.organization_id is not null and s.configured_at is not null,
    'dueNoticeEmailEnabled', coalesce(s.due_notice_email_enabled, false),
    'overdueReminderEmailEnabled', coalesce(s.overdue_reminder_email_enabled, false),
    'paymentReceiptEmailEnabled', coalesce(s.payment_receipt_email_enabled, false),
    'rentReceiptEmailEnabled', coalesce(s.rent_receipt_email_enabled, false),
    'ownerCopyEnabled', coalesce(s.owner_copy_enabled, false),
    'ownerEmailDeliverable', private.is_deliverable_email(lower(trim(coalesce(owner_email, '')))),
    'updatedAt', s.updated_at,
    'tenantsWithoutEmail', (
      select count(*) from public.tenants t
       where t.organization_id = target_organization_id
         and not private.is_deliverable_email(lower(trim(coalesce(t.email, ''))))
    )
  );
end;
$$;

create or replace function public.save_organization_communication_settings(
  target_organization_id uuid,
  p_due_notice boolean,
  p_overdue_reminder boolean,
  p_payment_receipt boolean,
  p_rent_receipt boolean,
  p_owner_copy boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select private.is_organization_owner(target_organization_id))
    or not exists (select 1 from public.organizations where id = target_organization_id and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_due_notice is null or p_overdue_reminder is null or p_payment_receipt is null
    or p_rent_receipt is null or p_owner_copy is null then
    return jsonb_build_object('outcome', 'invalid_settings');
  end if;

  insert into public.organization_communication_settings (
    organization_id, due_notice_email_enabled, overdue_reminder_email_enabled,
    payment_receipt_email_enabled, rent_receipt_email_enabled, owner_copy_enabled,
    updated_by, updated_at, configured_at
  ) values (
    target_organization_id, p_due_notice, p_overdue_reminder, p_payment_receipt, p_rent_receipt,
    p_owner_copy, (select auth.uid()), now(), now()
  )
  on conflict (organization_id) do update set
    due_notice_email_enabled = excluded.due_notice_email_enabled,
    overdue_reminder_email_enabled = excluded.overdue_reminder_email_enabled,
    payment_receipt_email_enabled = excluded.payment_receipt_email_enabled,
    rent_receipt_email_enabled = excluded.rent_receipt_email_enabled,
    owner_copy_enabled = excluded.owner_copy_enabled,
    updated_by = excluded.updated_by,
    updated_at = now(),
    configured_at = coalesce(public.organization_communication_settings.configured_at, now());

  perform private.write_administrative_audit(
    target_organization_id, 'communication.settings_updated', null, null, null,
    jsonb_build_object('dueNotice', p_due_notice, 'overdueReminder', p_overdue_reminder,
      'paymentReceipt', p_payment_receipt, 'rentReceipt', p_rent_receipt, 'ownerCopy', p_owner_copy)
  );
  return jsonb_build_object('outcome', 'saved');
end;
$$;

revoke all on function public.get_organization_communication_settings(uuid) from public, anon;
revoke all on function public.save_organization_communication_settings(uuid, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_organization_communication_settings(uuid) to authenticated;
grant execute on function public.save_organization_communication_settings(uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- File automatique : Organization active, destinataire valide et non
-- supprimé, réglage activé ; copie propriétaire facultative.
create or replace function private.queue_automatic_delivery(target_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_document public.financial_documents%rowtype;
  settings public.organization_communication_settings%rowtype;
  recipient text;
  owner_recipient text;
  enabled boolean := false;
begin
  select * into selected_document from public.financial_documents where id = target_document_id;
  if selected_document.id is null or selected_document.status = 'invalidated' then return; end if;
  if not exists (select 1 from public.organizations where id = selected_document.organization_id and status = 'active') then
    return;
  end if;

  select * into settings from public.organization_communication_settings
   where organization_id = selected_document.organization_id;
  enabled := case selected_document.document_type
    when 'due_notice' then coalesce(settings.due_notice_email_enabled, false)
    when 'payment_receipt' then coalesce(settings.payment_receipt_email_enabled, false)
    when 'rent_receipt' then coalesce(settings.rent_receipt_email_enabled, false)
    else false end;
  if not enabled then return; end if;

  select lower(trim(t.email)) into recipient
    from public.tenants t
   where t.organization_id = selected_document.organization_id and t.id = selected_document.tenant_id;

  if private.is_deliverable_email(recipient) then
    insert into public.message_deliveries (
      organization_id, document_id, tenant_id, recipient_email, language,
      template_key, idempotency_key, trigger_type, next_attempt_at
    ) values (
      selected_document.organization_id, selected_document.id, selected_document.tenant_id,
      recipient, selected_document.language, selected_document.document_type,
      'automatic:' || selected_document.id::text || ':' || recipient,
      'automatic', now()
    ) on conflict (organization_id, idempotency_key) do nothing;
  end if;

  if coalesce(settings.owner_copy_enabled, false) then
    select lower(trim(u.email)) into owner_recipient
      from public.memberships m join auth.users u on u.id = m.user_id
     where m.organization_id = selected_document.organization_id
       and m.role = 'organization_owner' and m.status = 'active'
     order by m.created_at limit 1;
    if private.is_deliverable_email(owner_recipient) and owner_recipient is distinct from recipient then
      insert into public.message_deliveries (
        organization_id, document_id, tenant_id, recipient_email, language,
        template_key, idempotency_key, trigger_type, next_attempt_at
      ) values (
        selected_document.organization_id, selected_document.id, selected_document.tenant_id,
        owner_recipient, selected_document.language, selected_document.document_type,
        'automatic-owner-copy:' || selected_document.id::text,
        'automatic', now()
      ) on conflict (organization_id, idempotency_key) do nothing;
    end if;
  end if;
end;
$$;

revoke all on function private.queue_automatic_delivery(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. File de courriels locatifs — réservation, résultats ambigus, revue Admin
-- -----------------------------------------------------------------------------
-- GARANTIE RÉELLE (et seulement celle-ci) : AU PLUS UNE tentative
-- d'expédition AUTOMATIQUE susceptible d'avoir été acceptée par le fournisseur,
-- par ligne et par génération. Ce n'est PAS du « exactly-once » : un résultat
-- ambigu (délai dépassé, réponse 5xx, crash entre l'acceptation fournisseur et
-- l'écriture en base) bloque la ligne en 'delivery_unknown' ; seule une
-- décision Admin explicite et auditée peut la ré-expédier, en assumant le
-- risque de doublon. L'Idempotency-Key Resend (24 h) n'est qu'une protection
-- supplémentaire, jamais la garantie : avec un cron quotidien, une reprise
-- peut survenir après son expiration.
--
-- États :
--   pending → processing (réservée) → [send_started_at posé JUSTE AVANT
--   l'appel fournisseur] → sent → delivered (webhook)
--   failed          : refus CERTAIN du fournisseur (429) ou échec avant tout
--                     appel (rendu) ; relançable tant que attempt_count < 3,
--                     au prochain passage quotidien ou déclenchement Admin
--                     (le backoff 5/30/120 min n'est qu'un délai MINIMAL) ;
--                     attempt_count = 3 → définitif.
--   delivery_unknown: résultat ambigu ; terminal pour l'automatisme.
--   provider_failed : webhook email.failed ; terminal, jamais « livré ».
--   bounced / complained / suppressed : webhook ; terminaux ; liste de suppression.
--   cancelled       : annulée (document invalidé, abandon Admin…).

alter table public.message_deliveries
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists last_claim_token uuid,
  add column if not exists send_started_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists provider_event_at timestamptz,
  add column if not exists provider_delayed_at timestamptz,
  add column if not exists resend_generation smallint not null default 0 check (resend_generation between 0 and 20),
  add column if not exists review_reason text check (review_reason is null or review_reason in (
    'ambiguous_provider_response', 'worker_lease_expired', 'finalization_failed'
  )),
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists reviewed_at timestamptz;

alter table public.message_deliveries drop constraint message_deliveries_status_check;
alter table public.message_deliveries add constraint message_deliveries_status_check check (status in (
  'pending', 'processing', 'sent', 'delivered', 'failed', 'delivery_unknown', 'provider_failed',
  'bounced', 'complained', 'suppressed', 'cancelled'
));

alter table public.message_deliveries drop constraint message_deliveries_sent_state;
alter table public.message_deliveries add constraint message_deliveries_sent_state check (
  (status in ('sent', 'delivered', 'bounced', 'complained', 'suppressed', 'provider_failed')
    and sent_at is not null and provider = 'resend' and provider_message_id is not null)
  or (status not in ('sent', 'delivered', 'bounced', 'complained', 'suppressed', 'provider_failed') and sent_at is null)
);

-- Lignes 'processing' laissées par l'ancien worker (crash sans réservation) :
-- l'ancien worker appelait le fournisseur sans rien noter avant ; leur issue
-- est donc INCONNUE. Elles passent en revue Admin, jamais en ré-expédition
-- automatique — aucune donnée supprimée.
update public.message_deliveries
   set status = 'delivery_unknown', review_reason = 'worker_lease_expired',
       last_error_code = 'legacy_processing_unknown', next_attempt_at = null
 where status = 'processing';

alter table public.message_deliveries add constraint message_deliveries_claim_state check (
  (status = 'processing') = (claim_token is not null and claimed_at is not null)
);
alter table public.message_deliveries add constraint message_deliveries_send_state check (
  send_started_at is null or status = 'processing'
);
alter table public.message_deliveries add constraint message_deliveries_review_state check (
  status <> 'delivery_unknown' or review_reason is not null
);

create index if not exists message_deliveries_provider_message_idx
  on public.message_deliveries (provider_message_id) where provider_message_id is not null;
create index if not exists message_deliveries_review_idx
  on public.message_deliveries (updated_at) where status = 'delivery_unknown';

-- Délai MINIMAL avant une nouvelle tentative relançable. Sur un cron
-- quotidien, la tentative a lieu au prochain passage quotidien ou lors d'un
-- déclenchement Admin — jamais « dans 5 minutes » automatiquement.
create or replace function private.retry_delay(attempt integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case greatest(1, least(coalesce(attempt, 1), 3))
    when 1 then interval '5 minutes'
    when 2 then interval '30 minutes'
    else interval '120 minutes' end;
$$;

revoke all on function private.retry_delay(integer) from public, anon, authenticated;
revoke all on function private.reserve_provider_message_id(text, text, uuid) from public, anon, authenticated;

-- Baux expirés : une ligne réservée dont l'expédition a COMMENCÉ passe en
-- revue (issue inconnue) ; une ligne réservée qui n'a jamais atteint le
-- fournisseur redevient réservable (aucun risque de doublon).
create or replace function private.expire_message_delivery_leases(p_lease_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare exhausted_id uuid;
begin
  update public.message_deliveries md
     set status = 'delivery_unknown', review_reason = 'worker_lease_expired',
         last_error_code = 'worker_lease_expired', last_error_message = null,
         claim_token = null, claimed_at = null, send_started_at = null, next_attempt_at = null,
         updated_at = now()
   where md.status = 'processing' and md.send_started_at is not null
     and md.claimed_at < now() - make_interval(secs => p_lease_seconds);

  for exhausted_id in
    update public.message_deliveries md
       set status = 'failed', claim_token = null, claimed_at = null,
           next_attempt_at = case when md.attempt_count >= 3 then null else now() end,
           last_error_code = case when md.attempt_count >= 3 then 'delivery_exhausted' else 'delivery_retryable' end,
           last_error_message = 'worker_lease_expired_before_send', updated_at = now()
     where md.status = 'processing' and md.send_started_at is null
       and md.claimed_at < now() - make_interval(secs => p_lease_seconds)
    returning case when md.attempt_count >= 3 then md.id end
  loop
    if exhausted_id is not null then
      perform public.record_financial_delivery_failure_system(exhausted_id);
    end if;
  end loop;
end;
$$;

revoke all on function private.expire_message_delivery_leases(integer) from public, anon, authenticated;

-- Réservation atomique d'un petit lot (1..25), `for update skip locked` :
-- deux workers concurrents ne réservent jamais la même ligne. Seules les
-- lignes 'pending' et 'failed' (refus certain ou échec avant envoi) sont
-- candidates ; jamais 'processing', jamais 'delivery_unknown'.
create or replace function public.claim_message_deliveries(
  p_batch integer default 5,
  p_lease_seconds integer default 900
)
returns table (
  id uuid,
  organization_id uuid,
  document_id uuid,
  recipient_email text,
  language text,
  template_key text,
  attempt_count smallint,
  claim_token uuid,
  is_owner_copy boolean,
  resend_generation smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch is null or p_batch not between 1 and 25 then
    raise exception 'invalid_batch' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'invalid_lease' using errcode = '22023';
  end if;

  perform private.expire_message_delivery_leases(p_lease_seconds);

  update public.message_deliveries md
     set status = 'cancelled', last_error_code = 'recipient_suppressed',
         last_error_message = null, next_attempt_at = null, updated_at = now()
   where md.status in ('pending', 'failed')
     and exists (select 1 from private.email_suppressions s
                  where s.email_fingerprint = private.email_fingerprint(md.recipient_email));

  return query
  -- last_claim_token mémorise le jeton de cette réservation : une
  -- finalisation tardive (bail expiré pendant l'appel fournisseur) reste
  -- possible, avec l'identifiant fournisseur pour preuve.
  with candidates as (
    select md.id, gen_random_uuid() as token
      from public.message_deliveries md
      join public.organizations o on o.id = md.organization_id
     where o.status = 'active'
       and md.attempt_count < 3
       and md.status in ('pending', 'failed')
       and coalesce(md.next_attempt_at, md.created_at) <= now()
     order by md.created_at, md.id
     limit p_batch
     for update of md skip locked
  )
  update public.message_deliveries md
     set status = 'processing', attempt_count = md.attempt_count + 1,
         claimed_at = now(), claim_token = c.token, last_claim_token = c.token,
         send_started_at = null, updated_at = now()
    from candidates c
   where md.id = c.id
  returning md.id, md.organization_id, md.document_id, md.recipient_email, md.language,
            md.template_key, md.attempt_count, md.claim_token,
            (md.idempotency_key like 'automatic-owner-copy:%'), md.resend_generation;
end;
$$;

-- Point de non-retour : appelé JUSTE AVANT l'appel fournisseur. Au-delà,
-- toute issue non confirmée est « inconnue », jamais relancée automatiquement.
create or replace function public.mark_message_delivery_sending(p_delivery_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  update public.message_deliveries
     set send_started_at = now(), updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
     and send_started_at is null
  returning id into changed;
  return changed is not null;
end;
$$;

-- Succès confirmé par le fournisseur (identifiant de message). Accepté aussi
-- pour une ligne passée en revue par expiration de SON bail : l'identifiant
-- fournisseur est la preuve qui lève l'ambiguïté.
create or replace function public.complete_message_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  if p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200 then
    raise exception 'invalid_provider_message_id' using errcode = '22023';
  end if;
  -- Identifiant déjà porté par une autre ligne : aucune affectation ; le
  -- worker placera la ligne en revue (finalization_failed), sans renvoi.
  if not private.reserve_provider_message_id(p_provider_message_id, 'rent', p_delivery_id) then
    return false;
  end if;
  update public.message_deliveries
     set status = 'sent', provider = 'resend', provider_message_id = p_provider_message_id,
         sent_at = now(), next_attempt_at = null, last_error_code = null, last_error_message = null,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = p_delivery_id
     and (
       (status = 'processing' and claim_token = p_claim_token)
       or (status = 'delivery_unknown' and review_reason = 'worker_lease_expired'
           and last_claim_token = p_claim_token and reviewed_at is null)
     )
  returning id into changed;
  return changed is not null;
end;
$$;

-- Refus CERTAIN (ou échec avant tout appel). p_retryable : seulement pour un
-- refus explicite qui n'a pas pu être accepté (429) ou un échec de rendu.
create or replace function public.fail_message_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare d public.message_deliveries%rowtype; exhausted boolean;
begin
  select * into d from public.message_deliveries
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token for update;
  if d.id is null then return false; end if;
  exhausted := d.attempt_count >= 3 or not coalesce(p_retryable, false);
  update public.message_deliveries
     set status = 'failed',
         attempt_count = case when exhausted then 3 else attempt_count end,
         next_attempt_at = case when exhausted then null else now() + private.retry_delay(d.attempt_count) end,
         last_error_code = case when exhausted then 'delivery_exhausted' else 'delivery_retryable' end,
         last_error_message = left(regexp_replace(coalesce(p_error_code, 'delivery_failed'), '[^a-z0-9_:.\-]', '', 'g'), 80),
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = d.id;
  if exhausted then
    perform public.record_financial_delivery_failure_system(d.id);
  end if;
  return true;
end;
$$;

-- Résultat ambigu (délai dépassé, 5xx, réponse sans identifiant, échec de
-- finalisation après acceptation) : revue Admin obligatoire.
create or replace function public.mark_message_delivery_unknown(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  update public.message_deliveries
     set status = 'delivery_unknown',
         review_reason = case when p_error_code = 'finalization_failed' then 'finalization_failed'
                              else 'ambiguous_provider_response' end,
         last_error_code = left(regexp_replace(coalesce(p_error_code, 'ambiguous'), '[^a-z0-9_:.\-]', '', 'g'), 80),
         last_error_message = null, next_attempt_at = null,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
  returning id into changed;
  return changed is not null;
end;
$$;

create or replace function public.cancel_message_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  -- Annulation seulement AVANT tout appel fournisseur.
  update public.message_deliveries
     set status = 'cancelled', next_attempt_at = null,
         last_error_code = left(regexp_replace(coalesce(p_reason, 'cancelled'), '[^a-z0-9_]', '', 'g'), 80),
         last_error_message = null, claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
     and send_started_at is null
  returning id into changed;
  return changed is not null;
end;
$$;

revoke all on function public.claim_message_deliveries(integer, integer) from public, anon, authenticated;
revoke all on function public.mark_message_delivery_sending(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_message_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_message_delivery(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_message_delivery_unknown(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_message_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_message_deliveries(integer, integer) to service_role;
grant execute on function public.mark_message_delivery_sending(uuid, uuid) to service_role;
grant execute on function public.complete_message_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_message_delivery(uuid, uuid, text, boolean) to service_role;
grant execute on function public.mark_message_delivery_unknown(uuid, uuid, text) to service_role;
grant execute on function public.cancel_message_delivery(uuid, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Facturation SaaS Afrique/XAF — génération automatique et file dédiée
-- -----------------------------------------------------------------------------
-- Domaine STRICTEMENT séparé des loyers : aucune clé vers financial_documents,
-- dues, payments ou tenants. La file billing_email_deliveries est lue par le
-- même worker (même transport Resend, mêmes variables) — pas un second
-- système, une seconde file d'un domaine distinct.

alter table public.billing_invoices
  add column if not exists generation_source text not null default 'manual'
    check (generation_source in ('manual', 'automatic'));

-- Une seule facture automatique non annulée par Organization et période.
-- Index limité aux factures automatiques : il ne peut PAS échouer à la
-- migration sur un historique manuel existant (aucune donnée n'est jamais
-- supprimée pour le rendre possible). Entre manuel et automatique,
-- l'unicité par période est garantie par verrou : les deux chemins
-- verrouillent la ligne organizations (FOR UPDATE) avant de vérifier la
-- période, ce qui sérialise toute émission concurrente pour une Organization.
create unique index if not exists billing_invoices_org_period_unique
  on public.billing_invoices (organization_id, period_start, period_end)
  where generation_source = 'automatic' and status in ('draft', 'open', 'paid');

create table public.billing_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  billing_invoice_id uuid not null references public.billing_invoices (id) on delete restrict,
  template_key text not null check (template_key in (
    'saas_invoice_issued', 'saas_invoice_due_soon', 'saas_invoice_overdue', 'saas_receipt'
  )),
  recipient_email text not null check (private.is_deliverable_email(recipient_email)),
  language text not null check (language in ('fr', 'en')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 280),
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'sent', 'delivered', 'failed', 'delivery_unknown', 'provider_failed',
    'bounced', 'complained', 'suppressed', 'cancelled'
  )),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  -- NULL = aucune tentative automatique prévue (état terminal ou en revue).
  next_attempt_at timestamptz default now(),
  claimed_at timestamptz,
  claim_token uuid,
  last_claim_token uuid,
  send_started_at timestamptz,
  resend_generation smallint not null default 0 check (resend_generation between 0 and 20),
  provider text check (provider is null or provider = 'resend'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  held_reason text check (held_reason is null or held_reason in ('legal_identity_missing')),
  review_reason text check (review_reason is null or review_reason in (
    'ambiguous_provider_response', 'worker_lease_expired', 'finalization_failed'
  )),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_event_at timestamptz,
  provider_delayed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint billing_email_deliveries_idempotency unique (organization_id, idempotency_key),
  constraint billing_email_deliveries_sent_state check (
    (status in ('sent', 'delivered', 'bounced', 'complained', 'suppressed', 'provider_failed')
      and sent_at is not null and provider = 'resend' and provider_message_id is not null)
    or (status not in ('sent', 'delivered', 'bounced', 'complained', 'suppressed', 'provider_failed') and sent_at is null)
  ),
  constraint billing_email_deliveries_claim_state check (
    (status = 'processing') = (claim_token is not null and claimed_at is not null)
  ),
  constraint billing_email_deliveries_send_state check (send_started_at is null or status = 'processing'),
  constraint billing_email_deliveries_review_state check (status <> 'delivery_unknown' or review_reason is not null)
);

create index billing_email_deliveries_queue_idx
  on public.billing_email_deliveries (status, next_attempt_at, created_at)
  where status in ('pending', 'failed', 'processing');
create index billing_email_deliveries_review_idx
  on public.billing_email_deliveries (updated_at) where status = 'delivery_unknown';
create index billing_email_deliveries_provider_message_idx
  on public.billing_email_deliveries (provider_message_id) where provider_message_id is not null;

alter table public.billing_email_deliveries enable row level security;
revoke all on public.billing_email_deliveries from public, anon, authenticated;
grant select on public.billing_email_deliveries to service_role;

comment on table public.billing_email_deliveries is
  'NOTIFICATIONS-COMMUNICATIONS-E2E-01 : file des courriels SaaS (facture, rappels, reçu) adressés au propriétaire. Domaine séparé des loyers. Accès exclusif par RPC/service_role ; aucun contenu de message stocké.';

-- Mise en file SaaS : Organization active, facture XAF sans fournisseur,
-- destinataire = propriétaire actif, adresse valide et non supprimée.
create or replace function private.queue_billing_email(target_invoice_id uuid, template text, key_suffix text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.billing_invoices%rowtype;
  owner_recipient text;
  org_language text;
  new_id uuid;
begin
  select * into inv from public.billing_invoices where id = target_invoice_id;
  if inv.id is null or inv.currency <> 'XAF' then return null; end if;
  if not exists (select 1 from public.organizations where id = inv.organization_id and status = 'active') then
    return null;
  end if;
  if exists (select 1 from public.organization_subscriptions s
              where s.organization_id = inv.organization_id and s.provider is not null) then
    return null;
  end if;

  select lower(trim(u.email)) into owner_recipient
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.organization_id = inv.organization_id and m.role = 'organization_owner' and m.status = 'active'
   order by m.created_at limit 1;
  if not private.is_deliverable_email(owner_recipient) then return null; end if;
  if exists (select 1 from private.email_suppressions s
              where s.email_fingerprint = private.email_fingerprint(owner_recipient)) then
    return null;
  end if;

  select coalesce(op.language, 'fr') into org_language
    from public.organization_profiles op where op.organization_id = inv.organization_id;

  insert into public.billing_email_deliveries (
    organization_id, billing_invoice_id, template_key, recipient_email, language, idempotency_key
  ) values (
    inv.organization_id, inv.id, template, owner_recipient, coalesce(org_language, 'fr'),
    template || ':' || inv.id::text || ':' || key_suffix
  ) on conflict (organization_id, idempotency_key) do nothing
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function private.queue_billing_email(uuid, text, text) from public, anon, authenticated;

-- Déclencheurs : facture ouverte émise (manuelle ou automatique) ; passage
-- payé (reçu) ; rappel de facture journalisé (avant échéance / en retard).
create or replace function private.billing_invoice_email_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'open' then
    perform private.queue_billing_email(new.id, 'saas_invoice_issued', 'v1');
  elsif tg_op = 'UPDATE' and old.status <> 'paid' and new.status = 'paid' then
    perform private.queue_billing_email(new.id, 'saas_receipt', 'v1');
  end if;
  return new;
end;
$$;

create trigger billing_invoices_queue_email
after insert or update of status on public.billing_invoices
for each row execute function private.billing_invoice_email_trigger();

create or replace function private.billing_reminder_email_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invoice_id is not null and new.reminder_type in ('invoice_due_soon', 'invoice_overdue') then
    perform private.queue_billing_email(
      new.invoice_id,
      case new.reminder_type when 'invoice_due_soon' then 'saas_invoice_due_soon' else 'saas_invoice_overdue' end,
      new.target_date::text
    );
  end if;
  return new;
end;
$$;

create trigger billing_reminder_log_queue_email
after insert on public.billing_reminder_log
for each row execute function private.billing_reminder_email_trigger();

revoke all on function private.billing_invoice_email_trigger() from public, anon, authenticated;
revoke all on function private.billing_reminder_email_trigger() from public, anon, authenticated;

-- Émission manuelle : même corps que REVENUE-01B + refus explicite d'une
-- seconde facture pour une période déjà facturée (index unique ci-dessus).
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

  if exists (
    select 1 from public.billing_invoices
     where organization_id = target_organization_id and period_start = p_period_start
       and period_end = p_period_end and status in ('draft', 'open', 'paid')
  ) then
    return jsonb_build_object('outcome', 'period_already_invoiced');
  end if;

  select * into sub from public.organization_subscriptions
   where organization_id = target_organization_id for update;
  if sub.organization_id is null then
    insert into public.organization_subscriptions (organization_id)
    values (target_organization_id)
    returning * into sub;
  end if;
  if sub.provider is not null then
    return jsonb_build_object('outcome', 'provider_managed_subscription');
  end if;
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
      period_start, period_end, due_on, status, issued_on, issue_idempotency_key, created_by,
      generation_source
    ) values (
      target_organization_id, invoice_number, p_plan, p_cycle, 'XAF', price,
      p_period_start, p_period_end, effective_due, 'open', current_date, p_idempotency_key, (select auth.uid()),
      'manual'
    )
    returning id into new_id;
  exception when unique_violation then
    select * into existing from public.billing_invoices
     where organization_id = target_organization_id and issue_idempotency_key = p_idempotency_key;
    if existing.id is null then
      return jsonb_build_object('outcome', 'period_already_invoiced');
    end if;
    return jsonb_build_object('outcome', 'already_issued', 'invoiceId', existing.id, 'number', existing.number);
  end;

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

revoke all on function public.admin_issue_manual_invoice(uuid, text, text, date, date, text, date) from public, anon;
grant execute on function public.admin_issue_manual_invoice(uuid, text, text, date, date, text, date) to authenticated;

-- Génération automatique : même règle métier que l'émission manuelle, sans
-- jamais l'emprunter (aucun platform_admin ici). Période calculée depuis
-- renewal_date et le cycle (jamais « dernier jour du mois »). Fenêtre : de 31
-- jours de retard à `lead_days` d'avance. Facture 'open' : aucune activation.
create or replace function private.generate_automatic_saas_invoices(
  run_on date default current_date,
  dry_run boolean default true,
  lead_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  period_end_date date;
  price bigint;
  invoice_number text;
  effective_due date;
  new_id uuid;
  candidate_total integer := 0;
  created_total integer := 0;
  skipped_total integer := 0;
  error_total integer := 0;
begin
  if lead_days is null or lead_days not between 0 and 31 then
    raise exception 'invalid_lead_days' using errcode = '22023';
  end if;

  for item in
    select s.organization_id, s.plan, s.billing_cycle, s.status, s.renewal_date
      from public.organization_subscriptions s
      join public.organizations o on o.id = s.organization_id
     where o.status = 'active'
       and s.currency = 'XAF'
       and s.provider is null
       and s.plan in ('essentiel', 'avance', 'patrimoine')
       and s.status in ('active', 'grace')
       and s.renewal_date is not null
       and s.renewal_date <= run_on + lead_days
       and s.renewal_date >= run_on - 31
     order by s.renewal_date, s.organization_id
  loop
    period_end_date := case item.billing_cycle
      when 'annual' then (item.renewal_date + interval '1 year')::date
      else (item.renewal_date + interval '1 month')::date end;

    -- Sérialise avec admin_issue_manual_invoice (même verrou de ligne).
    if not dry_run then
      perform 1 from public.organizations where id = item.organization_id for update;
    end if;

    if exists (
      select 1 from public.billing_invoices i
       where i.organization_id = item.organization_id and i.period_start = item.renewal_date
         and i.period_end = period_end_date and i.status in ('draft', 'open', 'paid')
    ) then
      skipped_total := skipped_total + 1;
      continue;
    end if;

    select bp.amount_minor into price from public.billing_prices bp
     where bp.plan = item.plan and bp.cycle = item.billing_cycle and bp.currency = 'XAF';
    if price is null or price <= 0 then
      skipped_total := skipped_total + 1;
      continue;
    end if;

    candidate_total := candidate_total + 1;
    if dry_run then continue; end if;

    begin
      effective_due := least(greatest(item.renewal_date, run_on, current_date) + 7, period_end_date);
      if effective_due < current_date then effective_due := current_date; end if;
      invoice_number := 'KJORA-' || to_char(current_date, 'YYYY') || '-'
        || lpad(nextval('public.billing_invoice_sequence')::text, 6, '0');
      insert into public.billing_invoices (
        organization_id, number, plan, billing_cycle, currency, amount_minor,
        period_start, period_end, due_on, status, issued_on, issue_idempotency_key, created_by,
        generation_source
      ) values (
        item.organization_id, invoice_number, item.plan, item.billing_cycle, 'XAF', price,
        item.renewal_date, period_end_date, effective_due, 'open', current_date,
        'auto:' || item.renewal_date::text || ':' || item.billing_cycle, null, 'automatic'
      )
      returning id into new_id;

      insert into public.billing_events (organization_id, event_type, from_status, to_status, payload)
      values (
        item.organization_id, 'invoice_auto_issued', item.status, item.status,
        jsonb_build_object('invoiceId', new_id, 'number', invoice_number, 'plan', item.plan,
          'cycle', item.billing_cycle, 'amountMinor', price, 'currency', 'XAF',
          'periodStart', item.renewal_date, 'periodEnd', period_end_date, 'dueOn', effective_due)
      );
      created_total := created_total + 1;
    exception when unique_violation then
      skipped_total := skipped_total + 1;
    when others then
      error_total := error_total + 1;
    end;
  end loop;

  return jsonb_build_object(
    'dry_run', dry_run, 'run_on', run_on, 'lead_days', lead_days,
    'candidates', candidate_total, 'created', created_total,
    'skipped', skipped_total, 'errors', error_total
  );
end;
$$;

revoke all on function private.generate_automatic_saas_invoices(date, boolean, integer) from public, anon, authenticated;

-- Rappels SaaS : cœur sans garde Admin, appelable par l'orchestrateur
-- (service_role) ; admin_run_billing_reminders garde exactement son contrat.
create or replace function private.run_billing_reminders_core(
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
  for rec in select * from private.compute_due_billing_reminders(p_as_of) loop
    reminder_total := reminder_total + 1;
    counts := jsonb_set(
      counts, array[rec.reminder_type],
      to_jsonb(coalesce((counts ->> rec.reminder_type)::int, 0) + 1)
    );

    if not p_dry_run then
      inserted_id := null;
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

create or replace function public.admin_run_billing_reminders(
  p_as_of date default current_date,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return private.run_billing_reminders_core(p_as_of, p_dry_run);
end;
$$;

revoke all on function private.run_billing_reminders_core(date, boolean) from public, anon, authenticated;
revoke all on function public.admin_run_billing_reminders(date, boolean) from public, anon;
grant execute on function public.admin_run_billing_reminders(date, boolean) to authenticated;

-- File SaaS : mêmes règles que la file locative (voir §4) — au plus une
-- tentative automatique susceptible d'avoir été acceptée ; toute ambiguïté
-- en revue Admin.
create or replace function private.expire_billing_email_leases(p_lease_seconds integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.billing_email_deliveries bd
     set status = 'delivery_unknown', review_reason = 'worker_lease_expired',
         last_error_code = 'worker_lease_expired', next_attempt_at = null,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where bd.status = 'processing' and bd.send_started_at is not null
     and bd.claimed_at < now() - make_interval(secs => p_lease_seconds);
  update public.billing_email_deliveries bd
     set status = 'failed', claim_token = null, claimed_at = null,
         next_attempt_at = case when bd.attempt_count >= 3 then null else now() end,
         last_error_code = case when bd.attempt_count >= 3 then 'delivery_exhausted' else 'delivery_retryable' end,
         updated_at = now()
   where bd.status = 'processing' and bd.send_started_at is null
     and bd.claimed_at < now() - make_interval(secs => p_lease_seconds);
$$;

revoke all on function private.expire_billing_email_leases(integer) from public, anon, authenticated;

create or replace function public.claim_billing_email_deliveries(
  p_batch integer default 5,
  p_lease_seconds integer default 900
)
returns table (
  id uuid,
  organization_id uuid,
  billing_invoice_id uuid,
  recipient_email text,
  language text,
  template_key text,
  attempt_count smallint,
  claim_token uuid,
  resend_generation smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch is null or p_batch not between 1 and 25 then
    raise exception 'invalid_batch' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'invalid_lease' using errcode = '22023';
  end if;

  perform private.expire_billing_email_leases(p_lease_seconds);

  update public.billing_email_deliveries bd
     set status = 'cancelled', last_error_code = 'recipient_suppressed', updated_at = now()
   where bd.status in ('pending', 'failed')
     and exists (select 1 from private.email_suppressions s
                  where s.email_fingerprint = private.email_fingerprint(bd.recipient_email));

  return query
  with candidates as (
    select bd.id, gen_random_uuid() as token
      from public.billing_email_deliveries bd
      join public.organizations o on o.id = bd.organization_id
     where o.status = 'active'
       and bd.attempt_count < 3
       and bd.status in ('pending', 'failed')
       and bd.next_attempt_at <= now()
     order by bd.created_at, bd.id
     limit p_batch
     for update of bd skip locked
  )
  update public.billing_email_deliveries bd
     set status = 'processing', attempt_count = bd.attempt_count + 1,
         claimed_at = now(), claim_token = c.token, last_claim_token = c.token,
         send_started_at = null, updated_at = now()
    from candidates c
   where bd.id = c.id
  returning bd.id, bd.organization_id, bd.billing_invoice_id, bd.recipient_email, bd.language,
            bd.template_key, bd.attempt_count, bd.claim_token, bd.resend_generation;
end;
$$;

create or replace function public.mark_billing_email_sending(p_delivery_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  update public.billing_email_deliveries
     set send_started_at = now(), updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
     and send_started_at is null
  returning id into changed;
  return changed is not null;
end;
$$;

create or replace function public.complete_billing_email_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  if p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200 then
    raise exception 'invalid_provider_message_id' using errcode = '22023';
  end if;
  if not private.reserve_provider_message_id(p_provider_message_id, 'saas', p_delivery_id) then
    return false;
  end if;
  update public.billing_email_deliveries
     set status = 'sent', provider = 'resend', provider_message_id = p_provider_message_id,
         sent_at = now(), last_error_code = null, held_reason = null, next_attempt_at = null,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = p_delivery_id
     and (
       (status = 'processing' and claim_token = p_claim_token)
       or (status = 'delivery_unknown' and review_reason = 'worker_lease_expired'
           and last_claim_token = p_claim_token and reviewed_at is null)
     )
  returning id into changed;
  return changed is not null;
end;
$$;

create or replace function public.fail_billing_email_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare d public.billing_email_deliveries%rowtype; exhausted boolean;
begin
  select * into d from public.billing_email_deliveries
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token for update;
  if d.id is null then return false; end if;
  exhausted := d.attempt_count >= 3 or not coalesce(p_retryable, false);
  update public.billing_email_deliveries
     set status = 'failed',
         attempt_count = case when exhausted then 3 else attempt_count end,
         next_attempt_at = case when exhausted then null else now() + private.retry_delay(d.attempt_count) end,
         last_error_code = case when exhausted then 'delivery_exhausted' else 'delivery_retryable' end,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = d.id;
  return true;
end;
$$;

create or replace function public.mark_billing_email_unknown(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  update public.billing_email_deliveries
     set status = 'delivery_unknown',
         review_reason = case when p_error_code = 'finalization_failed' then 'finalization_failed'
                              else 'ambiguous_provider_response' end,
         last_error_code = left(regexp_replace(coalesce(p_error_code, 'ambiguous'), '[^a-z0-9_:.\-]', '', 'g'), 80),
         next_attempt_at = null,
         claim_token = null, claimed_at = null, send_started_at = null, updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
  returning id into changed;
  return changed is not null;
end;
$$;

-- Mise en attente sans consommer de tentative : identité légale absente
-- (document provisoire, jamais d'envoi automatique final). Réessai au plus
-- tôt le lendemain ; la tentative réservée est restituée. Seulement AVANT
-- tout appel fournisseur.
create or replace function public.hold_billing_email_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  if p_reason is distinct from 'legal_identity_missing' then
    raise exception 'invalid_hold_reason' using errcode = '22023';
  end if;
  update public.billing_email_deliveries
     set status = 'pending', attempt_count = greatest(attempt_count - 1, 0),
         next_attempt_at = now() + interval '1 day', held_reason = p_reason,
         claim_token = null, claimed_at = null, updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
     and send_started_at is null
  returning id into changed;
  return changed is not null;
end;
$$;

create or replace function public.cancel_billing_email_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed uuid;
begin
  update public.billing_email_deliveries
     set status = 'cancelled', next_attempt_at = null,
         last_error_code = left(regexp_replace(coalesce(p_reason, 'cancelled'), '[^a-z0-9_]', '', 'g'), 80),
         claim_token = null, claimed_at = null, updated_at = now()
   where id = p_delivery_id and status = 'processing' and claim_token = p_claim_token
     and send_started_at is null
  returning id into changed;
  return changed is not null;
end;
$$;

-- Données minimales pour rendre la facture/reçu SaaS côté worker : jamais la
-- note interne Admin, jamais un jeton.
create or replace function public.get_billing_invoice_for_delivery(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'organizationId', i.organization_id, 'organizationName', coalesce(p.name, ''),
    'number', i.number, 'plan', i.plan, 'billingCycle', i.billing_cycle, 'currency', i.currency,
    'amountMinor', i.amount_minor, 'periodStart', i.period_start, 'periodEnd', i.period_end,
    'dueOn', i.due_on, 'status', i.status, 'issuedOn', i.issued_on, 'paidAt', i.paid_at,
    'manualReference', i.manual_reference
  )
  from public.billing_invoices i
  left join public.organization_profiles p on p.organization_id = i.organization_id
  where i.id = p_invoice_id;
$$;

revoke all on function public.claim_billing_email_deliveries(integer, integer) from public, anon, authenticated;
revoke all on function public.mark_billing_email_sending(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_billing_email_unknown(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_billing_email_sending(uuid, uuid) to service_role;
grant execute on function public.mark_billing_email_unknown(uuid, uuid, text) to service_role;
revoke all on function public.complete_billing_email_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_billing_email_delivery(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.hold_billing_email_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_billing_email_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_billing_invoice_for_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_billing_email_deliveries(integer, integer) to service_role;
grant execute on function public.complete_billing_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_billing_email_delivery(uuid, uuid, text, boolean) to service_role;
grant execute on function public.hold_billing_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.cancel_billing_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.get_billing_invoice_for_delivery(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Webhook fournisseur (signature vérifiée côté serveur) — idempotent
-- -----------------------------------------------------------------------------
-- Classement EXPLICITE des événements Resend :
--   email.sent             information ; peut lever une revue 'delivery_unknown'
--                          (preuve d'acceptation) via l'étiquette kjora_delivery
--   email.delivered        terminal succès      (depuis sent)
--   email.delivery_delayed information seule    (provider_delayed_at), JAMAIS
--                          de ré-expédition automatique, statut inchangé
--   email.failed           terminal échec → provider_failed, JAMAIS « livré »,
--                          jamais relancé automatiquement
--   email.bounced          terminal échec + liste de suppression
--   email.complained       terminal + liste de suppression (même après delivered)
--   email.suppressed       terminal échec + liste de suppression
-- Toute autre transition est refusée (un « delivered » tardif ne dégrade
-- jamais un échec). Chaque événement n'est traité qu'une fois (event_id).
--
-- Rapprochement (v3) :
--   • AVEC étiquette kjora_delivery « <file>_<uuid>_g<génération> » : la ligne
--     doit correspondre à la file, à l'identifiant ET à la génération. Une
--     génération différente (webhook retardé d'une expédition antérieure)
--     ne modifie RIEN : outcome 'generation_mismatch', événement conservé.
--   • SANS étiquette : seul un provider_message_id EXACT rapproche ; jamais
--     de levée de revue (aucune preuve de génération).
-- Un identifiant fournisseur déjà porté par une autre ligne n'est jamais
-- réaffecté.

create or replace function private.apply_provider_event_to_queue(
  p_queue text,
  p_event_type text,
  p_provider_message_id text,
  p_occurred_at timestamptz,
  p_delivery_id uuid,
  p_delivery_generation integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_status text;
  row_id uuid;
  row_generation smallint;
  row_message_id text;
  recipient text;
  target_status text;
  resolved boolean := false;
begin
  if p_delivery_id is not null then
    -- 1a. Étiquette présente : file + identifiant + génération.
    if p_queue = 'rent' then
      select id, status, recipient_email, resend_generation, provider_message_id
        into row_id, row_status, recipient, row_generation, row_message_id
        from public.message_deliveries where id = p_delivery_id for update;
    else
      select id, status, recipient_email, resend_generation, provider_message_id
        into row_id, row_status, recipient, row_generation, row_message_id
        from public.billing_email_deliveries where id = p_delivery_id for update;
    end if;
    if row_id is null then return 'no_matching_delivery'; end if;
    if p_delivery_generation is null or row_generation <> p_delivery_generation then
      return 'generation_mismatch';
    end if;

    if row_message_id is null then
      -- Ligne sans identifiant fournisseur : seule une ligne EN REVUE peut
      -- être levée, et seulement avec un identifiant libre.
      if row_status <> 'delivery_unknown' then return 'transition_refused'; end if;
      if not private.reserve_provider_message_id(p_provider_message_id, p_queue, row_id) then
        return 'transition_refused';
      end if;
      if p_queue = 'rent' then
        update public.message_deliveries
           set status = 'sent', provider = 'resend', provider_message_id = p_provider_message_id,
               sent_at = coalesce(p_occurred_at, now()), reviewed_at = now(), updated_at = now()
         where id = row_id;
      else
        update public.billing_email_deliveries
           set status = 'sent', provider = 'resend', provider_message_id = p_provider_message_id,
               sent_at = coalesce(p_occurred_at, now()), next_attempt_at = null,
               reviewed_at = now(), updated_at = now()
         where id = row_id;
      end if;
      row_status := 'sent';
      resolved := true;
    elsif row_message_id <> p_provider_message_id then
      -- Même ligne et génération, autre identifiant : incohérence, aucun effet.
      return 'transition_refused';
    end if;
  else
    -- 1b. Sans étiquette : identifiant fournisseur exact uniquement.
    if p_queue = 'rent' then
      select id, status, recipient_email into row_id, row_status, recipient
        from public.message_deliveries where provider_message_id = p_provider_message_id
       order by created_at desc limit 1 for update;
    else
      select id, status, recipient_email into row_id, row_status, recipient
        from public.billing_email_deliveries where provider_message_id = p_provider_message_id
       order by created_at desc limit 1 for update;
    end if;
    if row_id is null then return 'no_matching_delivery'; end if;
  end if;

  if p_event_type in ('email.sent', 'email.delivery_delayed') then
    if p_event_type = 'email.delivery_delayed' then
      if p_queue = 'rent' then
        update public.message_deliveries set provider_delayed_at = coalesce(p_occurred_at, now()), updated_at = now() where id = row_id;
      else
        update public.billing_email_deliveries set provider_delayed_at = coalesce(p_occurred_at, now()), updated_at = now() where id = row_id;
      end if;
    end if;
    return case when resolved then 'review_resolved' else 'information_recorded' end;
  end if;

  target_status := case p_event_type
    when 'email.delivered' then 'delivered'
    when 'email.failed' then 'provider_failed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.suppressed' then 'suppressed'
  end;

  if not (
    (target_status = 'delivered' and row_status = 'sent')
    or (target_status in ('provider_failed', 'bounced', 'suppressed') and row_status = 'sent')
    or (target_status = 'complained' and row_status in ('sent', 'delivered'))
  ) then
    return case when resolved then 'review_resolved' else 'transition_refused' end;
  end if;

  if p_queue = 'rent' then
    update public.message_deliveries
       set status = target_status, provider_event_at = coalesce(p_occurred_at, now()),
           delivered_at = case when target_status = 'delivered' then coalesce(p_occurred_at, now()) else delivered_at end,
           updated_at = now()
     where id = row_id;
  else
    update public.billing_email_deliveries
       set status = target_status, provider_event_at = coalesce(p_occurred_at, now()),
           delivered_at = case when target_status = 'delivered' then coalesce(p_occurred_at, now()) else delivered_at end,
           updated_at = now()
     where id = row_id;
  end if;

  if target_status in ('bounced', 'complained', 'suppressed') then
    insert into private.email_suppressions (email_fingerprint, reason)
    values (private.email_fingerprint(recipient), target_status)
    on conflict (email_fingerprint) do nothing;
  end if;
  return case when resolved then 'review_resolved' else 'status_updated' end;
end;
$$;

revoke all on function private.apply_provider_event_to_queue(text, text, text, timestamptz, uuid, integer) from public, anon, authenticated;

create or replace function public.record_email_provider_event(
  p_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_occurred_at timestamptz default now(),
  p_delivery_queue text default null,
  p_delivery_id uuid default null,
  p_delivery_generation integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcome text;
  queue_used text;
begin
  if p_event_id is null or char_length(p_event_id) not between 3 and 200
     or p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200 then
    return jsonb_build_object('outcome', 'invalid_event');
  end if;
  if p_event_type is null or p_event_type not in (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.failed',
    'email.bounced', 'email.complained', 'email.suppressed'
  ) then
    return jsonb_build_object('outcome', 'ignored_event_type');
  end if;
  -- Étiquette : tout ou rien (file, identifiant, génération 0..20).
  if (p_delivery_queue is not null or p_delivery_id is not null or p_delivery_generation is not null)
     and (p_delivery_queue is null or p_delivery_queue not in ('rent', 'saas') or p_delivery_id is null
          or p_delivery_generation is null or p_delivery_generation not between 0 and 20) then
    return jsonb_build_object('outcome', 'invalid_event');
  end if;

  if exists (select 1 from private.email_provider_events where event_id = p_event_id) then
    return jsonb_build_object('outcome', 'duplicate_event');
  end if;

  if p_delivery_id is not null then
    queue_used := p_delivery_queue;
    outcome := private.apply_provider_event_to_queue(p_delivery_queue, p_event_type, p_provider_message_id,
      p_occurred_at, p_delivery_id, p_delivery_generation);
  else
    queue_used := 'rent';
    outcome := private.apply_provider_event_to_queue('rent', p_event_type, p_provider_message_id, p_occurred_at, null, null);
    if outcome = 'no_matching_delivery' then
      queue_used := 'saas';
      outcome := private.apply_provider_event_to_queue('saas', p_event_type, p_provider_message_id, p_occurred_at, null, null);
    end if;
  end if;

  insert into private.email_provider_events (event_id, event_type, matched_queue, outcome)
  values (p_event_id, p_event_type, case when outcome = 'no_matching_delivery' then null else queue_used end, outcome)
  on conflict (event_id) do nothing;
  if not found then
    -- Course entre deux livraisons simultanées du même événement : la
    -- première a gagné ; cette transaction est annulée.
    raise exception 'duplicate_event_race' using errcode = '40001';
  end if;

  return jsonb_build_object('outcome', outcome, 'queue', case when outcome = 'no_matching_delivery' then null else queue_used end);
end;
$$;

revoke all on function public.record_email_provider_event(text, text, text, timestamptz, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.record_email_provider_event(text, text, text, timestamptz, text, uuid, integer) to service_role;

-- -----------------------------------------------------------------------------
-- 7. Orchestrateur quotidien unique + supervision Admin
-- -----------------------------------------------------------------------------
-- Un seul cron applicatif (Vercel, quotidien) appelle
-- run_communications_daily_system puis vide les deux files. Le cron base
-- existant (kjora-generate-dues-daily, 00:15) reste inchangé : échéances,
-- avis et alertes locatives. Aucun second cron n'est créé ici.

create or replace function public.run_communications_daily_system(
  p_run_on date default current_date,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  invoices jsonb;
  reminders jsonb;
begin
  insert into private.platform_operation_runs (run_type, trigger_source, dry_run, run_on)
  values ('communications_daily', 'cron', coalesce(p_dry_run, true), coalesce(p_run_on, current_date))
  returning id into run_id;

  invoices := private.generate_automatic_saas_invoices(coalesce(p_run_on, current_date), coalesce(p_dry_run, true));
  reminders := private.run_billing_reminders_core(coalesce(p_run_on, current_date), coalesce(p_dry_run, true));

  update private.platform_operation_runs
     set summary = jsonb_build_object('saasInvoices', invoices, 'billingReminders', reminders)
   where id = run_id;

  return jsonb_build_object('runId', run_id, 'saasInvoices', invoices, 'billingReminders', reminders);
end;
$$;

create or replace function public.finish_operation_run_system(
  p_run_id uuid,
  p_summary jsonb,
  p_succeeded boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.platform_operation_runs
     set summary = summary || coalesce(p_summary, '{}'::jsonb) - 'recipient_email' - 'recipient',
         status = case when p_succeeded then 'succeeded' else 'failed' end,
         finished_at = now()
   where id = p_run_id and status = 'running';
$$;

revoke all on function public.run_communications_daily_system(date, boolean) from public, anon, authenticated;
revoke all on function public.finish_operation_run_system(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.run_communications_daily_system(date, boolean) to service_role;
grant execute on function public.finish_operation_run_system(uuid, jsonb, boolean) to service_role;

-- Déclenchement Admin (Preview/Dev, où le cron Vercel ne tourne pas) :
-- dry-run par défaut. En mode réel, crée l'exécution et renvoie son id au
-- serveur, qui vide ensuite les files avec le même worker que le cron.
create or replace function public.admin_run_communications(
  p_run_on date default current_date,
  p_dry_run boolean default true,
  -- Vrai : le serveur va vider les files juste après (exécution réelle) ;
  -- l'exécution reste 'running' jusqu'à admin_finish_communications_run,
  -- même si la génération de factures est restée en dry-run.
  p_will_drain boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
  invoices jsonb;
  reminders jsonb;
  notices jsonb;
begin
  perform private.assert_platform_admin();
  insert into private.platform_operation_runs (run_type, trigger_source, dry_run, actor_user_id, run_on)
  values ('communications_daily', 'admin', coalesce(p_dry_run, true), (select auth.uid()), coalesce(p_run_on, current_date))
  returning id into run_id;

  invoices := private.generate_automatic_saas_invoices(coalesce(p_run_on, current_date), coalesce(p_dry_run, true));
  reminders := private.run_billing_reminders_core(coalesce(p_run_on, current_date), coalesce(p_dry_run, true));
  notices := private.reconcile_due_notices(coalesce(p_run_on, current_date), 500, true);

  update private.platform_operation_runs
     set summary = jsonb_build_object(
           'saasInvoices', invoices, 'billingReminders', reminders,
           'missingDueNotices', notices -> 'candidates',
           'claimableDeliveries', (
             select count(*) from public.message_deliveries md
              where md.status in ('pending', 'failed') and md.attempt_count < 3
                and coalesce(md.next_attempt_at, md.created_at) <= now()
           ) + (
             select count(*) from public.billing_email_deliveries bd
              where bd.status in ('pending', 'failed') and bd.attempt_count < 3 and bd.next_attempt_at <= now()
           )),
         status = case when coalesce(p_dry_run, true) and not coalesce(p_will_drain, false) then 'succeeded' else 'running' end,
         finished_at = case when coalesce(p_dry_run, true) and not coalesce(p_will_drain, false) then now() else null end
   where id = run_id;

  return (select jsonb_build_object('runId', r.id, 'dryRun', r.dry_run) || r.summary
            from private.platform_operation_runs r where r.id = run_id);
end;
$$;

create or replace function public.admin_finish_communications_run(
  p_run_id uuid,
  p_summary jsonb,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  update private.platform_operation_runs
     set summary = summary || coalesce(p_summary, '{}'::jsonb) - 'recipient_email' - 'recipient',
         status = case when p_succeeded then 'succeeded' else 'failed' end,
         finished_at = now()
   where id = p_run_id and status = 'running' and trigger_source = 'admin';
end;
$$;

create or replace function public.admin_reconcile_due_notices(
  p_run_on date default current_date,
  p_batch_limit integer default 50,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.assert_platform_admin();
  result := private.reconcile_due_notices(coalesce(p_run_on, current_date), p_batch_limit, coalesce(p_dry_run, true));
  insert into private.platform_operation_runs (run_type, trigger_source, dry_run, actor_user_id, run_on, status, summary, finished_at)
  values ('due_notice_reconciliation', 'admin', coalesce(p_dry_run, true), (select auth.uid()),
          coalesce(p_run_on, current_date), 'succeeded', result, now());
  return result;
end;
$$;

-- Relance des SEULS échecs admissibles : 'failed' avec tentatives restantes,
-- jamais un rebond/une plainte/une suppression, jamais un envoi réussi.
create or replace function public.admin_retry_failed_deliveries()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare rent_count integer; saas_count integer;
begin
  perform private.assert_platform_admin();
  update public.message_deliveries md
     set next_attempt_at = now(), updated_at = now()
   where md.status = 'failed' and md.attempt_count < 3
     and exists (select 1 from public.organizations o where o.id = md.organization_id and o.status = 'active');
  get diagnostics rent_count = row_count;
  update public.billing_email_deliveries bd
     set next_attempt_at = now(), updated_at = now()
   where bd.status = 'failed' and bd.attempt_count < 3
     and exists (select 1 from public.organizations o where o.id = bd.organization_id and o.status = 'active');
  get diagnostics saas_count = row_count;
  insert into private.platform_operation_runs (run_type, trigger_source, dry_run, actor_user_id, run_on, status, summary, finished_at)
  values ('retry_failed_deliveries', 'admin', false, (select auth.uid()), current_date, 'succeeded',
          jsonb_build_object('rentDeliveries', rent_count, 'saasDeliveries', saas_count), now());
  return jsonb_build_object('outcome', 'rescheduled', 'rentDeliveries', rent_count, 'saasDeliveries', saas_count);
end;
$$;

-- Vue opérationnelle : compteurs uniquement (jamais une adresse, un sujet,
-- un corps de message ni un payload).
create or replace function public.admin_communications_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  db_cron_last jsonb := null;
begin
  perform private.assert_platform_admin();

  begin
    execute $q$
      select jsonb_build_object('status', d.status, 'startedAt', d.start_time, 'finishedAt', d.end_time)
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
       where j.jobname = 'kjora-generate-dues-daily'
       order by d.start_time desc limit 1
    $q$ into db_cron_last;
  exception when others then
    db_cron_last := null;
  end;

  return jsonb_build_object(
    'dbCronLastRun', db_cron_last,
    'lastDailyRun', (
      select jsonb_build_object('status', r.status, 'dryRun', r.dry_run, 'trigger', r.trigger_source,
        'startedAt', r.started_at, 'finishedAt', r.finished_at)
        from private.platform_operation_runs r
       where r.run_type = 'communications_daily'
       order by r.started_at desc limit 1
    ),
    'automaticInvoices30d', (select count(*) from public.billing_invoices
                              where generation_source = 'automatic' and created_at >= now() - interval '30 days'),
    'dueNotices30d', (select count(*) from public.financial_documents
                       where document_type = 'due_notice' and created_at >= now() - interval '30 days'),
    'missingDueNotices', (
      select count(*) from public.dues d
        join public.dues_with_status ds on ds.organization_id = d.organization_id and ds.id = d.id
        join public.organizations o on o.id = d.organization_id
       where d.notice_date <= current_date and d.cancelled_at is null and d.kind <> 'adjustment'
         and ds.remaining_amount_xaf > 0 and o.status = 'active'
         and not exists (select 1 from public.financial_documents fd
                          where fd.organization_id = d.organization_id and fd.due_id = d.id
                            and fd.document_type = 'due_notice')
    ),
    'rentDeliveries', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) as n from public.message_deliveries group by status) s
    ),
    'saasDeliveries', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) as n from public.billing_email_deliveries group by status) s
    ),
    'saasDeliveriesHeldForLegalIdentity', (
      select count(*) from public.billing_email_deliveries where held_reason = 'legal_identity_missing' and status = 'pending'
    ),
    'retryableFailures', (
      (select count(*) from public.message_deliveries where status = 'failed' and attempt_count < 3)
      + (select count(*) from public.billing_email_deliveries where status = 'failed' and attempt_count < 3)
    ),
    -- Relances : exécutées au prochain passage quotidien ou sur
    -- déclenchement Admin (le délai 5/30/120 min n'est qu'un minimum).
    'retryableFailuresDueNow', (
      (select count(*) from public.message_deliveries
        where status = 'failed' and attempt_count < 3 and coalesce(next_attempt_at, created_at) <= now())
      + (select count(*) from public.billing_email_deliveries
        where status = 'failed' and attempt_count < 3 and next_attempt_at <= now())
    ),
    'deliveryUnknown', (
      (select count(*) from public.message_deliveries where status = 'delivery_unknown')
      + (select count(*) from public.billing_email_deliveries where status = 'delivery_unknown')
    ),
    'providerFailed', (
      (select count(*) from public.message_deliveries where status = 'provider_failed')
      + (select count(*) from public.billing_email_deliveries where status = 'provider_failed')
    ),
    'deliveryDelayedAwaitingOutcome', (
      (select count(*) from public.message_deliveries where status = 'sent' and provider_delayed_at is not null)
      + (select count(*) from public.billing_email_deliveries where status = 'sent' and provider_delayed_at is not null)
    ),
    'providerEvents30d', (
      select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb)
        from (select event_type, count(*) as n from private.email_provider_events
               where received_at >= now() - interval '30 days' group by event_type) e
    ),
    'organizationsWithoutCommunicationSettings', (
      select count(*) from public.organizations o
       where o.status = 'active'
         and not exists (select 1 from public.organization_communication_settings s
                          where s.organization_id = o.id and s.configured_at is not null)
    ),
    'generatedAt', now()
  );
end;
$$;

create or replace function public.admin_list_operation_runs(result_limit integer default 20)
returns table (
  run_id uuid,
  run_type text,
  trigger_source text,
  dry_run boolean,
  actor_email_masked text,
  run_on date,
  status text,
  summary jsonb,
  started_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select r.id, r.run_type, r.trigger_source, r.dry_run,
           (select private.mask_email(u.email::text) from auth.users u where u.id = r.actor_user_id),
           r.run_on, r.status, r.summary, r.started_at, r.finished_at
      from private.platform_operation_runs r
     order by r.started_at desc
     limit greatest(1, least(coalesce(result_limit, 20), 100));
end;
$$;

revoke all on function public.admin_run_communications(date, boolean, boolean) from public, anon;
revoke all on function public.admin_finish_communications_run(uuid, jsonb, boolean) from public, anon;
revoke all on function public.admin_reconcile_due_notices(date, integer, boolean) from public, anon;
revoke all on function public.admin_retry_failed_deliveries() from public, anon;
revoke all on function public.admin_communications_overview() from public, anon;
revoke all on function public.admin_list_operation_runs(integer) from public, anon;
grant execute on function public.admin_run_communications(date, boolean, boolean) to authenticated;
grant execute on function public.admin_finish_communications_run(uuid, jsonb, boolean) to authenticated;
grant execute on function public.admin_reconcile_due_notices(date, integer, boolean) to authenticated;
grant execute on function public.admin_retry_failed_deliveries() to authenticated;
grant execute on function public.admin_communications_overview() to authenticated;
grant execute on function public.admin_list_operation_runs(integer) to authenticated;

-- Lignes en revue (issue d'expédition inconnue) : adresse MASQUÉE, jamais
-- de contenu. Seule une décision Admin les fait évoluer.
create or replace function public.admin_list_delivery_reviews(result_limit integer default 50)
returns table (
  queue text,
  delivery_id uuid,
  organization_name text,
  template_key text,
  recipient_masked text,
  attempt_count smallint,
  resend_generation smallint,
  review_reason text,
  last_error_code text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select * from (
      select 'rent'::text, md.id, coalesce(op.name, '')::text, md.template_key, private.mask_email(md.recipient_email),
             md.attempt_count, md.resend_generation, md.review_reason, md.last_error_code, md.updated_at
        from public.message_deliveries md
        left join public.organization_profiles op on op.organization_id = md.organization_id
       where md.status = 'delivery_unknown'
      union all
      select 'saas'::text, bd.id, coalesce(op.name, '')::text, bd.template_key, private.mask_email(bd.recipient_email),
             bd.attempt_count, bd.resend_generation, bd.review_reason, bd.last_error_code, bd.updated_at
        from public.billing_email_deliveries bd
        left join public.organization_profiles op on op.organization_id = bd.organization_id
       where bd.status = 'delivery_unknown'
    ) r
    order by 10 asc
    limit greatest(1, least(coalesce(result_limit, 50), 200));
end;
$$;

-- Décision Admin EXPLICITE et AUDITÉE sur une ligne en revue :
--   confirm_sent : l'Admin a constaté l'envoi chez le fournisseur ; il fournit
--                  l'identifiant de message (preuve) → 'sent', jamais renvoyé ;
--   resend       : ré-expédition acceptée EN CONNAISSANCE DE CAUSE (risque de
--                  doublon) → nouvelle génération, donc nouvelle
--                  Idempotency-Key ; Organization active exigée ;
--   abandon      : aucune nouvelle expédition → 'cancelled'.
-- Motif obligatoire (3..500 caractères), journalisé dans administrative_audit_log
-- et platform_operation_runs, sans adresse ni contenu.
create or replace function public.admin_resolve_delivery_review(
  p_queue text,
  p_delivery_id uuid,
  p_decision text,
  p_note text,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
  row_status text;
  generation smallint;
begin
  perform private.assert_platform_admin();
  if p_queue is null or p_queue not in ('rent', 'saas') then
    return jsonb_build_object('outcome', 'invalid_queue');
  end if;
  if p_decision is null or p_decision not in ('confirm_sent', 'resend', 'abandon') then
    return jsonb_build_object('outcome', 'invalid_decision');
  end if;
  if p_note is null or char_length(trim(p_note)) not between 3 and 500 then
    return jsonb_build_object('outcome', 'note_required');
  end if;
  if p_decision = 'confirm_sent'
     and (p_provider_message_id is null or char_length(trim(p_provider_message_id)) not between 1 and 200) then
    return jsonb_build_object('outcome', 'provider_message_id_required');
  end if;

  if p_queue = 'rent' then
    select organization_id, status, resend_generation into org_id, row_status, generation
      from public.message_deliveries where id = p_delivery_id for update;
  else
    select organization_id, status, resend_generation into org_id, row_status, generation
      from public.billing_email_deliveries where id = p_delivery_id for update;
  end if;
  if org_id is null then return jsonb_build_object('outcome', 'delivery_not_found'); end if;
  if row_status <> 'delivery_unknown' then
    return jsonb_build_object('outcome', 'not_under_review', 'status', row_status);
  end if;
  if p_decision = 'resend' then
    if not exists (select 1 from public.organizations where id = org_id and status = 'active') then
      return jsonb_build_object('outcome', 'organization_not_active');
    end if;
    if generation >= 20 then return jsonb_build_object('outcome', 'resend_limit_reached'); end if;
  end if;
  -- Un identifiant fournisseur n'appartient qu'à UNE ligne, toutes files
  -- confondues : jamais réaffecté par une confirmation.
  if p_decision = 'confirm_sent'
     and not private.reserve_provider_message_id(trim(p_provider_message_id), p_queue, p_delivery_id) then
    return jsonb_build_object('outcome', 'provider_message_id_already_used');
  end if;

  if p_decision = 'resend' then
    -- Nouvelle génération PROPRE (v4) : aucune métadonnée de la revue ni de
    -- l'expédition précédente ne subsiste sur la ligne (l'historique de la
    -- décision reste dans administrative_audit_log et platform_operation_runs).
    -- reviewed_at NULL : une finalisation tardive de la génération suivante,
    -- avec SON jeton, reste possible.
    if p_queue = 'rent' then
      update public.message_deliveries
         set status = 'pending',
             reviewed_by = null, reviewed_at = null, review_reason = null,
             last_error_code = null, last_error_message = null,
             provider = null, provider_message_id = null,
             sent_at = null, delivered_at = null, provider_event_at = null, provider_delayed_at = null,
             last_claim_token = null,
             next_attempt_at = now(), attempt_count = 0, resend_generation = resend_generation + 1,
             updated_at = now()
       where id = p_delivery_id;
    else
      update public.billing_email_deliveries
         set status = 'pending',
             reviewed_by = null, reviewed_at = null, review_reason = null,
             last_error_code = null,
             provider = null, provider_message_id = null,
             sent_at = null, delivered_at = null, provider_event_at = null, provider_delayed_at = null,
             last_claim_token = null,
             next_attempt_at = now(), attempt_count = 0, resend_generation = resend_generation + 1,
             updated_at = now()
       where id = p_delivery_id;
    end if;
  elsif p_queue = 'rent' then
    update public.message_deliveries
       set status = case p_decision when 'confirm_sent' then 'sent' else 'cancelled' end,
           provider = case when p_decision = 'confirm_sent' then 'resend' else provider end,
           provider_message_id = case when p_decision = 'confirm_sent' then trim(p_provider_message_id) else provider_message_id end,
           sent_at = case when p_decision = 'confirm_sent' then now() else null end,
           next_attempt_at = null,
           last_error_code = case p_decision when 'abandon' then 'abandoned_after_review' else last_error_code end,
           reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_delivery_id;
  else
    update public.billing_email_deliveries
       set status = case p_decision when 'confirm_sent' then 'sent' else 'cancelled' end,
           provider = case when p_decision = 'confirm_sent' then 'resend' else provider end,
           provider_message_id = case when p_decision = 'confirm_sent' then trim(p_provider_message_id) else provider_message_id end,
           sent_at = case when p_decision = 'confirm_sent' then now() else null end,
           next_attempt_at = null,
           last_error_code = case p_decision when 'abandon' then 'abandoned_after_review' else last_error_code end,
           reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now()
     where id = p_delivery_id;
  end if;

  perform private.write_administrative_audit(
    org_id, 'communication.delivery_review_resolved', null, null, null,
    jsonb_build_object('queue', p_queue, 'deliveryId', p_delivery_id, 'decision', p_decision,
      'note', left(trim(p_note), 500))
  );
  insert into private.platform_operation_runs (run_type, trigger_source, dry_run, actor_user_id, run_on, status, summary, finished_at)
  values ('delivery_review', 'admin', false, (select auth.uid()), current_date, 'succeeded',
          jsonb_build_object('queue', p_queue, 'decision', p_decision), now());

  return jsonb_build_object('outcome', 'resolved', 'decision', p_decision);
end;
$$;

-- Historique des événements fournisseur : type, file, effet — rien d'autre.
create or replace function public.admin_list_provider_events(result_limit integer default 50)
returns table (event_type text, matched_queue text, outcome text, received_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select e.event_type, e.matched_queue, e.outcome, e.received_at
      from private.email_provider_events e
     order by e.received_at desc
     limit greatest(1, least(coalesce(result_limit, 50), 200));
end;
$$;

revoke all on function public.admin_list_delivery_reviews(integer) from public, anon;
revoke all on function public.admin_resolve_delivery_review(text, uuid, text, text, text) from public, anon;
revoke all on function public.admin_list_provider_events(integer) from public, anon;
grant execute on function public.admin_list_delivery_reviews(integer) to authenticated;
grant execute on function public.admin_resolve_delivery_review(text, uuid, text, text, text) to authenticated;
grant execute on function public.admin_list_provider_events(integer) to authenticated;

-- Le résultat quotidien base indique désormais que l'automatisation des
-- courriels dépend des réglages (plus un « false » figé).
create or replace function private.run_financial_daily(run_on date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare generated_dues integer; communication_result record; processed_events integer;
begin
  generated_dues := private.generate_due_schedules(run_on);
  processed_events := private.process_financial_document_events(100);
  select * into communication_result from private.prepare_financial_communications(run_on);
  return jsonb_build_object('generated_dues', generated_dues, 'due_notices', communication_result.due_notices,
    'overdue_notifications', communication_result.overdue_notifications,
    'prepaid_notifications', communication_result.prepaid_notifications,
    'low_credit_notifications', communication_result.low_credit_notifications,
    'processed_financial_events', processed_events,
    'email_automation', 'settings_driven',
    'queued_deliveries_pending', (select count(*) from public.message_deliveries where status = 'pending'));
end;
$$;

revoke all on function private.run_financial_daily(date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Correctif constaté pendant le rejeu : ordre du journal de consentement
-- -----------------------------------------------------------------------------
-- Deux décisions enregistrées dans une même transaction partagent le même
-- recorded_at (now()) ; le départage par id (uuid aléatoire) rendait l'ordre
-- — et donc « la décision la plus récente » — non déterministe (test 01I
-- intermittent). Séquence d'insertion monotone, ajoutée sans UPDATE (le
-- trigger d'immutabilité n'est jamais contourné) ; même signature, mêmes droits.
alter table public.organization_marketing_consent_events
  add column if not exists recorded_seq bigint generated always as identity;

create or replace function public.admin_list_marketing_consent_history(
  target_organization_id uuid
)
returns table (
  event_id uuid,
  consent boolean,
  source text,
  consent_version text,
  evidence text,
  recorded_by_email text,
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_platform_admin();
  return query
    select e.id, e.consent, e.source, e.consent_version, e.evidence,
           (select email::text from auth.users where id = e.recorded_by), e.recorded_at
      from public.organization_marketing_consent_events e
     where e.organization_id = target_organization_id
     order by e.recorded_at desc, e.recorded_seq desc;
end;
$$;

commit;
