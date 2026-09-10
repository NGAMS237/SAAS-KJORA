begin;

-- =============================================================================
-- FIX — GRANT SELECT manquant sur public.tenants pour le rôle authenticated
-- =============================================================================
-- Contexte : le lot EXPORT-01 + Document Delivery a introduit, dans
-- getFinancialDocuments() (src/modules/documents/server.ts), une lecture
-- directe de public.tenants (id, email) via le client Supabase de
-- l'utilisateur authentifié — afin que l'UI puisse détecter l'absence
-- d'email du locataire avant de tenter un envoi. Cette table n'avait
-- jusqu'ici jamais été lue directement par du code applicatif : tous les
-- accès existants passent par des RPC SECURITY DEFINER (list_tenant_profiles,
-- get_tenant_private_profile, etc.), qui n'ont pas besoin du GRANT de table
-- puisqu'ils s'exécutent avec les privilèges du définisseur.
--
-- Résultat en Production : la policy RLS "authorized members read tenants"
-- (private.has_capability(tenants.organization_id, 'tenant.view')) est
-- correcte et déjà scopée par Organization + capability, mais Postgres
-- exige EN PLUS le GRANT de table pour que authenticated puisse ne serait-ce
-- que soumettre une requête SELECT sur tenants — GRANT qui n'a jamais été
-- ajouté. Conséquence : ERROR 42501 permission denied for table tenants,
-- provoquant l'erreur React #441 sur /app/documents.
--
-- Correction strictement minimale : ajouter le GRANT SELECT manquant, à
-- l'identique du pattern déjà utilisé pour toutes les autres tables lues
-- directement (properties, units, leases, dues, payments,
-- financial_documents, data_exports...). Aucune policy RLS n'est modifiée :
-- la policy existante reste la seule porte d'accès effective (isolation
-- Organization + capability tenant.view inchangées).
-- =============================================================================

grant select on public.tenants to authenticated;

commit;
