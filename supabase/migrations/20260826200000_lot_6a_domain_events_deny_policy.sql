-- Historical replayability repair: the preceding Lot 6A migration already
-- creates this exact deny policy. Preserve it on fresh or existing databases.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policy
    where polrelid = 'private.domain_events'::regclass
      and polname = 'domain events are internal only'
  ) then
    create policy "domain events are internal only"
    on private.domain_events for select to authenticated
    using (false);
  end if;
end;
$$;

comment on policy "domain events are internal only" on private.domain_events is
  'Defense in depth: the private schema is not exposed and authenticated users receive no table grants.';
