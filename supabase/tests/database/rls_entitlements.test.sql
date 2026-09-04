-- =============================================================================
-- pgTAP tests — ALIGN-01 Plans, Quotas & Entitlements
-- Run in BEGIN...ROLLBACK (non-destructive)
-- plan(42)
-- =============================================================================

begin;

select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, email_confirmed_at)
  values
    ('e1000000-0000-4000-8000-000000000001'::uuid, 'ownerA@align01.test', now()),
    ('e1000000-0000-4000-8000-000000000002'::uuid, 'ownerB@align01.test', now()),
    ('e1000000-0000-4000-8000-000000000003'::uuid, 'collab@align01.test', now());

-- Org A (owner A), Org B (owner B)
insert into public.organizations (id, created_by)
  values
    ('e2000000-0000-4000-8000-000000000001'::uuid, 'e1000000-0000-4000-8000-000000000001'),
    ('e2000000-0000-4000-8000-000000000002'::uuid, 'e1000000-0000-4000-8000-000000000002');

insert into public.organization_profiles (organization_id, name)
  values
    ('e2000000-0000-4000-8000-000000000001', 'AlignOrgA'),
    ('e2000000-0000-4000-8000-000000000002', 'AlignOrgB');

insert into public.memberships (organization_id, user_id, role, status)
  values
    ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'organization_owner', 'active'),
    ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'organization_owner', 'active');

-- Properties for OrgA (essentiel) and OrgB (decouverte)
insert into public.properties (id, organization_id, name, locality, type, status, created_by)
  values ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'OrgA-P1', 'Douala', 'building', 'active', 'e1000000-0000-4000-8000-000000000001');

insert into public.properties (id, organization_id, name, locality, type, status, created_by)
  values ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'OrgB-P1', 'Douala', 'house', 'active', 'e1000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 1. Auto-trigger plan assignment
-- ---------------------------------------------------------------------------

select is(
  (select plan from public.organization_plans where organization_id = 'e2000000-0000-4000-8000-000000000001'),
  'decouverte',
  '1. trigger assigne decouverte à orgA (nouvelle org)'
);

select is(
  (select plan from public.organization_plans where organization_id = 'e2000000-0000-4000-8000-000000000002'),
  'decouverte',
  '2. trigger assigne decouverte à orgB (nouvelle org)'
);

-- ---------------------------------------------------------------------------
-- 2. plan_quota_limits
-- ---------------------------------------------------------------------------

select is((select max_properties    from private.plan_quota_limits('decouverte')), 1,   '3. decouverte max_properties = 1');
select is((select max_active_units  from private.plan_quota_limits('decouverte')), 3,   '4. decouverte max_active_units = 3');
select is((select max_collaborators from private.plan_quota_limits('decouverte')), 0,   '5. decouverte max_collaborators = 0');
select is((select max_properties    from private.plan_quota_limits('essentiel')),  3,   '6. essentiel max_properties = 3');
select is((select max_active_units  from private.plan_quota_limits('essentiel')),  10,  '7. essentiel max_active_units = 10');
select is((select max_collaborators from private.plan_quota_limits('essentiel')),  1,   '8. essentiel max_collaborators = 1');
select is((select max_properties    from private.plan_quota_limits('avance')),     10,  '9. avance max_properties = 10');
select is((select max_active_units  from private.plan_quota_limits('avance')),     30,  '10. avance max_active_units = 30');
select is((select max_collaborators from private.plan_quota_limits('avance')),     3,   '11. avance max_collaborators = 3');
select is((select max_properties    from private.plan_quota_limits('patrimoine')), 30,  '12. patrimoine max_properties = 30');
select is((select max_active_units  from private.plan_quota_limits('patrimoine')), 100, '13. patrimoine max_active_units = 100');
select is((select max_collaborators from private.plan_quota_limits('patrimoine')), 10,  '14. patrimoine max_collaborators = 10');

-- ---------------------------------------------------------------------------
-- 3. Property quota — Découverte (max 1) — OrgB already has 1
-- ---------------------------------------------------------------------------

select throws_like(
  $$insert into public.properties (id, organization_id, name, locality, type, status, created_by)
      values ('e3000000-0000-4000-8000-000000000099', 'e2000000-0000-4000-8000-000000000002',
              'OrgB-P2', 'Yaoundé', 'house', 'active', 'e1000000-0000-4000-8000-000000000002')$$,
  '%PLAN_PROPERTY_LIMIT_REACHED%',
  '15. decouverte refuse la 2e Property'
);

