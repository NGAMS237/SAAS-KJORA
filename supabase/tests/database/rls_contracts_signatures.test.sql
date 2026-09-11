begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

insert into auth.users (id,aud,role,email,email_confirmed_at,created_at,updated_at) values
('f6000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a-6f@kjora.test',now(),now(),now()),
('f6000000-0000-4000-8000-000000000002','authenticated','authenticated','manager-a-6f@kjora.test',now(),now(),now()),
('f6000000-0000-4000-8000-000000000003','authenticated','authenticated','viewer-a-6f@kjora.test',now(),now(),now()),
('f6000000-0000-4000-8000-000000000004','authenticated','authenticated','owner-b-6f@kjora.test',now(),now(),now()),
('f6000000-0000-4000-8000-000000000005','authenticated','authenticated','portal-a-6f@kjora.test',now(),now(),now()),
('f6000000-0000-4000-8000-000000000006','authenticated','authenticated','portal-b-6f@kjora.test',now(),now(),now());
insert into public.organizations(id,created_by) values
('f6100000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000001'),
('f6100000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-000000000004');
insert into public.organization_profiles(organization_id,name,language) values
('f6100000-0000-4000-8000-00000000000a','Organization A 6F','fr'),
('f6100000-0000-4000-8000-00000000000b','Organization B 6F','en');
insert into public.organization_plans(organization_id,plan,assigned_by) values
('f6100000-0000-4000-8000-00000000000a','avance','f6000000-0000-4000-8000-000000000001')
on conflict (organization_id) do update set plan=excluded.plan,assigned_by=excluded.assigned_by,assigned_at=now();
insert into public.memberships(organization_id,user_id,role) values
('f6100000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000001','organization_owner'),
('f6100000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000002','manager'),
('f6100000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000003','viewer'),
('f6100000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-000000000004','organization_owner');
insert into public.properties(id,organization_id,name,locality,type,created_by) values
('f6200000-0000-4000-8000-00000000000a','f6100000-0000-4000-8000-00000000000a','Immeuble A 6F','Douala','building','f6000000-0000-4000-8000-000000000001'),
('f6200000-0000-4000-8000-00000000000b','f6100000-0000-4000-8000-00000000000b','Immeuble B 6F','Yaoundé','building','f6000000-0000-4000-8000-000000000004');
insert into public.units(id,organization_id,property_id,label,type,created_by) values
('f6300000-0000-4000-8000-00000000000a','f6100000-0000-4000-8000-00000000000a','f6200000-0000-4000-8000-00000000000a','A1','apartment','f6000000-0000-4000-8000-000000000001'),
('f6300000-0000-4000-8000-00000000000b','f6100000-0000-4000-8000-00000000000b','f6200000-0000-4000-8000-00000000000b','B1','apartment','f6000000-0000-4000-8000-000000000004');
insert into public.tenants(id,organization_id,full_name,email,preferred_language,created_by) values
('f6400000-0000-4000-8000-00000000000a','f6100000-0000-4000-8000-00000000000a','Locataire A 6F','portal-a-6f@kjora.test','fr','f6000000-0000-4000-8000-000000000001'),
('f6400000-0000-4000-8000-00000000000b','f6100000-0000-4000-8000-00000000000b','Tenant B 6F','portal-b-6f@kjora.test','en','f6000000-0000-4000-8000-000000000004');
insert into public.leases(id,organization_id,property_id,unit_id,tenant_id,status,start_date,base_rent_xaf,recurring_charges_xaf,security_deposit_xaf,billing_frequency,due_day,created_by) values
('f6500000-0000-4000-8000-00000000000a','f6100000-0000-4000-8000-00000000000a','f6200000-0000-4000-8000-00000000000a','f6300000-0000-4000-8000-00000000000a','f6400000-0000-4000-8000-00000000000a','draft',current_date,80000,5000,0,'monthly',5,'f6000000-0000-4000-8000-000000000001'),
('f6500000-0000-4000-8000-00000000000b','f6100000-0000-4000-8000-00000000000b','f6200000-0000-4000-8000-00000000000b','f6300000-0000-4000-8000-00000000000b','f6400000-0000-4000-8000-00000000000b','draft',current_date,90000,0,45000,'monthly',5,'f6000000-0000-4000-8000-000000000004');
update public.leases set status='active' where id in ('f6500000-0000-4000-8000-00000000000a','f6500000-0000-4000-8000-00000000000b');
insert into public.tenant_portal_accesses(id,organization_id,tenant_id,user_id,status,invited_email,preferred_language,invited_by,accepted_at,last_login_at) values
('f6600000-0000-4000-8000-00000000000a','f6100000-0000-4000-8000-00000000000a','f6400000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000005','active','portal-a-6f@kjora.test','fr','f6000000-0000-4000-8000-000000000001',now(),now()),
('f6600000-0000-4000-8000-00000000000b','f6100000-0000-4000-8000-00000000000b','f6400000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-000000000006','active','portal-b-6f@kjora.test','en','f6000000-0000-4000-8000-000000000004',now(),now());
insert into public.tenant_portal_lease_accesses(organization_id,access_id,tenant_id,lease_id,granted_by) values
('f6100000-0000-4000-8000-00000000000a','f6600000-0000-4000-8000-00000000000a','f6400000-0000-4000-8000-00000000000a','f6500000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000001'),
('f6100000-0000-4000-8000-00000000000b','f6600000-0000-4000-8000-00000000000b','f6400000-0000-4000-8000-00000000000b','f6500000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-000000000004');
insert into public.tenant_portal_sessions(organization_id,access_id,tenant_id,user_id,auth_session_id,expires_at) values
('f6100000-0000-4000-8000-00000000000a','f6600000-0000-4000-8000-00000000000a','f6400000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-000000000005','session-portal-a-6f',now()+interval '30 days'),
('f6100000-0000-4000-8000-00000000000b','f6600000-0000-4000-8000-00000000000b','f6400000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-000000000006','session-portal-b-6f',now()+interval '30 days');

