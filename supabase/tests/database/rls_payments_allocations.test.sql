begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('18000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'collector-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'accountant-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'caretaker-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'viewer-a-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'owner-b-6c2@kjora.test', now(), now(), now()),
  ('18000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'none-6c2@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000001'),
  ('28000000-0000-4000-8000-00000000000b', '18000000-0000-4000-8000-000000000007');
insert into public.organization_profiles (organization_id, name) values
  ('28000000-0000-4000-8000-00000000000a', 'Org A Lot 6C2'),
  ('28000000-0000-4000-8000-00000000000b', 'Org B Lot 6C2');
insert into public.memberships (organization_id, user_id, role) values
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000002', 'manager'),
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000003', 'collector'),
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000004', 'accountant'),
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000005', 'caretaker'),
  ('28000000-0000-4000-8000-00000000000a', '18000000-0000-4000-8000-000000000006', 'viewer'),
  ('28000000-0000-4000-8000-00000000000b', '18000000-0000-4000-8000-000000000007', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('38000000-0000-4000-8000-00000000000a', '28000000-0000-4000-8000-00000000000a', 'Immeuble A 6C2', 'Douala', 'building', '18000000-0000-4000-8000-000000000001'),
  ('38000000-0000-4000-8000-00000000000b', '28000000-0000-4000-8000-00000000000b', 'Immeuble B 6C2', 'Yaoundé', 'building', '18000000-0000-4000-8000-000000000007');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('48000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-00000000000a', '38000000-0000-4000-8000-00000000000a', 'A1', 'apartment', '18000000-0000-4000-8000-000000000001'),
  ('48000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-00000000000a', '38000000-0000-4000-8000-00000000000a', 'A2', 'apartment', '18000000-0000-4000-8000-000000000001'),
  ('48000000-0000-4000-8000-00000000000b', '28000000-0000-4000-8000-00000000000b', '38000000-0000-4000-8000-00000000000b', 'B1', 'studio', '18000000-0000-4000-8000-000000000007');
insert into public.tenants (id, organization_id, full_name, phone, created_by) values
  ('58000000-0000-4000-8000-00000000000a', '28000000-0000-4000-8000-00000000000a', 'Locataire Paiement A', '+237699200001', '18000000-0000-4000-8000-000000000001'),
  ('58000000-0000-4000-8000-00000000000b', '28000000-0000-4000-8000-00000000000b', 'Locataire Paiement B', '+237699200002', '18000000-0000-4000-8000-000000000007');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency,
  due_day, generate_due_days_before, created_by
) values
  ('68000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-00000000000a', '38000000-0000-4000-8000-00000000000a', '48000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'active', '2099-01-01', 40000, 2000, 0, 'monthly', 5, 5, '18000000-0000-4000-8000-000000000001'),
  ('68000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-00000000000a', '38000000-0000-4000-8000-00000000000a', '48000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-00000000000a', 'active', '2099-01-01', 40000, 2000, 0, 'monthly', 5, 5, '18000000-0000-4000-8000-000000000001'),
  ('68000000-0000-4000-8000-00000000000b', '28000000-0000-4000-8000-00000000000b', '38000000-0000-4000-8000-00000000000b', '48000000-0000-4000-8000-00000000000b', '58000000-0000-4000-8000-00000000000b', 'active', '2099-01-01', 50000, 0, 0, 'monthly', 5, 5, '18000000-0000-4000-8000-000000000007');

insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference,
  period_start, period_end, due_date, notice_date, rent_amount_xaf,
  recurring_charges_amount_xaf, deposit_amount_xaf, created_by
) values
  ('78000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:1', 'DUE-A1', '2026-06-01', '2026-06-30', current_date, current_date - 5, 40000, 2000, 0, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:2', 'DUE-A2', '2026-07-01', '2026-07-31', current_date, current_date - 5, 40000, 2000, 0, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000004', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'deposit', 'test:deposit:1', 'DEP-A1', '2026-06-01', '2026-06-01', '2026-06-01', '2026-06-01', 0, 0, 40000, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000005', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:other:1', 'DUE-A5', '2026-06-01', '2026-06-30', '2026-06-05', '2026-05-31', 40000, 2000, 0, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-00000000000b', '28000000-0000-4000-8000-00000000000b', '68000000-0000-4000-8000-00000000000b', '58000000-0000-4000-8000-00000000000b', 'periodic', 'test:period:b', 'DUE-B1', '2026-06-01', '2026-06-30', '2026-06-05', '2026-05-31', 50000, 0, 0, '18000000-0000-4000-8000-000000000007');

create temporary table pg_temp.payment_results (
  payment_id uuid, payment_reference text, allocated_amount_xaf bigint,
  credit_created_xaf bigint, balance_before_xaf bigint, balance_after_xaf bigint,
  payment_status text
) on commit drop;
grant all on pg_temp.payment_results to authenticated;

select has_table('public', 'payments', 'Payment existe');
select has_table('public', 'payment_allocations', 'PaymentAllocation existe');
select has_function('public', 'confirm_payment', array['uuid', 'bigint', 'date', 'text', 'text', 'text', 'text', 'jsonb'], 'confirmation atomique exposée');
select has_function('public', 'reverse_payment', array['uuid', 'text'], 'annulation compensatoire exposée');
set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select ok((select private.has_capability('28000000-0000-4000-8000-00000000000a', 'payment.correct')), 'Owner possède payment.correct');
insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000001', 20000, current_date, 'cash', null, 'Cas A',
  '6c2-case-a-000000000001', null
);
select is((select allocated_amount_xaf from pg_temp.payment_results order by payment_reference limit 1), 20000::bigint, 'A: 20 000 est alloué');
select is((select remaining_amount_xaf from public.dues_with_status where id = '78000000-0000-4000-8000-000000000001'), 22000::bigint, 'A: il reste 22 000');
select is((select derived_status from public.dues_with_status where id = '78000000-0000-4000-8000-000000000001'), 'partially_paid', 'A: échéance partiellement payée');

insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000001', 22000, current_date, 'mtn_momo', 'MOMO-A', 'Cas B',
  '6c2-case-b-000000000002', null
);
select is((select remaining_amount_xaf from public.dues_with_status where id = '78000000-0000-4000-8000-000000000001'), 0::bigint, 'B: les 22 000 restants soldent la première échéance');
select is((select derived_status from public.dues_with_status where id = '78000000-0000-4000-8000-000000000001'), 'paid', 'B: statut paid dérivé de vrais paiements');
select is((select count(*) from public.payments where lease_id = '68000000-0000-4000-8000-000000000001'), 2::bigint, 'B: deux Payments réels restent distincts');

insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000001', 50000, current_date, 'orange_money', 'OM-C', 'Cas C',
  '6c2-case-c-000000000003', null
);
select is((select allocated_amount_xaf from pg_temp.payment_results where credit_created_xaf = 8000), 42000::bigint, 'C: 42 000 est alloué');
select is((select credit_created_xaf from pg_temp.payment_results where credit_created_xaf = 8000), 8000::bigint, 'C: surplus de 8 000 créé');
select is((select available_credit_xaf from public.tenant_financial_positions where tenant_id = '58000000-0000-4000-8000-00000000000a'), 8000::bigint, 'C: crédit disponible vaut 8 000');

