create policy "domain events are internal only"
on private.domain_events for select to authenticated
using (false);

comment on policy "domain events are internal only" on private.domain_events is
  'Defense in depth: the private schema is not exposed and authenticated users receive no table grants.';
