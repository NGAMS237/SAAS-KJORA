begin;
create extension if not exists pgtap with schema extensions;
select plan(272);

-- =============================================================================
-- NOTIFICATIONS-COMMUNICATIONS-E2E-01 v4 — Tests pgTAP (272 assertions)
-- =============================================================================
-- Transaction annulée (rollback) : rien ne survit. RÉELLEMENT EXÉCUTÉ sur un
-- PostgreSQL 16 local éphémère avec pgtap réel (jamais Supabase distant).
-- Aucun appel réseau : la base ne parle jamais à Resend ; les RPC du worker
-- sont exercées exactement comme le serveur les appelle (rôle service_role).
--
-- Préfixe d'identifiants réservé à ce fichier : e2…
--   Utilisateurs : …01 Owner A, …02 Viewer A, …03 Owner B, …04 Admin plateforme,
--                  …05 Manager A
--   Organizations : …0a A (active), …0b B (active), …0c C (suspendue, Owner A)
--   SaaS : …1a..1h (voir §6)
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-e2e@kjora.test', now(), now(), now()),
  ('e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'viewer-a-e2e@kjora.test', now(), now(), now()),
  ('e2000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-b-e2e@kjora.test', now(), now(), now()),
  ('e2000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin-e2e@kjora.test', now(), now(), now()),
  ('e2000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'manager-a-e2e@kjora.test', now(), now(), now());

insert into public.platform_admins (user_id) values ('e2000000-0000-4000-8000-000000000004');

insert into public.organizations (id, created_by, status) values
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000001', 'active'),
  ('e2100000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-000000000003', 'active'),
  ('e2100000-0000-4000-8000-00000000000c', 'e2000000-0000-4000-8000-000000000001', 'suspended');
insert into public.organization_profiles (organization_id, name) values
  ('e2100000-0000-4000-8000-00000000000a', 'E2E Org A'),
  ('e2100000-0000-4000-8000-00000000000b', 'E2E Org B'),
  ('e2100000-0000-4000-8000-00000000000c', 'E2E Org C');
insert into public.memberships (organization_id, user_id, role) values
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000001', 'organization_owner'),
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000002', 'viewer'),
  ('e2100000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-000000000005', 'manager'),
  ('e2100000-0000-4000-8000-00000000000b', 'e2000000-0000-4000-8000-000000000003', 'organization_owner'),
  ('e2100000-0000-4000-8000-00000000000c', 'e2000000-0000-4000-8000-000000000001', 'organization_owner');

insert into public.properties (id, organization_id, name, locality, type, created_by) values
  ('e2200000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'Résidence E2E', 'Douala', 'building', 'e2000000-0000-4000-8000-000000000001'),
  ('e2200000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000b', 'Immeuble B E2E', 'Yaoundé', 'building', 'e2000000-0000-4000-8000-000000000003');
insert into public.units (id, organization_id, property_id, label, type, created_by) values
  ('e2300000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'Porte 3', 'apartment', 'e2000000-0000-4000-8000-000000000001'),
  ('e2300000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000b', 'e2200000-0000-4000-8000-00000000000b', 'B1', 'studio', 'e2000000-0000-4000-8000-000000000003');
insert into public.tenants (id, organization_id, full_name, phone, email, preferred_language, created_by) values
  ('e2400000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'Awa Locataire', '+237699400001', 'awa-e2e@kjora.test', 'fr', 'e2000000-0000-4000-8000-000000000001'),
  ('e2400000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000b', 'Bola Tenant', '+237699400002', 'bola-e2e@kjora.test', 'en', 'e2000000-0000-4000-8000-000000000003');
insert into public.leases (
  id, organization_id, property_id, unit_id, tenant_id, status, start_date,
  base_rent_xaf, recurring_charges_xaf, billing_frequency, due_day, generate_due_days_before, created_by
) values
  ('e2500000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000a', 'e2200000-0000-4000-8000-00000000000a', 'e2300000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'active', current_date - 90, 40000, 0, 'monthly', 5, 5, 'e2000000-0000-4000-8000-000000000001'),
  ('e2500000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000b', 'e2200000-0000-4000-8000-00000000000b', 'e2300000-0000-4000-8000-00000000000b', 'e2400000-0000-4000-8000-00000000000b', 'active', current_date - 90, 50000, 0, 'monthly', 5, 5, 'e2000000-0000-4000-8000-000000000003');

-- Échéances d'A :
--   …01 avis À L'HEURE (notice_date = aujourd'hui)       → avis + courriel si activé
--   …02 avis passé de 3 jours (cron manqué)               → avis tardif, JAMAIS de courriel
--   …03 avis passé de 20 jours, échéance ANCIENNE        → hors quotidien, réconciliation
--   …04 avis futur                                        → rien
insert into public.dues (
  id, organization_id, lease_id, tenant_id, kind, generation_key, reference, period_start,
  period_end, due_date, notice_date, rent_amount_xaf, recurring_charges_amount_xaf, created_by, created_at
) values
  ('e2600000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-00000000000a', 'e2500000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'periodic', 'e2e:ontime:period', 'DUE-E2E-ONTIME', current_date + 1, current_date + 30, current_date + 5, current_date, 40000, 0, 'e2000000-0000-4000-8000-000000000001', now() - interval '40 days'),
  ('e2600000-0000-4000-8000-000000000002', 'e2100000-0000-4000-8000-00000000000a', 'e2500000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'periodic', 'e2e:missed:period', 'DUE-E2E-MISSED', current_date - 29, current_date, current_date + 2, current_date - 3, 40000, 0, 'e2000000-0000-4000-8000-000000000001', now() - interval '40 days'),
  ('e2600000-0000-4000-8000-000000000003', 'e2100000-0000-4000-8000-00000000000a', 'e2500000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'periodic', 'e2e:history:period', 'DUE-E2E-HISTORY', current_date - 59, current_date - 30, current_date - 15, current_date - 20, 40000, 0, 'e2000000-0000-4000-8000-000000000001', now() - interval '40 days'),
  ('e2600000-0000-4000-8000-000000000004', 'e2100000-0000-4000-8000-00000000000a', 'e2500000-0000-4000-8000-00000000000a', 'e2400000-0000-4000-8000-00000000000a', 'periodic', 'e2e:future:period', 'DUE-E2E-FUTURE', current_date + 31, current_date + 60, current_date + 35, current_date + 30, 40000, 0, 'e2000000-0000-4000-8000-000000000001', now() - interval '40 days'),
  ('e2600000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000b', 'e2500000-0000-4000-8000-00000000000b', 'e2400000-0000-4000-8000-00000000000b', 'periodic', 'e2e:org-b:period', 'DUE-E2E-B', current_date + 1, current_date + 30, current_date + 5, current_date, 50000, 0, 'e2000000-0000-4000-8000-000000000003', now() - interval '40 days');

-- =============================================================================
-- 1. Paramètres de communication (Phase D) — propriétaire seul, audités
-- =============================================================================

select has_function('public', 'get_organization_communication_settings', array['uuid'], 'lecture des réglages existe');
select has_function('public', 'save_organization_communication_settings',
  array['uuid', 'boolean', 'boolean', 'boolean', 'boolean', 'boolean'], 'enregistrement des réglages existe');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);

select is(
  (public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') ->> 'configured'),
  'false', 'réglages non configurés par défaut'
);
select is(
  (public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') ->> 'dueNoticeEmailEnabled'),
  'false', 'avis d''échéance par courriel désactivé par défaut'
);
select ok(
  (public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') ->> 'ownerEmailDeliverable')::boolean,
  'adresse du propriétaire signalée comme utilisable (booléen, jamais l''adresse)'
);
select ok(
  not (public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') ? 'ownerEmail'),
  'la lecture des réglages ne renvoie jamais l''adresse du propriétaire'
);
select is(
  (public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000a', true, true, true, true, null) ->> 'outcome'),
  'invalid_settings', 'réglage NULL refusé sans rien écrire'
);
select throws_ok(
  $$ select public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000c', true, true, true, true, true) $$,
  '42501', 'forbidden', 'Organization suspendue : enregistrement refusé même au propriétaire'
);
select throws_ok(
  $$ select public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000b', true, true, true, true, true) $$,
  '42501', 'forbidden', 'Organization étrangère : enregistrement refusé'
);

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$ select public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000a', true, true, true, true, true) $$,
  '42501', 'forbidden', 'un collaborateur (gestionnaire) ne peut pas modifier les réglages'
);
select throws_ok(
  $$ select public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') $$,
  '42501', 'forbidden', 'un collaborateur ne lit pas les réglages du propriétaire'
);

-- =============================================================================
-- 2. Avis d'échéance (Phase C) — rattrapage borné, jamais de courriel tardif
-- =============================================================================
-- Premier passage SANS réglage : aucun courriel, quel que soit l'avis.

reset role;
select lives_ok($$ select * from private.prepare_financial_communications(current_date) $$, 'passage quotidien sans réglage');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000001' and document_type = 'due_notice'), 1, 'avis à l''heure créé');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'), 1,
  'avis manqué (cron absent 3 jours) rattrapé');
select ok((select (snapshot ->> 'issued_late')::boolean from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'l''avis rattrapé est marqué émis en retard dans son instantané');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'), 0,
  'échéance historique (> 7 jours, ancienne) : jamais traitée par le quotidien');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000004' and document_type = 'due_notice'), 0, 'avis futur : rien');
select is((select count(*)::int from public.message_deliveries where organization_id = 'e2100000-0000-4000-8000-00000000000a'), 0,
  'aucun courriel sans réglage enregistré');
select is((select count(*)::int from public.notifications
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and notification_type = 'due_notice_ready'
    and recipient_user_id = 'e2000000-0000-4000-8000-000000000001'
    and deduplication_key in ('due_notice_ready:e2600000-0000-4000-8000-000000000001',
                              'due_notice_ready:e2600000-0000-4000-8000-000000000002')), 2,
  'une notification interne par avis créé, pour le propriétaire');

select set_config('kjora_test.e2_notice_count',
  (select count(*)::text from public.financial_documents
    where organization_id = 'e2100000-0000-4000-8000-00000000000a' and document_type = 'due_notice'), true);
select lives_ok($$ select * from private.prepare_financial_communications(current_date) $$, 'second passage le même jour');
select is((select count(*)::int from public.financial_documents
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and document_type = 'due_notice'),
  current_setting('kjora_test.e2_notice_count')::int,
  'rejeu : aucun avis dupliqué');

-- Réconciliation historique : dry-run par défaut, par lots, jamais de courriel.
select is((private.reconcile_due_notices(current_date, 50) ->> 'dry_run'), 'true', 'réconciliation en dry-run par défaut');
select is((private.reconcile_due_notices(current_date, 50) ->> 'candidates')::int >= 1, true, 'la réconciliation compte l''avis historique manquant');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'), 0, 'le dry-run n''écrit rien');
select throws_ok($$ select private.reconcile_due_notices(current_date, 0, true) $$, '22023', 'invalid_batch_limit', 'lot nul refusé');
select throws_ok($$ select private.reconcile_due_notices(current_date, 501, true) $$, '22023', 'invalid_batch_limit', 'lot > 500 refusé');

-- =============================================================================
-- 3. Réglages activés : file des courriels locatifs (Phases D/E)
-- =============================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select is(
  (public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000a', true, true, true, true, true) ->> 'outcome'),
  'saved', 'le propriétaire enregistre ses réglages'
);
select is(
  (public.get_organization_communication_settings('e2100000-0000-4000-8000-00000000000a') ->> 'configured'),
  'true', 'réglages désormais configurés'
);
select is(
  (public.save_organization_communication_settings('e2100000-0000-4000-8000-00000000000a', true, true, true, true, true) ->> 'outcome'),
  'saved', 'enregistrement idempotent'
);
reset role;
select is((select count(*)::int from public.organization_communication_settings
  where organization_id = 'e2100000-0000-4000-8000-00000000000a'), 1, 'une seule ligne de réglages (upsert)');
select is((select count(*)::int from public.administrative_audit_log
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and action = 'communication.settings_updated'), 2,
  'chaque enregistrement est audité');

-- Réconciliation réelle APRÈS activation : crée l'avis, jamais de courriel.
select is((private.reconcile_due_notices(current_date, 50, false) ->> 'emails_queued')::int, 0, 'réconciliation réelle : zéro courriel');
select is((select count(*)::int from public.financial_documents
  where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'), 1, 'avis historique créé par la réconciliation');
select is((select count(*)::int from public.message_deliveries where organization_id = 'e2100000-0000-4000-8000-00000000000a'), 0,
  'aucun courriel pour un avis historique, même réglages activés');
select is((private.reconcile_due_notices(current_date, 50, false) ->> 'created')::int, 0, 'réconciliation rejouée : rien de plus');

-- Mise en file explicite d'un document à l'heure (même chemin que le quotidien).
select lives_ok($$ select private.queue_automatic_delivery(
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000001' and document_type = 'due_notice')) $$,
  'mise en file d''un avis à l''heure');
select is((select count(*)::int from public.message_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and recipient_email = 'awa-e2e@kjora.test'), 1,
  'courriel locataire mis en file');
select is((select count(*)::int from public.message_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and idempotency_key like 'automatic-owner-copy:%'), 1,
  'copie propriétaire mise en file');
select lives_ok($$ select private.queue_automatic_delivery(
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000001' and document_type = 'due_notice')) $$,
  'double mise en file');
select is((select count(*)::int from public.message_deliveries where organization_id = 'e2100000-0000-4000-8000-00000000000a'), 2,
  'double mise en file : aucune ligne de plus (clé d''idempotence)');

-- Organization B sans réglage : son avis à l'heure ne part jamais.
select is((select count(*)::int from public.message_deliveries where organization_id = 'e2100000-0000-4000-8000-00000000000b'), 0,
  'Organization sans réglage : aucun courriel');

-- =============================================================================
-- 4. Worker : réservation, point de non-retour, résultats ambigus (Phase E v2)
-- =============================================================================
-- Garantie testée : au plus UNE tentative automatique susceptible d'avoir été
-- acceptée par ligne et par génération ; toute ambiguïté → 'delivery_unknown',
-- jamais ré-expédiée automatiquement, même après plus de 24 h (au-delà de
-- l'expiration des clés d'idempotence Resend).

select ok(not has_function_privilege('authenticated', 'public.claim_message_deliveries(integer,integer)', 'execute'),
  'un utilisateur connecté ne peut pas réserver la file');
select ok(not has_function_privilege('authenticated', 'public.mark_message_delivery_sending(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_message_delivery_unknown(uuid,uuid,text)', 'execute'),
  'un utilisateur connecté ne peut ni marquer un envoi ni le déclarer inconnu');
select ok(not has_function_privilege('anon', 'public.record_email_provider_event(text,text,text,timestamptz,text,uuid,integer)', 'execute'),
  'anon ne peut pas enregistrer un événement fournisseur');
select ok(not has_function_privilege('authenticated', 'public.run_communications_daily_system(date,boolean)', 'execute'),
  'un utilisateur connecté ne peut pas lancer l''orchestrateur système');

create temporary table pg_temp.claimed (id uuid, claim_token uuid, attempt_count smallint, is_owner_copy boolean, resend_generation smallint) on commit drop;
grant all on pg_temp.claimed to service_role;

select set_config('kjora_test.row_a', (select id::text from public.message_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and recipient_email = 'awa-e2e@kjora.test'), true);
select set_config('kjora_test.row_b', (select id::text from public.message_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and idempotency_key like 'automatic-owner-copy:%'), true);

set local role service_role;
select throws_ok($$ select * from public.claim_message_deliveries(0, 900) $$, '22023', 'invalid_batch', 'lot de réservation nul refusé');
select throws_ok($$ select * from public.claim_message_deliveries(5, 10) $$, '22023', 'invalid_lease', 'bail trop court refusé');
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select count(*)::int from pg_temp.claimed), 2, 'les deux courriels sont réservés');
select is((select count(*)::int from pg_temp.claimed where is_owner_copy), 1, 'la réservation signale la copie propriétaire (gabarit dédié)');
select is((select max(resend_generation)::int from pg_temp.claimed), 0, 'génération initiale 0 (clé d''idempotence stable)');
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0,
  'une seconde réservation concurrente ne reprend aucune ligne en cours');
select is((select min(attempt_count)::int from pg_temp.claimed), 1, 'la réservation consomme une tentative');

-- Ligne A : chemin nominal.
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_a')::uuid, gen_random_uuid()), false,
  'point de non-retour refusé avec un mauvais jeton');
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_a')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_a')::uuid)), true,
  'point de non-retour posé juste avant l''appel fournisseur');
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_a')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_a')::uuid)), false,
  'point de non-retour posé une seule fois');
select is(public.cancel_message_delivery(current_setting('kjora_test.row_a')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_a')::uuid), 'late_cancel'), false,
  'annulation impossible une fois l''envoi commencé');
select is(public.complete_message_delivery(current_setting('kjora_test.row_a')::uuid, gen_random_uuid(), 're_fake_1'),
  false, 'finalisation avec un mauvais jeton refusée');
select is(public.complete_message_delivery(current_setting('kjora_test.row_a')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_a')::uuid), 're_fake_1'),
  true, 'finalisation avec le bon jeton et l''identifiant fournisseur');
select is(public.complete_message_delivery(current_setting('kjora_test.row_a')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_a')::uuid), 're_fake_1'),
  false, 'finalisation rejouée : sans effet');

-- Ligne B : refus CERTAIN (429) → relançable ; le délai n'est qu'un minimum.
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid)), true, 'envoi B commencé');
select is(public.fail_message_delivery(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid), 'resend_429', true),
  true, 'refus certain (429) enregistré');
reset role;
select is((select status from public.message_deliveries where id = current_setting('kjora_test.row_a')::uuid), 'sent', 'ligne A envoyée');
select ok((select status = 'failed' and attempt_count = 1 and send_started_at is null and last_error_message = 'resend_429'
    and next_attempt_at > now() + interval '4 minutes' and next_attempt_at <= now() + interval '6 minutes'
  from public.message_deliveries where id = current_setting('kjora_test.row_b')::uuid),
  'refus certain : relançable, délai MINIMAL de 5 minutes');
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0,
  'avant le délai minimal : rien n''est réservé');
