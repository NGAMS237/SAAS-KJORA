begin;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('caf10000-0000-4000-8000-000000000001','authenticated','authenticated','owner-ca-flow@kjora.test',now(),now(),now()),
  ('caf10000-0000-4000-8000-000000000002','authenticated','authenticated','owner-cm-flow@kjora.test',now(),now(),now()),
  ('caf10000-0000-4000-8000-000000000003','authenticated','authenticated','manager-ca-flow@kjora.test',now(),now(),now());

insert into public.organizations (id, created_by) values
  ('caf20000-0000-4000-8000-0000000000ca','caf10000-0000-4000-8000-000000000001'),
  ('caf20000-0000-4000-8000-0000000000cc','caf10000-0000-4000-8000-000000000002');

insert into public.organization_profiles (organization_id, name, country_code, currency_code) values
  ('caf20000-0000-4000-8000-0000000000ca','Flow Canada rentals','CM','XAF'),
  ('caf20000-0000-4000-8000-0000000000cc','Flow Cameroon rentals','CM','XAF');

insert into public.memberships (organization_id, user_id, role) values
  ('caf20000-0000-4000-8000-0000000000ca','caf10000-0000-4000-8000-000000000001','organization_owner'),
  ('caf20000-0000-4000-8000-0000000000cc','caf10000-0000-4000-8000-000000000002','organization_owner'),
  ('caf20000-0000-4000-8000-0000000000ca','caf10000-0000-4000-8000-000000000003','manager');

insert into public.organization_plans (organization_id, plan) values
  ('caf20000-0000-4000-8000-0000000000ca','decouverte'),
  ('caf20000-0000-4000-8000-0000000000cc','decouverte')
on conflict (organization_id) do update set plan = excluded.plan;

insert into public.organization_subscriptions (
  organization_id, status, plan, billing_cycle, currency
) values
  ('caf20000-0000-4000-8000-0000000000ca','free','decouverte','monthly','CAD'),
  ('caf20000-0000-4000-8000-0000000000cc','free','decouverte','monthly','XAF');

commit;
