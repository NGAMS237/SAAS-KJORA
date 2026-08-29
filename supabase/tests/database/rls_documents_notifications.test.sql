begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('19000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6c3@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-a-6c3@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'accountant-a-6c3@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'caretaker-a-6c3@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'viewer-a-6c3@kjora.test', now(), now(), now()),
  ('19000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'owner-b-6c3@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001'),
  ('29000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-000000000006');
insert into public.organization_profiles (organization_id, name) values
  ('29000000-0000-4000-8000-00000000000a', 'Org A Lot 6C3'),
  ('29000000-0000-4000-8000-00000000000b', 'Org B Lot 6C3');
insert into public.memberships (organization_id, user_id, role) values
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000002', 'manager'),
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000003', 'accountant'),
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000004', 'caretaker'),
  ('29000000-0000-4000-8000-00000000000a', '19000000-0000-4000-8000-000000000005', 'viewer'),
  ('29000000-0000-4000-8000-00000000000b', '19000000-0000-4000-8000-000000000006', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('39000000-0000-4000-8000-00000000000a', '29000000-0000-4000-8000-00000000000a', 'Immeuble A 6C3', 'Douala', 'building', '19000000-0000-4000-8000-000000000001'),
  ('39000000-0000-4000-8000-00000000000b', '29000000-0000-4000-8000-00000000000b', 'Immeuble B 6C3', 'Yaoundé', 'building', '19000000-0000-4000-8000-000000000006');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('49000000-0000-4000-8000-00000000000a', '29000000-0000-4000-8000-00000000000a', '39000000-0000-4000-8000-00000000000a', 'A1', 'apartment', '19000000-0000-4000-8000-000000000001'),
  ('49000000-0000-4000-8000-00000000000b', '29000000-0000-4000-8000-00000000000b', '39000000-0000-4000-8000-00000000000b', 'B1', 'studio', '19000000-0000-4000-8000-000000000006');
insert into public.tenants (id, organization_id, full_name, phone, email, preferred_language, created_by) values
  ('59000000-0000-4000-8000-00000000000a', '29000000-0000-4000-8000-00000000000a', 'Locataire Documents A', '+237699300001', 'tenant-a-6c3@kjora.test', 'fr', '19000000-0000-4000-8000-000000000001'),
  ('59000000-0000-4000-8000-00000000000b', '29000000-0000-4000-8000-00000000000b', 'Locataire Documents B', '+237699300002', 'tenant-b-6c3@kjora.test', 'en', '19000000-0000-4000-8000-000000000006');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, billing_frequency, due_day, generate_due_days_before, created_by
) values
  ('69000000-0000-4000-8000-00000000000a', '29000000-0000-4000-8000-00000000000a', '39000000-0000-4000-8000-00000000000a', '49000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a', 'active', current_date - 40, 40000, 2000, 'monthly', 5, 5, '19000000-0000-4000-8000-000000000001'),
  ('69000000-0000-4000-8000-00000000000b', '29000000-0000-4000-8000-00000000000b', '39000000-0000-4000-8000-00000000000b', '49000000-0000-4000-8000-00000000000b', '59000000-0000-4000-8000-00000000000b', 'active', current_date - 40, 50000, 0, 'monthly', 5, 5, '19000000-0000-4000-8000-000000000006');

insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference, period_start,
  period_end, due_date, notice_date, rent_amount_xaf, recurring_charges_amount_xaf, created_by
) values
  ('79000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-00000000000a', '69000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a', 'periodic', '6c3:paid:period', 'DUE-6C3-PAID', current_date - 30, current_date - 1, current_date, current_date - 5, 40000, 2000, '19000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-00000000000a', '69000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a', 'periodic', '6c3:notice:period', 'DUE-6C3-NOTICE', current_date + 1, current_date + 30, current_date + 5, current_date, 40000, 2000, '19000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-00000000000a', '69000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a', 'periodic', '6c3:overdue:period', 'DUE-6C3-LATE', current_date - 40, current_date - 11, current_date - 10, current_date - 15, 40000, 2000, '19000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-00000000000a', '69000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a', 'periodic', '6c3:oldest:period', 'DUE-6C3-OLDEST', current_date - 70, current_date - 41, current_date - 20, current_date - 25, 40000, 2000, '19000000-0000-4000-8000-000000000001');

select has_table('public', 'financial_documents', 'FinancialDocument existe');
select has_table('public', 'financial_document_payments', 'liaison Document-Payment existe');
select has_table('public', 'message_deliveries', 'journal de livraison existe');
select has_table('public', 'notifications', 'notifications internes existent');
select has_table('public', 'organization_communication_settings', 'réglages email sûrs existent');
select ok((select not public from storage.buckets where id = 'financial-documents'), 'bucket financier privé');
select has_function('public', 'prepare_account_statement', array['uuid', 'date', 'date'], 'RPC état de compte existe');
select has_function('public', 'prepare_payment_receipt', array['uuid'], 'RPC reçu Payment immédiat existe');
select has_function('private', 'run_financial_daily', array['date'], 'job financier unique existe');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.confirm_payment(
  '69000000-0000-4000-8000-00000000000a', 42000, current_date, 'cash', null, '6C3 réel',
  '6c3-payment-000000000001', null
);
reset role;

select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a'), 0::bigint, 'Payment reste indépendant avant traitement outbox');
select lives_ok($$ select private.process_financial_document_events(100) $$, 'processeur événementiel fonctionne');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a' and document_type = 'payment_receipt'), 1::bigint, 'un reçu Payment préparé');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a' and document_type = 'rent_receipt'), 1::bigint, 'une quittance préparée pour période soldée');
select is((select count(*) from public.financial_document_payments where organization_id = '29000000-0000-4000-8000-00000000000a'), 2::bigint, 'les deux documents référencent le Payment réel');
select ok((select count(*) from public.notifications where notification_type in ('payment_receipt_ready', 'rent_receipt_ready')) >= 2, 'notifications internes créées');
select is((select count(*) from public.message_deliveries), 0::bigint, 'aucun email sans activation');
select is(private.process_financial_document_events(100), 0, 'rejeu événementiel idempotent');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a'), 2::bigint, 'rejeu ne duplique aucun document');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.confirm_payment(
  '69000000-0000-4000-8000-00000000000a', 10000, current_date, 'cash', null, '6C3 partiel',
  '6c3-payment-000000000002',
  jsonb_build_array(jsonb_build_object('due_id', '79000000-0000-4000-8000-000000000001', 'amount_xaf', 10000))
);
select ok(public.prepare_payment_receipt((select id from public.payments where idempotency_key = '6c3-payment-000000000002')) is not null,
  'Owner prépare immédiatement le reçu du Payment partiel');
