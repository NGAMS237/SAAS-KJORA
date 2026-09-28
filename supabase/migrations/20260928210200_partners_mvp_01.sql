begin;

create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null check (char_length(applicant_name) between 2 and 120),
  applicant_email text not null check (char_length(applicant_email) between 5 and 254),
  partner_type text not null check (partner_type in ('commercial','influencer')),
  locale text not null check (locale in ('fr','en')),
  motivation text not null check (char_length(motivation) between 20 and 2000),
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','refused','suspended')),
  status_token_hash text not null unique check (status_token_hash ~ '^[a-f0-9]{64}$'),
  submitter_fingerprint text not null check (submitter_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index partner_applications_pending_email_idx on public.partner_applications(lower(applicant_email))
  where status in ('submitted','under_review','approved');

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.partner_applications(id) on delete restrict,
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null, partner_type text not null check (partner_type in ('commercial','influencer')),
  status text not null default 'approved' check (status in ('approved','active','suspended','closed')),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.partner_codes (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9_-]{4,32}$'),
  campaign_name text check (campaign_name is null or char_length(campaign_name) <= 120),
  status text not null default 'active' check (status in ('active','paused','retired')), created_at timestamptz not null default now()
);
create table public.partner_attributions (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id) on delete restrict,
  code_id uuid references public.partner_codes(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source text not null check (source in ('link','code','manual_admin')),
  status text not null default 'pending' check (status in ('pending','confirmed','disputed','rejected')),
  anti_abuse_flags text[] not null default '{}', attributed_by uuid references auth.users(id),
  attributed_at timestamptz not null default now(), unique(organization_id)
);
create table public.partner_rewards (
  id uuid primary key default gen_random_uuid(), attribution_id uuid not null references public.partner_attributions(id) on delete restrict,
  event_key text not null, amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency in ('CAD','XAF')),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  due_after date, approved_by uuid references auth.users(id), approved_at timestamptz,
  paid_by uuid references auth.users(id), paid_at timestamptz,
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 120),
  created_at timestamptz not null default now(), unique(attribution_id,event_key),
  check (status <> 'paid' or (approved_by is not null and paid_by is not null and paid_by <> approved_by and paid_at is not null))
);
create table public.partner_reward_events (
  id bigint generated always as identity primary key, reward_id uuid not null references public.partner_rewards(id) on delete restrict,
  from_status text, to_status text not null, actor_user_id uuid not null references auth.users(id),
  note text check (note is null or char_length(note) <= 500), created_at timestamptz not null default now()
);
create table public.partner_admin_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null check (target_type in ('application','partner','attribution','reward')),
  target_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create or replace function private.prevent_partner_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'partner_audit_is_immutable' using errcode='55000'; end; $$;
create trigger partner_admin_events_immutable before update or delete on public.partner_admin_events
for each row execute function private.prevent_partner_audit_mutation();
create trigger partner_reward_events_immutable before update or delete on public.partner_reward_events
for each row execute function private.prevent_partner_audit_mutation();
create table private.partner_submission_limits (
  fingerprint text not null, window_start timestamptz not null, attempts integer not null check (attempts > 0),
  primary key(fingerprint,window_start)
);

alter table public.partner_applications enable row level security;
alter table public.partners enable row level security;
alter table public.partner_codes enable row level security;
alter table public.partner_attributions enable row level security;
alter table public.partner_rewards enable row level security;
alter table public.partner_reward_events enable row level security;
alter table public.partner_admin_events enable row level security;
revoke all on public.partner_applications, public.partners, public.partner_codes,
  public.partner_attributions, public.partner_rewards, public.partner_reward_events, public.partner_admin_events from public,anon,authenticated;

