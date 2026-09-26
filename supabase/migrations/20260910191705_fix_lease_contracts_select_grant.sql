-- EXPORT-01 bugfix: readContractsSummary() reads public.lease_contracts directly
-- (not via a SECURITY DEFINER RPC). RLS is already enabled on this table; only the
-- base table GRANT was missing for the authenticated role, causing "permission
-- denied for relation lease_contracts" -> swallowed into a generic 500
-- ("export_preview_failed") whenever the ZIP export format was requested.
-- This grant does not add, remove, or modify any RLS policy, and grants
-- SELECT only (no INSERT/UPDATE/DELETE).
grant select on public.lease_contracts to authenticated;
