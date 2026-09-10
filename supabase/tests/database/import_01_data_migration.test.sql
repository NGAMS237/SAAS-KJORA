-- =============================================================================
-- pgTAP — IMPORT-01 Migration de données (Rentila/CSV/Excel) + situation d'ouverture
-- Transactionnel : aucun résidu en base (rollback final).
--
-- Couvre : structure des tables d'import, RLS, privilèges directs, RBAC
-- (data_import.manage), isolation Organization, idempotence par empreinte de
-- fichier, rollback atomique (format invalide + quota dépassé), quotas,
-- absence de faux Payment, situation d'ouverture (dette / crédit),
-- séparation stricte du dépôt de garantie, cutover (migration_as_of_date
-- obligatoire, pas de doublon d'échéance).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- ---------------------------------------------------------------------------
-- Fixture : trois Organizations distinctes
--   Org A (99...0a) — plan relevé à 'avance' : scénarios fonctionnels (dette,
--                      crédit, dépôt, idempotence, rollback format).
--   Org B (99...0b) — plan par défaut 'decouverte' : isolation uniquement.
--   Org Q (99...0c) — plan par défaut 'decouverte' : test de quota + rollback
--                      atomique sur dépassement de quota (bien).
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('99000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a-import01@kjora.test',now(),now(),now()),
  ('99000000-0000-4000-8000-000000000002','authenticated','authenticated','owner-b-import01@kjora.test',now(),now(),now()),
  ('99000000-0000-4000-8000-000000000003','authenticated','authenticated','viewer-a-import01@kjora.test',now(),now(),now()),
  ('99000000-0000-4000-8000-000000000004','authenticated','authenticated','manager-a-import01@kjora.test',now(),now(),now());

insert into public.organizations (id, created_by) values
  ('99000000-0000-4000-8000-0000000000aa','99000000-0000-4000-8000-000000000001'),
  ('99000000-0000-4000-8000-0000000000bb','99000000-0000-4000-8000-000000000002'),
  ('99000000-0000-4000-8000-0000000000cc','99000000-0000-4000-8000-000000000001');

insert into public.organization_profiles (organization_id, name) values
  ('99000000-0000-4000-8000-0000000000aa','Org A Import01'),
  ('99000000-0000-4000-8000-0000000000bb','Org B Import01'),
  ('99000000-0000-4000-8000-0000000000cc','Org Q Import01 Quota');

insert into public.memberships (organization_id, user_id, role) values
  ('99000000-0000-4000-8000-0000000000aa','99000000-0000-4000-8000-000000000001','organization_owner'),
  ('99000000-0000-4000-8000-0000000000bb','99000000-0000-4000-8000-000000000002','organization_owner'),
  ('99000000-0000-4000-8000-0000000000aa','99000000-0000-4000-8000-000000000003','viewer'),
  ('99000000-0000-4000-8000-0000000000aa','99000000-0000-4000-8000-000000000004','manager'),
  ('99000000-0000-4000-8000-0000000000cc','99000000-0000-4000-8000-000000000001','organization_owner');

-- Org A a besoin de plusieurs biens/logements pour les scénarios : on relève
-- son plan (Org Q, elle, reste volontairement en 'decouverte' pour le test de
-- quota). Ceci ne modifie aucune Organization réelle : tout est annulé (rollback).
update public.organization_plans set plan = 'avance' where organization_id = '99000000-0000-4000-8000-0000000000aa';

-- ---------------------------------------------------------------------------
-- 1. Structure des tables d'import
-- ---------------------------------------------------------------------------

select has_table('public','data_imports','table data_imports existe');
select has_table('public','data_import_rows','table data_import_rows existe');
select has_table('public','data_import_fingerprints','table data_import_fingerprints existe');

select ok((select relrowsecurity from pg_class where oid='public.data_imports'::regclass),
  'RLS active sur data_imports');
select ok((select relrowsecurity from pg_class where oid='public.data_import_rows'::regclass),
  'RLS active sur data_import_rows');
select ok((select relrowsecurity from pg_class where oid='public.data_import_fingerprints'::regclass),
  'RLS active sur data_import_fingerprints');

select has_function('public','commit_data_import',
  array['uuid','date','text','text','text','jsonb'], 'fonction commit_data_import existe');
select ok((select prosecdef from pg_proc
  where oid='public.commit_data_import(uuid,date,text,text,text,jsonb)'::regprocedure),
  'commit_data_import est SECURITY DEFINER');

-- ---------------------------------------------------------------------------
-- 2. Privilèges directs — architecture RPC-only, aucune écriture cliente
-- ---------------------------------------------------------------------------

select ok(not has_table_privilege('anon','public.data_imports','select'),
  'anon ne lit pas data_imports');
select ok(not has_table_privilege('anon','public.data_import_fingerprints','select'),
  'anon ne lit pas data_import_fingerprints');
select ok(not has_table_privilege('authenticated','public.data_imports','insert'),
  'aucune écriture cliente directe sur data_imports');
select ok(not has_table_privilege('authenticated','public.data_import_rows','insert'),
  'aucune écriture cliente directe sur data_import_rows');
select ok(not has_table_privilege('authenticated','public.data_imports','update'),
  'aucune modification cliente directe de data_imports');
select ok(not has_table_privilege('authenticated','public.data_imports','delete'),
  'aucune suppression cliente directe de data_imports');
select ok(not has_function_privilege('anon','public.commit_data_import(uuid,date,text,text,text,jsonb)','execute'),
  'anon ne peut pas exécuter commit_data_import');
select ok(has_function_privilege('authenticated','public.commit_data_import(uuid,date,text,text,text,jsonb)','execute'),
  'authenticated peut exécuter commit_data_import (RBAC vérifié en interne)');

-- ---------------------------------------------------------------------------
-- 3. RBAC — capability data_import.manage
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select ok((select private.has_capability('99000000-0000-4000-8000-0000000000aa','data_import.manage')),
  'Owner a data_import.manage par défaut');

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000003', true);
select ok(not (select private.has_capability('99000000-0000-4000-8000-0000000000aa','data_import.manage')),
  'un viewer n''a pas data_import.manage par défaut');

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000004', true);
select ok(not (select private.has_capability('99000000-0000-4000-8000-0000000000aa','data_import.manage')),
  'un manager n''a pas data_import.manage sans octroi explicite');

reset role;
insert into public.role_capabilities (role, capability) values ('manager','data_import.manage')
  on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000004', true);
select ok((select private.has_capability('99000000-0000-4000-8000-0000000000aa','data_import.manage')),
  'un manager obtient data_import.manage une fois la capability explicitement octroyée à son rôle');
reset role;
delete from public.role_capabilities where role='manager' and capability='data_import.manage';

select is(
  (select count(*)::int from public.role_capabilities
    where capability='data_import.manage' and role <> 'organization_owner'),
  0, 'aucun rôle autre que Owner ne détient data_import.manage par défaut (fixture nettoyée)');

-- Refus d'un utilisateur non autorisé (viewer) au niveau de la fonction elle-même.
set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $q$ select public.commit_data_import(
        '99000000-0000-4000-8000-0000000000aa'::uuid, current_date, 'csv', 'x.csv', repeat('0',64),
        '[]'::jsonb) $q$,
  '42501', null, 'un viewer ne peut pas appeler commit_data_import');