reset role;

-- Prochain passage quotidien (plus de 24 h plus tard) : un refus certain
-- peut repartir sans risque — rien n'avait été accepté.
update public.message_deliveries set next_attempt_at = now() - interval '25 hours', updated_at = now() - interval '25 hours'
 where id = current_setting('kjora_test.row_b')::uuid;
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select attempt_count::int from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid), 2,
  'refus certain repris au passage suivant (seconde tentative)');

-- Timeout AMBIGU : le fournisseur a pu accepter → revue, aucune relance.
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid)), true, 'envoi B repris');
select is(public.mark_message_delivery_unknown(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid), 'provider_timeout'),
  true, 'délai dépassé : issue déclarée inconnue');
reset role;
select ok((select status = 'delivery_unknown' and review_reason = 'ambiguous_provider_response'
    and last_error_code = 'provider_timeout' and next_attempt_at is null and sent_at is null
  from public.message_deliveries where id = current_setting('kjora_test.row_b')::uuid),
  'timeout ambigu : revue Admin requise, aucune date de relance');
update public.message_deliveries set updated_at = now() - interval '30 hours'
 where id = current_setting('kjora_test.row_b')::uuid;
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0,
  'reprise après plus de 24 h : une issue inconnue n''est JAMAIS ré-expédiée automatiquement');
