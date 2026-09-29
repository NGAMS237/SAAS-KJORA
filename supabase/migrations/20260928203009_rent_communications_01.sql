begin;

alter table private.domain_events drop constraint domain_events_event_type_check;
alter table private.domain_events add constraint domain_events_event_type_check check (event_type in (
  'PROPERTY_CREATED', 'TENANT_CREATED', 'LEASE_ACTIVATED', 'LEASE_LEDGER_OPENED', 'DUE_GENERATED', 'DUE_ADJUSTED',
  'PAYMENT_RECORDED', 'PAYMENT_COMPLETED', 'PAYMENT_ALLOCATION_CONFIRMED', 'PAYMENT_REVERSED',
  'DOCUMENT_GENERATED', 'DOCUMENT_INVALIDATED', 'MESSAGE_DELIVERY_FAILED', 'FINANCIAL_DOCUMENT_REVIEWED'
));

alter table public.financial_documents
  add column if not exists review_status text not null default 'approved'
    check (review_status in ('draft','approved','deferred')),
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists deferred_until date,
  add column if not exists supersedes_document_id uuid references public.financial_documents(id) on delete restrict;

-- Installer la version du garde qui connaît le mode `review` AVANT le
-- backfill. Sur une base non vide, l'ancien garde d'immutabilité refuse toute
-- mise à jour qui n'est ni une finalisation ni une invalidation.
create or replace function private.protect_financial_document()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'financial_document_history_is_immutable' using errcode = '23514'; end if;
  if current_setting('kjora.document_maintenance', true) = 'finalize'
    and old.status = 'prepared' and new.status = 'ready'
    and to_jsonb(new) - array['status','storage_path','content_sha256','content_bytes','ready_at']
      = to_jsonb(old) - array['status','storage_path','content_sha256','content_bytes','ready_at'] then return new; end if;
  if current_setting('kjora.document_maintenance', true) = 'invalidate'
    and old.status in ('prepared','ready') and new.status = 'invalidated'
    and to_jsonb(new) - array['status','invalidated_by','invalidated_at','invalidation_reason']
      = to_jsonb(old) - array['status','invalidated_by','invalidated_at','invalidation_reason'] then return new; end if;
  if current_setting('kjora.document_maintenance', true) = 'review'
    and old.status = new.status and old.snapshot = new.snapshot
    and to_jsonb(new) - array['review_status','approved_by','approved_at','deferred_until']
      = to_jsonb(old) - array['review_status','approved_by','approved_at','deferred_until'] then return new; end if;
  raise exception 'financial_document_history_is_immutable' using errcode = '23514';
end;
$$;

select set_config('kjora.document_maintenance', 'review', true);
update public.financial_documents
   set approved_at = coalesce(ready_at, created_at), approved_by = created_by
 where review_status = 'approved' and approved_at is null;
select set_config('kjora.document_maintenance', '', true);

alter table public.financial_documents
  add constraint financial_documents_review_state check (
    (review_status = 'approved' and approved_at is not null)
    or (review_status = 'deferred' and deferred_until is not null and approved_at is null)
    or (review_status = 'draft' and approved_at is null and deferred_until is null)
  );

create or replace function private.financial_statement_review_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.document_type = 'account_statement' and (select auth.uid()) is not null then
    new.review_status := 'draft'; new.approved_at := null; new.approved_by := null; new.deferred_until := null;
  elsif new.review_status = 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;
create trigger financial_statement_review_default
before insert on public.financial_documents
for each row execute function private.financial_statement_review_default();

create or replace function public.review_financial_document(
  target_document_id uuid, p_decision text, p_deferred_until date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare doc public.financial_documents%rowtype;
begin
  select * into doc from public.financial_documents where id=target_document_id for update;
  if doc.id is null or (select auth.uid()) is null
     or not private.has_capability(doc.organization_id,'receipt.share') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if doc.status = 'invalidated' or p_decision not in ('approve','defer') then
    raise exception 'invalid_review' using errcode='22023';
  end if;
  if p_decision='defer' and (p_deferred_until is null or p_deferred_until < current_date) then
    raise exception 'invalid_deferred_until' using errcode='22023';
  end if;
  perform set_config('kjora.document_maintenance','review',true);
  update public.financial_documents set
    review_status=case p_decision when 'approve' then 'approved' else 'deferred' end,
    approved_by=case p_decision when 'approve' then (select auth.uid()) else null end,
    approved_at=case p_decision when 'approve' then now() else null end,
    deferred_until=case p_decision when 'defer' then p_deferred_until else null end
  where id=doc.id;
  insert into private.domain_events(organization_id,event_type,aggregate_type,aggregate_id,actor_user_id,payload)
  values(doc.organization_id,'FINANCIAL_DOCUMENT_REVIEWED','financial_document',doc.id,(select auth.uid()),
    jsonb_build_object('decision',p_decision,'deferred_until',p_deferred_until));
  return jsonb_build_object('documentId',doc.id,'decision',p_decision);
end;
$$;

create or replace function private.guard_financial_delivery_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.financial_documents d where d.id=new.document_id and d.review_status='approved') then
    raise exception 'document_review_required' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger message_deliveries_require_approved_document
before insert on public.message_deliveries
for each row execute function private.guard_financial_delivery_review();

revoke all on function public.review_financial_document(uuid,text,date) from public, anon;
grant execute on function public.review_financial_document(uuid,text,date) to authenticated;
revoke all on function private.financial_statement_review_default() from public, anon, authenticated;
revoke all on function private.guard_financial_delivery_review() from public, anon, authenticated;

commit;
