begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

-- Contrat, privilèges et garde-fous structurels.
select has_column('public','tenant_communication_preferences','whatsapp_status','état WhatsApp explicite');
select has_column('public','tenant_communication_preferences','country_code','pays structuré');
select has_column('public','tenant_communication_preferences','national_number','numéro national structuré');
select has_table('public','tenant_whatsapp_consent_events','historique locataire sans numéro');
select has_table('public','user_communication_preferences','préférences personnelles Owner/partenaire');
select has_table('public','partner_application_communication_preferences','préférences de candidature partenaire');
select has_table('public','personal_whatsapp_consent_events','historique personnel sans numéro');
select has_function('public','save_tenant_whatsapp_preferences_v2',array['uuid','text','text','text','text','boolean','text','boolean','boolean','text','text'],'sauvegarde v2 présente');
select has_function('public','prepare_manual_whatsapp_handoff',array['uuid'],'handoff manuel présent');
select has_function('public','set_my_tenant_whatsapp_status',array['uuid','text','text'],'confirmation portail présente');
select ok((select bool_and(prosecdef) from pg_proc where oid in (
  'public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)'::regprocedure,
  'public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure,
  'public.set_my_tenant_whatsapp_status(uuid,text,text)'::regprocedure
)),'les trois RPC sont SECURITY DEFINER');
select ok((select bool_and('search_path=""'=any(proconfig)) from pg_proc where oid in (
  'public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)'::regprocedure,
  'public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure,
  'public.set_my_tenant_whatsapp_status(uuid,text,text)'::regprocedure
)),'les trois RPC ont un search_path vide');
select ok(
  not has_function_privilege('public','public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)','execute')
  and not has_function_privilege('public','public.prepare_manual_whatsapp_handoff(uuid)','execute')
  and not has_function_privilege('public','public.set_my_tenant_whatsapp_status(uuid,text,text)','execute'),
  'PUBLIC ne peut exécuter aucune RPC du lot'
);
select ok((select relrowsecurity from pg_class where oid='public.tenant_whatsapp_consent_events'::regclass),'RLS historique');
select ok(not has_table_privilege('anon','public.tenant_whatsapp_consent_events','select'),'anon ne lit pas historique');
select ok(not has_table_privilege('authenticated','public.tenant_whatsapp_consent_events','select'),'authenticated ne lit pas directement historique');
select ok(not has_function_privilege('anon','public.prepare_manual_whatsapp_handoff(uuid)','execute'),'anon ne prépare pas de handoff');
select ok(has_function_privilege('authenticated','public.prepare_manual_whatsapp_handoff(uuid)','execute'),'authenticated passe par RPC gardée');
select ok(not has_function_privilege('anon','public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)','execute'),'anon ne modifie pas les préférences');
select ok(has_function_privilege('authenticated','public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)','execute'),'authenticated passe par RPC gardée');
select ok(position('receipt.share' in pg_get_functiondef('public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure))>0,'capability document exigée');
select ok(position('tenant.manage' in pg_get_functiondef('public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)'::regprocedure))>0,'capability locataire exigée');
select ok(position('organization_id=d.organization_id' in replace(pg_get_functiondef('public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure),' ',''))>0,'Organization du document imposée');
select ok(position('whatsapp_open_requested' in pg_get_functiondef('public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure))>0,'ouverture seule auditée');
select trigger_is('public','tenant_whatsapp_consent_events','tenant_whatsapp_consent_events_immutable','private','prevent_whatsapp_event_mutation','historique append-only');
select ok(not has_function_privilege('anon','public.set_my_tenant_whatsapp_status(uuid,text,text)','execute'),'anon ne confirme pas');
select ok(has_function_privilege('authenticated','public.set_my_tenant_whatsapp_status(uuid,text,text)','execute'),'portail authentifié passe par RPC');
select ok(position('has_active_tenant_portal_access' in pg_get_functiondef('public.set_my_tenant_whatsapp_status(uuid,text,text)'::regprocedure))>0,'accès portail actif exigé');
select ok(position('tenant_confirmed' in pg_get_functiondef('public.set_my_tenant_whatsapp_status(uuid,text,text)'::regprocedure))>0 and position('disabled' in pg_get_functiondef('public.set_my_tenant_whatsapp_status(uuid,text,text)'::regprocedure))>0,'confirmation portail distincte de verified et retrait audités');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)'::regprocedure))>0,'première sauvegarde sérialisée avant upsert');
select ok(position('tenant_marketing_consent_requires_tenant_action' in pg_get_functiondef('public.save_tenant_whatsapp_preferences_v2(uuid,text,text,text,text,boolean,text,boolean,boolean,text,text)'::regprocedure))>0,'le bailleur ne peut pas consentir au marketing');
select ok(position('coalesce(d.review_status' in pg_get_functiondef('public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure))=0,'aucun statut review NULL n’est approuvé implicitement');
select ok(position('review_status is distinct from ''approved''' in pg_get_functiondef('public.prepare_manual_whatsapp_handoff(uuid)'::regprocedure))>0,'seul approved autorise le handoff');
select ok(null is distinct from 'approved' and 'pending' is distinct from 'approved' and 'rejected' is distinct from 'approved' and 'refused' is distinct from 'approved','NULL, pending, rejected et refused sont tous non approuvés');

-- Petite fixture contrôlée, multi-Organization et entièrement rollbackée.
insert into auth.users (id,aud,role,email,email_confirmed_at,created_at,updated_at) values
 ('a4100000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a-wa04@kjora.test',now(),now(),now()),
 ('a4100000-0000-4000-8000-000000000002','authenticated','authenticated','owner-b-wa04@kjora.test',now(),now(),now()),
 ('a4100000-0000-4000-8000-000000000003','authenticated','authenticated','outsider-wa04@kjora.test',now(),now(),now()),
 ('a4100000-0000-4000-8000-000000000004','authenticated','authenticated','tenant-wa04@kjora.test',now(),now(),now());
insert into public.organizations(id,created_by) values
 ('a4200000-0000-4000-8000-00000000000a','a4100000-0000-4000-8000-000000000001'),
 ('a4200000-0000-4000-8000-00000000000b','a4100000-0000-4000-8000-000000000002');
insert into public.organization_profiles(organization_id,name,language) values
 ('a4200000-0000-4000-8000-00000000000a','WA04 A','fr'),
 ('a4200000-0000-4000-8000-00000000000b','WA04 B','en');
insert into public.memberships(organization_id,user_id,role) values
 ('a4200000-0000-4000-8000-00000000000a','a4100000-0000-4000-8000-000000000001','organization_owner'),
 ('a4200000-0000-4000-8000-00000000000b','a4100000-0000-4000-8000-000000000002','organization_owner');
insert into public.tenants(id,organization_id,full_name,email,preferred_language,created_by) values
 ('a4300000-0000-4000-8000-00000000000a','a4200000-0000-4000-8000-00000000000a','Locataire WA04 A','tenant-a-wa04@kjora.test','fr','a4100000-0000-4000-8000-000000000001'),
 ('a4300000-0000-4000-8000-00000000000b','a4200000-0000-4000-8000-00000000000b','Tenant WA04 B','tenant-b-wa04@kjora.test','en','a4100000-0000-4000-8000-000000000002');
insert into public.financial_documents(
 id,organization_id,tenant_id,document_type,source_key,reference,status,language,issued_on,
 period_start,period_end,snapshot,storage_path,content_sha256,content_bytes,ready_at,
 review_status,approved_by,approved_at,created_by
) values
 ('a4400000-0000-4000-8000-00000000000a','a4200000-0000-4000-8000-00000000000a','a4300000-0000-4000-8000-00000000000a','due_notice','wa04-ready-a-0001','AVI-2026-940001','ready','fr','2026-10-02','2026-10-01','2026-10-31','{}','a/wa04-a.pdf',repeat('a',64),100,now(),'approved','a4100000-0000-4000-8000-000000000001',now(),'a4100000-0000-4000-8000-000000000001'),
 ('a4400000-0000-4000-8000-00000000000c','a4200000-0000-4000-8000-00000000000a','a4300000-0000-4000-8000-00000000000a','due_notice','wa04-draft-a-0002','AVI-2026-940002','ready','fr','2026-10-02','2026-10-01','2026-10-31','{}','a/wa04-c.pdf',repeat('c',64),100,now(),'draft',null,null,'a4100000-0000-4000-8000-000000000001'),
 ('a4400000-0000-4000-8000-00000000000b','a4200000-0000-4000-8000-00000000000b','a4300000-0000-4000-8000-00000000000b','due_notice','wa04-ready-b-0001','AVI-2026-940003','ready','en','2026-10-02','2026-10-01','2026-10-31','{}','b/wa04-b.pdf',repeat('b',64),100,now(),'approved','a4100000-0000-4000-8000-000000000002',now(),'a4100000-0000-4000-8000-000000000002');

set local role anon;
select throws_ok($$select public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000a')$$,'42501',null,'anon est refusé');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'42501','forbidden','sans membership ni capability, la sauvegarde est refusée');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'42501','forbidden','Owner d’une autre Organization refusé');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a',null,null,null,null,false,'in_app',false,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_preferences','les paramètres structurés NULL sont refusés');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','1','699000001','+1699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','indicatif incohérent refusé');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','069900000','+237069900000',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','préfixe national zéro refusé');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','69900AB01','+23769900AB01',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','caractères non numériques refusés');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','69900001','+23769900001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','longueur nationale incorrecte refusée');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','XX','999','699000001','+999699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','pays non supporté refusé');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000002',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'22023','invalid_whatsapp_phone','E164 incohérent refusé');
select throws_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'whatsapp',true,true,'owner_form','wa04-v1')$$,'42501','tenant_marketing_consent_requires_tenant_action','le bailleur ne peut pas consentir au marketing');
select lives_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')$$,'Owner autorisé enregistre une déclaration et un consentement service');
reset role;

select is((select whatsapp_status from public.tenant_communication_preferences where tenant_id='a4300000-0000-4000-8000-00000000000a'),'declared','une saisie Owner ne devient jamais verified');
select ok((select whatsapp_marketing_consented_at is null from public.tenant_communication_preferences where tenant_id='a4300000-0000-4000-8000-00000000000a'),'marketing reste désactivé par défaut');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('tenant_whatsapp_consent_events','personal_whatsapp_consent_events') and column_name in ('phone_e164','phone_fingerprint','national_number')),'aucun numéro ni fingerprint n’entre dans le journal');
select throws_ok($$update public.tenant_whatsapp_consent_events set action='disabled' where tenant_id='a4300000-0000-4000-8000-00000000000a'$$,'55000','whatsapp_consent_history_is_immutable','le registre refuse réellement toute modification');

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000a')$$,'42501','forbidden','Owner d’une autre Organization ne prépare pas le document');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000c')$$,'22023','document_not_approved','document non approuvé refusé');
select is(public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000a')->>'phoneE164','+237699000001','le destinataire est résolu côté serveur');
select is(public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000a')->>'language','fr','la langue sûre du locataire est conservée');
reset role;

select ok(exists(select 1 from public.tenant_whatsapp_consent_events where tenant_id='a4300000-0000-4000-8000-00000000000a' and action='whatsapp_open_requested'),'seule l’ouverture WhatsApp est auditée');
select is((select count(*) from public.whatsapp_outbox where organization_id='a4200000-0000-4000-8000-00000000000a'),0::bigint,'le mode manuel ne crée aucune tentative fournisseur');

update public.tenant_communication_preferences set whatsapp_status='verified' where tenant_id='a4300000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000001',true);
select is(public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'whatsapp',true,false,'owner_form','wa04-v1')->>'whatsappStatus','verified','une sauvegarde identique conserve et restitue verified');
select is(public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000002','+237699000002',true,'whatsapp',true,false,'owner_form','wa04-v1')->>'whatsappStatus','declared','un changement de numéro perd tout statut confirmé ou verified');
select ok((select whatsapp_marketing_consented_at is null from public.tenant_communication_preferences where tenant_id='a4300000-0000-4000-8000-00000000000a'),'le changement ne restaure aucun consentement marketing');
select lives_ok($$select public.save_tenant_whatsapp_preferences_v2('a4300000-0000-4000-8000-00000000000a','CM','237','699000001','+237699000001',true,'in_app',false,false,'owner_form','wa04-v1')$$,'le consentement service peut être retiré sans effacer l’historique');
select throws_ok($$select public.prepare_manual_whatsapp_handoff('a4400000-0000-4000-8000-00000000000a')$$,'22023','whatsapp_not_available','un consentement retiré bloque le handoff');
reset role;

insert into public.tenant_portal_accesses(id,organization_id,tenant_id,user_id,status,invited_email,preferred_language,invited_by,accepted_at) values
 ('a4500000-0000-4000-8000-00000000000a','a4200000-0000-4000-8000-00000000000a','a4300000-0000-4000-8000-00000000000a','a4100000-0000-4000-8000-000000000004','active','tenant-wa04@kjora.test','fr','a4100000-0000-4000-8000-000000000001',now());
insert into public.tenant_portal_sessions(id,organization_id,access_id,tenant_id,user_id,auth_session_id,expires_at) values
 ('a4600000-0000-4000-8000-00000000000a','a4200000-0000-4000-8000-00000000000a','a4500000-0000-4000-8000-00000000000a','a4300000-0000-4000-8000-00000000000a','a4100000-0000-4000-8000-000000000004','session-wa04-tenant-a',now()+interval '1 day');

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"session-wa04-tenant-a"}',true);
select lives_ok($$select public.set_my_tenant_whatsapp_status('a4500000-0000-4000-8000-00000000000a','confirm_service','wa04-v1')$$,'le locataire confirme le service depuis une session portail active');
reset role;
select is((select whatsapp_status from public.tenant_communication_preferences where tenant_id='a4300000-0000-4000-8000-00000000000a'),'tenant_confirmed','la confirmation du locataire ne produit jamais verified');

set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"a4100000-0000-4000-8000-000000000004","role":"authenticated","session_id":"session-wa04-tenant-a"}',true);
select lives_ok($$select public.set_my_tenant_whatsapp_status('a4500000-0000-4000-8000-00000000000a','disable','wa04-v1')$$,'le locataire retire son consentement depuis le portail');
reset role;
select ok((select whatsapp_status='disabled' and whatsapp_transactional_revoked_at is not null from public.tenant_communication_preferences where tenant_id='a4300000-0000-4000-8000-00000000000a'),'le retrait désactive WhatsApp et date la révocation');
select is((select count(*) from public.tenant_whatsapp_consent_events where tenant_id='a4300000-0000-4000-8000-00000000000a' and action in ('tenant_confirmed','disabled')),2::bigint,'confirmation et retrait restent dans le registre append-only');

select * from finish();
rollback;
