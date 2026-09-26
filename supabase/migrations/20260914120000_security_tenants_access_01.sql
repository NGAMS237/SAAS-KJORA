-- SECURITY-TENANTS-ACCESS-01: restore the original column-level boundary.
-- The later table-wide SELECT grant bypassed that boundary. Keep legitimate
-- private reads behind small, purpose-specific, capability-checked RPCs.
begin;

revoke select on table public.tenants from public, anon, authenticated;
grant select (id, organization_id, full_name, created_at, updated_at)
  on public.tenants to authenticated;

create or replace function public.list_tenant_document_contacts(
  target_organization_id uuid,
  target_tenant_ids uuid[]
)
returns table (tenant_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select t.id,
    case when private.has_capability(target_organization_id, 'receipt.share') then t.email else null end
  from public.tenants t
  where (select auth.uid()) is not null
    and t.organization_id = target_organization_id
    and cardinality(target_tenant_ids) between 1 and 200
    and t.id = any(target_tenant_ids)
    and (private.has_capability(target_organization_id, 'due.view')
      or private.has_capability(target_organization_id, 'receipt.view'));
$$;

create or replace function public.list_tenants_for_import(target_organization_id uuid)
returns table (id uuid, full_name text, phone text, email text)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.full_name, t.phone, t.email
  from public.tenants t
  where (select auth.uid()) is not null
    and t.organization_id = target_organization_id
    and private.has_capability(target_organization_id, 'data_import.manage')
  order by t.created_at desc
  limit 5000;
$$;

create or replace function public.list_tenants_for_export(target_organization_id uuid)
returns table (id uuid, full_name text, phone text, email text,
  preferred_language text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.full_name, t.phone, t.email, t.preferred_language, t.created_at
  from public.tenants t
  where (select auth.uid()) is not null
    and t.organization_id = target_organization_id
    and private.has_capability(target_organization_id, 'data_export.manage')
    and private.check_plan_feature(target_organization_id, 'exports_standard')
  order by t.created_at;
$$;

revoke all on function public.list_tenant_document_contacts(uuid, uuid[]) from public, anon;
revoke all on function public.list_tenants_for_import(uuid) from public, anon;
revoke all on function public.list_tenants_for_export(uuid) from public, anon;
grant execute on function public.list_tenant_document_contacts(uuid, uuid[]) to authenticated;
grant execute on function public.list_tenants_for_import(uuid) to authenticated;
grant execute on function public.list_tenants_for_export(uuid) to authenticated;

commit;