reset role;
select lives_ok($$ select private.process_financial_document_events(100) $$, 'Payment partiel traité');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a' and document_type = 'payment_receipt'), 2::bigint, 'le Payment partiel produit son reçu');
select is((select count(*) from public.financial_documents d where d.document_type = 'payment_receipt'
  and d.payment_id = (select id from public.payments where idempotency_key = '6c3-payment-000000000002')), 1::bigint,
  'double traitement conserve un reçu unique par Payment');
select is((select (snapshot->>'amount_xaf')::bigint from public.financial_documents
  where payment_id = (select id from public.payments where idempotency_key = '6c3-payment-000000000002')
    and document_type = 'payment_receipt'), 10000::bigint, 'le reçu certifie exactement le Payment partiel reçu');
select is((select (snapshot->>'linked_due_total_xaf')::bigint - (snapshot->>'credit_applied_xaf')::bigint
    - (snapshot->>'allocated_xaf')::bigint - (snapshot->>'linked_due_remaining_xaf')::bigint
  from public.financial_documents
  where payment_id = (select id from public.payments where idempotency_key = '6c3-payment-000000000002')
    and document_type = 'payment_receipt'), 0::bigint, 'la ventilation snapshot se réconcilie exactement');
select is((select count(*) from public.financial_documents where document_type = 'rent_receipt' and due_id = '79000000-0000-4000-8000-000000000001'), 0::bigint, 'aucune quittance pour une période partielle');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.confirm_payment(
  '69000000-0000-4000-8000-00000000000a', 32000, current_date, 'bank_transfer', 'VIR-6C3', '6C3 complément',
  '6c3-payment-000000000003',
  jsonb_build_array(jsonb_build_object('due_id', '79000000-0000-4000-8000-000000000001', 'amount_xaf', 32000))
);
reset role;
select lives_ok($$ select private.process_financial_document_events(100) $$, 'complément de règlement traité');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a' and document_type = 'payment_receipt'), 3::bigint, 'chaque Payment réel conserve son reçu');
select is((select count(*) from public.financial_documents where document_type = 'rent_receipt' and due_id = '79000000-0000-4000-8000-000000000001'), 1::bigint, 'quittance créée seulement après solde complet');
select is((select count(*) from public.financial_document_payments dp join public.financial_documents d on d.id = dp.document_id where d.document_type = 'rent_receipt' and d.due_id = '79000000-0000-4000-8000-000000000001'), 2::bigint, 'quittance multi-Payments référence les deux encaissements');
create temporary table pg_temp.document_ids (id uuid) on commit drop;
insert into pg_temp.document_ids
select id from public.financial_documents
where organization_id = '29000000-0000-4000-8000-00000000000a'
order by created_at, id limit 1;
grant select on pg_temp.document_ids to authenticated;
insert into storage.objects (bucket_id, name, metadata)
select 'financial-documents', '29000000-0000-4000-8000-00000000000a/' || id::text || '/v1.pdf',
  '{"mimetype":"application/pdf"}'::jsonb
