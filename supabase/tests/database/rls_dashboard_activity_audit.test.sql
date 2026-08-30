begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('1d000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6d@kjora.test', now(), now(), now()),
  ('1d000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-a-6d@kjora.test', now(), now(), now()),
  ('1d000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'caretaker-a-6d@kjora.test', now(), now(), now()),
  ('1d000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'owner-b-6d@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('2d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000001'),
  ('2d000000-0000-4000-8000-00000000000b', '1d000000-0000-4000-8000-000000000004');
insert into public.organization_profiles (organization_id, name) values
  ('2d000000-0000-4000-8000-00000000000a', 'Org A Lot 6D'),
  ('2d000000-0000-4000-8000-00000000000b', 'Org B Lot 6D');
insert into public.memberships (organization_id, user_id, role) values
  ('2d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('2d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000002', 'manager'),
  ('2d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000003', 'caretaker'),
  ('2d000000-0000-4000-8000-00000000000b', '1d000000-0000-4000-8000-000000000004', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('3d000000-0000-4000-8000-00000000000a', '2d000000-0000-4000-8000-00000000000a', 'Immeuble A 6D', 'Douala', 'building', '1d000000-0000-4000-8000-000000000001'),
  ('3d000000-0000-4000-8000-00000000000b', '2d000000-0000-4000-8000-00000000000b', 'Immeuble B 6D', 'Yaoundé', 'building', '1d000000-0000-4000-8000-000000000004');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('4d000000-0000-4000-8000-00000000000a', '2d000000-0000-4000-8000-00000000000a', '3d000000-0000-4000-8000-00000000000a', 'A1', 'apartment', '1d000000-0000-4000-8000-000000000001');

insert into private.domain_events (organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload) values
  ('2d000000-0000-4000-8000-00000000000a', 'PAYMENT_REVERSED', 'payment', '5d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000001', '{"reference":"PAY-6D","reason":"Correction contrôlée"}'::jsonb),
  ('2d000000-0000-4000-8000-00000000000a', 'DOCUMENT_INVALIDATED', 'financial_document', '6d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000001', '{"reference":"REC-6D","reason":"Payment extourné"}'::jsonb);

insert into public.notifications (
  organization_id, recipient_user_id, required_capability, notification_type,
  deduplication_key, title_code, payload
) values
  ('2d000000-0000-4000-8000-00000000000a', '1d000000-0000-4000-8000-000000000001', 'receipt.view', 'payment_receipt_ready', 'lot6d-owner-a-notification', 'payment_receipt_ready', '{}'::jsonb),
  ('2d000000-0000-4000-8000-00000000000b', '1d000000-0000-4000-8000-000000000004', 'receipt.view', 'payment_receipt_ready', 'lot6d-owner-b-notification', 'payment_receipt_ready', '{}'::jsonb);

select has_function('public', 'get_operational_dashboard', array['uuid', 'date', 'date'], 'RPC dashboard existe');
select has_function('public', 'list_organization_activity', array['uuid', 'timestamp with time zone', 'uuid', 'integer'], 'RPC activité existe');
select has_function('public', 'mark_all_notifications_read', array['uuid'], 'RPC lecture globale existe');
select has_function('public', 'set_notification_read_state', array['uuid', 'boolean'], 'RPC lu/non lu existe');
select has_function('public', 'list_operational_audit', array['uuid', 'timestamp with time zone', 'uuid', 'text', 'uuid', 'date', 'date', 'integer'], 'RPC audit existe');
select has_function('public', 'get_operational_health', array['uuid'], 'RPC santé existe');
select has_trigger('private', 'domain_events', 'domain_events_audit_sensitive_actions', 'trigger audit sensible existe');
select is((select count(*) from public.administrative_audit_log where action = 'payment.reversed'), 1::bigint, 'reversal auditée une fois');
select is((select count(*) from public.administrative_audit_log where action = 'document.invalidated'), 1::bigint, 'invalidation auditée une fois');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000001', true);
select ok((public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000a', current_date, current_date)->>'finance_available')::boolean, 'Owner A reçoit sa finance');
select is((public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000a', current_date, current_date)->>'unit_count')::integer, 1, 'Owner A reçoit ses unités');
select throws_ok($$ select public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000b', current_date, current_date) $$, '42501', 'forbidden', 'Owner A ne lit pas dashboard B');
select is((select count(*) from public.list_organization_activity('2d000000-0000-4000-8000-00000000000a')), 3::bigint, 'Owner A voit son activité autorisée');
select throws_ok($$ select * from public.list_organization_activity('2d000000-0000-4000-8000-00000000000b') $$, '42501', 'forbidden', 'Owner A ne lit pas activité B');
select is(public.mark_all_notifications_read('2d000000-0000-4000-8000-00000000000a'), 1, 'Owner A marque ses notifications');
select is(public.set_notification_read_state((select id from public.notifications where organization_id = '2d000000-0000-4000-8000-00000000000a'), false), (select id from public.notifications where organization_id = '2d000000-0000-4000-8000-00000000000a'), 'Owner A remet sa notification en non lue');
select is((select count(*) from public.notifications where organization_id = '2d000000-0000-4000-8000-00000000000b' and read_at is not null), 0::bigint, 'notification B reste intacte');
select is((select count(*) from public.list_operational_audit('2d000000-0000-4000-8000-00000000000a')), 2::bigint, 'Owner voit audit sensible');
select lives_ok($$ select public.get_operational_health('2d000000-0000-4000-8000-00000000000a') $$, 'Owner voit santé opérationnelle');

select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000002', true);
select ok((public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000a', current_date, current_date)->>'finance_available')::boolean, 'Gestionnaire voit finance');
select throws_ok($$ select * from public.list_operational_audit('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'forbidden', 'Gestionnaire ne voit pas audit Owner');
select throws_ok($$ select public.get_operational_health('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'forbidden', 'Gestionnaire ne voit pas santé Owner');

select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000003', true);
select ok(not (public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000a', current_date, current_date)->>'finance_available')::boolean, 'Gardien ne reçoit aucun KPI financier');
select is((select count(*) from public.list_organization_activity('2d000000-0000-4000-8000-00000000000a') where event_type like 'PAYMENT%'), 0::bigint, 'Gardien ne voit aucun événement Payment');
select is((select count(*) from public.list_organization_activity('2d000000-0000-4000-8000-00000000000a') where event_type = 'PROPERTY_CREATED'), 1::bigint, 'Gardien voit activité Property autorisée');
select throws_ok($$ select public.mark_all_notifications_read('2d000000-0000-4000-8000-00000000000b') $$, '42501', 'forbidden', 'Gardien ne traverse pas Org B');
select throws_ok($$ update public.administrative_audit_log set details = '{}'::jsonb where organization_id = '2d000000-0000-4000-8000-00000000000a' $$, '42501', null, 'audit immuable pour authenticated');
reset role;

set local role anon;
select throws_ok($$ select public.get_operational_dashboard('2d000000-0000-4000-8000-00000000000a', current_date, current_date) $$, '42501', 'permission denied for function get_operational_dashboard', 'anon exclu du dashboard');
select throws_ok($$ select * from public.list_organization_activity('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'permission denied for function list_organization_activity', 'anon exclu activité');
select throws_ok($$ select public.mark_all_notifications_read('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'permission denied for function mark_all_notifications_read', 'anon exclu notifications');
select throws_ok($$ select * from public.list_operational_audit('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'permission denied for function list_operational_audit', 'anon exclu audit');
select throws_ok($$ select public.get_operational_health('2d000000-0000-4000-8000-00000000000a') $$, '42501', 'permission denied for function get_operational_health', 'anon exclu santé');
reset role;

select is((select count(*) from public.message_deliveries), 0::bigint, 'aucun email créé par 6D');
select is((select count(*) from public.notifications where organization_id = '2d000000-0000-4000-8000-00000000000a'), 1::bigint, 'aucune notification parallèle créée');
select ok((select bool_and(read_at is null) from public.notifications where organization_id = '2d000000-0000-4000-8000-00000000000b'), 'Org B demeure isolée');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6D pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6d_dashboard_activity_audit_ok' as result;
rollback;