reset role;

-- Crash APRÈS acceptation fournisseur mais AVANT finalisation en base
-- (ligne C) : le bail expire → revue, jamais de nouvelle expédition ;
-- la finalisation tardive, avec l'identifiant fournisseur pour preuve,
-- reste acceptée.
insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-c-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-crash-c-0001', 'automatic', now());
select set_config('kjora_test.row_c', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-crash-c-0001'), true);
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_c')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_c')::uuid)), true, 'envoi C commencé');
reset role;
-- … le worker meurt ici ; plus de 24 h passent.
update public.message_deliveries set claimed_at = now() - interval '25 hours'
 where id = current_setting('kjora_test.row_c')::uuid;
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0,
  'crash après le début de l''envoi : aucune nouvelle réservation, même après 24 h');
reset role;
select ok((select status = 'delivery_unknown' and review_reason = 'worker_lease_expired' and claim_token is null
  from public.message_deliveries where id = current_setting('kjora_test.row_c')::uuid),
  'bail expiré après le début de l''envoi : issue inconnue');
set local role service_role;
select is(public.complete_message_delivery(current_setting('kjora_test.row_c')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_c')::uuid), 're_late_c'),
  true, 'finalisation tardive avec preuve fournisseur : l''ambiguïté est levée');
select is(public.complete_message_delivery(current_setting('kjora_test.row_c')::uuid, gen_random_uuid(), 're_other'),
  false, 'une autre réservation ne peut pas se l''approprier');
reset role;
select is((select status from public.message_deliveries where id = current_setting('kjora_test.row_c')::uuid), 'sent',
  'ligne C envoyée une seule fois');

-- Crash AVANT tout appel fournisseur (ligne E) : aucun risque → réservable.
insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-e-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-before-e-01', 'automatic', now());
select set_config('kjora_test.row_e', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-before-e-01'), true);
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
reset role;
update public.message_deliveries set claimed_at = now() - interval '2 hours' where id = current_setting('kjora_test.row_e')::uuid;
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select attempt_count::int from pg_temp.claimed where id = current_setting('kjora_test.row_e')::uuid), 2,
  'crash avant l''appel fournisseur : ligne à nouveau réservée (aucun envoi possible avant)');
select is(public.fail_message_delivery(current_setting('kjora_test.row_e')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_e')::uuid), 'resend_422', false),
  true, 'refus définitif (422)');
reset role;
select ok((select status = 'failed' and attempt_count = 3 and next_attempt_at is null and last_error_code = 'delivery_exhausted'
  from public.message_deliveries where id = current_setting('kjora_test.row_e')::uuid),
  'refus définitif : épuisé, jamais relancé');
select is((select count(*)::int from public.notifications
  where organization_id = 'e2100000-0000-4000-8000-00000000000a' and notification_type = 'delivery_failed'
    and recipient_user_id = 'e2000000-0000-4000-8000-000000000001'), 1,
  'l''échec définitif crée une notification interne');

-- =============================================================================
-- 4b. Revue Admin : décision explicite et auditée, jamais automatique
-- =============================================================================

-- Lignes F (abandon) et G (confirmation) passées en revue.
insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values
  ('e2100000-0000-4000-8000-00000000000a',
   (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'),
   'e2400000-0000-4000-8000-00000000000a', 'scenario-f-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-review-f-01', 'automatic', now()),
  ('e2100000-0000-4000-8000-00000000000a',
   (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'),
   'e2400000-0000-4000-8000-00000000000a', 'scenario-g-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-review-g-01', 'automatic', now()),
  ('e2100000-0000-4000-8000-00000000000a',
   (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000003' and document_type = 'due_notice'),
   'e2400000-0000-4000-8000-00000000000a', 'scenario-d-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-webhook-d-1', 'automatic', now());
select set_config('kjora_test.row_f', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-review-f-01'), true);
select set_config('kjora_test.row_g', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-review-g-01'), true);
select set_config('kjora_test.row_d', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-webhook-d-1'), true);
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select count(*)::int from pg_temp.claimed), 3, 'trois nouvelles lignes réservées');
select ok((select bool_and(public.mark_message_delivery_sending(id, claim_token)) from pg_temp.claimed), 'envois commencés');
select ok((select bool_and(public.mark_message_delivery_unknown(id, claim_token, 'resend_503')) from pg_temp.claimed),
  'réponse 5xx : issue inconnue pour les trois');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_b')::uuid, 'resend', 'tentative propriétaire') $$,
  '42501', null, 'un propriétaire ne peut pas décider d''une ré-expédition');
select throws_ok($$ select * from public.admin_list_delivery_reviews(50) $$, '42501', null, 'la liste des revues est réservée à l''Admin');

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.admin_list_delivery_reviews(50)), 4, 'quatre envois en revue listés (B, D, F, G)');
select ok((select bool_and(recipient_masked like '_***@%') from public.admin_list_delivery_reviews(50)),
  'destinataires masqués, jamais l''adresse complète');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_b')::uuid, 'resend', '') ->> 'outcome'),
  'note_required', 'motif obligatoire');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_g')::uuid, 'confirm_sent', 'vu dans Resend') ->> 'outcome'),
  'provider_message_id_required', 'confirmation sans identifiant fournisseur refusée');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_b')::uuid, 'forget', 'motif') ->> 'outcome'),
  'invalid_decision', 'décision fermée');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_a')::uuid, 'resend', 'motif valable') ->> 'outcome'),
  'not_under_review', 'une ligne envoyée n''est jamais ré-expédiable');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_b')::uuid, 'resend',
  'Absent du tableau de bord Resend après vérification') ->> 'outcome'), 'resolved', 'ré-expédition décidée par l''Admin');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_f')::uuid, 'abandon',
  'Destinataire prévenu par téléphone') ->> 'outcome'), 'resolved', 'abandon décidé par l''Admin');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_g')::uuid, 'confirm_sent',
  'Présent dans Resend', 're_confirmed_g') ->> 'outcome'), 'resolved', 'envoi confirmé par l''Admin avec preuve');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_b')::uuid, 'resend', 'double clic') ->> 'outcome'),
  'not_under_review', 'décision rejouée : sans effet');
reset role;

select ok((select status = 'pending' and resend_generation = 1 and attempt_count = 0
    and reviewed_by is null and reviewed_at is null and review_reason is null
  from public.message_deliveries where id = current_setting('kjora_test.row_b')::uuid),
  'ré-expédition : nouvelle génération propre (nouvelle clé d''idempotence) ; la décision est auditée hors ligne');
select is((select status from public.message_deliveries where id = current_setting('kjora_test.row_f')::uuid), 'cancelled', 'abandon : annulée');
select ok((select status = 'sent' and provider_message_id = 're_confirmed_g' from public.message_deliveries where id = current_setting('kjora_test.row_g')::uuid),
  'confirmation : envoyée, jamais renvoyée');
select is((select count(*)::int from public.administrative_audit_log
  where action = 'communication.delivery_review_resolved' and organization_id = 'e2100000-0000-4000-8000-00000000000a'
    and actor_user_id = 'e2000000-0000-4000-8000-000000000004'), 3, 'chaque décision est auditée (acteur Admin)');
select ok((select bool_and(position('@' in details::text) = 0) from public.administrative_audit_log
  where action = 'communication.delivery_review_resolved'), 'l''audit ne contient aucune adresse');

truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select count(*)::int from pg_temp.claimed), 1, 'seule la ligne dont la ré-expédition a été décidée repart');
select is((select resend_generation::int from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid), 1,
  'la ré-expédition porte la génération 1');
select is(public.mark_message_delivery_sending(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid)), true, 'ré-expédition commencée');
select is(public.complete_message_delivery(current_setting('kjora_test.row_b')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_b')::uuid), 're_fake_b'), true, 'ré-expédition finalisée');
reset role;

-- =============================================================================
-- 5. Webhook fournisseur — classement explicite, idempotent, jamais régressif
-- =============================================================================

set local role service_role;
select is((public.record_email_provider_event('evt_e2e_1', 'email.delivered', 're_fake_1', now()) ->> 'outcome'), 'status_updated',
  'événement « delivered » enregistré');
select is((public.record_email_provider_event('evt_e2e_1', 'email.delivered', 're_fake_1', now()) ->> 'outcome'), 'duplicate_event',
  'le même événement rejoué est ignoré (idempotence)');
select is((public.record_email_provider_event('evt_e2e_2', 'email.opened', 're_fake_1', now()) ->> 'outcome'), 'ignored_event_type',
  'type d''événement hors périmètre ignoré');
select is((public.record_email_provider_event('evt_e2e_3', 'email.delivery_delayed', 're_fake_b', now()) ->> 'outcome'),
  'information_recorded', 'email.delivery_delayed : information seule');
select is((public.record_email_provider_event('evt_e2e_3', 'email.delivery_delayed', 're_fake_b', now()) ->> 'outcome'),
  'duplicate_event', 'email.delivery_delayed rejoué : ignoré');
reset role;
select ok((select status = 'sent' and provider_delayed_at is not null from public.message_deliveries where provider_message_id = 're_fake_b'),
  'retard : statut inchangé, date de retard enregistrée, aucune ré-expédition');
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0, 'un retard ne remet rien en file');
select is((public.record_email_provider_event('evt_e2e_4', 'email.failed', 're_fake_b', now()) ->> 'outcome'), 'status_updated',
  'email.failed enregistré');
select is((public.record_email_provider_event('evt_e2e_5', 'email.delivered', 're_fake_b', now()) ->> 'outcome'), 'transition_refused',
  'un « delivered » après email.failed est refusé');
reset role;
select is((select status from public.message_deliveries where provider_message_id = 're_fake_b'), 'provider_failed',
  'email.failed : terminal, jamais classé livré');
select is((select count(*)::int from private.email_suppressions
  where email_fingerprint = private.email_fingerprint('owner-a-e2e@kjora.test')), 0,
  'email.failed n''ajoute pas de suppression (échec fournisseur, pas l''adresse)');
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900)), 0, 'email.failed ne remet rien en file');
select is((public.record_email_provider_event('evt_e2e_6', 'email.complained', 're_fake_1', now()) ->> 'outcome'), 'status_updated',
  'plainte après livraison enregistrée');
