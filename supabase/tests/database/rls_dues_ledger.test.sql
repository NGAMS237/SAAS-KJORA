begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('17000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-6c1@kjora.test', now(), now(), now()),
  ('17000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b-6c1@kjora.test', now(), now(), now()),
  ('17000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'collector-a-6c1@kjora.test', now(), now(), now()),
  ('17000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'caretaker-a-6c1@kjora.test', now(), now(), now()),
  ('17000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'viewer-a-6c1@kjora.test', now(), now(), now()),
  ('17000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'none-6c1@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('27000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-00000000000b', '17000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('27000000-0000-4000-8000-00000000000a', 'Org A Lot 6C1'),
  ('27000000-0000-4000-8000-00000000000b', 'Org B Lot 6C1');
insert into public.memberships (organization_id, user_id, role) values
  ('27000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('27000000-0000-4000-8000-00000000000b', '17000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('27000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-000000000003', 'collector'),
  ('27000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-000000000004', 'caretaker'),
  ('27000000-0000-4000-8000-00000000000a', '17000000-0000-4000-8000-000000000005', 'viewer');

-- Ledger fixture needs six units; Decouverte's three-unit quota is unrelated
-- to this regression test. The transaction rolls this entitlement back.
update public.organization_plans set plan = 'avance'
 where organization_id = '27000000-0000-4000-8000-00000000000a';

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('37000000-0000-4000-8000-00000000000a', '27000000-0000-4000-8000-00000000000a', 'Immeuble A 6C1', 'Douala', 'building', '17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-00000000000b', '27000000-0000-4000-8000-00000000000b', 'Immeuble B 6C1', 'Yaoundé', 'building', '17000000-0000-4000-8000-000000000002');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Mensuel', 'apartment', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Trimestriel', 'apartment', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Semestriel', 'apartment', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Annuel', 'apartment', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Prorata', 'studio', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000006', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', 'Termes futurs', 'studio', '17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-00000000000b', '27000000-0000-4000-8000-00000000000b', '37000000-0000-4000-8000-00000000000b', 'B1', 'studio', '17000000-0000-4000-8000-000000000002');

insert into public.tenants (id, organization_id, full_name, phone, created_by) values
  ('57000000-0000-4000-8000-00000000000a', '27000000-0000-4000-8000-00000000000a', 'Locataire Finance A', '+237699100001', '17000000-0000-4000-8000-000000000001'),
  ('57000000-0000-4000-8000-00000000000b', '27000000-0000-4000-8000-00000000000b', 'Locataire Finance B', '+237699100002', '17000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);

insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, initial_prepayment_amount_xaf,
  billing_frequency, due_day, generate_due_days_before, entry_proration_mode,
  exit_proration_mode, created_by
) values
  ('67000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-09-01', 40000, 2000, 40000, 90000, 'monthly', 5, 5, 'none', 'none', '17000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-09-01', 120000, 6000, 0, 0, 'quarterly', 5, 5, 'none', 'none', '17000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-09-01', 240000, 12000, 0, 0, 'semiannual', 5, 5, 'none', 'none', '17000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000004', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-09-01', 480000, 24000, 0, 0, 'annual', 5, 5, 'none', 'none', '17000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000005', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-03-20', 40000, 2000, 0, 0, 'monthly', 5, 5, 'calendar_days', 'calendar_days', '17000000-0000-4000-8000-000000000001'),
  ('67000000-0000-4000-8000-000000000006', '27000000-0000-4000-8000-00000000000a', '37000000-0000-4000-8000-00000000000a', '47000000-0000-4000-8000-000000000006', '57000000-0000-4000-8000-00000000000a', 'draft', '2026-09-01', 40000, 2000, 0, 0, 'monthly', 5, 5, 'none', 'calendar_days', '17000000-0000-4000-8000-000000000001');

update public.leases set status = 'active' where id between '67000000-0000-4000-8000-000000000001' and '67000000-0000-4000-8000-000000000006';

select is((select count(*) from public.lease_financial_terms), 6::bigint, 'activation ouvre une version financière par bail');
select is((select count(*) from public.ledger_entries where entry_type = 'opening_credit'), 1::bigint, 'un seul crédit d’ouverture documenté est créé');
select is((select credit_xaf from public.ledger_entries where entry_type = 'opening_credit'), 90000::bigint, 'crédit d’ouverture reprend le montant validé du Lease');
select is((select count(*) from public.ledger_entries where entry_type = 'deposit'), 1::bigint, 'dépôt reste une ligne Ledger séparée');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and kind = 'deposit'), 40000::bigint, 'dépôt n’entre pas dans le total périodique');
select is((select rent_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-09-01'), 40000::bigint, 'loyer mensuel reste ventilé');
select is((select recurring_charges_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-09-01'), 2000::bigint, 'charges mensuelles restent ventilées');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-09-01'), 42000::bigint, 'total mensuel vaut loyer plus charges');
select is((select due_date from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-09-01'), '2026-09-05'::date, 'jour limite exact');
select is((select notice_date from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-09-01'), '2026-08-31'::date, 'J-5 est calendaire');
select is((select count(*) from public.dues_with_status where lease_id = '67000000-0000-4000-8000-000000000001' and kind in ('periodic', 'initial_prorata') and derived_status = 'covered'), 2::bigint, '90 000 couvre exactement deux périodes complètes');
select is((select residual_opening_credit_xaf from public.tenant_financial_positions where tenant_id = '57000000-0000-4000-8000-00000000000a'), 0::bigint, '6C2 consomme le reliquat dès qu’il couvre partiellement la période suivante');
select is((select last_covered_period_end from public.tenant_financial_positions where tenant_id = '57000000-0000-4000-8000-00000000000a'), '2026-10-31'::date, 'dernière période prépayée est explicite');
select is((select next_uncovered_due_date from public.tenant_financial_positions where tenant_id = '57000000-0000-4000-8000-00000000000a'), '2026-03-20'::date, 'première échéance non couverte est calculée sur toute la vérité du locataire');
select is((select remaining_amount_xaf from public.dues_with_status where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-11-01'), 36000::bigint, 'crédit résiduel couvre partiellement la période suivante sans statut paid');

select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000002', '2026-08-31') $$, 'génération trimestrielle explicite réussit');
select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000003', '2026-08-31') $$, 'génération semestrielle explicite réussit');
select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000004', '2026-08-31') $$, 'génération annuelle explicite réussit');
select is((select period_end from public.dues where lease_id = '67000000-0000-4000-8000-000000000002'), '2026-11-30'::date, 'période trimestrielle correcte');
select is((select period_end from public.dues where lease_id = '67000000-0000-4000-8000-000000000003'), '2027-02-28'::date, 'période semestrielle correcte');
select is((select period_end from public.dues where lease_id = '67000000-0000-4000-8000-000000000004'), '2027-08-31'::date, 'période annuelle correcte');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000005' and generation_key = 'period:2026-03-01'), 16258::bigint, 'prorata entrée ventile et arrondit chaque composante');
select is((select calculation ->> 'occupied_days' from public.dues where lease_id = '67000000-0000-4000-8000-000000000005' and generation_key = 'period:2026-03-01'), '12', 'prorata conserve les jours occupés');

select lives_ok($$ select public.schedule_lease_financial_terms('67000000-0000-4000-8000-000000000006'::uuid, '2026-10-01'::date, 50000::bigint, 3000::bigint, 5::smallint, 5::smallint) $$, 'termes futurs sont ajoutés sans réécrire le Lease');
select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000006', '2026-10-31') $$, 'génération applique les termes effectifs');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'period:2026-09-01'), 42000::bigint, 'historique garde ancien loyer et anciennes charges');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'period:2026-10-01'), 53000::bigint, 'nouveaux loyer et charges affectent seulement le futur');
select lives_ok($$ update public.leases set status = 'ended', ended_on = '2026-10-12' where id = '67000000-0000-4000-8000-000000000006' $$, 'fin en cours de période crée une correction append-only');
select is((select expected_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'period:2026-10-01'), 53000::bigint, 'prorata sortie ne réécrit pas échéance originale');
select is((select adjustment_amount_xaf from public.dues where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'exit-adjustment:2026-10-01'), 32484::bigint, 'correction sortie explique la différence');
select is((select adjustment_direction from public.dues where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'exit-adjustment:2026-10-01'), 'credit', 'prorata sortie réduit la dette par crédit Ledger explicite');
select is((select net_expected_amount_xaf from public.dues_with_status where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'period:2026-10-01'), 20516::bigint, 'montant net terminal reproduit 53 000 × 12 / 31');
select is((select derived_status from public.dues_with_status where lease_id = '67000000-0000-4000-8000-000000000006' and generation_key = 'period:2026-11-01'), 'cancelled', 'période générée après la fin reste en historique mais est annulée');

select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000001', '2026-12-31') $$, 'première relance idempotente réussit');
select lives_ok($$ select public.generate_lease_dues('67000000-0000-4000-8000-000000000001', '2026-12-31') $$, 'seconde relance idempotente réussit');
select is((select count(*) from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' and generation_key = 'period:2026-12-01'), 1::bigint, 'relance ne duplique jamais une période');
select throws_ok($$ update public.ledger_entries set debit_xaf = 1 where lease_id = '67000000-0000-4000-8000-000000000001' $$, '42501', null, 'Ledger non modifiable par le client');
select throws_ok($$ insert into public.dues (organization_id, lease_id, tenant_id, kind, generation_key, reference, period_start, period_end, due_date, notice_date, rent_amount_xaf) values ('27000000-0000-4000-8000-00000000000a', '67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-00000000000a', 'periodic', 'manual:forbidden', 'BAD', current_date, current_date, current_date, current_date, 1) $$, '42501', null, 'échéance non insérable directement');

reset role;
create temporary table pg_temp.test_due_uuid (id uuid primary key) on commit drop;
insert into pg_temp.test_due_uuid select id from public.dues where lease_id = '67000000-0000-4000-8000-000000000001' limit 1;
grant select on pg_temp.test_due_uuid to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
select ok((select count(*) from public.dues) > 0, 'Encaisseur avec due.view lit les échéances');
select ok((select count(*) from public.ledger_statement) > 0, 'Encaisseur avec due.view lit le Ledger');

select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.dues), 0::bigint, 'Gardien ne voit aucune échéance financière');
select is((select count(*) from public.ledger_statement), 0::bigint, 'Gardien ne voit aucun Ledger');

select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.dues), 0::bigint, 'Consultation ne voit aucune échéance financière');

select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.dues where id = (select id from pg_temp.test_due_uuid)), 0::bigint, 'Owner B ne traverse pas Org A même par UUID direct');

select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.tenant_financial_positions), 0::bigint, 'non-membre ne voit aucune position locataire');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.dues $$, '42501', null, 'portail anon ne reçoit aucune donnée sans TenantPortalAccess 6E');
reset role;

select is((select count(*) from private.domain_events where event_type = 'LEASE_LEDGER_OPENED' and organization_id = '27000000-0000-4000-8000-00000000000a'), 6::bigint, 'un événement Ledger ouvert par bail');
select ok((select count(*) from private.domain_events where event_type = 'DUE_GENERATED' and organization_id = '27000000-0000-4000-8000-00000000000a') > 0, 'DUE_GENERATED est tenant-scoped');
select is((select count(*) from cron.job where jobname = 'kjora-generate-dues-daily'), 1::bigint, 'cron quotidien est unique');

do $$
declare diagnostics text;
begin
  select string_agg(result, E'\n') into diagnostics from extensions.finish() as result;
  if diagnostics is not null then raise exception 'Lot 6C1 pgTAP failures: %', diagnostics; end if;
end;
$$;
select 'lot_6c1_rls_ok' as result;
rollback;
