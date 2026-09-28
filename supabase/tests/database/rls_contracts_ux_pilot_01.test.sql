-- =============================================================================
-- pgTAP — CONTRATS-UX-PILOTE-01
-- =============================================================================
-- Couvre le seul changement de schéma de ce lot : civilité facultative,
-- prénom(s)/nom(s) séparés pour le locataire (public.tenants) et pour
-- l'identité individuelle du bailleur portée par le cachet
-- (public.organization_contract_settings) — additifs, jamais un
-- remplacement de full_name/stamp_name, qui restent affichés partout.
-- Transactionnel : aucun résidu en base (rollback final).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-cup01@kjora.test', now(), now(), now());

insert into public.organizations(id, created_by) values
  ('e3100000-0000-4000-8000-00000000000a', 'e3000000-0000-4000-8000-000000000001');
insert into public.organization_profiles(organization_id, name, language) values
  ('e3100000-0000-4000-8000-00000000000a', 'Organization CUP01', 'fr');
insert into public.organization_plans(organization_id, plan, assigned_by) values
  ('e3100000-0000-4000-8000-00000000000a', 'avance', 'e3000000-0000-4000-8000-000000000001')
  on conflict (organization_id) do update set plan = excluded.plan, assigned_by = excluded.assigned_by, assigned_at = now();
insert into public.memberships(organization_id, user_id, role) values
  ('e3100000-0000-4000-8000-00000000000a', 'e3000000-0000-4000-8000-000000000001', 'organization_owner');

-- ---------------------------------------------------------------------------
-- 1. Locataire — colonnes additives, nullables, contraintes de forme.
-- ---------------------------------------------------------------------------
select has_column('public', 'tenants', 'civility', 'colonne civility présente');
select has_column('public', 'tenants', 'first_name', 'colonne first_name présente');
select has_column('public', 'tenants', 'last_name', 'colonne last_name présente');
select col_is_null('public', 'tenants', 'civility', 'civility optionnelle (nullable)');
select col_is_null('public', 'tenants', 'first_name', 'first_name optionnelle (nullable)');

insert into public.tenants(id, organization_id, full_name, phone, created_by) values
  ('e3400000-0000-4000-8000-00000000000a', 'e3100000-0000-4000-8000-00000000000a', 'Historique Sans Split', '+237600000001', 'e3000000-0000-4000-8000-000000000001');
select is(
  (select full_name from public.tenants where id = 'e3400000-0000-4000-8000-00000000000a'),
  'Historique Sans Split', 'un locataire créé sans civilité/prénom/nom garde full_name intact (affichage historique)'
);
select is(
  (select civility from public.tenants where id = 'e3400000-0000-4000-8000-00000000000a'),
  null, 'civility reste NULL quand non renseignée — jamais une valeur fabriquée'
);

select throws_ok(
  $$insert into public.tenants(id, organization_id, full_name, phone, civility, created_by) values ('e3400000-0000-4000-8000-00000000000b','e3100000-0000-4000-8000-00000000000a','Test','+237600000002','Dr.','e3000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'une civilité hors {M., Mme} viole la contrainte de forme'
);
insert into public.tenants(id, organization_id, full_name, phone, civility, first_name, last_name, created_by) values
  ('e3400000-0000-4000-8000-00000000000c', 'e3100000-0000-4000-8000-00000000000a', 'Mme Fatou Diop', '+237600000003', 'Mme', 'Fatou', 'Diop', 'e3000000-0000-4000-8000-000000000001');
select is(
  (select civility||' '||first_name||' '||last_name from public.tenants where id = 'e3400000-0000-4000-8000-00000000000c'),
  'Mme Fatou Diop', 'civilité/prénom/nom séparés se lisent correctement pour un nouveau locataire'
);

-- Grants applicatifs : même palier que full_name (tenant.view suffit, pas besoin de tenant.manage).
select ok(has_column_privilege('authenticated', 'public.tenants', 'civility', 'select'), 'authenticated peut lire civility');
select ok(has_column_privilege('authenticated', 'public.tenants', 'first_name', 'insert'), 'authenticated peut saisir first_name à la création');
select ok(has_column_privilege('authenticated', 'public.tenants', 'last_name', 'update'), 'authenticated peut corriger last_name ensuite');

-- ---------------------------------------------------------------------------
-- 2. Identité individuelle du bailleur (cachet) — même traitement.
-- ---------------------------------------------------------------------------
select has_column('public', 'organization_contract_settings', 'stamp_civility', 'colonne stamp_civility présente');
select has_column('public', 'organization_contract_settings', 'stamp_first_name', 'colonne stamp_first_name présente');
select has_column('public', 'organization_contract_settings', 'stamp_last_name', 'colonne stamp_last_name présente');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3000000-0000-4000-8000-000000000001', true);

-- L'ancienne signature à 7 arguments a bien été supprimée (remplacée, pas
-- juste surchargée) : ce même appel positionnel échouerait sinon de façon
-- ambiguë ou silencieusement partielle.
select is(
  (select count(*) from pg_proc where proname = 'save_organization_contract_settings'),
  1::bigint, 'une seule version de save_organization_contract_settings existe (ancienne signature réellement supprimée)'
);

select throws_ok(
  $$select public.save_organization_contract_settings('e3100000-0000-4000-8000-00000000000a', true, 'Cachet', 'Ma Société', '+237699999999', 'Douala', 'signature_block', 'Dr.', 'X', 'Y')$$,
  '22023', null, 'une civilité de cachet hors {M., Mme} est refusée'
);

select lives_ok(
  $$select public.save_organization_contract_settings('e3100000-0000-4000-8000-00000000000a', true, 'Cachet', 'Ma Société', '+237699999999', 'Douala', 'signature_block', 'M.', 'Blaise', 'Nganbou')$$,
  'un enregistrement valide de civilité/prénom/nom du cachet est accepté'
);
select is(
  (select stamp_civility||' '||stamp_first_name||' '||stamp_last_name from public.get_organization_contract_settings('e3100000-0000-4000-8000-00000000000a')),
  'M. Blaise Nganbou', 'get_organization_contract_settings restitue civilité/prénom/nom du cachet'
);
select is(
  (select stamp_company from public.get_organization_contract_settings('e3100000-0000-4000-8000-00000000000a')),
  'Ma Société', 'stamp_company (utilisé par lessor.displayName du contrat) reste inchangé par cet ajout'
);

-- Appel sans les nouveaux paramètres (rétrocompatibilité positionnelle avec
-- des valeurs par défaut) : ne doit pas échouer.
select lives_ok(
  $$select public.save_organization_contract_settings('e3100000-0000-4000-8000-00000000000a', true, 'Cachet', 'Ma Société', '+237699999999', 'Douala', 'footer')$$,
  'save_organization_contract_settings reste appelable avec seulement les 7 arguments historiques'
);
select is(
  (select stamp_position from public.get_organization_contract_settings('e3100000-0000-4000-8000-00000000000a')),
  'footer', 'un appel à 7 arguments met bien à jour le reste des réglages'
);

reset role;

select finish();
rollback;