from pg_temp.document_ids limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.prepare_account_statement('59000000-0000-4000-8000-00000000000a', null, null) $$, 'état de compte préparé');
select is((select count(*) from public.financial_documents where document_type = 'account_statement'), 1::bigint, 'un état de compte Ledger');
select lives_ok($$ select public.prepare_account_statement('59000000-0000-4000-8000-00000000000a', null, null) $$, 'double clic état de compte idempotent');
select is((select count(*) from public.financial_documents where document_type = 'account_statement'), 1::bigint, 'double clic ne duplique pas état de compte');
select throws_ok($$ select public.prepare_account_statement('59000000-0000-4000-8000-00000000000a', current_date, current_date - 1) $$, '22023', 'invalid_statement_period', 'période inversée refusée');
reset role;
select throws_ok($$ update public.financial_documents set snapshot = '{}'::jsonb where organization_id = '29000000-0000-4000-8000-00000000000a' $$, '23514', 'financial_document_history_is_immutable', 'snapshot documentaire immuable');

select lives_ok($$ select * from private.prepare_financial_communications(current_date) $$, 'J-X prépare avis et rappel');
select is((select count(*) from public.financial_documents where due_id = '79000000-0000-4000-8000-000000000002' and document_type = 'due_notice'), 1::bigint, 'avis créé exactement à J-X');
select lives_ok($$ select * from private.prepare_financial_communications(current_date) $$, 'rejeu J-X sûr');
select is((select count(*) from public.financial_documents where due_id = '79000000-0000-4000-8000-000000000002' and document_type = 'due_notice'), 1::bigint, 'avis J-X non dupliqué');
select is((select count(*) from public.financial_documents where due_id = '79000000-0000-4000-8000-000000000002' and issued_on = current_date + 1), 0::bigint, 'aucun backfill à une autre date');
select ok((select count(*) from public.notifications where notification_type = 'payment_overdue' and payload->>'reminder_date' = current_date::text) > 0, 'rappel J+10 interne créé');
select is((select count(*) from public.message_deliveries), 0::bigint, 'J-X/J+10 sans email implicite');
insert into public.organization_communication_settings (organization_id, due_notice_email_enabled, overdue_reminder_email_enabled)
values ('29000000-0000-4000-8000-00000000000a', true, true);
select is((select count(*) from public.message_deliveries), 0::bigint, 'activation réglage ne provoque aucune vague rétroactive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select ok((select count(*) from public.financial_documents) >= 3, 'Owner A voit ses documents');
select ok((select count(*) from public.notifications) > 0, 'Owner A voit ses notifications');
select is((select count(*) from storage.objects where bucket_id = 'financial-documents'), 1::bigint, 'Owner A voit le chemin Storage autorisé');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000003', true);
select ok((select count(*) from public.financial_documents where document_type in ('payment_receipt', 'rent_receipt')) > 0, 'Comptable voit reçus et quittances');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.financial_documents), 0::bigint, 'Gardien ne voit aucun document financier');
select is((select count(*) from storage.objects where bucket_id = 'financial-documents'), 0::bigint, 'Gardien ne voit aucun objet financier');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('financial-documents', '29000000-0000-4000-8000-00000000000a/00000000-0000-4000-8000-000000000000/v1.pdf') $$, '42501', null, 'Gardien ne peut pas injecter un chemin direct');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.financial_documents), 0::bigint, 'Consultation ne voit aucun document financier');
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000006', true);
select throws_ok($$ select public.prepare_payment_receipt((select id from public.payments where idempotency_key = '6c3-payment-000000000002')) $$,
  '42501', 'forbidden', 'Owner B ne prépare pas le reçu Payment de Org A par UUID direct');