reset role;
insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference,
  period_start, period_end, due_date, notice_date, rent_amount_xaf, recurring_charges_amount_xaf, created_by
) values
  ('78000000-0000-4000-8000-000000000003', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:3', 'DUE-A3', '2026-08-01', '2026-08-31', '2026-08-05', '2026-07-31', 40000, 2000, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000006', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:4', 'DUE-A4', '2026-09-01', '2026-09-30', '2026-08-20', '2026-08-15', 40000, 2000, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000007', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:5', 'DUE-A5', '2026-10-01', '2026-10-31', '2026-08-25', '2026-08-20', 40000, 2000, '18000000-0000-4000-8000-000000000001'),
  ('78000000-0000-4000-8000-000000000008', '28000000-0000-4000-8000-00000000000a', '68000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-00000000000a', 'periodic', 'test:period:6', 'DUE-A6', '2026-11-01', '2026-11-30', '2026-09-25', '2026-09-20', 40000, 2000, '18000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select is((select covered_by_payment_credit_xaf from public.dues_with_status where id = '78000000-0000-4000-8000-000000000003'), 8000::bigint, 'crédit existant couvre la prochaine période');
select is((select remaining_amount_xaf from public.dues_with_status where id = '78000000-0000-4000-8000-000000000003'), 34000::bigint, 'crédit existant réduit le restant à 34 000');
insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000001', 100000, '2026-08-27', 'bank_transfer', 'VIR-D', 'Cas D',
  '6c2-case-d-000000000004', null
);
select is((select allocated_amount_xaf from pg_temp.payment_results where payment_reference = (select max(payment_reference) from pg_temp.payment_results)), 100000::bigint, 'D: 100 000 est réparti sur plusieurs échéances');
select is((select count(*) from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-case-d-000000000004'), 3::bigint, 'D: trois allocations explicites sont conservées');
select is((select a.amount_xaf from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-case-d-000000000004' order by a.created_at, a.due_id limit 1), 34000::bigint, 'D: la dette la plus ancienne reçoit d’abord 34 000');

insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000001', 15000, '2026-08-27', 'cash', null, 'Allocation manuelle dépôt et futur',
  '6c2-manual-000000000005', jsonb_build_array(
    jsonb_build_object('due_id', '78000000-0000-4000-8000-000000000004', 'amount_xaf', 10000),
    jsonb_build_object('due_id', '78000000-0000-4000-8000-000000000008', 'amount_xaf', 5000)
  )
);
select is((select sum(deposit_amount_xaf) from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-manual-000000000005'), 10000::numeric, 'allocation manuelle cible explicitement le dépôt');
select is((select sum(rent_amount_xaf + recurring_charges_amount_xaf) from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-manual-000000000005'), 5000::numeric, 'allocation manuelle peut cibler une période choisie');
select is((select sum(a.amount_xaf) from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-manual-000000000005'), 15000::numeric, 'E: reçu égale allocations');

insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000002', 1000, '2026-08-27', 'cash', null, 'Idempotence',
  '6c2-idempotent-000000006', null
);
insert into pg_temp.payment_results select * from public.confirm_payment(
  '68000000-0000-4000-8000-000000000002', 1000, '2026-08-27', 'cash', null, 'Idempotence',
  '6c2-idempotent-000000006', null
);
select is((select count(*) from public.payments where idempotency_key = '6c2-idempotent-000000006'), 1::bigint, 'double clic idempotent ne crée qu’un Payment');
select is((select count(distinct payment_id) from pg_temp.payment_results where payment_reference in (select reference from public.payments where idempotency_key = '6c2-idempotent-000000006')), 1::bigint, 'double clic retourne le même Payment');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 2000, '2026-08-27', 'cash', null, 'Conflit', '6c2-idempotent-000000006', null) $$, '23505', 'idempotency_key_conflict', 'même clé avec contenu différent est refusée');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 0, '2026-08-27', 'cash', null, null, '6c2-invalid-000000000007', null) $$, '22023', 'invalid_payment', 'montant nul refusé');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 1000, current_date + 1, 'cash', null, null, '6c2-future-000000000008', null) $$, '22023', 'invalid_payment', 'date future refusée');

select matches((select reference from public.payments order by created_at limit 1), '^PAY-[0-9]{4}-[0-9]{6,}$', 'référence interne unique et lisible');
reset role;
select is((select count(*) from private.domain_events where event_type = 'PAYMENT_COMPLETED' and organization_id = '28000000-0000-4000-8000-00000000000a'), (select count(*) from public.payments where organization_id = '28000000-0000-4000-8000-00000000000a'), 'un événement PAYMENT_COMPLETED par Payment');
select is((select count(*) from public.ledger_entries where entry_type = 'payment' and organization_id = '28000000-0000-4000-8000-00000000000a'), (select count(*) from public.payments where organization_id = '28000000-0000-4000-8000-00000000000a'), 'une écriture Ledger crédit par Payment');
select throws_ok($$ update public.payments set amount_xaf = 1 where organization_id = '28000000-0000-4000-8000-00000000000a' $$, '23514', 'payment_history_is_append_only', 'Payment confirmé est immuable');
select throws_ok($$ delete from public.payment_allocations where organization_id = '28000000-0000-4000-8000-00000000000a' $$, '23514', 'financial_history_is_append_only', 'PaymentAllocation est append-only');

set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000002', true);
insert into pg_temp.payment_results select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 1000, '2026-08-27', 'cash', null, 'Manager', '6c2-manager-000000000009', null);
select ok((select count(*) from public.payments) > 0, 'Gestionnaire enregistre et lit les Payments');
select throws_ok($$ select * from public.reverse_payment((select id from public.payments where idempotency_key = '6c2-manager-000000000009'), 'Correction manager interdite') $$, '42501', 'forbidden', 'Gestionnaire ne peut pas annuler directement');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000003', true);
insert into pg_temp.payment_results select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 1000, '2026-08-27', 'cash', null, 'Encaisseur', '6c2-collector-000000000010', null);
select ok((select count(*) from public.payment_allocations) > 0, 'Encaisseur enregistre et lit les allocations');
select throws_ok($$ select * from public.reverse_payment((select id from public.payments where idempotency_key = '6c2-collector-000000000010'), 'Correction encaisseur interdite') $$, '42501', 'forbidden', 'Encaisseur ne peut pas annuler directement');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000004', true);
select ok((select count(*) from public.payments) > 0, 'Comptable peut consulter les paiements');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000002', 1000, '2026-08-27', 'cash', null, null, '6c2-accountant-000000011', null) $$, '42501', 'forbidden', 'Comptable ne peut pas enregistrer');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.payments), 0::bigint, 'Gardien ne voit aucun Payment');
select is((select count(*) from public.payment_allocations), 0::bigint, 'Gardien ne voit aucune allocation');
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.payments), 0::bigint, 'Consultation ne voit aucun Payment');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000007', true);
select is((select count(*) from public.payments where organization_id = '28000000-0000-4000-8000-00000000000a'), 0::bigint, 'Owner B ne traverse pas Org A');
select is((select count(*) from public.payments where id = (select payment_id from pg_temp.payment_results limit 1)), 0::bigint, 'UUID direct Org A reste invisible à Owner B');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000001', 1000, '2026-08-27', 'cash', null, null, '6c2-cross-org-000000012', null) $$, '42501', 'forbidden', 'Owner B ne paie pas une Location Org A');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000008', true);
select is((select count(*) from public.payments), 0::bigint, 'non-membre ne voit aucun Payment');