select has_table('public','contract_templates','table modèles présente');
select has_table('public','lease_contracts','table contrats présente');
select has_table('public','contract_signatures','preuves de signature présentes');
select has_table('public','organization_contract_settings','cachet Organization présent');
select has_table('public','contract_amendments','socle avenant minimal présent');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.contract_templates'::regclass,'public.lease_contracts'::regclass,'public.contract_signatures'::regclass,'public.organization_contract_settings'::regclass,'public.contract_amendments'::regclass)),'RLS active sur toutes les tables 6F');
select is((select count(*) from public.role_capabilities where capability='contract.manage'),2::bigint,'seuls Owner et gestionnaire gèrent les contrats');
select is((select count(*) from public.role_capabilities where capability='contract.manage' and role in ('organization_owner','manager')),2::bigint,'capability portée par les rôles attendus');
select ok(not has_table_privilege('authenticated','public.lease_contracts','select'),'pas de lecture directe des contrats');
select ok(not has_table_privilege('anon','public.lease_contracts','select'),'anon ne lit pas directement les contrats');
select ok(not has_table_privilege('public','public.lease_contracts','select'),'PUBLIC ne lit pas directement les contrats');
select ok(not has_table_privilege('authenticated','public.contract_signatures','select'),'pas de lecture directe des signatures');
select ok(not has_function_privilege('anon','public.list_contracts_for_export(uuid)','execute'),'anon ne peut appeler la RPC export contrats');
select ok(not has_function_privilege('public','public.list_contracts_for_export(uuid)','execute'),'PUBLIC ne peut appeler la RPC export contrats');
select ok(not has_function_privilege('anon','public.generate_lease_contract(uuid,uuid)','execute'),'anon ne génère pas de contrat');
select ok(not has_function_privilege('anon','public.sign_lease_contract_tenant(uuid,uuid,text,jsonb,text,text)','execute'),'anon ne signe pas');
select ok(not exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.send_lease_contract(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC ne peut envoyer');
select ok((select not public from storage.buckets where id='contract-documents'),'bucket contrat privé');
select is((select count(*) from public.contract_templates where is_system and language='fr'),1::bigint,'modèle système FR présent');
select is((select count(*) from public.contract_templates where is_system and language='en'),1::bigint,'modèle système EN présent');

create temporary table pg_temp.contract_ids(id uuid primary key) on commit drop;
grant select,insert on pg_temp.contract_ids to authenticated;
create temporary table pg_temp.template_ids(id uuid primary key) on commit drop;
insert into pg_temp.template_ids select id from public.contract_templates where is_system and language='fr';
grant select on pg_temp.template_ids to authenticated;
set local role authenticated;
select throws_ok($$select * from public.lease_contracts$$,'42501',null,'authenticated ne peut lire directement la table contrats');
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000003',true);
select throws_ok($$select * from public.list_contracts_for_export('f6100000-0000-4000-8000-00000000000a')$$,'42501','forbidden','Viewer sans data_export.manage refusé par la RPC export');
select throws_ok($$select public.generate_lease_contract('f6500000-0000-4000-8000-00000000000a',(select id from pg_temp.template_ids))$$,'42501','not_found','Viewer refusé');
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000004',true);
select throws_ok($$select * from public.list_contracts_for_export('f6100000-0000-4000-8000-00000000000a')$$,'42501','forbidden','Owner B ne lit pas les contrats de Organization A');
select throws_ok($$select public.generate_lease_contract('f6500000-0000-4000-8000-00000000000a',(select id from pg_temp.template_ids))$$,'42501','not_found','Owner B refusé sur Lease A');
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000001',true);
insert into pg_temp.contract_ids select public.generate_lease_contract('f6500000-0000-4000-8000-00000000000a',(select id from pg_temp.template_ids));
select is((select count(*) from public.list_contracts_for_export('f6100000-0000-4000-8000-00000000000a')),1::bigint,'Owner autorisé exporte le résumé de son Organization');
select is((select count(*) from public.get_lease_contracts('f6100000-0000-4000-8000-00000000000a','f6500000-0000-4000-8000-00000000000a')),1::bigint,'Owner voit le contrat A');
select is((select template_version from public.get_lease_contract('f6100000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids))),1,'version du modèle figée');
select is((select count(*) from jsonb_array_elements((select content_snapshot from public.get_lease_contract('f6100000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids)))) as section where section->>'key'='deposit'),0::bigint,'clause dépôt masquée pour dépôt nul');
select is((select count(*) from jsonb_array_elements((select content_snapshot from public.get_lease_contract('f6100000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids)))) as section where section->>'key'='charges'),1::bigint,'clause charges présente quand applicable');
select ok(public.validate_lease_contract((select id from pg_temp.contract_ids),(select content_snapshot from public.get_lease_contract('f6100000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids))),repeat('a',64)) is not null,'validation explicite réussit');
select ok(public.sign_lease_contract_owner((select id from pg_temp.contract_ids),'stylized_name','{"displayName":"Owner A"}'::jsonb,'Consentement exact',repeat('a',64)) is not null,'signature Owner enregistrée');
select is((select status from public.get_lease_contract('f6100000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids))),'owner_signed','état owner_signed formel');
select ok(public.send_lease_contract((select id from pg_temp.contract_ids)) is not null,'envoi vers accès actif réussit');
select is((select count(*) from public.notifications where recipient_tenant_portal_access_id='f6600000-0000-4000-8000-00000000000a' and notification_type='contract_ready'),0::bigint,'lecture directe notifications reste RLS refusée');
reset role;
select is((select count(*) from public.notifications where recipient_tenant_portal_access_id='f6600000-0000-4000-8000-00000000000a' and notification_type='contract_ready'),1::bigint,'notification contrat tenant-scoped créée');

set local role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"session-portal-b-6f"}',true);
select throws_ok(format('select * from public.get_my_tenant_portal_contract(%L,%L)','f6600000-0000-4000-8000-00000000000b',(select id from pg_temp.contract_ids)),'42501','not_found','Tenant B ne lit pas contrat A');
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a-6f"}',true);
select is((select count(*) from public.list_my_tenant_portal_contracts('f6600000-0000-4000-8000-00000000000a',null)),1::bigint,'Tenant A voit son contrat envoyé');
select is((select count(*) from public.get_my_tenant_portal_contract('f6600000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids))),1::bigint,'UUID exact autorisé au Tenant A');
select ok(public.sign_lease_contract_tenant('f6600000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids),'drawn','{"strokes":[{"x":1,"y":1},{"x":2,"y":2}]}'::jsonb,'Consentement locataire',repeat('a',64)) is not null,'signature locataire enregistrée');
select is((select count(*) from public.get_lease_contract_signatures((select id from pg_temp.contract_ids),'f6600000-0000-4000-8000-00000000000a')),2::bigint,'deux preuves de signature liées au hash');
select ok(public.finalize_lease_contract('f6600000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids),'f6100000-0000-4000-8000-00000000000a/'||(select id from pg_temp.contract_ids)||'/v1/final.pdf',repeat('b',64),2048) is not null,'finalisation exacte autorisée');
select is((select status from public.get_my_tenant_portal_contract('f6600000-0000-4000-8000-00000000000a',(select id from pg_temp.contract_ids))),'completed','contrat final immuable disponible');
select throws_ok(format('update public.lease_contracts set status=%L where id=%L','draft',(select id from pg_temp.contract_ids)),'42501',null,'table contrat non modifiable directement');
reset role;
select throws_ok(format('update public.lease_contracts set status=%L where id=%L','draft',(select id from pg_temp.contract_ids)),'23514','immutable_contract','contrat final protégé même côté privilégié');
select is((select count(distinct content_sha256) from public.contract_signatures where contract_id=(select id from pg_temp.contract_ids)),1::bigint,'hash signé stable pour les deux parties');
select is((select count(*) from public.administrative_audit_log where contract_id=(select id from pg_temp.contract_ids) and action like 'contract.%'),7::bigint,'audit complet sans jeton brut');
select ok(not private.valid_contract_sections('[{"key":"bad","title":"Bad","condition":"always","body":"{{process.env.SECRET}}"}]'::jsonb),'langage libre interdit dans les modèles');
select ok(not private.can_access_contract_document_path('f6100000-0000-4000-8000-00000000000b/'||(select id from pg_temp.contract_ids)||'/v1/final.pdf'),'chemin d’une autre Organization refusé');

update public.tenant_portal_accesses set status='revoked',revoked_at=now() where id='f6600000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"f6000000-0000-4000-8000-000000000005","role":"authenticated","session_id":"session-portal-a-6f"}',true);
select throws_ok($$select * from public.list_my_tenant_portal_contracts('f6600000-0000-4000-8000-00000000000a',null)$$,'42501','not_found','révocation immédiate bloque le portail');
reset role;
select ok(not private.can_access_contract_document_path('f6100000-0000-4000-8000-00000000000a/'||(select id from pg_temp.contract_ids)||'/v1/final.pdf'),'révocation bloque aussi le document privé');

select * from finish();
rollback;