reset role;

-- ---------------------------------------------------------------------------
-- 4. migration_as_of_date obligatoire
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $q$ select public.commit_data_import(
        '99000000-0000-4000-8000-0000000000aa'::uuid, null, 'csv', 'x.csv', repeat('1',64),
        jsonb_build_array(jsonb_build_object(
          'property', jsonb_build_object('type','building','name','P Null Date','locality','Douala'),
          'unit', jsonb_build_object('type','apartment','label','U1'),
          'tenant', jsonb_build_object('full_name','Loc Null Date','phone','+237699000001'),
          'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
                     'base_rent_xaf','50000','due_day','1')
        ))) $q$,
  '23502', null, 'migration_as_of_date est obligatoire (violation NOT NULL si absente)');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Cas A — dette d'ouverture (3 mois échus, loyer 80 000, dette 240 000)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);

select public.commit_data_import(
  '99000000-0000-4000-8000-0000000000aa'::uuid,
  current_date,
  'csv', 'case-a-debt.csv', md5('import01-case-a')||md5('import01-case-a-2'),
  jsonb_build_array(jsonb_build_object(
    'property', jsonb_build_object('type','building','name','Immeuble Cas A','locality','Douala','fingerprint','FP-PROP-A'),
    'unit', jsonb_build_object('type','apartment','label','Cas A U1','fingerprint','FP-UNIT-A'),
    'tenant', jsonb_build_object('full_name','Locataire Cas A','phone','+237699000010','fingerprint','FP-TEN-A'),
    'lease', jsonb_build_object(
      'start_date', (date_trunc('month', current_date - interval '2 months'))::date::text,
      'billing_frequency','monthly','base_rent_xaf','80000','recurring_charges_xaf','0','due_day','1',
      'opening_situation', jsonb_build_object('kind','debt','amount_xaf','240000'),
      'deposit_situation', jsonb_build_object('status','not_required')
    )
  ))
);

