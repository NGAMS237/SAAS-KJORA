-- REPOSITORY-STABILIZATION-01.1
--
-- The application reads lease contracts only through explicitly authorized
-- SECURITY DEFINER functions. Migration 20260910191705 temporarily restored a
-- direct SELECT grant for EXPORT-01, but the dedicated
-- list_contracts_for_export RPC now provides the required minimal projection,
-- capability check, plan check, and Organization scope.
--
-- Keep the historical migrations immutable and close the direct PostgREST
-- table surface for every client role. service_role retains its owner-granted
-- access for trusted server/database operations.

revoke select on table public.lease_contracts from authenticated, anon, public;
