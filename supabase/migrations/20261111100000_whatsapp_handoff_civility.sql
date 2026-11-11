-- Ajoute la civilité (M. / Mme), le montant du document et l'échéance au contexte du message WhatsApp manuel.
-- Seule la fonction est remplacée ; ses droits d'exécution sont conservés.
begin;

create or replace function public.prepare_manual_whatsapp_handoff(target_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.financial_documents%rowtype; p public.tenant_communication_preferences%rowtype; t public.tenants%rowtype; actor uuid:=(select auth.uid());
begin
 select * into d from public.financial_documents where id=target_document_id;
 if actor is null or d.id is null or not private.has_capability(d.organization_id,'receipt.share') then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=d.organization_id and status='active') then raise exception 'organization_unavailable' using errcode='42501'; end if;
 if d.status is distinct from 'ready' or d.review_status is distinct from 'approved' then raise exception 'document_not_approved' using errcode='22023'; end if;
 select * into t from public.tenants where id=d.tenant_id and organization_id=d.organization_id;
 select * into p from public.tenant_communication_preferences where tenant_id=t.id and organization_id=d.organization_id;
 if p.phone_e164 is null or p.whatsapp_status not in ('declared','tenant_confirmed','verified') or p.whatsapp_transactional_consented_at is null or p.whatsapp_transactional_revoked_at is not null then raise exception 'whatsapp_not_available' using errcode='22023'; end if;
 insert into public.tenant_whatsapp_consent_events(organization_id,tenant_id,actor_user_id,action,whatsapp_status,document_id) values(d.organization_id,t.id,actor,'whatsapp_open_requested',p.whatsapp_status,d.id);
 return jsonb_build_object('phoneE164',p.phone_e164,'displayName',coalesce(nullif(trim(t.full_name),''),'KJORA'),'civility',t.civility,'amountXaf',case when coalesce(d.snapshot->>'currency','XAF')='XAF' then (case d.document_type when 'payment_receipt' then d.snapshot->>'amount_xaf' when 'rent_receipt' then d.snapshot->>'expected_xaf' when 'due_notice' then d.snapshot->>'remaining_xaf' when 'account_statement' then d.snapshot->>'closing_balance_xaf' end)::numeric::bigint end,'dueDate',case when d.document_type='due_notice' then d.snapshot->>'due_date' end,'language',case when coalesce(t.preferred_language,d.language)='en' then 'en' else 'fr' end,
  'documentType',case when d.document_type in ('due_notice','payment_receipt','rent_receipt','account_statement') then d.document_type else null end,'periodStart',d.period_start,'periodEnd',d.period_end);
end; $$;

commit;