create or replace function public.submit_partner_application(
  p_name text, p_email text, p_partner_type text, p_locale text, p_motivation text,
  p_status_token_hash text, p_submitter_fingerprint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_window timestamptz := date_trunc('hour',now()); v_attempts integer; v_id uuid;
begin
  if p_name is null or char_length(trim(p_name)) not between 2 and 120
     or p_email is null or lower(trim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or p_partner_type not in ('commercial','influencer') or p_locale not in ('fr','en')
     or char_length(trim(p_motivation)) not between 20 and 2000
     or p_status_token_hash !~ '^[a-f0-9]{64}$' or p_submitter_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_application' using errcode='22023';
  end if;
  insert into private.partner_submission_limits(fingerprint,window_start,attempts) values(p_submitter_fingerprint,v_window,1)
  on conflict(fingerprint,window_start) do update set attempts=private.partner_submission_limits.attempts+1 returning attempts into v_attempts;
  if v_attempts > 3 then raise exception 'rate_limited' using errcode='P0001'; end if;
  insert into public.partner_applications(applicant_name,applicant_email,partner_type,locale,motivation,status_token_hash,submitter_fingerprint)
  values(trim(p_name),lower(trim(p_email)),p_partner_type,p_locale,trim(p_motivation),p_status_token_hash,p_submitter_fingerprint)
  returning id into v_id;
  return jsonb_build_object('applicationId',v_id,'status','submitted');
exception when unique_violation then raise exception 'application_already_open' using errcode='23505';
end; $$;

create or replace function public.read_partner_application_status(p_application_id uuid,p_status_token_hash text)
returns jsonb language sql security definer set search_path='' stable as $$
  select coalesce((select jsonb_build_object('applicationId',id,'status',status,'updatedAt',updated_at)
    from public.partner_applications where id=p_application_id and status_token_hash=p_status_token_hash),'{}'::jsonb);
$$;

create or replace function public.admin_list_partner_applications(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' stable as $$
begin
  perform private.assert_platform_admin();
  if p_limit not between 1 and 200 or p_offset < 0 then raise exception 'invalid_pagination' using errcode='22023'; end if;
  return jsonb_build_object('total',(select count(*) from public.partner_applications),'items',coalesce((
    select jsonb_agg(to_jsonb(q)) from (select id,applicant_name,applicant_email,partner_type,locale,status,created_at
      from public.partner_applications order by created_at desc limit p_limit offset p_offset) q),'[]'::jsonb));
end; $$;

create or replace function public.admin_review_partner_application(p_application_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.partner_applications%rowtype; p_id uuid;
begin
  perform private.assert_platform_admin();
  if p_decision not in ('under_review','approved','refused','suspended') then raise exception 'invalid_decision' using errcode='22023'; end if;
  select * into a from public.partner_applications where id=p_application_id for update;
  if a.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  update public.partner_applications set status=p_decision,reviewed_by=(select auth.uid()),reviewed_at=now(),decision_note=p_note,updated_at=now() where id=a.id;
  if p_decision='approved' then
    insert into public.partners(application_id,display_name,partner_type,approved_by)
    values(a.id,a.applicant_name,a.partner_type,(select auth.uid())) on conflict(application_id) do nothing returning id into p_id;
  end if;
  insert into public.partner_admin_events(actor_user_id,action,target_type,target_id,details)
  values((select auth.uid()),'application_reviewed','application',a.id,jsonb_build_object('decision',p_decision));
  return jsonb_build_object('applicationId',a.id,'status',p_decision,'partnerId',p_id);
end; $$;

create or replace function public.admin_transition_partner_reward(p_reward_id uuid,p_status text,p_note text default null,p_payment_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.partner_rewards%rowtype; actor uuid := (select auth.uid());
begin
  perform private.assert_platform_admin();
  select * into r from public.partner_rewards where id=p_reward_id for update;
  if r.id is null then raise exception 'not_found' using errcode='P0002'; end if;
  if not ((r.status='pending' and p_status in ('approved','cancelled')) or (r.status='approved' and p_status in ('paid','cancelled'))) then
    raise exception 'invalid_transition' using errcode='22023';
  end if;
  if p_status='paid' and r.approved_by=actor then raise exception 'four_eyes_required' using errcode='42501'; end if;
  update public.partner_rewards set status=p_status,
    approved_by=case when p_status='approved' then actor else approved_by end,
    approved_at=case when p_status='approved' then now() else approved_at end,
    paid_by=case when p_status='paid' then actor else paid_by end,
    paid_at=case when p_status='paid' then now() else paid_at end,
    payment_reference=case when p_status='paid' then p_payment_reference else payment_reference end
  where id=r.id;
  insert into public.partner_reward_events(reward_id,from_status,to_status,actor_user_id,note) values(r.id,r.status,p_status,actor,p_note);
  insert into public.partner_admin_events(actor_user_id,action,target_type,target_id,details)
  values(actor,'reward_transitioned','reward',r.id,jsonb_build_object('from',r.status,'to',p_status));
  return jsonb_build_object('rewardId',r.id,'status',p_status);
end; $$;

create or replace function public.partner_dashboard_self()
returns jsonb language plpgsql security definer set search_path='' stable as $$
declare p public.partners%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into p from public.partners where user_id=(select auth.uid()) and status in ('approved','active');
  if p.id is null then raise exception 'forbidden' using errcode='42501'; end if;
  return jsonb_build_object('partnerId',p.id,'displayName',p.display_name,'type',p.partner_type,'status',p.status,
    'codes',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'status',status,'campaign',campaign_name)),'[]'::jsonb) from public.partner_codes where partner_id=p.id),
    'attributions',(select count(*) from public.partner_attributions where partner_id=p.id),
    'rewards',(select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) from (select r.status,count(*) total from public.partner_rewards r join public.partner_attributions a on a.id=r.attribution_id where a.partner_id=p.id group by r.status) x));
end; $$;

revoke all on function public.submit_partner_application(text,text,text,text,text,text,text) from public,authenticated;
revoke all on function public.read_partner_application_status(uuid,text) from public,authenticated;
revoke all on function public.admin_list_partner_applications(integer,integer) from public,anon;
revoke all on function public.admin_review_partner_application(uuid,text,text) from public,anon;
revoke all on function public.admin_transition_partner_reward(uuid,text,text,text) from public,anon;
revoke all on function public.partner_dashboard_self() from public,anon;
grant execute on function public.submit_partner_application(text,text,text,text,text,text,text) to anon;
grant execute on function public.read_partner_application_status(uuid,text) to anon;
grant execute on function public.admin_list_partner_applications(integer,integer) to authenticated;
grant execute on function public.admin_review_partner_application(uuid,text,text) to authenticated;
grant execute on function public.admin_transition_partner_reward(uuid,text,text,text) to authenticated;
grant execute on function public.partner_dashboard_self() to authenticated;
commit;
