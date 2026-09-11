-- EXPORT-01 bugfix (Option A): public.lease_contracts is deliberately RLS-enabled with
-- zero policies -- every existing read path (get_lease_contract, get_lease_contracts,
-- get_lease_contract_signatures) is a SECURITY DEFINER RPC that checks
-- private.has_capability(org, 'contract.manage') in application code, bypassing RLS by
-- design. The previous fix (grant select on lease_contracts to authenticated) deviated
-- from this pattern -- and did not actually work for real data: with RLS enabled and no
-- policy, PostgreSQL denies all rows to a non-owner role regardless of table GRANTs,
-- so a real contract would still not have appeared in a ZIP export; the grant only
-- stopped the 500 error, it never actually surfaced contract rows.
--
-- This RPC gives EXPORT-01 a proper, minimal, read-only, capability-checked path to
-- the same lease_contracts summary data (no template/content snapshots, no PII beyond
-- IDs), consistent with the existing contracts RPC family. It reuses the exact
-- capability EXPORT-01 already requires end-to-end: 'data_export.manage' (checked by
-- request_data_export) plus the 'exports_advanced' plan entitlement (the ZIP-only
-- feature that includes contracts).
create or replace function public.list_contracts_for_export(target_organization_id uuid)
returns table (
  id uuid,
  lease_id uuid,
  tenant_id uuid,
  reference text,
  status text,
  final_storage_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (select private.has_capability(target_organization_id, 'data_export.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (select private.check_plan_feature(target_organization_id, 'exports_advanced')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode = '42501',
      detail = json_build_object('code','PLAN_FEATURE_NOT_AVAILABLE','feature','exports_advanced')::text;
  end if;
  return query
    select c.id, c.lease_id, c.tenant_id, c.reference, c.status, c.final_storage_path, c.created_at
    from public.lease_contracts c
    where c.organization_id = target_organization_id
    order by c.created_at desc;
end;
$function$;

grant execute on function public.list_contracts_for_export(uuid) to authenticated;
revoke execute on function public.list_contracts_for_export(uuid) from anon, public;