select ok(
  (select (public.commit_data_import(
      '99000000-0000-4000-8000-0000000000aa'::uuid, current_date, 'csv', 'case-a-debt.csv',
      md5('import01-case-a')||md5('import01-case-a-2'), '[]'::jsonb
    ) ->> 'already_imported')::boolean),
  'rejouer le même fichier (Cas A) est reconnu comme déjà importé (idempotence par empreinte de fichier)');

select is(
  (select count(*)::int from public.leases l
     join public.tenants t on t.id = l.tenant_id
    where l.organization_id='99000000-0000-4000-8000-0000000000aa' and t.full_name='Locataire Cas A'),
  1, 'Cas A : une seule Location créée (pas de doublon via le rejeu)');

select is(
  (select l.start_date from public.leases l
     join public.tenants t on t.id = l.tenant_id
    where l.organization_id='99000000-0000-4000-8000-0000000000aa' and t.full_name='Locataire Cas A'),
  (date_trunc('month', current_date - interval '2 months'))::date,
  'Cas A : la date de début de bail réelle est préservée telle quelle');

select is(
  (select count(*)::int from public.payments p
     join public.leases l on l.id = p.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas A'),
  0, 'Cas A : aucun faux Payment créé');

select is(
  (select count(*)::int from public.ledger_entries le
     join public.leases l on l.id = le.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas A' and le.entry_type='opening_credit'),
  0, 'Cas A : pas de crédit d''ouverture (dette totale = échéances échues, prépaiement = 0)');

select is(
  (select coalesce(sum(d.remaining_amount_xaf),0)::bigint from public.dues_with_status d
     join public.leases l on l.id = d.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas A' and d.kind='periodic'),
  240000::bigint,
  'Cas A : la dette restante due (3 échéances de 80 000) correspond exactement à la dette déclarée');

select is(
  (select count(*)::int from public.dues d
     join public.leases l on l.id = d.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas A' and d.kind='periodic'),
  3, 'Cas A : exactement 3 échéances périodiques générées (mois échus)');

-- Pas de doublon d'échéance (même period_start) pour cette Location.
select is(
  (select count(*)::int from (
     select d.period_start, count(*) c from public.dues d
       join public.leases l on l.id = d.lease_id
       join public.tenants t on t.id = l.tenant_id
      where t.full_name='Locataire Cas A'
      group by d.period_start having count(*) > 1
   ) dup),
  0, 'Cas A : aucune échéance dupliquée pour une même période');

-- ---------------------------------------------------------------------------
-- 6. Cas B — crédit d'ouverture (loyer 80 000/mois, 2 mois échus, crédit 60 000)
-- ---------------------------------------------------------------------------

select public.commit_data_import(
  '99000000-0000-4000-8000-0000000000aa'::uuid,
  current_date,
  'csv', 'case-b-credit.csv', md5('import01-case-b')||md5('import01-case-b-2'),
  jsonb_build_array(jsonb_build_object(
    'property', jsonb_build_object('type','building','name','Immeuble Cas B','locality','Douala','fingerprint','FP-PROP-B'),
    'unit', jsonb_build_object('type','apartment','label','Cas B U1','fingerprint','FP-UNIT-B'),
    'tenant', jsonb_build_object('full_name','Locataire Cas B','phone','+237699000020','fingerprint','FP-TEN-B'),
    'lease', jsonb_build_object(
      'start_date', (date_trunc('month', current_date - interval '1 months'))::date::text,
      'billing_frequency','monthly','base_rent_xaf','80000','recurring_charges_xaf','0','due_day','1',
      'opening_situation', jsonb_build_object('kind','credit','amount_xaf','60000'),
      'deposit_situation', jsonb_build_object('status','not_required')
    )
  ))
);

select is(
  (select count(*)::int from public.payments p
     join public.leases l on l.id = p.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas B'),
  0, 'Cas B : aucun faux Payment créé');

select is(
  (select le.credit_xaf from public.ledger_entries le
     join public.leases l on l.id = le.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas B' and le.entry_type='opening_credit'),
  220000::bigint,
  'Cas B : le crédit d''ouverture comptabilisé = échéances échues (160 000) + crédit déclaré (60 000)');

select is(
  (select coalesce(sum(d.remaining_amount_xaf),0)::bigint from public.dues_with_status d
     join public.leases l on l.id = d.lease_id
     join public.tenants t on t.id = l.tenant_id
    where t.full_name='Locataire Cas B' and d.kind='periodic'
      and d.period_start <= date_trunc('month', current_date)::date),
  0::bigint, 'Cas B : les échéances déjà échues sont intégralement couvertes par le crédit d''ouverture');

-- ---------------------------------------------------------------------------
-- 7. Cas C — situations de dépôt de garantie (toujours séparé du loyer)
-- ---------------------------------------------------------------------------

select public.commit_data_import(
  '99000000-0000-4000-8000-0000000000aa'::uuid,
  current_date,
  'csv', 'case-c-deposit.csv', md5('import01-case-c')||md5('import01-case-c-2'),
  jsonb_build_array(
    jsonb_build_object(
      'property', jsonb_build_object('type','building','name','Immeuble Cas C','locality','Douala','fingerprint','FP-PROP-C'),
      'unit', jsonb_build_object('type','studio','label','Cas C Non Requis','fingerprint','FP-UNIT-C1'),
      'tenant', jsonb_build_object('full_name','Locataire Depot NonRequis','phone','+237699000031','fingerprint','FP-TEN-C1'),
      'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
        'base_rent_xaf','50000','due_day','1',
        'opening_situation', jsonb_build_object('kind','even'),
        'deposit_situation', jsonb_build_object('status','not_required'))
    ),
    jsonb_build_object(
      'property', jsonb_build_object('type','building','fingerprint','FP-PROP-C'),
      'unit', jsonb_build_object('type','studio','label','Cas C Du','fingerprint','FP-UNIT-C2'),
      'tenant', jsonb_build_object('full_name','Locataire Depot Du','phone','+237699000032','fingerprint','FP-TEN-C2'),
      'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
        'base_rent_xaf','50000','due_day','1','security_deposit_xaf','100000',
        'opening_situation', jsonb_build_object('kind','even'),
        'deposit_situation', jsonb_build_object('status','due'))
    ),
    jsonb_build_object(
      'property', jsonb_build_object('type','building','fingerprint','FP-PROP-C'),
      'unit', jsonb_build_object('type','studio','label','Cas C Partiel','fingerprint','FP-UNIT-C3'),
      'tenant', jsonb_build_object('full_name','Locataire Depot Partiel','phone','+237699000033','fingerprint','FP-TEN-C3'),
      'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
        'base_rent_xaf','50000','due_day','1','security_deposit_xaf','100000',
        'opening_situation', jsonb_build_object('kind','even'),
        'deposit_situation', jsonb_build_object('status','partial','paid_amount_xaf','40000'))
    ),
    jsonb_build_object(
      'property', jsonb_build_object('type','building','fingerprint','FP-PROP-C'),
      'unit', jsonb_build_object('type','studio','label','Cas C Paye','fingerprint','FP-UNIT-C4'),
      'tenant', jsonb_build_object('full_name','Locataire Depot Paye','phone','+237699000034','fingerprint','FP-TEN-C4'),
      'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
        'base_rent_xaf','50000','due_day','1','security_deposit_xaf','100000',
        'opening_situation', jsonb_build_object('kind','even'),
        'deposit_situation', jsonb_build_object('status','paid'))
    )
  )
);

select is(
  (select count(*)::int from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot NonRequis' and d.kind='deposit'),
  0, 'Dépôt non requis : aucune Due de dépôt créée');

select is(
  (select d.deposit_amount_xaf from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Du' and d.kind='deposit'),
  100000::bigint, 'Dépôt dû : la Due de dépôt porte le montant intégral requis');
select is(
  (select count(*)::int from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Du' and d.kind='adjustment'),
  0, 'Dépôt dû (rien perçu) : aucune Due d''ajustement créée');

select is(
  (select d.deposit_amount_xaf from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Partiel' and d.kind='deposit'),
  100000::bigint, 'Dépôt partiel : la Due de dépôt reste au montant intégral requis (pas réduite)');
select is(
  (select d.adjustment_amount_xaf from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Partiel' and d.kind='adjustment'),
  40000::bigint, 'Dépôt partiel : la Due d''ajustement (crédit) porte exactement le montant déjà perçu');
select is(
  (select d.adjustment_direction from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Partiel' and d.kind='adjustment'),
  'credit', 'Dépôt partiel : l''ajustement est bien un crédit (jamais un Payment)');

select is(
  (select d.adjustment_amount_xaf from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name='Locataire Depot Paye' and d.kind='adjustment'),
  100000::bigint, 'Dépôt payé : la Due d''ajustement (crédit) couvre le montant intégral');

select is(
  (select count(*)::int from public.dues d
     join public.leases l on l.id=d.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name in ('Locataire Depot Du','Locataire Depot Partiel','Locataire Depot Paye')
      and d.kind='periodic' and d.deposit_amount_xaf <> 0),
  0, 'Séparation stricte : aucune Due périodique (loyer) ne porte de montant de dépôt');

select is(
  (select count(*)::int from public.payments p
     join public.leases l on l.id=p.lease_id join public.tenants t on t.id=l.tenant_id
    where t.full_name like 'Locataire Depot%'),
  0, 'Cas C : aucun faux Payment créé pour les 4 situations de dépôt');

-- Une seule Location par bien/logement/locataire même après rejeu de fichier —
-- dédoublonnage par empreinte, un même bien réutilisé (fingerprint FP-PROP-C).
select is(
  (select count(*)::int from public.properties where organization_id='99000000-0000-4000-8000-0000000000aa'
     and name='Immeuble Cas C'),
  1, 'Cas C : un seul Bien créé malgré 4 lignes partageant la même empreinte de bien');

-- ---------------------------------------------------------------------------
-- 8. Rollback atomique — ligne au format invalide (aucune écriture partielle)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.properties where organization_id='99000000-0000-4000-8000-0000000000aa'),
  3, 'référence avant tentative invalide : 3 Biens existants (Cas A, B, C)');

select throws_ok(
  $q$ select public.commit_data_import(
        '99000000-0000-4000-8000-0000000000aa'::uuid, current_date, 'csv', 'rollback-format.csv',
        md5('import01-rollback-format')||md5('import01-rollback-format-2'),
        jsonb_build_array(
          jsonb_build_object(
            'property', jsonb_build_object('type','building','name','Bien Ephemere','locality','Douala'),
            'unit', jsonb_build_object('type','apartment','label','U Ephemere'),
            'tenant', jsonb_build_object('full_name','Locataire Ephemere','phone','+237699000099'),
            'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
              'base_rent_xaf','50000','due_day','1')
          ),
          jsonb_build_object(
            'property', jsonb_build_object('type','building','name','Bien Ephemere 2','locality','Douala'),
            'unit', jsonb_build_object('type','apartment','label','U Ephemere 2'),
            'tenant', jsonb_build_object('full_name','Locataire Ephemere 2','phone','+237699000098'),
            'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','invalide',
              'base_rent_xaf','50000','due_day','1')
          )
        )) $q$,
  '22023', 'IMPORT_LEASE_FREQUENCY_INVALID',
  'une ligne au format invalide fait échouer tout l''import');

select is(
  (select count(*)::int from public.properties where organization_id='99000000-0000-4000-8000-0000000000aa'),
  3, 'rollback atomique confirmé : le Bien de la 1ère ligne (valide) n''a pas été conservé');

select is(
  (select count(*)::int from public.data_imports
    where organization_id='99000000-0000-4000-8000-0000000000aa' and file_name='rollback-format.csv'),
  0, 'rollback atomique confirmé : aucun en-tête d''import laissé pour la tentative échouée');

-- ---------------------------------------------------------------------------
-- 9. Quota — Org Q reste en 'decouverte' (max 1 bien) : rollback sur dépassement
-- ---------------------------------------------------------------------------

select is(
  (select plan from public.organization_plans where organization_id='99000000-0000-4000-8000-0000000000cc'),
  'decouverte', 'Org Q est bien restée au plan par défaut Découverte (1 bien max)');

select throws_ok(
  $q$ select public.commit_data_import(
        '99000000-0000-4000-8000-0000000000cc'::uuid, current_date, 'csv', 'quota-exceeded.csv',
        md5('import01-quota')||md5('import01-quota-2'),
        jsonb_build_array(
          jsonb_build_object(
            'property', jsonb_build_object('type','building','name','Bien Quota 1','locality','Douala'),
            'unit', jsonb_build_object('type','apartment','label','U Quota 1'),
            'tenant', jsonb_build_object('full_name','Locataire Quota 1','phone','+237699000091'),
            'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
              'base_rent_xaf','50000','due_day','1')
          ),
          jsonb_build_object(
            'property', jsonb_build_object('type','building','name','Bien Quota 2','locality','Douala'),
            'unit', jsonb_build_object('type','apartment','label','U Quota 2'),
            'tenant', jsonb_build_object('full_name','Locataire Quota 2','phone','+237699000092'),
            'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
              'base_rent_xaf','50000','due_day','1')
          )
        )) $q$,
  'P0001', 'PLAN_PROPERTY_LIMIT_REACHED',
  'un import dépassant le quota de biens du plan est bloqué par le trigger existant (aucun contournement)');

select is(
  (select count(*)::int from public.properties where organization_id='99000000-0000-4000-8000-0000000000cc'),
  0, 'quota + rollback : aucun bien partiel conservé pour Org Q après l''échec (le 1er bien de la ligne 1 est annulé aussi)');

select is(
  (select count(*)::int from public.data_imports where organization_id='99000000-0000-4000-8000-0000000000cc'),
  0, 'quota + rollback : aucun en-tête d''import laissé pour Org Q');

-- Le preview (hors DB) doit avertir en amont, mais c'est bien la RPC/DB qui
-- empêche réellement le dépassement : vérifié ci-dessus indépendamment de la
-- couche applicative (aucun contournement possible même via appel direct RPC).

-- ---------------------------------------------------------------------------
-- 10. Isolation Organization — Owner A ne voit jamais les imports d'Org B
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
select public.commit_data_import(
  '99000000-0000-4000-8000-0000000000bb'::uuid, current_date, 'csv', 'org-b-import.csv',
  md5('import01-org-b')||md5('import01-org-b-2'),
  jsonb_build_array(jsonb_build_object(
    'property', jsonb_build_object('type','building','name','Bien Org B','locality','Yaoundé'),
    'unit', jsonb_build_object('type','apartment','label','U Org B'),
    'tenant', jsonb_build_object('full_name','Locataire Org B','phone','+237699000080'),
    'lease', jsonb_build_object('start_date',current_date::text,'billing_frequency','monthly',
      'base_rent_xaf','50000','due_day','1')
  )));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::int from public.data_imports),
  3, 'Owner A (RLS) ne voit que les imports de ses propres Organizations (A + Q, ici 3 en A, 0 en Q après rollback), jamais ceux d''Org B');
select is(
  (select count(*)::int from public.data_imports where organization_id='99000000-0000-4000-8000-0000000000bb'),
  0, 'Owner A ne voit explicitement aucun import d''Org B (isolation stricte)');

select throws_ok(
  $q$ select public.list_data_imports('99000000-0000-4000-8000-0000000000bb'::uuid) $q$,
  '42501', null, 'list_data_imports refuse l''accès cross-Organization (Owner A → Org B)');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::int from public.data_imports),
  1, 'Owner B (RLS) ne voit que l''import de sa propre Organization');
reset role;

-- anon ne voit jamais aucun import, quelle que soit l'Organization : le
-- privilège est révoqué au niveau table (refus avant même RLS), donc la
-- simple tentative de lecture échoue avec permission denied.
set local role anon;
select throws_ok(
  $q$ select count(*) from public.data_imports $q$,
  '42501', null, 'anon ne peut même pas tenter de lire data_imports (privilège table révoqué)');
reset role;

select * from finish();
rollback;