-- Ligne D, en revue sans identifiant fournisseur : l'étiquette kjora_delivery
-- rapproche l'événement ; la livraison prouve l'acceptation.
select is((public.record_email_provider_event('evt_e2e_7', 'email.delivered', 're_webhook_d', now(),
  'rent', current_setting('kjora_test.row_d')::uuid, 0) ->> 'outcome'), 'review_resolved',
  'webhook avec étiquette (file, ligne, génération 0) : la revue est levée par la preuve du fournisseur');
select is((public.record_email_provider_event('evt_e2e_8', 'email.delivered', 're_unknown_zz', now()) ->> 'outcome'), 'no_matching_delivery',
  'événement sans ligne correspondante : consigné, sans effet');
select is((public.record_email_provider_event('evt_e2e_9', 'email.delivered', 're_unknown_zz', now(), 'rent', gen_random_uuid(), 0) ->> 'outcome'),
  'no_matching_delivery', 'étiquette désignant une ligne inexistante : consignée, sans effet');
select is((public.record_email_provider_event('evt_e2e_10', 'email.delivered', 're_unknown_zz', now(), 'rent', null, 0) ->> 'outcome'),
  'invalid_event', 'étiquette incomplète : refusée, rien d''écrit');
select is((public.record_email_provider_event('evt_e2e_11', 'email.delivered', 're_unknown_zz', now(), 'rent',
  current_setting('kjora_test.row_d')::uuid, 21) ->> 'outcome'), 'invalid_event', 'génération hors bornes : refusée');
reset role;
select ok((select status = 'delivered' and provider_message_id = 're_webhook_d' from public.message_deliveries
  where id = current_setting('kjora_test.row_d')::uuid), 'ligne D : livrée, identifiant fournisseur enregistré');
select is((select status from public.message_deliveries where provider_message_id = 're_fake_1'), 'complained', 'statut final : plainte');
select is((select count(*)::int from private.email_suppressions
  where email_fingerprint = private.email_fingerprint('awa-e2e@kjora.test')), 1,
  'le destinataire plaignant est mis en liste de suppression (empreinte seule)');
select is((select count(*)::int from private.email_suppressions where email_fingerprint like '%@%'), 0,
  'la liste de suppression ne contient jamais d''adresse en clair');
select is((select count(*)::int from private.email_provider_events where event_id like 'evt\_e2e\_%'), 8,
  'historique : chaque événement traité une fois (hors type ignoré)');
select is((select outcome from private.email_provider_events where event_id = 'evt_e2e_4'), 'status_updated',
  'historique : email.failed consigné avec son effet');

-- =============================================================================
-- 5b. Génération (v3) : un webhook retardé d'une ancienne génération ne lève
--     JAMAIS la revue d'une génération plus récente
-- =============================================================================

insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-h-e2e@kjora.test', 'fr', 'due_notice', 'e2e-scenario-generation-h1', 'automatic', now());
select set_config('kjora_test.row_h', (select id::text from public.message_deliveries where idempotency_key = 'e2e-scenario-generation-h1'), true);

-- Génération 0 : envoi commencé puis issue ambiguë.
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select resend_generation::int from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid), 0, 'H réservée en génération 0');
select ok(public.mark_message_delivery_sending(current_setting('kjora_test.row_h')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid))
  and public.mark_message_delivery_unknown(current_setting('kjora_test.row_h')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid), 'provider_timeout'),
  'génération 0 : issue inconnue');
reset role;

-- Décision Admin : ré-expédier → génération 1.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.row_h')::uuid, 'resend',
  'Absent de Resend après vérification') ->> 'outcome'), 'resolved', 'Admin : ré-expédition de H');
reset role;

-- Génération 1 : à nouveau une issue ambiguë.
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is((select resend_generation::int from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid), 1, 'H réservée en génération 1');
select ok(public.mark_message_delivery_sending(current_setting('kjora_test.row_h')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid))
  and public.mark_message_delivery_unknown(current_setting('kjora_test.row_h')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.row_h')::uuid), 'resend_503'),
  'génération 1 : issue inconnue');

-- Webhook RETARDÉ de la génération 0.
select is((public.record_email_provider_event('evt_gen_g0', 'email.delivered', 're_h_generation_0', now(),
  'rent', current_setting('kjora_test.row_h')::uuid, 0) ->> 'outcome'), 'generation_mismatch',
  'webhook retardé g0 : outcome generation_mismatch');
select is((public.record_email_provider_event('evt_gen_g0_sent', 'email.sent', 're_h_generation_0', now(),
  'rent', current_setting('kjora_test.row_h')::uuid, 0) ->> 'outcome'), 'generation_mismatch',
  'email.sent retardé g0 : generation_mismatch aussi');
select is((public.record_email_provider_event('evt_gen_notag', 'email.delivered', 're_h_generation_0', now()) ->> 'outcome'),
  'no_matching_delivery', 'sans étiquette, l''identifiant g0 ne correspond à aucune ligne : aucune levée de revue');
reset role;
select ok((select status = 'delivery_unknown' and resend_generation = 1 and provider_message_id is null and sent_at is null
    and delivered_at is null and review_reason = 'ambiguous_provider_response'
  from public.message_deliveries where id = current_setting('kjora_test.row_h')::uuid),
  'génération 1 reste delivery_unknown, aucune modification par le webhook g0');
select is((select outcome from private.email_provider_events where event_id = 'evt_gen_g0'), 'generation_mismatch',
  'le webhook g0 est conservé dans l''historique avec son outcome');
select is((select matched_queue from private.email_provider_events where event_id = 'evt_gen_g0'), 'rent',
  'historique : file identifiée pour le webhook g0');
set local role service_role;
select is((public.record_email_provider_event('evt_gen_g0', 'email.delivered', 're_h_generation_0', now(),
  'rent', current_setting('kjora_test.row_h')::uuid, 0) ->> 'outcome'), 'duplicate_event',
  'webhook g0 rejoué : idempotent');

-- Webhook de la génération 1 : lève correctement la revue.
select is((public.record_email_provider_event('evt_gen_g1', 'email.delivered', 're_h_generation_1', now(),
  'rent', current_setting('kjora_test.row_h')::uuid, 1) ->> 'outcome'), 'review_resolved',
  'webhook g1 : la revue de la génération 1 est levée');
select is((public.record_email_provider_event('evt_gen_g1_other', 'email.bounced', 're_h_other_id', now(),
  'rent', current_setting('kjora_test.row_h')::uuid, 1) ->> 'outcome'), 'transition_refused',
  'même génération, autre identifiant fournisseur : refusé');
reset role;
select ok((select status = 'delivered' and resend_generation = 1 and provider_message_id = 're_h_generation_1' and delivered_at is not null
  from public.message_deliveries where id = current_setting('kjora_test.row_h')::uuid),
  'H livrée en génération 1 avec l''identifiant fournisseur g1');

