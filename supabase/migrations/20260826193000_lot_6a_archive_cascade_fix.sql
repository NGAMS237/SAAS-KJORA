create or replace function private.enforce_unit_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_type text;
  parent_status text;
begin
  select p.type, p.status into parent_type, parent_status
  from public.properties p
  where p.organization_id = new.organization_id and p.id = new.property_id;

  if parent_type is null or (
    parent_status <> 'active'
    and not (tg_op = 'UPDATE' and old.status = 'active' and new.status = 'archived')
  ) then
    raise exception 'property_unavailable' using errcode = '23503';
  end if;
  if parent_type = 'house' and new.type <> 'whole_house' then
    raise exception 'house_requires_whole_house' using errcode = '23514';
  end if;
  if parent_type = 'building' and new.type = 'whole_house' then
    raise exception 'whole_house_requires_house' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.property_id <> old.property_id then
      raise exception 'unit_parent_immutable' using errcode = '23514';
    end if;
    if new.created_by <> old.created_by then
      raise exception 'unit_creator_immutable' using errcode = '23514';
    end if;
    if old.status = 'archived' then
      raise exception 'unit_archived_immutable' using errcode = '23514';
    end if;
    if (old.type = 'whole_house' or new.type = 'whole_house') and new.type <> old.type then
      raise exception 'whole_house_type_immutable' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_unit_hierarchy() from public, anon, authenticated;

comment on function private.enforce_unit_hierarchy() is
  'Lot 6A: validates tenant/property/type invariants while allowing the atomic active-to-archived cascade.';
