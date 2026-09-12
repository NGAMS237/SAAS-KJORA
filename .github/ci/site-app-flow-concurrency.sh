#!/usr/bin/env bash
set -euo pipefail

db_url="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
org_id="caf40000-0000-4000-8000-0000000000ca"
user_id="caf30000-0000-4000-8000-000000000001"
cleanup() {
  psql "$db_url" -v ON_ERROR_STOP=1 -q <<SQL
delete from public.organizations where id = '$org_id';
delete from auth.users where id = '$user_id';
SQL
}
trap cleanup EXIT

psql "$db_url" -v ON_ERROR_STOP=1 -q <<SQL
insert into auth.users (id,aud,role,email,email_confirmed_at,created_at,updated_at)
values ('$user_id','authenticated','authenticated','concurrency-flow@kjora.test',now(),now(),now());
insert into public.organizations (id,created_by) values ('$org_id','$user_id');
insert into public.organization_profiles (organization_id,name,country_code,currency_code)
values ('$org_id','Concurrency flow','CM','XAF');
insert into public.memberships (organization_id,user_id,role)
values ('$org_id','$user_id','organization_owner');
insert into public.organization_plans (organization_id,plan)
values ('$org_id','decouverte');
SQL

pids=()
for _ in $(seq 1 8); do
  psql "$db_url" -v ON_ERROR_STOP=1 -q <<SQL &
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"$user_id","role":"authenticated"}';
select public.prepare_plan_change_for_market('$org_id','essentiel','annual','CA');
commit;
SQL
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

psql "$db_url" -v ON_ERROR_STOP=1 -Atc "
do \$\$
begin
  if (select count(*) from public.organization_subscriptions where organization_id='$org_id') <> 1 then
    raise exception 'concurrency created duplicate subscriptions';
  end if;
  if (select billing_country || '/' || currency from public.organization_subscriptions where organization_id='$org_id') <> 'CA/CAD' then
    raise exception 'concurrency lost the validated billing market';
  end if;
  if (select plan from public.organization_plans where organization_id='$org_id') <> 'decouverte' then
    raise exception 'concurrency activated a paid entitlement';
  end if;
end \$\$;"
echo "CONCURRENCY_TEST=PASS"