-- =============================================================================
-- 6. Factures SaaS XAF automatiques (Phase G)
-- =============================================================================

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('e2000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'saas-owner-e2e@kjora.test', now(), now(), now());
insert into public.organizations (id, created_by, status) values
  ('e2100000-0000-4000-8000-00000000001a', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- nominal mensuel
  ('e2100000-0000-4000-8000-00000000001b', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- fournisseur
  ('e2100000-0000-4000-8000-00000000001c', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- Découverte
  ('e2100000-0000-4000-8000-00000000001d', 'e2000000-0000-4000-8000-000000000011', 'suspended'),  -- suspendue
  ('e2100000-0000-4000-8000-00000000001e', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- CAD
  ('e2100000-0000-4000-8000-00000000001f', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- Sur mesure
  ('e2100000-0000-4000-8000-000000000020', 'e2000000-0000-4000-8000-000000000011', 'active'),     -- renouvellement lointain
  ('e2100000-0000-4000-8000-000000000021', 'e2000000-0000-4000-8000-000000000011', 'active');     -- annuel, en grâce
insert into public.organization_profiles (organization_id, name)
select id, 'E2E SaaS ' || right(id::text, 2) from public.organizations where id::text like 'e2100000-0000-4000-8000-0000000000%'
  and id not in ('e2100000-0000-4000-8000-00000000000a', 'e2100000-0000-4000-8000-00000000000b', 'e2100000-0000-4000-8000-00000000000c');
insert into public.memberships (organization_id, user_id, role)
select id, 'e2000000-0000-4000-8000-000000000011', 'organization_owner' from public.organizations
 where created_by = 'e2000000-0000-4000-8000-000000000011';

insert into public.organization_subscriptions (organization_id, status, plan, billing_cycle, currency, billing_country, provider, provider_subscription_ref, renewal_date) values
  ('e2100000-0000-4000-8000-00000000001a', 'active', 'essentiel',  'monthly', 'XAF', 'CM', null, null, current_date + 3),
  ('e2100000-0000-4000-8000-00000000001b', 'active', 'essentiel',  'monthly', 'XAF', 'CM', 'stripe', 'sub_e2e', current_date + 3),
  ('e2100000-0000-4000-8000-00000000001c', 'active', 'decouverte', 'monthly', 'XAF', 'CM', null, null, current_date + 3),
  ('e2100000-0000-4000-8000-00000000001d', 'active', 'essentiel',  'monthly', 'XAF', 'CM', null, null, current_date + 3),
  ('e2100000-0000-4000-8000-00000000001e', 'active', 'essentiel',  'monthly', 'CAD', 'CA', null, null, current_date + 3),
  ('e2100000-0000-4000-8000-00000000001f', 'active', 'sur_mesure', 'monthly', 'XAF', 'CM', null, null, current_date + 3),
  ('e2100000-0000-4000-8000-000000000020', 'active', 'avance',     'monthly', 'XAF', 'CM', null, null, current_date + 20),
  ('e2100000-0000-4000-8000-000000000021', 'grace',  'avance',     'annual',  'XAF', 'CM', null, null, current_date - 2);

select is((private.generate_automatic_saas_invoices(current_date) ->> 'dry_run'), 'true', 'génération SaaS en dry-run par défaut');
select is((private.generate_automatic_saas_invoices(current_date) ->> 'candidates')::int, 2,
  'périmètre : seules l''Organization nominale et l''annuelle en grâce sont éligibles');
select is((select count(*)::int from public.billing_invoices where generation_source = 'automatic'), 0, 'le dry-run ne crée aucune facture');

select is((private.generate_automatic_saas_invoices(current_date, false) ->> 'created')::int, 2, 'deux factures automatiques créées');
select is((select count(*)::int from public.billing_invoices
  where organization_id in ('e2100000-0000-4000-8000-00000000001b', 'e2100000-0000-4000-8000-00000000001c',
    'e2100000-0000-4000-8000-00000000001d', 'e2100000-0000-4000-8000-00000000001e',
    'e2100000-0000-4000-8000-00000000001f', 'e2100000-0000-4000-8000-000000000020')), 0,
  'aucune facture pour fournisseur, Découverte, suspendue, CAD, Sur mesure ou hors fenêtre');
select ok((select period_start = current_date + 3 and period_end = (current_date + 3 + interval '1 month')::date
    and status = 'open' and amount_minor = 5900 and currency = 'XAF' and created_by is null
    and issue_idempotency_key = 'auto:' || (current_date + 3)::text || ':monthly'
  from public.billing_invoices where organization_id = 'e2100000-0000-4000-8000-00000000001a'),
  'mensuelle : période depuis renewal_date + 1 mois, ouverte, prix catalogue, clé déterministe');
select ok((select period_start = current_date - 2 and period_end = (current_date - 2 + interval '1 year')::date and amount_minor = 129000
  from public.billing_invoices where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  'annuelle : période d''un an, prix annuel');
select ok((select bool_and(due_on >= issued_on and due_on >= current_date and due_on <= period_end)
  from public.billing_invoices where generation_source = 'automatic'), 'échéance cohérente (≥ émission, ≤ fin de période)');
select is((select status from public.organization_subscriptions where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  'grace', 'la facture n''active et ne modifie jamais l''abonnement');
select is((private.generate_automatic_saas_invoices(current_date, false) ->> 'created')::int, 0, 'rejeu le même jour : aucune facture de plus');
select is((private.generate_automatic_saas_invoices(current_date + 1, false) ->> 'created')::int, 0, 'rejeu le lendemain : même période, aucune facture');
select throws_ok(
  $$ insert into public.billing_invoices (organization_id, number, plan, billing_cycle, currency, amount_minor, period_start, period_end, status, issued_on, generation_source)
     values ('e2100000-0000-4000-8000-00000000001a', 'KJORA-E2E-DUP', 'essentiel', 'monthly', 'XAF', 5900, current_date + 3,
             (current_date + 3 + interval '1 month')::date, 'open', current_date, 'automatic') $$,
  '23505', null, 'contrainte base : jamais deux factures automatiques pour la même période'
);
select is((select count(*)::int from public.billing_events where event_type = 'invoice_auto_issued'
  and organization_id = 'e2100000-0000-4000-8000-00000000001a'), 1, 'émission automatique journalisée une fois');

-- Émission manuelle sur une période déjà facturée automatiquement : refusée.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((public.admin_issue_manual_invoice('e2100000-0000-4000-8000-00000000001a', 'essentiel', 'monthly',
  current_date + 3, (current_date + 3 + interval '1 month')::date, 'e2e-manual-dup-key') ->> 'outcome'),
  'period_already_invoiced', 'émission manuelle d''une période déjà facturée : refus explicite');
reset role;

-- Courriels SaaS : un par facture émise, au propriétaire, dans une file SÉPARÉE.
select is((select count(*)::int from public.billing_email_deliveries where template_key = 'saas_invoice_issued'
  and organization_id in ('e2100000-0000-4000-8000-00000000001a', 'e2100000-0000-4000-8000-000000000021')), 2,
  'un courriel « facture émise » par facture automatique');
select is((select count(*)::int from public.billing_email_deliveries where recipient_email <> 'saas-owner-e2e@kjora.test'
  and organization_id in ('e2100000-0000-4000-8000-00000000001a', 'e2100000-0000-4000-8000-000000000021')), 0,
  'destinataire : le propriétaire uniquement');
select is((select count(*)::int from public.message_deliveries md
  where md.organization_id in ('e2100000-0000-4000-8000-00000000001a', 'e2100000-0000-4000-8000-000000000021')), 0,
  'domaine SaaS jamais mêlé à la file des loyers');

-- Identité légale absente : mise en attente sans consommer de tentative.
truncate pg_temp.claimed;
set local role service_role;
create temporary table pg_temp.saas_claimed (id uuid, organization_id uuid, claim_token uuid, resend_generation smallint) on commit drop;
grant all on pg_temp.saas_claimed to service_role;
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select is((select count(*)::int from pg_temp.saas_claimed), 2, 'les deux courriels SaaS sont réservés');
select is(public.hold_billing_email_delivery(
  (select id from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-00000000001a'),
  (select claim_token from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-00000000001a'), 'legal_identity_missing'),
  true, 'identité légale absente : envoi retenu');
select throws_ok($$ select public.hold_billing_email_delivery(gen_random_uuid(), gen_random_uuid(), 'whatever') $$,
  '22023', 'invalid_hold_reason', 'motif de mise en attente fermé');
-- Seconde ligne SaaS : envoi commencé puis coupure réseau → revue.
select is(public.mark_billing_email_sending(
  (select id from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  (select claim_token from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021')),
  true, 'SaaS : point de non-retour posé');
select is(public.hold_billing_email_delivery(
  (select id from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  (select claim_token from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021'), 'legal_identity_missing'),
  false, 'SaaS : mise en attente impossible une fois l''envoi commencé');
select is(public.mark_billing_email_unknown(
  (select id from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  (select claim_token from pg_temp.saas_claimed where organization_id = 'e2100000-0000-4000-8000-000000000021'), 'network_error'),
  true, 'SaaS : coupure réseau → issue inconnue');
reset role;
select ok((select status = 'pending' and attempt_count = 0 and held_reason = 'legal_identity_missing'
    and next_attempt_at > now() + interval '23 hours'
  from public.billing_email_deliveries where organization_id = 'e2100000-0000-4000-8000-00000000001a' and template_key = 'saas_invoice_issued'),
  'mise en attente : tentative restituée, réessai au plus tôt le lendemain, aucun envoi final');
update public.billing_email_deliveries set updated_at = now() - interval '30 hours', next_attempt_at = now() - interval '30 hours'
 where organization_id = 'e2100000-0000-4000-8000-000000000021';
set local role service_role;
select is((select count(*)::int from public.claim_billing_email_deliveries(25, 900)
  where organization_id = 'e2100000-0000-4000-8000-000000000021'), 0,
  'SaaS : issue inconnue jamais ré-expédiée automatiquement, même après 24 h');
reset role;
select is((select status from public.billing_email_deliveries where organization_id = 'e2100000-0000-4000-8000-000000000021'),
  'delivery_unknown', 'SaaS : ligne en revue');

-- Paiement confirmé → reçu.
update public.billing_invoices set status = 'paid', paid_at = now()
 where organization_id = 'e2100000-0000-4000-8000-00000000001a' and generation_source = 'automatic';
select is((select count(*)::int from public.billing_email_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000001a' and template_key = 'saas_receipt'), 1,
  'facture payée : un reçu mis en file');
update public.billing_invoices set status = 'paid', paid_at = now()
 where organization_id = 'e2100000-0000-4000-8000-00000000001a' and generation_source = 'automatic';
select is((select count(*)::int from public.billing_email_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000001a' and template_key = 'saas_receipt'), 1,
  'mise à jour rejouée : aucun second reçu');

-- Décisions Admin sur la file SaaS (v3) : next_attempt_at et unicité de
-- l'identifiant fournisseur.
select set_config('kjora_test.saas_21', (select id::text from public.billing_email_deliveries
  where organization_id = 'e2100000-0000-4000-8000-000000000021'), true);
select set_config('kjora_test.saas_receipt', (select id::text from public.billing_email_deliveries
  where organization_id = 'e2100000-0000-4000-8000-00000000001a' and template_key = 'saas_receipt'), true);
truncate pg_temp.saas_claimed;
set local role service_role;
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select is((select count(*)::int from pg_temp.saas_claimed), 1, 'SaaS : seul le reçu est réservable (facture retenue, ligne 21 en revue)');
select ok(public.mark_billing_email_sending(current_setting('kjora_test.saas_receipt')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.saas_receipt')::uuid))
  and public.mark_billing_email_unknown(current_setting('kjora_test.saas_receipt')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.saas_receipt')::uuid), 'resend_502'),
  'SaaS : reçu en issue inconnue');
reset role;
select is((select next_attempt_at from public.billing_email_deliveries where id = current_setting('kjora_test.saas_receipt')::uuid), null,
  'SaaS en revue : aucune date de tentative');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.saas_21')::uuid, 'confirm_sent',
  'Identifiant repris d''une autre ligne', 're_fake_1') ->> 'outcome'), 'provider_message_id_already_used',
  'confirm_sent : identifiant déjà porté par une ligne loyers refusé');
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.saas_21')::uuid, 'confirm_sent',
  'Identifiant repris d''une autre ligne', 're_h_generation_1') ->> 'outcome'), 'provider_message_id_already_used',
  'confirm_sent : identifiant déjà affecté (autre ligne) refusé');
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.saas_21')::uuid, 'confirm_sent',
  'Vu dans le tableau de bord Resend', 're_saas_21_confirmed') ->> 'outcome'), 'resolved', 'SaaS : confirm_sent avec identifiant libre');
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.saas_receipt')::uuid, 'resend',
  'Absent de Resend après vérification') ->> 'outcome'), 'resolved', 'SaaS : ré-expédition du reçu');
reset role;
select ok((select status = 'sent' and provider_message_id = 're_saas_21_confirmed' and next_attempt_at is null
  from public.billing_email_deliveries where id = current_setting('kjora_test.saas_21')::uuid),
  'SaaS confirm_sent : envoyé, next_attempt_at = NULL');
select ok((select status = 'pending' and resend_generation = 1 and next_attempt_at is not null
    and next_attempt_at <= now() and next_attempt_at > now() - interval '1 minute'
  from public.billing_email_deliveries where id = current_setting('kjora_test.saas_receipt')::uuid),
  'SaaS resend : next_attempt_at = now(), génération 1');

-- Génération 1 du reçu : à nouveau ambiguë, puis abandon.
truncate pg_temp.saas_claimed;
set local role service_role;
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select is((select resend_generation::int from pg_temp.saas_claimed where id = current_setting('kjora_test.saas_receipt')::uuid), 1,
  'SaaS : reçu réservé en génération 1');
select ok(public.mark_billing_email_sending(current_setting('kjora_test.saas_receipt')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.saas_receipt')::uuid))
  and public.mark_billing_email_unknown(current_setting('kjora_test.saas_receipt')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.saas_receipt')::uuid), 'network_error'),
  'SaaS génération 1 : issue inconnue');
select is((public.record_email_provider_event('evt_saas_g0', 'email.delivered', 're_saas_receipt_g0', now(),
  'saas', current_setting('kjora_test.saas_receipt')::uuid, 0) ->> 'outcome'), 'generation_mismatch',
  'SaaS : webhook retardé g0 sans effet sur la génération 1');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.saas_receipt')::uuid, 'abandon',
  'Propriétaire informé autrement') ->> 'outcome'), 'resolved', 'SaaS : abandon');
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.saas_receipt')::uuid, 'abandon',
  'Mauvaise file') ->> 'outcome'), 'delivery_not_found', 'file incohérente : ligne introuvable');
reset role;
select ok((select status = 'cancelled' and next_attempt_at is null
  from public.billing_email_deliveries where id = current_setting('kjora_test.saas_receipt')::uuid),
  'SaaS abandon : annulée, next_attempt_at = NULL');
set local role service_role;
select is((select count(*)::int from public.claim_billing_email_deliveries(25, 900)), 0,
  'SaaS : rien de réservable après confirmation et abandon');
reset role;

-- =============================================================================
-- 6c. v4 — Unicité de l'identifiant fournisseur sur tous les chemins, et
--     nouvelle génération propre avec finalisation tardive
-- =============================================================================

-- Preuve SQL : les quatre chemins d'affectation passent par le MÊME
-- mécanisme, qui prend le verrou transactionnel commun.
select ok((select pg_catalog.bool_and(p.prosrc like '%private.reserve_provider_message_id(%')
             from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where (n.nspname, p.proname) in (('public', 'complete_message_delivery'), ('public', 'complete_billing_email_delivery'),
                                             ('public', 'admin_resolve_delivery_review'), ('private', 'apply_provider_event_to_queue')))
  and (select count(*) = 4 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where (n.nspname, p.proname) in (('public', 'complete_message_delivery'), ('public', 'complete_billing_email_delivery'),
                                         ('public', 'admin_resolve_delivery_review'), ('private', 'apply_provider_event_to_queue'))),
  'les quatre chemins d''affectation appellent private.reserve_provider_message_id');
select ok((select p.prosrc like '%pg_catalog.pg_advisory_xact_lock(%' and p.prosrc like '%pg_catalog.hashtextextended(%'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'reserve_provider_message_id'),
  'le mécanisme commun prend un verrou transactionnel déterministe (pg_catalog qualifié)');
select ok((select pg_catalog.bool_and(p.prosrc not like '%exists (select 1 from public.message_deliveries where provider_message_id%')
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.proname <> 'reserve_provider_message_id'),
  'aucun contrôle EXISTS isolé ne subsiste hors du mécanisme commun');
select ok(not has_function_privilege('authenticated', 'private.reserve_provider_message_id(text,text,uuid)', 'execute')
  and not has_function_privilege('service_role', 'private.reserve_provider_message_id(text,text,uuid)', 'execute'),
  'mécanisme commun non exposé (appelé uniquement par les fonctions SECURITY DEFINER)');

insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-u-e2e@kjora.test', 'fr', 'due_notice', 'e2e-v4-unique-rent-u1', 'automatic', now());
insert into public.billing_email_deliveries (organization_id, billing_invoice_id, template_key, recipient_email, language, idempotency_key)
values ('e2100000-0000-4000-8000-00000000001a',
  (select id from public.billing_invoices where organization_id = 'e2100000-0000-4000-8000-00000000001a' and generation_source = 'automatic'),
  'saas_invoice_due_soon', 'saas-owner-e2e@kjora.test', 'fr', 'e2e-v4-unique-saas-u2-key');
select set_config('kjora_test.u1', (select id::text from public.message_deliveries where idempotency_key = 'e2e-v4-unique-rent-u1'), true);
select set_config('kjora_test.u2', (select id::text from public.billing_email_deliveries where idempotency_key = 'e2e-v4-unique-saas-u2-key'), true);

truncate pg_temp.claimed;
truncate pg_temp.saas_claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select ok((select count(*) = 1 from pg_temp.claimed where id = current_setting('kjora_test.u1')::uuid)
  and (select count(*) = 1 from pg_temp.saas_claimed where id = current_setting('kjora_test.u2')::uuid),
  'U1 (loyers) et U2 (SaaS) réservées');
select ok(public.mark_message_delivery_sending(current_setting('kjora_test.u1')::uuid,
    (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u1')::uuid))
  and public.mark_billing_email_sending(current_setting('kjora_test.u2')::uuid,
    (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.u2')::uuid)),
  'U1 et U2 : envoi commencé');
select is(public.complete_billing_email_delivery(current_setting('kjora_test.u2')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.u2')::uuid), 're_fake_b'), false,
  'complete_billing_email_delivery : identifiant déjà utilisé dans la file loyers refusé');
select is(public.complete_message_delivery(current_setting('kjora_test.u1')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u1')::uuid), 're_saas_21_confirmed'), false,
  'complete_message_delivery : identifiant déjà utilisé dans la file SaaS refusé');
select is(public.complete_message_delivery(current_setting('kjora_test.u1')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u1')::uuid), 're_webhook_d'), false,
  'complete_message_delivery : identifiant déjà utilisé par une autre ligne loyers refusé');
reset role;
select ok((select status = 'processing' and provider_message_id is null and sent_at is null
  from public.billing_email_deliveries where id = current_setting('kjora_test.u2')::uuid),
  'refus : aucun identifiant affecté à U2, toujours en cours');
select ok((select status = 'processing' and provider_message_id is null and sent_at is null
  from public.message_deliveries where id = current_setting('kjora_test.u1')::uuid),
  'refus : aucun identifiant affecté à U1, toujours en cours');
select is((select count(*)::int from public.message_deliveries where provider_message_id = 're_fake_b'), 1,
  'l''identifiant existant reste porté par sa seule ligne d''origine');
set local role service_role;
-- Le worker place la ligne refusée en revue (finalization_failed), sans renvoi.
select is(public.mark_message_delivery_unknown(current_setting('kjora_test.u1')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u1')::uuid), 'finalization_failed'), true,
  'finalisation refusée → revue (finalization_failed)');
select is(public.complete_billing_email_delivery(current_setting('kjora_test.u2')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.u2')::uuid), 're_v4_saas_free_u2'), true,
  'complete_billing_email_delivery : identifiant libre accepté');
reset role;
select is((select review_reason from public.message_deliveries where id = current_setting('kjora_test.u1')::uuid), 'finalization_failed',
  'U1 en revue finalization_failed, jamais renvoyée automatiquement');
select is((select status from public.billing_email_deliveries where id = current_setting('kjora_test.u2')::uuid), 'sent', 'U2 envoyée');

-- Identifiant libre accepté dans la file loyers (nouvelle ligne U3).
insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-u3-e2e@kjora.test', 'fr', 'due_notice', 'e2e-v4-unique-rent-u3', 'automatic', now());
select set_config('kjora_test.u3', (select id::text from public.message_deliveries where idempotency_key = 'e2e-v4-unique-rent-u3'), true);
truncate pg_temp.claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
select is(public.mark_message_delivery_sending(current_setting('kjora_test.u3')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u3')::uuid)), true, 'U3 : envoi commencé');
select is(public.complete_message_delivery(current_setting('kjora_test.u3')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.u3')::uuid), 're_v4_rent_free_u3'), true,
  'complete_message_delivery : identifiant libre accepté');
-- Webhook : conserve son refus d'un identifiant déjà affecté (levée de revue de U1).
select is((public.record_email_provider_event('evt_v4_u1', 'email.delivered', 're_v4_rent_free_u3', now(),
  'rent', current_setting('kjora_test.u1')::uuid, 0) ->> 'outcome'), 'transition_refused',
  'webhook : levée de revue avec un identifiant déjà affecté refusée');
reset role;

-- ---------------------------------------------------------------------------
-- Nouvelle génération propre + finalisation tardive de la génération 1
-- (loyers : L ; SaaS : K)
-- ---------------------------------------------------------------------------
insert into public.message_deliveries (organization_id, document_id, tenant_id, recipient_email, language, template_key, idempotency_key, trigger_type, next_attempt_at)
values ('e2100000-0000-4000-8000-00000000000a',
  (select id from public.financial_documents where due_id = 'e2600000-0000-4000-8000-000000000002' and document_type = 'due_notice'),
  'e2400000-0000-4000-8000-00000000000a', 'scenario-l-e2e@kjora.test', 'fr', 'due_notice', 'e2e-v4-late-rent-l-gen', 'automatic', now());
insert into public.billing_email_deliveries (organization_id, billing_invoice_id, template_key, recipient_email, language, idempotency_key)
values ('e2100000-0000-4000-8000-00000000001a',
  (select id from public.billing_invoices where organization_id = 'e2100000-0000-4000-8000-00000000001a' and generation_source = 'automatic'),
  'saas_invoice_overdue', 'saas-owner-e2e@kjora.test', 'fr', 'e2e-v4-late-saas-k-gen-key');
select set_config('kjora_test.l', (select id::text from public.message_deliveries where idempotency_key = 'e2e-v4-late-rent-l-gen'), true);
select set_config('kjora_test.k', (select id::text from public.billing_email_deliveries where idempotency_key = 'e2e-v4-late-saas-k-gen-key'), true);

-- 1. Génération 0 → delivery_unknown.
truncate pg_temp.claimed;
truncate pg_temp.saas_claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select ok(public.mark_message_delivery_sending(current_setting('kjora_test.l')::uuid,
    (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.l')::uuid))
  and public.mark_message_delivery_unknown(current_setting('kjora_test.l')::uuid,
    (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.l')::uuid), 'provider_timeout'),
  'L génération 0 : delivery_unknown');
select ok(public.mark_billing_email_sending(current_setting('kjora_test.k')::uuid,
    (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid))
  and public.mark_billing_email_unknown(current_setting('kjora_test.k')::uuid,
    (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid), 'resend_504'),
  'K génération 0 : delivery_unknown');
reset role;
-- Métadonnées résiduelles de g0 (retard, événement, identifiant, message
-- d'erreur) simulées pour prouver le nettoyage complet.
update public.message_deliveries
   set provider = 'resend', provider_message_id = 're_v4_residual_l_g0', provider_event_at = now(),
       provider_delayed_at = now(), delivered_at = now(), last_error_message = 'residual_g0', reviewed_at = null
 where id = current_setting('kjora_test.l')::uuid;
update public.billing_email_deliveries
   set provider = 'resend', provider_message_id = 're_v4_residual_k_g0', provider_event_at = now(),
       provider_delayed_at = now(), delivered_at = now()
 where id = current_setting('kjora_test.k')::uuid;

-- 2. Admin : resend → génération 1.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select is((public.admin_resolve_delivery_review('rent', current_setting('kjora_test.l')::uuid, 'resend',
  'Absent de Resend après vérification (v4)') ->> 'outcome'), 'resolved', 'L : ré-expédition décidée');
select is((public.admin_resolve_delivery_review('saas', current_setting('kjora_test.k')::uuid, 'resend',
  'Absent de Resend après vérification (v4)') ->> 'outcome'), 'resolved', 'K : ré-expédition décidée');
reset role;

-- 3. Nettoyage complet des métadonnées de g0.
select ok((select status = 'pending' and resend_generation = 1 and attempt_count = 0
    and reviewed_by is null and reviewed_at is null and review_reason is null
    and last_error_code is null and last_error_message is null
    and provider is null and provider_message_id is null
    and sent_at is null and delivered_at is null and provider_event_at is null and provider_delayed_at is null
    and last_claim_token is null
    and next_attempt_at <= now() and next_attempt_at > now() - interval '1 minute'
  from public.message_deliveries where id = current_setting('kjora_test.l')::uuid),
  'L génération 1 : toutes les métadonnées de revue et d''expédition g0 nettoyées');
select ok((select status = 'pending' and resend_generation = 1 and attempt_count = 0
    and reviewed_by is null and reviewed_at is null and review_reason is null
    and last_error_code is null
    and provider is null and provider_message_id is null
    and sent_at is null and delivered_at is null and provider_event_at is null and provider_delayed_at is null
    and last_claim_token is null
    and next_attempt_at <= now() and next_attempt_at > now() - interval '1 minute'
  from public.billing_email_deliveries where id = current_setting('kjora_test.k')::uuid),
  'K génération 1 : toutes les métadonnées de revue et d''expédition g0 nettoyées');
select is((select count(*)::int from public.administrative_audit_log
  where action = 'communication.delivery_review_resolved'
    and details ->> 'deliveryId' in (current_setting('kjora_test.l'), current_setting('kjora_test.k'))), 2,
  'l''historique de la décision reste dans administrative_audit_log');
select is((select count(*)::int from private.platform_operation_runs
  where run_type = 'delivery_review' and summary ->> 'decision' = 'resend'), 5,
  'et dans platform_operation_runs (5 ré-expéditions journalisées : B, H, reçu SaaS, L, K)');

-- 4. Réserver g1 et poser send_started_at.
truncate pg_temp.claimed;
truncate pg_temp.saas_claimed;
set local role service_role;
insert into pg_temp.claimed select id, claim_token, attempt_count, is_owner_copy, resend_generation from public.claim_message_deliveries(25, 900);
insert into pg_temp.saas_claimed select id, organization_id, claim_token, resend_generation from public.claim_billing_email_deliveries(25, 900);
select is((select resend_generation::int from pg_temp.claimed where id = current_setting('kjora_test.l')::uuid), 1, 'L réservée en génération 1');
select is((select resend_generation::int from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid), 1, 'K réservée en génération 1');
select ok(public.mark_message_delivery_sending(current_setting('kjora_test.l')::uuid,
    (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.l')::uuid))
  and public.mark_billing_email_sending(current_setting('kjora_test.k')::uuid,
    (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid)),
  'L et K génération 1 : send_started_at posé');
reset role;

-- 5. Le bail expire → delivery_unknown.
update public.message_deliveries set claimed_at = now() - interval '2 hours' where id = current_setting('kjora_test.l')::uuid;
update public.billing_email_deliveries set claimed_at = now() - interval '2 hours' where id = current_setting('kjora_test.k')::uuid;
set local role service_role;
select is((select count(*)::int from public.claim_message_deliveries(25, 900) where id = current_setting('kjora_test.l')::uuid), 0,
  'L : bail expiré, jamais re-réservée');
select is((select count(*)::int from public.claim_billing_email_deliveries(25, 900) where id = current_setting('kjora_test.k')::uuid), 0,
  'K : bail expiré, jamais re-réservée');
reset role;
select ok((select status = 'delivery_unknown' and review_reason = 'worker_lease_expired' and reviewed_at is null
  from public.message_deliveries where id = current_setting('kjora_test.l')::uuid), 'L génération 1 : delivery_unknown (bail expiré)');
select ok((select status = 'delivery_unknown' and review_reason = 'worker_lease_expired' and reviewed_at is null
  from public.billing_email_deliveries where id = current_setting('kjora_test.k')::uuid), 'K génération 1 : delivery_unknown (bail expiré)');

-- 6/7. Finalisation tardive avec le jeton EXACT de g1 : réussit, sans webhook.
set local role service_role;
select is(public.complete_message_delivery(current_setting('kjora_test.l')::uuid, gen_random_uuid(), 're_v4_late_l_g1'), false,
  'L : finalisation tardive avec un autre jeton refusée');
select is(public.complete_message_delivery(current_setting('kjora_test.l')::uuid,
  (select claim_token from pg_temp.claimed where id = current_setting('kjora_test.l')::uuid), 're_v4_late_l_g1'), true,
  'L : finalisation tardive avec le jeton exact de g1 réussie');
select is(public.complete_billing_email_delivery(current_setting('kjora_test.k')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid), 're_v4_late_l_g1'), false,
  'K : finalisation tardive avec un identifiant déjà affecté (à L) refusée');
select is(public.complete_billing_email_delivery(current_setting('kjora_test.k')::uuid,
  (select claim_token from pg_temp.saas_claimed where id = current_setting('kjora_test.k')::uuid), 're_v4_late_k_g1'), true,
  'K : finalisation tardive avec le jeton exact de g1 réussie');
-- Webhook g0 retardé contre g1 : toujours generation_mismatch.
select is((public.record_email_provider_event('evt_v4_l_g0', 'email.delivered', 're_v4_residual_l_g0', now(),
  'rent', current_setting('kjora_test.l')::uuid, 0) ->> 'outcome'), 'generation_mismatch', 'L : webhook g0 retardé → generation_mismatch');
select is((public.record_email_provider_event('evt_v4_k_g0', 'email.failed', 're_v4_residual_k_g0', now(),
  'saas', current_setting('kjora_test.k')::uuid, 0) ->> 'outcome'), 'generation_mismatch', 'K : webhook g0 retardé → generation_mismatch');
reset role;
select ok((select status = 'sent' and provider_message_id = 're_v4_late_l_g1' and sent_at is not null and resend_generation = 1
  from public.message_deliveries where id = current_setting('kjora_test.l')::uuid), 'L : sent en génération 1, sans webhook');
select ok((select status = 'sent' and provider_message_id = 're_v4_late_k_g1' and sent_at is not null and resend_generation = 1 and next_attempt_at is null
  from public.billing_email_deliveries where id = current_setting('kjora_test.k')::uuid), 'K : sent en génération 1, sans webhook');

-- =============================================================================
-- 7. Notifications (Phases A/B) — lecture, ouverture, destinations fermées
-- =============================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);

select ok((select count(*) from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)) >= 2,
  'le propriétaire liste ses notifications');
select ok((select bool_and(tenant_name = 'Awa Locataire' and property_name = 'Résidence E2E' and unit_label = 'Porte 3')
  from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50) where notification_type = 'due_notice_ready'),
  'libellés enrichis : locataire, bien et logement distinguent des alertes répétées');
select ok((select bool_and(not (payload ? 'tenant_email') and not (payload ? 'recipient_email') and not (payload ? 'email'))
  from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)),
  'aucune adresse électronique dans les notifications listées');
select is((select count(*)::int from public.list_my_notifications('e2100000-0000-4000-8000-00000000000b', 50)), 0,
  'aucune notification d''une autre Organization');

select set_config('kjora_test.e2_notice',
  (select id::text from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
    where notification_type = 'due_notice_ready' order by created_at, id limit 1), true);

select ok((select (r ->> 'found')::boolean and r ->> 'notification_type' = 'due_notice_ready' and r ->> 'document_id' is not null
  from (select public.open_notification(current_setting('kjora_test.e2_notice')::uuid) as r) x),
  'ouverture : destination document re-vérifiée en base');
select ok((select read_at is not null from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
  where id = current_setting('kjora_test.e2_notice')::uuid), 'l''ouverture marque la notification lue');
select set_config('kjora_test.e2_read_at',
  (select read_at::text from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
    where id = current_setting('kjora_test.e2_notice')::uuid), true);
select ok((public.open_notification(current_setting('kjora_test.e2_notice')::uuid) ->> 'found')::boolean, 'réouverture');
select is((select read_at::text from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
  where id = current_setting('kjora_test.e2_notice')::uuid), current_setting('kjora_test.e2_read_at'),
  'ouverture idempotente : la date de lecture ne change pas');

select lives_ok($$ select public.set_notification_read_state(current_setting('kjora_test.e2_notice')::uuid, true) $$,
  'marquer lue une notification déjà lue');
select is((select read_at::text from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
  where id = current_setting('kjora_test.e2_notice')::uuid), current_setting('kjora_test.e2_read_at'),
  'marquer lue est idempotent : date de première lecture conservée');
-- Lecture seule (en-tête Sec-Fetch-Site absent) : destination, AUCUNE écriture.
select set_config('kjora_test.e2_unread',
  (select id::text from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
    where read_at is null order by created_at, id limit 1), true);
select ok((public.peek_notification(current_setting('kjora_test.e2_unread')::uuid) ->> 'found')::boolean,
  'lecture seule : destination résolue');
select is((select read_at from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)
  where id = current_setting('kjora_test.e2_unread')::uuid), null,
  'lecture seule : la notification reste non lue (aucune écriture)');
select is((public.peek_notification(gen_random_uuid()) ->> 'found'), 'false', 'lecture seule : identifiant inconnu → found=false');
select is((public.open_notification(gen_random_uuid()) ->> 'found'), 'false', 'identifiant inconnu : found=false, sans erreur');
select is((public.open_notification(null) ->> 'found'), 'false', 'identifiant NULL : found=false');
select is(
  (select jsonb_object_keys(public.open_notification(gen_random_uuid())) limit 1), 'found',
  'identifiant hostile : la réponse ne révèle rien d''autre que found'
);

-- Document invalidé (ressource « supprimée ») : plus de destination document.
reset role;
select set_config('kjora.document_maintenance', 'invalidate', true);
update public.financial_documents set status = 'invalidated', invalidated_at = now(),
       invalidated_by = 'e2000000-0000-4000-8000-000000000001', invalidation_reason = 'test E2E ressource retirée'
 where id = (select document_id from public.notifications where id = current_setting('kjora_test.e2_notice')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select ok((select (r ->> 'found')::boolean and r ->> 'document_id' is null and r ->> 'tenant_id' is not null
  from (select public.open_notification(current_setting('kjora_test.e2_notice')::uuid) as r) x),
  'document retiré : aucune destination document, repli sur le locataire encore visible');

-- Notification d'une autre Organization (identifiant connu, obtenu hors RLS).
reset role;
select set_config('kjora_test.e2_foreign',
  (select id::text from public.notifications where organization_id = 'e2100000-0000-4000-8000-00000000000b' order by id limit 1), true);
select set_config('kjora_test.e2_manager_notice',
  (select id::text from public.notifications where organization_id = 'e2100000-0000-4000-8000-00000000000a'
     and recipient_user_id = 'e2000000-0000-4000-8000-000000000005' and notification_type = 'due_notice_ready'
   order by id limit 1), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select is((public.open_notification(current_setting('kjora_test.e2_foreign')::uuid) ->> 'found'), 'false',
  'notification d''une autre Organization : found=false');
reset role;
select is((select read_at from public.notifications where id = current_setting('kjora_test.e2_foreign')::uuid), null,
  'la notification étrangère n''a pas été marquée lue');

-- Perte de capacité : le gestionnaire devient gardien (sans due.view).
update public.memberships set role = 'caretaker'
 where organization_id = 'e2100000-0000-4000-8000-00000000000a' and user_id = 'e2000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000005', true);
select is((public.open_notification(current_setting('kjora_test.e2_manager_notice')::uuid) ->> 'found'), 'false',
  'capacité retirée : la notification ne s''ouvre plus');
select is((select count(*)::int from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)), 0,
  'capacité retirée : plus rien listé');
reset role;
select is((select read_at from public.notifications where id = current_setting('kjora_test.e2_manager_notice')::uuid), null,
  'capacité retirée : aucune écriture de lecture');

-- =============================================================================
-- 8. Supervision Admin (Phase H) — compteurs seulement, dry-run par défaut
-- =============================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.admin_communications_overview() $$, '42501', null, 'la vue opérationnelle est réservée à l''Admin');
select throws_ok($$ select public.admin_run_communications(current_date, true) $$, '42501', null, 'déclenchement réservé à l''Admin');
select throws_ok($$ select public.admin_retry_failed_deliveries() $$, '42501', null, 'relance réservée à l''Admin');
select throws_ok($$ select public.admin_reconcile_due_notices(current_date, 50, true) $$, '42501', null, 'réconciliation réservée à l''Admin');

select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select ok((public.admin_communications_overview() ->> 'missingDueNotices') is not null, 'l''Admin lit la vue opérationnelle');
select ok(position('@' in public.admin_communications_overview()::text) = 0,
  'la vue opérationnelle ne contient aucune adresse électronique');
select ok((public.admin_communications_overview() -> 'rentDeliveries' ->> 'complained')::int >= 1, 'les plaintes sont comptées');
select is((public.admin_communications_overview() ->> 'deliveryUnknown')::int, 1,
  'issues inconnues comptées : seule U1 (finalisation refusée, v4) reste en revue');
select is((public.admin_communications_overview() ->> 'providerFailed')::int, 1, 'échecs email.failed comptés');
select is((public.admin_communications_overview() -> 'providerEvents30d' ->> 'email.failed')::int, 2,
  'événements email.failed visibles dans les compteurs (dont le g0 retardé de K, historisé sans effet)');
select is((public.admin_communications_overview() -> 'providerEvents30d' ->> 'email.delivery_delayed')::int, 1,
  'événements email.delivery_delayed visibles dans les compteurs');
select ok((select count(*) >= 1 from public.admin_list_provider_events(50) where event_type = 'email.failed' and outcome = 'status_updated'),
  'historique Admin : email.failed et son effet');
select is((public.admin_run_communications() ->> 'dryRun'), 'true', 'déclenchement Admin en dry-run par défaut');
select is((public.admin_retry_failed_deliveries() ->> 'outcome'), 'rescheduled', 'relance des échecs admissibles');
reset role;
select is((select count(*)::int from public.billing_invoices where generation_source = 'automatic'), 2,
  'le dry-run Admin ne crée aucune facture');
select is((select count(*)::int from public.message_deliveries
  where status = 'failed' and attempt_count >= 3 and next_attempt_at is not null), 0,
  'un échec définitif n''est jamais relancé');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000004', true);
select ok((select bool_and(actor_email_masked is null or actor_email_masked like '_***@%')
  from public.admin_list_operation_runs(20)), 'historique audité : acteur masqué, jamais l''adresse complète');
select ok((select count(*) >= 2 from public.admin_list_operation_runs(20) where trigger_source = 'admin'),
  'chaque action Admin est journalisée');
reset role;

set local role service_role;
select ok((public.run_communications_daily_system(current_date) ->> 'runId') is not null, 'orchestrateur système (dry-run par défaut)');
reset role;
select is((select status from private.platform_operation_runs where trigger_source = 'cron' order by started_at desc limit 1), 'running',
  'exécution cron ouverte tant que le worker n''a pas conclu');

-- Organization suspendue : plus aucune notification visible, même pour le propriétaire.
update public.organizations set status = 'suspended' where id = 'e2100000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.list_my_notifications('e2100000-0000-4000-8000-00000000000a', 50)), 0,
  'Organization suspendue : aucune notification listée');
select is((public.open_notification(current_setting('kjora_test.e2_notice')::uuid) ->> 'found'), 'false',
  'Organization suspendue : ouverture refusée');
reset role;

select * from finish();
rollback;
