begin;
select plan(4);

select has_function('public', 'preview_africa_month_end', array['uuid','date'], 'month-end preview exists');
select ok(not has_function_privilege('public', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'PUBLIC cannot execute preview');
select ok(not has_function_privilege('anon', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'anon cannot execute preview');
select ok(has_function_privilege('authenticated', 'public.preview_africa_month_end(uuid,date)', 'execute'), 'authenticated reaches the capability-guarded RPC');

select * from finish();
rollback;