-- Upgrade to essentiel: 2nd property accepted
select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'essentiel');

insert into public.properties (id, organization_id, name, locality, type, status, created_by)
  values ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'OrgA-P2', 'Yaoundé', 'house', 'active', 'e1000000-0000-4000-8000-000000000001');
insert into public.properties (id, organization_id, name, locality, type, status, created_by)
  values ('e3000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'OrgA-P3', 'Bafoussam', 'building', 'active', 'e1000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.properties where organization_id = 'e2000000-0000-4000-8000-000000000001' and status = 'active'),
  3,
  '16. essentiel accepte 3 Properties'
);

select throws_like(
  $$insert into public.properties (id, organization_id, name, locality, type, status, created_by)
      values ('e3000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001',
              'OrgA-P4', 'Douala', 'house', 'active', 'e1000000-0000-4000-8000-000000000001')$$,
  '%PLAN_PROPERTY_LIMIT_REACHED%',
  '17. essentiel refuse la 4e Property'
);

-- ---------------------------------------------------------------------------
-- 4. Active unit quota — Découverte (max 3) — OrgB
-- ---------------------------------------------------------------------------

-- Insert units one by one (multi-row INSERT fails atomically if any row violates quota)
-- U1 active (1/3)
insert into public.units (id, organization_id, property_id, label, type, status, created_by)
  values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'U1', 'whole_house', 'active', 'e1000000-0000-4000-8000-000000000002');
-- U2 archived (archived, does not count) — archived_at required by constraint
insert into public.units (id, organization_id, property_id, label, type, status, archived_at, created_by)
  values ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'U2', 'whole_house', 'archived', now(), 'e1000000-0000-4000-8000-000000000002');
-- U3 active (2/3)
insert into public.units (id, organization_id, property_id, label, type, status, created_by)
  values ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'U3', 'whole_house', 'active', 'e1000000-0000-4000-8000-000000000002');
-- U4 active (3/3)
insert into public.units (id, organization_id, property_id, label, type, status, created_by)
  values ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'U4', 'whole_house', 'active', 'e1000000-0000-4000-8000-000000000002');

-- U1 + U3 + U4 = 3 active, U2 archived
select is(
  (select count(*)::int from public.units where organization_id = 'e2000000-0000-4000-8000-000000000002' and status = 'active'),
  3,
  '18. decouverte accepte 3 Units actives (U2 archivée ne compte pas)'
);

select throws_like(
  $$insert into public.units (id, organization_id, property_id, label, type, status, created_by)
      values ('e4000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000002',
              'e3000000-0000-4000-8000-000000000002', 'U5', 'whole_house', 'active', 'e1000000-0000-4000-8000-000000000002')$$,
  '%PLAN_ACTIVE_UNIT_LIMIT_REACHED%',
  '19. decouverte refuse la 4e Unit active'
);

-- Archive libère un quota
update public.units set status = 'archived', archived_at = now()
  where id = 'e4000000-0000-4000-8000-000000000004';

insert into public.units (id, organization_id, property_id, label, type, status, created_by)
  values ('e4000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000002',
          'e3000000-0000-4000-8000-000000000002', 'U5', 'whole_house', 'active', 'e1000000-0000-4000-8000-000000000002');

select ok(
  exists(select 1 from public.units where id = 'e4000000-0000-4000-8000-000000000005' and status = 'active'),
  '20. archivage libère quota — U5 créée OK'
);

-- Test 21: réactivation d'une unit archivée quand quota plein → refus immédiat
-- enforce_active_unit_quota_update (alphabétiquement avant enforce_unit_hierarchy) :
-- 3 actives (U1, U3, U5) >= max 3 → PLAN_ACTIVE_UNIT_LIMIT_REACHED avant même unit_archived_immutable
select throws_like(
  $$update public.units set status = 'active', archived_at = null
      where id = 'e4000000-0000-4000-8000-000000000002'$$,
  '%PLAN_ACTIVE_UNIT_LIMIT_REACHED%',
  '21. réactivation refait le contrôle quota — refus si quota atteint'
);

-- Test 22: archivage libère le quota (count actives diminue)
-- NOTE: unités archivées sont immutables (enforce_unit_hierarchy). On vérifie
-- que le count actif baisse après archivage de U5, libérant le quota pour un futur INSERT.
update public.units set status = 'archived', archived_at = now()
  where id = 'e4000000-0000-4000-8000-000000000005';

select is(
  (select count(*)::int from public.units
     where organization_id = 'e2000000-0000-4000-8000-000000000002' and status = 'active'),
  2,
  '22. après archivage U5, quota libéré (2 actives sur 3 max)'
);

