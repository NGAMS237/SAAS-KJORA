begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'collector-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'caretaker-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'accountant-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'viewer-a@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'target-owner-b@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'invitee@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'expired@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'revoked-invite@kjora.test', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'resend@kjora.test', now(), now(), now());

insert into public.organizations (id, created_by) values
  ('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-00000000000b', '11000000-0000-4000-8000-000000000002');
insert into public.organization_profiles (organization_id, name) values
  ('21000000-0000-4000-8000-00000000000a', 'Org A 5C'),
  ('21000000-0000-4000-8000-00000000000b', 'Org B 5C');
insert into public.memberships (id, organization_id, user_id, role) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-00000000000b', '11000000-0000-4000-8000-000000000002', 'organization_owner'),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000003', 'manager'),
  ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000004', 'collector'),
  ('31000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000005', 'caretaker'),
  ('31000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000006', 'accountant'),
  ('31000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000007', 'viewer'),
  ('31000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-00000000000b', '11000000-0000-4000-8000-000000000008', 'manager');

create temp table test_invite (invitation_id uuid, invitation_token text, expires_at timestamptz);
create temp table test_expired (invitation_id uuid, invitation_token text, expires_at timestamptz);
create temp table test_revoked (invitation_id uuid, invitation_token text, expires_at timestamptz);
create temp table test_resend_old (invitation_id uuid, invitation_token text, expires_at timestamptz);
create temp table test_resend_new (
  invitation_id uuid,
  invitation_email text,
  invitation_role text,
  invitation_token text,
  expires_at timestamptz
);
grant all on test_invite, test_expired, test_revoked, test_resend_old, test_resend_new to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'member.manage'), 'Owner gère les membres');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select isnt(private.has_capability('21000000-0000-4000-8000-00000000000a', 'member.manage'), true, 'gestionnaire ne gère pas les membres');
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'property.manage'), 'gestionnaire gère les biens');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'payment.record'), 'encaisseur enregistre un paiement');
select isnt(private.has_capability('21000000-0000-4000-8000-00000000000a', 'member.view'), true, 'encaisseur ne voit pas l équipe');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', true);
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'property.view'), 'gardien voit les biens');
select isnt(private.has_capability('21000000-0000-4000-8000-00000000000a', 'payment.view'), true, 'gardien ne voit pas les finances');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000006', true);
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'payment.view'), 'comptable voit les paiements');
select isnt(private.has_capability('21000000-0000-4000-8000-00000000000a', 'payment.record'), true, 'comptable n enregistre pas de paiement');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000007', true);
select ok(private.has_capability('21000000-0000-4000-8000-00000000000a', 'property.view'), 'consultation voit les biens');
select isnt(private.has_capability('21000000-0000-4000-8000-00000000000a', 'payment.view'), true, 'consultation ne reçoit pas de finance implicite');
select is((select count(distinct role) from public.role_capabilities), 6::bigint, 'exactement six rôles ont des capacités');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_organization_members('21000000-0000-4000-8000-00000000000a')), 6::bigint, 'Owner A voit les six membres A');
select throws_ok($$select * from public.list_organization_members('21000000-0000-4000-8000-00000000000b')$$, '42501', null, 'Owner A ne liste pas les membres B');
select is((select count(*) from public.membership_invitations where organization_id = '21000000-0000-4000-8000-00000000000b'), 0::bigint, 'UUID Organization B ne révèle aucune invitation à A');
insert into test_invite select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'invitee@kjora.test', 'viewer');
select is((select count(*) from test_invite), 1::bigint, 'Owner crée une invitation');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from test_invite), 'invitation expire dans sept jours');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000009', true);
select is((select count(*) from public.memberships where organization_id = '21000000-0000-4000-8000-00000000000a'), 0::bigint, 'aucune Membership avant acceptation');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select throws_ok($$select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'forbidden@kjora.test', 'viewer')$$, '42501', null, 'gestionnaire ne crée pas d invitation interne');
select throws_ok($$select public.change_membership_role('21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000007', 'manager')$$, '42501', null, 'gestionnaire ne change pas de rôle');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select throws_ok($$insert into public.memberships (organization_id, user_id, role) values ('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-000000000010', 'viewer')$$, '42501', null, 'ajout direct de Membership refusé');
select lives_ok($$select public.change_membership_role('21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000003', 'accountant')$$, 'Owner change un rôle A');
select throws_ok($$select public.change_membership_role('21000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-000000000008', 'viewer')$$, '42501', null, 'Owner A ne change pas un rôle B');
select lives_ok($$select public.revoke_membership('21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000004')$$, 'Owner révoque un membre A');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.organizations), 0::bigint, 'Membership révoqué perd immédiatement toute lecture');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'owner-invite@kjora.test', 'organization_owner')$$, '23514', null, 'Owner ne peut être créé par invitation générique');
select throws_ok($$select public.change_membership_role('21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000003', 'organization_owner')$$, '22023', null, 'promotion Owner exige le transfert dédié');
select throws_ok($$select public.revoke_membership('21000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-000000000001')$$, '22023', null, 'auto-révocation Owner interdite');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.revoke_membership('21000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-000000000002')$$, '22023', null, 'dernier Owner protégé par le transfert obligatoire');
select lives_ok($$select public.transfer_organization_ownership('21000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-000000000008')$$, 'transfert Owner atomique');
select is((select role from public.memberships where id = '31000000-0000-4000-8000-000000000002'), 'manager', 'ancien Owner devient gestionnaire');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000008', true);
select is((select role from public.memberships where id = '31000000-0000-4000-8000-000000000008'), 'organization_owner', 'cible devient Owner');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000009', true);
select is((select count(*) from public.inspect_membership_invitation((select invitation_token from test_invite))), 1::bigint, 'destinataire vérifié inspecte son invitation');
select lives_ok($$select public.accept_membership_invitation((select invitation_token from test_invite))$$, 'invitation acceptée une fois');
select is((select role from public.memberships where organization_id = '21000000-0000-4000-8000-00000000000a'), 'viewer', 'acceptation crée le rôle proposé');
select throws_ok($$select public.accept_membership_invitation((select invitation_token from test_invite))$$, '22023', null, 'invitation déjà utilisée refusée');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
insert into test_expired select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'expired@kjora.test', 'viewer');
reset role;
update public.membership_invitations set expires_at = now() - interval '1 minute' where id = (select invitation_id from test_expired);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000010', true);
select throws_ok($$select public.accept_membership_invitation((select invitation_token from test_expired))$$, '22023', null, 'invitation expirée refusée');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
insert into test_revoked select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'revoked-invite@kjora.test', 'viewer');
select is((select count(*) from test_revoked), 1::bigint, 'invitation à révoquer créée');
select lives_ok($$select public.revoke_membership_invitation((select invitation_id from test_revoked))$$, 'Owner révoque invitation');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000011', true);
select throws_ok($$select public.accept_membership_invitation((select invitation_token from test_revoked))$$, '22023', null, 'invitation révoquée refusée');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
insert into test_resend_old select * from public.create_membership_invitation('21000000-0000-4000-8000-00000000000a', 'resend@kjora.test', 'manager');
insert into test_resend_new select * from public.resend_membership_invitation((select invitation_id from test_resend_old));
select is((select count(*) from test_resend_new), 1::bigint, 'relance crée une nouvelle invitation');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000012', true);
select is((select count(*) from public.inspect_membership_invitation((select invitation_token from test_resend_old))), 0::bigint, 'ancien token invalidé par relance');
select is((select count(*) from public.inspect_membership_invitation((select invitation_token from test_resend_new))), 1::bigint, 'nouveau token de relance valide');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select ok((select count(*) > 0 from public.administrative_audit_log where organization_id = '21000000-0000-4000-8000-00000000000a'), 'Owner voit audit administratif A');
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.administrative_audit_log), 0::bigint, 'non Owner ne voit aucun audit');
select throws_ok($$update public.memberships set role = 'organization_owner' where id = '31000000-0000-4000-8000-000000000003'$$, '42501', null, 'UPDATE direct Membership refusé');
select throws_ok($$delete from public.memberships where id = '31000000-0000-4000-8000-000000000003'$$, '42501', null, 'DELETE direct Membership refusé');

do $$
declare
  diagnostics text;
begin
  select string_agg(result, E'\n')
    into diagnostics
    from extensions.finish() as result;
  if diagnostics is not null then
    raise exception 'Lot 5C pgTAP failures: %', diagnostics;
  end if;
end;
$$;
select 'lot_5c_rls_ok' as result;
rollback;
