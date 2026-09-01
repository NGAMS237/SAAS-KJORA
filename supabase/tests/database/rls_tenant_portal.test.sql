begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('1e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-a-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'viewer-a-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-b-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'portal-a-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'portal-a2-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'portal-b-6e@kjora.test', now(), now(), now()),
  ('1e000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'no-access-6e@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000004');
insert into public.organization_profiles (organization_id, name, language) values
  ('2e000000-0000-4000-8000-00000000000a', 'Organization A 6E', 'fr'),
  ('2e000000-0000-4000-8000-00000000000b', 'Organization B 6E', 'en');
insert into public.memberships (organization_id, user_id, role) values
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000002', 'manager'),
  ('2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000003', 'viewer'),
  ('2e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000004', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('3e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', 'Immeuble A 6E', 'Douala', 'building', '1e000000-0000-4000-8000-000000000001'),
  ('3e000000-0000-4000-8000-00000000000b', '2e000000-0000-4000-8000-00000000000b', 'Immeuble B 6E', 'Yaoundé', 'building', '1e000000-0000-4000-8000-000000000004');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('4e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', 'A1', 'apartment', '1e000000-0000-4000-8000-000000000001'),
  ('4e000000-0000-4000-8000-00000000000c', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', 'A2', 'apartment', '1e000000-0000-4000-8000-000000000001'),
  ('4e000000-0000-4000-8000-00000000000d', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', 'A0 historique', 'apartment', '1e000000-0000-4000-8000-000000000001'),
  ('4e000000-0000-4000-8000-00000000000b', '2e000000-0000-4000-8000-00000000000b', '3e000000-0000-4000-8000-00000000000b', 'B1', 'studio', '1e000000-0000-4000-8000-000000000004');
insert into public.tenants (id, organization_id, full_name, email, preferred_language, created_by) values
  ('5e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', 'Locataire Portail A', 'portal-a-6e@kjora.test', 'fr', '1e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-00000000000c', '2e000000-0000-4000-8000-00000000000a', 'Locataire Invitation A2', 'portal-a2-6e@kjora.test', 'fr', '1e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-00000000000b', '2e000000-0000-4000-8000-00000000000b', 'Locataire Portail B', 'portal-b-6e@kjora.test', 'en', '1e000000-0000-4000-8000-000000000004');
insert into public.leases (id, organization_id, property_id, unit_id, tenant_id, status, start_date, end_date, base_rent_xaf, recurring_charges_xaf, billing_frequency, due_day, created_by) values
  ('6e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', '4e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', 'draft', current_date - 30, null, 40000, 2000, 'monthly', 5, '1e000000-0000-4000-8000-000000000001'),
  ('6e000000-0000-4000-8000-00000000000d', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', '4e000000-0000-4000-8000-00000000000d', '5e000000-0000-4000-8000-00000000000a', 'draft', current_date - 150, current_date - 61, 30000, 0, 'monthly', 5, '1e000000-0000-4000-8000-000000000001'),
  ('6e000000-0000-4000-8000-00000000000c', '2e000000-0000-4000-8000-00000000000a', '3e000000-0000-4000-8000-00000000000a', '4e000000-0000-4000-8000-00000000000c', '5e000000-0000-4000-8000-00000000000c', 'draft', current_date + 30, null, 50000, 0, 'monthly', 5, '1e000000-0000-4000-8000-000000000001'),
  ('6e000000-0000-4000-8000-00000000000b', '2e000000-0000-4000-8000-00000000000b', '3e000000-0000-4000-8000-00000000000b', '4e000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-00000000000b', 'draft', current_date - 30, null, 60000, 0, 'monthly', 5, '1e000000-0000-4000-8000-000000000004');

update public.leases
set status = 'active'
where id in (
  '6e000000-0000-4000-8000-00000000000a',
  '6e000000-0000-4000-8000-00000000000b',
  '6e000000-0000-4000-8000-00000000000c',
  '6e000000-0000-4000-8000-00000000000d'
);
update public.leases
set status = 'ended', ended_on = current_date - 61, end_reason = 'Historique fixture 6E'
where id = '6e000000-0000-4000-8000-00000000000d';

insert into public.dues (id, organization_id, lease_id, tenant_id, kind, generation_key, reference, period_start, period_end, due_date, notice_date, rent_amount_xaf, recurring_charges_amount_xaf, deposit_amount_xaf, created_by) values
  ('7e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', 'periodic', 'portal-6e-due-a', 'DUE-6E-A', current_date - 30, current_date - 1, current_date, current_date - 5, 40000, 2000, 0, '1e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-00000000000d', '2e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', 'deposit', 'portal-6e-deposit-a', 'DEP-6E-A', current_date - 30, current_date - 30, current_date - 30, current_date - 30, 0, 0, 50000, '1e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-00000000000e', '2e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000d', '5e000000-0000-4000-8000-00000000000a', 'periodic', 'portal-6e-due-history', 'DUE-6E-HISTORY', current_date - 90, current_date - 61, current_date - 90, current_date - 95, 30000, 0, 0, '1e000000-0000-4000-8000-000000000001');
insert into public.payments (id, organization_id, tenant_id, lease_id, reference, amount_xaf, payment_date, method, allocation_mode, status, idempotency_key, request_fingerprint, balance_before_xaf, balance_after_xaf, created_by, confirmed_at) values
  ('8e000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', 'PAY-2026-600001', 20000, current_date, 'cash', 'manual', 'confirmed', 'portal-6e-payment-a', repeat('a', 64), 92000, 72000, '1e000000-0000-4000-8000-000000000001', now()),
  ('8e000000-0000-4000-8000-00000000000c', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000c', '6e000000-0000-4000-8000-00000000000c', 'PAY-2026-600002', 5000, current_date, 'mtn_momo', 'manual', 'confirmed', 'portal-6e-payment-credit', repeat('c', 64), 0, -5000, '1e000000-0000-4000-8000-000000000001', now()),
  ('8e000000-0000-4000-8000-00000000000d', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000d', 'PAY-2026-600003', 30000, current_date - 89, 'bank_transfer', 'manual', 'confirmed', 'portal-6e-payment-history', repeat('d', 64), 30000, 0, '1e000000-0000-4000-8000-000000000001', now() - interval '89 days');
insert into public.payment_allocations (organization_id, payment_id, due_id, lease_id, tenant_id, amount_xaf, rent_amount_xaf) values
  ('2e000000-0000-4000-8000-00000000000a', '8e000000-0000-4000-8000-00000000000a', '7e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', 20000, 20000),
  ('2e000000-0000-4000-8000-00000000000a', '8e000000-0000-4000-8000-00000000000d', '7e000000-0000-4000-8000-00000000000e', '6e000000-0000-4000-8000-00000000000d', '5e000000-0000-4000-8000-00000000000a', 30000, 30000);
insert into public.ledger_entries (organization_id, lease_id, tenant_id, payment_id, entry_type, source_key, reference, description_code, occurred_on, credit_xaf) values
  ('2e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000c', '5e000000-0000-4000-8000-00000000000c', '8e000000-0000-4000-8000-00000000000c', 'payment', 'portal-6e-payment-credit-ledger', 'PAY-2026-600002', 'PAYMENT_COMPLETED', current_date, 5000);
insert into public.financial_documents (id, organization_id, tenant_id, lease_id, due_id, payment_id, document_type, source_key, reference, status, language, issued_on, period_start, period_end, snapshot, storage_path, content_sha256, content_bytes, ready_at, created_by) values
  ('de000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', null, '8e000000-0000-4000-8000-00000000000a', 'payment_receipt', 'portal-6e-receipt-a', 'REC-2026-600001', 'prepared', 'fr', current_date, null, null, '{}'::jsonb, null, null, null, null, '1e000000-0000-4000-8000-000000000001'),
  ('de000000-0000-4000-8000-00000000000c', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', '7e000000-0000-4000-8000-00000000000a', null, 'due_notice', 'portal-6e-due-notice-a', 'AVI-2026-600001', 'prepared', 'fr', current_date, current_date - 30, current_date - 1, '{}'::jsonb, null, null, null, null, '1e000000-0000-4000-8000-000000000001'),
  ('de000000-0000-4000-8000-00000000000d', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000d', '7e000000-0000-4000-8000-00000000000e', null, 'rent_receipt', 'portal-6e-rent-receipt-history', 'QUI-2026-600001', 'ready', 'fr', current_date - 60, current_date - 90, current_date - 61, '{}'::jsonb, '2e000000-0000-4000-8000-00000000000a/de000000-0000-4000-8000-00000000000d/v1.pdf', repeat('e', 64), 128, now() - interval '60 days', '1e000000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, metadata) values
  ('financial-documents', '2e000000-0000-4000-8000-00000000000a/de000000-0000-4000-8000-00000000000d/v1.pdf', '{"mimetype":"application/pdf"}'::jsonb);

insert into public.tenant_portal_accesses (id, organization_id, tenant_id, user_id, status, invited_email, preferred_language, invited_by, accepted_at, last_login_at) values
  ('ae000000-0000-4000-8000-00000000000a', '2e000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000005', 'active', 'portal-a-6e@kjora.test', 'fr', '1e000000-0000-4000-8000-000000000001', now(), now()),
  ('ae000000-0000-4000-8000-00000000000b', '2e000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000007', 'active', 'portal-b-6e@kjora.test', 'en', '1e000000-0000-4000-8000-000000000004', now(), now());
insert into public.tenant_portal_lease_accesses (organization_id, access_id, tenant_id, lease_id, granted_by) values
  ('2e000000-0000-4000-8000-00000000000a', 'ae000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-00000000000a', 'ae000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000d', '1e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-00000000000b', 'ae000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-00000000000b', '6e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000004');
insert into public.tenant_portal_sessions (organization_id, access_id, tenant_id, user_id, auth_session_id, expires_at) values
  ('2e000000-0000-4000-8000-00000000000a', 'ae000000-0000-4000-8000-00000000000a', '5e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000005', 'session-portal-a', now() + interval '30 days'),
  ('2e000000-0000-4000-8000-00000000000b', 'ae000000-0000-4000-8000-00000000000b', '5e000000-0000-4000-8000-00000000000b', '1e000000-0000-4000-8000-000000000007', 'session-portal-b', now() + interval '30 days');

insert into public.notifications (
  organization_id, recipient_user_id, required_capability, notification_type,
  deduplication_key, title_code, payload, document_id, tenant_id, lease_id
) values (
  '2e000000-0000-4000-8000-00000000000a', '1e000000-0000-4000-8000-000000000001',
  'receipt.view', 'due_notice_ready', 'portal-notification-fixture-6e-a', 'DUE_NOTICE_READY',
  '{"reference":"AVI-2026-600001"}'::jsonb, 'de000000-0000-4000-8000-00000000000c',
  '5e000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a'
);

select has_table('public', 'tenant_portal_accesses', 'TenantPortalAccess existe');
select has_table('public', 'tenant_portal_lease_accesses', 'scope Lease explicite existe');
select has_table('public', 'tenant_portal_invitations', 'invitations portail existent');
select has_table('public', 'tenant_portal_sessions', 'sessions portail existent');
select has_table('public', 'tenant_portal_document_views', 'état reçu consulté existe');
select has_table('private', 'tenant_portal_access_log', 'journal accès privé existe');
select has_column('public', 'notifications', 'recipient_tenant_portal_access_id', 'destinataire portail explicite existe');
select ok(exists (select 1 from pg_constraint where conname = 'notifications_recipient_scope_check'), 'une notification a exactement un scope destinataire');
select ok(not has_function_privilege('anon', 'public.list_my_tenant_portal_notifications(uuid,integer)', 'execute'), 'anon ne liste pas les notifications portail');
select ok(not has_function_privilege('anon', 'public.set_tenant_portal_notification_read_state(uuid,uuid,boolean)', 'execute'), 'anon ne modifie pas une notification portail');
select ok(not has_function_privilege('anon', 'public.mark_all_tenant_portal_notifications_read(uuid)', 'execute'), 'anon ne marque pas les notifications portail');
select ok(not exists (
  select 1
  from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
  where procedure.oid = 'public.list_my_tenant_portal_notifications(uuid,integer)'::regprocedure
    and privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE'
), 'PUBLIC ne peut exécuter la liste des notifications portail');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'tenant_portal_%'), 'RLS active sur toutes les tables portail publiques');
select ok(not has_function_privilege('anon', 'public.get_tenant_portal_home(uuid)', 'execute'), 'anon ne peut exécuter les projections portail');
select ok(not has_table_privilege('authenticated', 'public.tenant_portal_accesses', 'select'), 'authenticated ne lit pas directement TenantPortalAccess');
select ok((select not public from storage.buckets where id = 'financial-documents'), 'bucket financier reste privé');
select ok(not has_function_privilege('authenticated', 'private.has_active_tenant_portal_access(uuid)', 'execute'), 'helper session privé non exposé au client');
select ok(not has_function_privilege('authenticated', 'private.has_tenant_portal_lease_access(uuid,uuid)', 'execute'), 'helper scope Lease privé non exposé au client');
select ok(exists (select 1 from pg_constraint where conname = 'tenant_portal_lease_accesses_lease_fk' and array_length(conkey, 1) = 3), 'scope Lease lie Organization + Lease + Tenant');
select ok(exists (select 1 from pg_constraint where conname = 'tenant_portal_document_views_document_fk' and array_length(conkey, 1) = 3), 'vue document lie Organization + Document + Tenant');
select is((select count(distinct role) from public.role_capabilities), 6::bigint, 'les six rôles internes restent inchangés');
select is((select count(*) from public.role_capabilities where role::text = 'tenant_portal'), 0::bigint, 'le locataire ne devient pas un rôle interne');
select is((select count(*) from public.role_capabilities where capability = 'tenant_portal.manage'), 2::bigint, 'seuls Owner et gestionnaire portent tenant_portal.manage');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a"}', true);
select is((select count(*) from public.list_my_tenant_portal_accesses()), 1::bigint, 'locataire actif voit un seul espace autorisé');
select is((public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a')->>'organizationId')::uuid, '2e000000-0000-4000-8000-00000000000a'::uuid, 'accueil reste dans Organization A');
select is(jsonb_array_length(public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a')->'leases'), 2, 'les deux Locations explicitement autorisées sont exposées');
select is((select count(*) from public.list_tenant_portal_dues('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a') where due_id in ('7e000000-0000-4000-8000-00000000000a', '7e000000-0000-4000-8000-00000000000d')), 2::bigint, 'échéance périodique et dépôt A autorisés');
select is((select count(*) from public.list_tenant_portal_payments('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a')), 1::bigint, 'Payment A autorisé');
select is((select count(*) from public.list_tenant_portal_documents('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a')), 2::bigint, 'reçu partiel et avis A autorisés');
select is((select count(*) from public.list_my_tenant_portal_notifications('ae000000-0000-4000-8000-00000000000a')), 1::bigint, 'locataire A voit sa notification projetée');
select throws_ok($$ select * from public.list_my_tenant_portal_notifications('ae000000-0000-4000-8000-00000000000b') $$, '42501', 'not_found', 'locataire A ne liste pas les notifications de B');
select ok(public.set_tenant_portal_notification_read_state(
  'ae000000-0000-4000-8000-00000000000a',
  (select notification_id from public.list_my_tenant_portal_notifications('ae000000-0000-4000-8000-00000000000a') limit 1), true
) is not null, 'lecture d’une notification autorisée est enregistrée');
select ok((select bool_and(read_at is not null) from public.list_my_tenant_portal_notifications('ae000000-0000-4000-8000-00000000000a')), 'badge non lu peut décroître après lecture');
select is(public.mark_all_tenant_portal_notifications_read('ae000000-0000-4000-8000-00000000000a'), 0, 'tout marquer lu reste idempotent');
select is((select count(*) from public.notifications), 0::bigint, 'le portail ne lit jamais directement la table notifications');
select ok((select count(*) = 2 and count(*) filter (where item->>'status' = 'active') = 1 and count(*) filter (where item->>'status' = 'ended') = 1 from jsonb_array_elements(public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a')->'leases') item), 'Location active et historique restent distinguées');
select is((select count(distinct item->>'unitLabel') from jsonb_array_elements(public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a')->'leases') item), 2::bigint, 'plusieurs logements autorisés restent distincts');
select is((select status from public.list_tenant_portal_dues('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a') where due_id = '7e000000-0000-4000-8000-00000000000a'), 'partially_paid', 'paiement partiel est projeté sans recalcul client');
select is((select count(*) from public.list_tenant_portal_dues('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a') where kind = 'deposit'), 1::bigint, 'dépôt de garantie reste une ligne distincte');
select is((select count(*) from (
  select document_type from public.list_tenant_portal_documents('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000a')
  union all
  select document_type from public.list_tenant_portal_documents('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000d')
) documents where document_type in ('payment_receipt', 'rent_receipt', 'due_notice')), 3::bigint, 'reçu partiel, quittance soldée et avis restent accessibles');
select ok(private.can_portal_read_financial_document_path('2e000000-0000-4000-8000-00000000000a/de000000-0000-4000-8000-00000000000d/v1.pdf'), 'chemin privé autorisé peut recevoir une URL signée courte');
select ok(not private.can_portal_read_financial_document_path('2e000000-0000-4000-8000-00000000000b/de000000-0000-4000-8000-00000000000d/v1.pdf'), 'chemin d’une autre Organization reste refusé');
select is((select count(*) from storage.objects where bucket_id = 'financial-documents'), 1::bigint, 'le portail voit uniquement son objet privé autorisé');
select throws_ok($$ select * from public.list_tenant_portal_dues('ae000000-0000-4000-8000-00000000000a', '6e000000-0000-4000-8000-00000000000b') $$, '42501', 'not_found', 'Tenant A ne lit pas le Lease B');
select throws_ok($$ select public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000b') $$, '42501', 'not_found', 'Tenant A ne traverse pas Organization B');
select is((select count(*) from public.get_tenant_portal_document('ae000000-0000-4000-8000-00000000000a', 'de000000-0000-4000-8000-00000000000b')), 0::bigint, 'UUID document inexistant ne révèle rien');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000008', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000008","role":"authenticated","session_id":"session-none-6e"}', true);
select is((select count(*) from public.list_my_tenant_portal_accesses()), 0::bigint, 'user Auth sans PortalAccess ne voit rien');
select throws_ok($$ select public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a') $$, '42501', 'not_found', 'user Auth sans PortalAccess est refusé');
reset role;
set local role anon;
select throws_ok($$ select public.get_tenant_portal_home('ae000000-0000-4000-8000-00000000000a') $$, '42501', null, 'anon est refusé');
reset role;

create temporary table pg_temp.portal_invite (access_id uuid, invitation_id uuid, invitation_email text, invitation_language text, invitation_token text, expires_at timestamptz) on commit drop;
grant select, insert, delete on pg_temp.portal_invite to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
insert into pg_temp.portal_invite select * from public.create_tenant_portal_invitation('5e000000-0000-4000-8000-00000000000c', array['6e000000-0000-4000-8000-00000000000c']::uuid[]);
select is((select count(*) from pg_temp.portal_invite), 1::bigint, 'Owner crée une invitation explicite');
select is((select status from public.get_tenant_portal_access_status('5e000000-0000-4000-8000-00000000000c')), 'invited', 'accès reste invited avant acceptation');
reset role;
select ok((select i.token_hash = encode(extensions.digest(convert_to(p.invitation_token, 'utf8'), 'sha256'), 'hex') and i.token_hash <> p.invitation_token from public.tenant_portal_invitations i join pg_temp.portal_invite p on p.invitation_id = i.id), 'seul le hash SHA-256 du jeton est conservé');
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-a2"}', true);
select is((select count(*) from public.inspect_tenant_portal_invitation((select invitation_token from pg_temp.portal_invite limit 1))), 1::bigint, 'ouverture authentifiée de l’invitation est reconnue');
select is((select count(*) from public.list_my_tenant_portal_accesses()), 0::bigint, 'identité invitée non acceptée reste refusée');
reset role;
select ok(not exists (select 1 from private.tenant_portal_access_log l, pg_temp.portal_invite p where l.details::text like '%' || p.invitation_token || '%'), 'aucun jeton brut n’entre dans le journal d’accès');
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-a2"}', true);
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select * from public.create_tenant_portal_invitation('5e000000-0000-4000-8000-00000000000c', array['6e000000-0000-4000-8000-00000000000c']::uuid[]) $$, '42501', 'forbidden', 'Viewer ne gère pas le portail');
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000004', true);
select throws_ok($$ select * from public.create_tenant_portal_invitation('5e000000-0000-4000-8000-00000000000c', array['6e000000-0000-4000-8000-00000000000c']::uuid[]) $$, '42501', 'forbidden', 'Owner B ne gère pas le Tenant A');
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a"}', true);
select throws_ok($$ select public.accept_tenant_portal_invitation((select invitation_token from pg_temp.portal_invite limit 1)) $$, '42501', 'invalid_invitation', 'mauvaise identité email refusée');
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-a2"}', true);
select ok(public.accept_tenant_portal_invitation((select invitation_token from pg_temp.portal_invite limit 1)) is not null, 'identité vérifiée accepte une fois');
select is((select count(*) from public.memberships where user_id = '1e000000-0000-4000-8000-000000000006'), 0::bigint, 'acceptation ne crée aucun Membership');
select throws_ok($$ select public.accept_tenant_portal_invitation((select invitation_token from pg_temp.portal_invite limit 1)) $$, '22023', 'invitation_already_used', 'jeton réutilisé refusé');
select is((select count(*) from public.list_my_tenant_portal_accesses()), 1::bigint, 'nouveau portail actif accessible');
select is((public.get_tenant_portal_home((select access_id from pg_temp.portal_invite limit 1))->>'availableCreditXaf')::bigint, 5000::bigint, 'crédit disponible provient de la projection financière existante');
select ok(not private.has_capability('2e000000-0000-4000-8000-00000000000a', 'property.view'), 'identité portail active ne reçoit aucune capability interne');

select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.revoke_tenant_portal_access((select access_id from pg_temp.portal_invite limit 1)) $$, 'Owner révoque immédiatement accès et session');
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-a2"}', true);
select is((select count(*) from public.list_my_tenant_portal_accesses()), 0::bigint, 'révocation prend effet pendant la session');
select throws_ok($$ select * from public.list_my_tenant_portal_notifications((select access_id from pg_temp.portal_invite limit 1)) $$, '42501', 'not_found', 'révocation invalide immédiatement les notifications et le PIN local ne peut pas la contourner');

delete from pg_temp.portal_invite;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
insert into pg_temp.portal_invite select * from public.create_tenant_portal_invitation('5e000000-0000-4000-8000-00000000000c', array['6e000000-0000-4000-8000-00000000000c']::uuid[]);
select is((select status from public.get_tenant_portal_access_status('5e000000-0000-4000-8000-00000000000c')), 'invited', 'nouvel envoi réactive explicitement accès révoqué');
reset role;
select is((select count(*) from public.administrative_audit_log where action = 'tenant_portal.reactivated'), 1::bigint, 'réactivation tracée dans audit existant');
update public.tenant_portal_invitations set expires_at = now() - interval '1 minute' where id = (select invitation_id from pg_temp.portal_invite limit 1);
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-a2-new"}', true);
select is(public.accept_tenant_portal_invitation((select invitation_token from pg_temp.portal_invite limit 1)), null::uuid, 'invitation expirée ne crée aucun accès');
reset role;
select is((select status from public.tenant_portal_invitations where id = (select invitation_id from pg_temp.portal_invite limit 1)), 'expired', 'expiration est persistée');

update public.tenant_portal_accesses set user_id = '1e000000-0000-4000-8000-000000000005'
  where id = 'ae000000-0000-4000-8000-00000000000b';
update public.tenant_portal_sessions set user_id = '1e000000-0000-4000-8000-000000000005',
  auth_session_id = 'session-portal-a', expires_at = now() - interval '1 minute'
  where access_id = 'ae000000-0000-4000-8000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a"}', true);
select is(public.start_tenant_portal_session(), 1, 'un accès valide ne masque pas un second accès expiré dans la boucle multi-Organization');
reset role;

update public.tenant_portal_sessions set expires_at = now() - interval '1 minute' where access_id = 'ae000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"1e000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a"}', true);
select is(public.start_tenant_portal_session(), 0, 'même session Auth ne renouvelle pas une session portail expirée');
select is((select count(*) from public.list_my_tenant_portal_accesses()), 0::bigint, 'session portail expirée reste refusée');
reset role;
select ok((select count(*) from private.tenant_portal_access_log where event_type = 'session_expired' and outcome = 'refused') >= 1, 'expiration de session est journalisée sans secret');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6E pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6e_tenant_portal_ok' as result;
rollback;