select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select * from public.reverse_payment((select id from public.payments where idempotency_key = '6c2-case-a-000000000001'), 'Erreur de saisie confirmée') $$, 'Owner annule par compensation');
select is((select status from public.payments where idempotency_key = '6c2-case-a-000000000001'), 'reversed', 'original marqué reversed sans suppression');
select is((select count(*) from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.idempotency_key = '6c2-case-a-000000000001'), 1::bigint, 'allocation originale conservée après annulation');
select is((select count(*) from public.ledger_entries le join public.payments p on p.id = le.payment_id where p.idempotency_key = '6c2-case-a-000000000001' and le.entry_type = 'payment_reversal'), 1::bigint, 'écriture Ledger inverse créée');
reset role;
select is((select count(*) from private.domain_events e join public.payments p on p.id = e.aggregate_id where p.idempotency_key = '6c2-case-a-000000000001' and e.event_type = 'PAYMENT_REVERSED'), 1::bigint, 'événement PAYMENT_REVERSED créé');
set local role authenticated;
select set_config('request.jwt.claim.sub', '18000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select * from public.reverse_payment((select id from public.payments where idempotency_key = '6c2-case-a-000000000001'), 'Deuxième tentative') $$, '23514', 'payment_not_reversible', 'double annulation refusée');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.payments $$, '42501', null, 'portail anon ne voit aucun paiement avant 6E');
select throws_ok($$ select * from public.confirm_payment('68000000-0000-4000-8000-000000000001', 1000, current_date, 'cash', null, null, '6c2-anon-000000000013', null) $$, '42501', null, 'anon ne peut pas confirmer un paiement');
reset role;

select matches(pg_get_functiondef('public.confirm_payment(uuid,bigint,date,text,text,text,text,jsonb)'::regprocedure), 'pg_advisory_xact_lock', 'verrou par Location sérialise les confirmations concurrentes');
select is((select count(*) from pg_indexes where schemaname = 'public' and tablename = 'payments' and indexdef like '%idempotency_key%'), 1::bigint, 'contrainte indexée protège les doubles soumissions concurrentes');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6C2 pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6c2_rls_ok' as result;
rollback;
