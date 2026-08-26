alter table public.leases
  drop constraint leases_active_period_no_overlap;

alter table public.leases
  add constraint leases_active_period_no_overlap exclude using gist (
    organization_id with =,
    unit_id with =,
    daterange(
      start_date,
      case when status = 'ended' then ended_on else coalesce(end_date, 'infinity'::date) end,
      '[]'
    ) with &&
  ) where (status in ('active', 'ended'));

comment on constraint leases_active_period_no_overlap on public.leases is
  'Lot 6B: drafts do not occupy; active and ended effective periods cannot overlap on one Unit.';