-- ---------------------------------------------------------------------------
-- 5. Collaborateur quota
-- ---------------------------------------------------------------------------

-- OrgB decouverte: max_collaborators = 0
select throws_like(
  $$select private.assert_collaborator_quota('e2000000-0000-4000-8000-000000000002')$$,
  '%PLAN_COLLABORATOR_LIMIT_REACHED%',
  '23. decouverte refuse collaborateur (quota 0)'
);

-- Upgrade to essentiel: quota = 1
select private.assign_organization_plan('e2000000-0000-4000-8000-000000000002', 'essentiel');

select lives_ok(
  $$select private.assert_collaborator_quota('e2000000-0000-4000-8000-000000000002')$$,
  '24. essentiel accepte le 1er collaborateur (quota 1, usage 0)'
);

-- Add 1 collaborator (non-owner)
insert into public.memberships (organization_id, user_id, role, status)
  values ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 'manager', 'active');

select is(
  private.count_collaborators('e2000000-0000-4000-8000-000000000002'),
  1,
  '25. count_collaborators = 1 (owner non compté)'
);

select throws_like(
  $$select private.assert_collaborator_quota('e2000000-0000-4000-8000-000000000002')$$,
  '%PLAN_COLLABORATOR_LIMIT_REACHED%',
  '26. essentiel refuse le 2e collaborateur (quota 1, usage 1)'
);

-- ---------------------------------------------------------------------------
-- 6. Feature gating
-- ---------------------------------------------------------------------------

-- essentiel — contracts disponible (OrgA vient d'être upgradée essentiel)
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'contracts'),
  '27. essentiel — OrgA a contracts feature'
);

-- Reset OrgA to decouverte for this check
select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'decouverte');
select ok(
  not private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'contracts'),
  '28. decouverte — contracts NON disponible'
);

-- Restore essentiel
select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'essentiel');
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'contracts'),
  '29. essentiel — contracts disponible'
);

select ok(
  not private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'contract_templates_custom'),
  '30. essentiel — contract_templates_custom NON disponible'
);

select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'avance');
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'contract_templates_custom'),
  '31. avance — contract_templates_custom disponible'
);
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'audit_advanced'),
  '32. avance — audit_advanced disponible'
);
select ok(
  not private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'reporting_consolidated'),
  '33. avance — reporting_consolidated NON disponible'
);

select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'patrimoine');
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'reporting_consolidated'),
  '34. patrimoine — reporting_consolidated disponible'
);
select ok(
  not private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'api_access'),
  '35. patrimoine — api_access NON disponible'
);

select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'sur_mesure');
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'api_access'),
  '36. sur_mesure — api_access disponible'
);
select ok(
  private.check_plan_feature('e2000000-0000-4000-8000-000000000001', 'sso'),
  '37. sur_mesure — sso disponible'
);

-- ---------------------------------------------------------------------------
-- 7. get_organization_entitlements — isolation RLS
-- ---------------------------------------------------------------------------

-- Restore essentiel for OrgA
select private.assign_organization_plan('e2000000-0000-4000-8000-000000000001', 'essentiel');

-- ownerA peut lire son plan
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001"}';

select ok(
  (select public.get_organization_entitlements('e2000000-0000-4000-8000-000000000001') is not null),
  '38. ownerA peut appeler get_organization_entitlements sur son org'
);

select is(
  (select public.get_organization_entitlements('e2000000-0000-4000-8000-000000000001') ->> 'plan'),
  'essentiel',
  '39. get_organization_entitlements retourne plan essentiel pour OrgA'
);

-- ownerA ne peut pas lire le plan de OrgB (RLS plan_features OK mais forbidden sur l'org)
select throws_ok(
  $$select public.get_organization_entitlements('e2000000-0000-4000-8000-000000000002')$$,
  '42501', 'forbidden',
  '40. ownerA ne peut pas lire les entitlements de OrgB'
);

-- RLS: ownerA ne voit pas organization_plans de OrgB
select is(
  (select count(*)::int from public.organization_plans
     where organization_id = 'e2000000-0000-4000-8000-000000000002'),
  0,
  '41. RLS organization_plans: ownerA ne voit pas le plan de OrgB'
);

reset role;

-- ---------------------------------------------------------------------------
-- 8. plan_features lisible par authenticated
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001"}';

select ok(
  (select count(*)::int from public.plan_features where plan = 'decouverte') > 0,
  '42. plan_features lisible par authenticated'
);

reset role;

select * from finish();
rollback;
