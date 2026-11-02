-- LOT 4 — Colocation (partie données), additive et sans risque pour la finance.
--
-- Le locataire titulaire (leases.tenant_id) reste le seul débiteur : échéances,
-- soldes, paiements, quittances, contrats et portail ne changent pas. Cette
-- table ajoute les colocataires rattachés au même bail, en lecture/écriture
-- contrôlées par les mêmes capacités que les baux (lease.view / lease.manage).

create table if not exists public.lease_co_tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  lease_id uuid not null,
  tenant_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint lease_co_tenants_lease_fk foreign key (organization_id, lease_id)
    references public.leases (organization_id, id) on delete cascade,
  constraint lease_co_tenants_tenant_fk foreign key (organization_id, tenant_id)
    references public.tenants (organization_id, id) on delete restrict,
  constraint lease_co_tenants_unique unique (lease_id, tenant_id)
);

create index if not exists lease_co_tenants_org_lease_idx on public.lease_co_tenants (organization_id, lease_id);
create index if not exists lease_co_tenants_org_tenant_idx on public.lease_co_tenants (organization_id, tenant_id);
create index if not exists lease_co_tenants_created_by_idx on public.lease_co_tenants (created_by);

-- Un colocataire ne peut pas être le titulaire du même bail.
create or replace function private.enforce_lease_co_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.leases l
    where l.id = new.lease_id and l.organization_id = new.organization_id and l.tenant_id = new.tenant_id
  ) then
    raise exception 'co_tenant_is_lease_holder' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_lease_co_tenant() from public, anon, authenticated;

drop trigger if exists lease_co_tenants_enforce on public.lease_co_tenants;
create trigger lease_co_tenants_enforce
before insert or update on public.lease_co_tenants
for each row execute function private.enforce_lease_co_tenant();

alter table public.lease_co_tenants enable row level security;

drop policy if exists "authorized members read lease co-tenants" on public.lease_co_tenants;
create policy "authorized members read lease co-tenants"
on public.lease_co_tenants for select to authenticated
using ((select private.has_capability(organization_id, 'lease.view')));

drop policy if exists "authorized members add lease co-tenants" on public.lease_co_tenants;
create policy "authorized members add lease co-tenants"
on public.lease_co_tenants for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_capability(organization_id, 'lease.manage'))
);

drop policy if exists "authorized members remove lease co-tenants" on public.lease_co_tenants;
create policy "authorized members remove lease co-tenants"
on public.lease_co_tenants for delete to authenticated
using ((select private.has_capability(organization_id, 'lease.manage')));

revoke all on table public.lease_co_tenants from public, anon, authenticated;
grant select, delete on public.lease_co_tenants to authenticated;
grant insert (organization_id, lease_id, tenant_id) on public.lease_co_tenants to authenticated;

comment on table public.lease_co_tenants is
  'Colocataires rattachés à un bail. Le titulaire financier reste leases.tenant_id ; aucune écriture comptable ne dépend de cette table.';
