-- =============================================================================
-- pgTAP — AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B (Modalités de paiement)
-- Couvre le correctif du bug vérifié : la clause « Modalités de paiement »
-- disparaissait TOUJOURS d'un contrat généré, quelle que soit la Location,
-- car `generate_lease_contract` filtrait la clause avec une condition
-- inconditionnellement fausse et alimentait le jeton avec une chaîne vide
-- littérale — aucune colonne réelle n'existait. Ce test vérifie que la
-- clause apparaît quand — et seulement quand — la Location porte de vraies
-- modalités saisies, et jamais une valeur fabriquée.
-- Transactionnel : aucun résidu en base (rollback final).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-acp01b@kjora.test', now(), now(), now());

insert into public.organizations(id, created_by) values
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000001');
insert into public.organization_profiles(organization_id, name, language) values
  ('e2100000-0000-4000-8000-00000000000a', 'Organization ACP01-B', 'fr');
insert into public.organization_plans(organization_id, plan, assigned_by) values
  ('e2100000-0000-4000-8000-00000000000a', 'avance', 'e2000000-0000-4000-8000-000000000001')
  on conflict (organization_id) do update set plan = excluded.plan, assigned_by = excluded.assigned_by, assigned_at = now();
insert into public.memberships(organization_id, user_id, role) values
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000001', 'organization_owner');
insert into public.properties(id, organization_id, name, locality, type, created_by) values
  ('e2200000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'Immeuble ACP01-B', 'Douala', 'building', 'e2000000-0000-4000-8000-000000000001');
insert into public.units(id, organization_id, property_id, label, type, created_by) values
  ('e2300000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'A1', 'apartment', 'e2000000-0000-4000-8000-000000000001'),
  ('e2300000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'A2', 'apartment', 'e2000000-0000-4000-8000-000000000001');
insert into public.tenants(id, organization_id, full_name, email, preferred_language, created_by) values
  ('e2400000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'Locataire ACP01-B', 'tenant-acp01b@kjora.test', 'fr', 'e2000000-0000-4000-8000-000000000001');

-- Lease A : aucune modalité de paiement saisie (cas historique — jamais fabriquer une valeur).
insert into public.leases(id, organization_id, property_id, unit_id, tenant_id, status, start_date, base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency, due_day, created_by) values
  ('e2500000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'e2300000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'draft', current_date, 80000, 0, 0, 'monthly', 5, 'e2000000-0000-4000-8000-000000000001');
-- Lease B : modalités réellement saisies par le bailleur.
insert into public.leases(id, organization_id, property_id, unit_id, tenant_id, status, start_date, base_rent_xaf, recurring_charges_xaf, security_deposit_xaf, billing_frequency, due_day, payment_terms, created_by) values
  ('e2500000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'e2300000-0000-4000-8000-00000000000b', 'e2400000-0000-4000-8000-00000000000a', 'draft', current_date, 80000, 0, 0, 'monthly', 5, 'Virement bancaire avant le 5 de chaque mois.', 'e2000000-0000-4000-8000-000000000001');
update public.leases set status = 'active' where id in ('e2500000-0000-4000-8000-00000000000a', 'e2500000-0000-4000-8000-00000000000b');

-- ---------------------------------------------------------------------------
-- 0. La colonne existe, est optionnelle, et respecte sa contrainte de forme.
-- ---------------------------------------------------------------------------
select has_column('public', 'leases', 'payment_terms', 'colonne payment_terms présente');
select col_type_is('public', 'leases', 'payment_terms', 'text', 'colonne de type text');
select col_is_null('public', 'leases', 'payment_terms', 'colonne optionnelle (nullable)');
select throws_ok(
  $$insert into public.leases(id, organization_id, property_id, unit_id, tenant_id, status, start_date, base_rent_xaf, billing_frequency, due_day, payment_terms, created_by) values ('e2500000-0000-4000-8000-00000000000c','e2100000-0000-4000-8000-00000000000a','e2200000-0000-4000-8000-00000000000a','e2300000-0000-4000-8000-00000000000a','e2400000-0000-4000-8000-00000000000a','draft',current_date,80000,'monthly',5,'ab','e2000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'un texte de moins de 3 caractères viole la contrainte de forme'
);

-- ---------------------------------------------------------------------------
-- 1. Grants applicatifs : authenticated peut écrire cette colonne (même
--    modèle de grants par colonne que le reste de leases).
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'public.leases', 'payment_terms', 'insert'), 'authenticated peut saisir payment_terms à la création');
select ok(has_column_privilege('authenticated', 'public.leases', 'payment_terms', 'update'), 'authenticated peut corriger payment_terms ensuite');

create temporary table pg_temp.template_ids(id uuid primary key) on commit drop;
insert into pg_temp.template_ids select id from public.contract_templates where is_system and language = 'fr';
grant select on pg_temp.template_ids to authenticated;
create temporary table pg_temp.contract_ids(label text primary key, id uuid) on commit drop;
grant select, insert on pg_temp.contract_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);

-- ---------------------------------------------------------------------------
-- 2. Lease A (sans modalités) : la clause reste absente — jamais fabriquée.
-- ---------------------------------------------------------------------------
insert into pg_temp.contract_ids values ('a', public.generate_lease_contract('e2500000-0000-4000-8000-00000000000a', (select id from pg_temp.template_ids)));
select ok((select id from pg_temp.contract_ids where label = 'a') is not null, 'contrat A généré');
select is(
  (select count(*) from jsonb_array_elements((select content_snapshot from public.get_lease_contract('e2100000-0000-4000-8000-00000000000a', (select id from pg_temp.contract_ids where label = 'a')))) as section where section->>'key' = 'payment'),
  0::bigint, 'clause « Modalités de paiement » absente quand rien n’est saisi (jamais fabriquée)'
);
select is(
  (select data_snapshot->'lease'->>'payment_terms' from public.get_lease_contract('e2100000-0000-4000-8000-00000000000a', (select id from pg_temp.contract_ids where label = 'a'))),
  '', 'jeton payment_terms vide plutôt qu’une valeur inventée'
);

-- ---------------------------------------------------------------------------
-- 3. Lease B (modalités réellement saisies) : la clause apparaît avec le
--    texte réel — c'est le cœur du correctif du bug de disparition.
-- ---------------------------------------------------------------------------
insert into pg_temp.contract_ids values ('b', public.generate_lease_contract('e2500000-0000-4000-8000-00000000000b', (select id from pg_temp.template_ids)));
select ok((select id from pg_temp.contract_ids where label = 'b') is not null, 'contrat B généré');
select is(
  (select count(*) from jsonb_array_elements((select content_snapshot from public.get_lease_contract('e2100000-0000-4000-8000-00000000000a', (select id from pg_temp.contract_ids where label = 'b')))) as section where section->>'key' = 'payment'),
  1::bigint, 'clause « Modalités de paiement » présente quand des modalités réelles existent'
);
select is(
  (select data_snapshot->'lease'->>'payment_terms' from public.get_lease_contract('e2100000-0000-4000-8000-00000000000a', (select id from pg_temp.contract_ids where label = 'b'))),
  'Virement bancaire avant le 5 de chaque mois.', 'jeton payment_terms reflète le texte réellement saisi, mot pour mot'
);

-- ---------------------------------------------------------------------------
-- 4. La correction de la colonne (RLS-scoped) respecte la même contrainte.
-- ---------------------------------------------------------------------------
select throws_ok(
  format('update public.leases set payment_terms = %L where id = %L', 'ab', 'e2500000-0000-4000-8000-00000000000a'),
  '23514', null, 'la contrainte de forme s’applique aussi via une mise à jour RLS-scoped'
);
select lives_ok(
  format('update public.leases set payment_terms = %L where id = %L', 'Espèces remises en main propre le jour de l’échéance.', 'e2500000-0000-4000-8000-00000000000a'),
  'une mise à jour valide de payment_terms est acceptée pour le propriétaire de la Location'
);
reset role;

select finish();
rollback;