select is((select count(*) from public.financial_documents where organization_id = '29000000-0000-4000-8000-00000000000a'), 0::bigint, 'Owner B ne traverse pas Org A');
select is((select count(*) from public.financial_documents where id = (select id from pg_temp.document_ids limit 1)), 0::bigint, 'UUID direct Org A invisible à Owner B');
select is((select count(*) from storage.objects where bucket_id = 'financial-documents'), 0::bigint, 'Owner B ne traverse pas le chemin Storage Org A');
reset role;
set local role anon;
select throws_ok($$ select public.prepare_payment_receipt('89000000-0000-4000-8000-000000000001') $$,
  '42501', 'permission denied for function prepare_payment_receipt', 'anon ne peut pas appeler le RPC reçu');
select throws_ok($$ select count(*) from public.financial_documents $$, '42501', null, 'portail anon sans accès avant 6E');
select is((select count(*) from storage.objects where bucket_id = 'financial-documents'), 0::bigint, 'anon ne voit aucun objet financier');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select * from public.reverse_payment((select id from public.payments where idempotency_key = '6c3-payment-000000000001'), 'Correction 6C3') $$, 'annulation Payment reste compensatoire');
reset role;
select lives_ok($$ select private.process_financial_document_events(100) $$, 'annulation traitée par outbox');
select is((select count(*) from public.financial_documents d join public.financial_document_payments dp on dp.document_id = d.id where dp.payment_id = (select id from public.payments where idempotency_key = '6c3-payment-000000000001') and d.status = 'invalidated'), 2::bigint, 'reçu et quittance invalidés');
select ok((select bool_and(snapshot <> '{}'::jsonb) from public.financial_documents where status = 'invalidated'), 'snapshots originaux conservés');
select is((select count(*) from public.financial_documents d join public.financial_document_payments dp on dp.document_id = d.id where dp.payment_id = (select id from public.payments where idempotency_key = '6c3-payment-000000000001')), 2::bigint, 'aucun original supprimé');
select is((select count(*) from private.domain_events where event_type = 'DOCUMENT_INVALIDATED'), 2::bigint, 'invalidation auditée par document');
select is((select count(*) from public.payments where organization_id = '29000000-0000-4000-8000-00000000000a'), 3::bigint, '6C3 ne fabrique aucun Payment au-delà des trois appels de test');
select is((select count(*) from public.message_deliveries), 0::bigint, 'aucun envoi réel pendant toute la suite');
select is((select count(*)
  from private.financial_document_event_processing processing
  join private.domain_events event on event.id = processing.event_id
  where event.organization_id = '29000000-0000-4000-8000-00000000000a'), 4::bigint,
  'un traitement par événement Payment post-migration');
select ok((select count(*) from private.domain_events
  where organization_id = '29000000-0000-4000-8000-00000000000a'
    and event_type = 'PAYMENT_COMPLETED') = 3, 'les trois faits PAYMENT_COMPLETED test sont les seules sources Org A');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6C3 pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6c3_documents_notifications_ok' as result;
rollback;
