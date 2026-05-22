create extension if not exists pgcrypto;

create type family_role as enum ('owner', 'member');
create type todo_category as enum ('preparation', 'homework', 'submission', 'parent_check', 'payment', 'other');
create type todo_status as enum ('pending', 'done', 'archived');
create type notice_status as enum ('draft', 'confirmed', 'cancelled');
create type calendar_event_status as enum ('pending', 'created', 'failed', 'deleted');
create type push_schedule_status as enum ('pending', 'sent', 'failed', 'cancelled');
create type smart_message_delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  toss_user_hash text,
  toss_user_key text,
  current_family_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_current_family_id_fkey
  foreign key (current_family_id) references public.families(id) on delete set null;

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role family_role not null default 'member',
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code text not null unique default replace(replace(rtrim(encode(gen_random_bytes(9), 'base64'), '='), '+', '-'), '/', '_'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  intended_display_name text,
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  avatar_id text not null default 'age5-boy',
  school_name text,
  grade text,
  class_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  source_text text not null,
  parsed_result jsonb not null,
  status notice_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  category todo_category not null default 'other',
  due_date date,
  due_label text,
  remind_at timestamptz,
  status todo_status not null default 'pending',
  source_notice_id uuid references public.notices(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  reminder_at timestamptz,
  confidence double precision,
  needs_user_confirmation boolean not null default false,
  reason text,
  google_event_id text,
  google_calendar_id text,
  source_notice_id uuid references public.notices(id) on delete set null,
  status calendar_event_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null default 'primary',
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, calendar_id)
);

create table public.push_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  todo_id uuid not null references public.todos(id) on delete cascade,
  scheduled_at timestamptz not null,
  status push_schedule_status not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  enabled boolean not null default false,
  preparation_day text not null default 'before',
  preparation_time time not null default '20:00',
  morning_time time not null default '07:30',
  schedule_enabled boolean not null default false,
  schedule_day text not null default 'before',
  schedule_time time not null default '18:30',
  template_set_code text,
  consent_status text not null default 'unknown',
  consent_last_prompted_at timestamptz,
  consent_accepted_at timestamptz,
  consent_declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, family_id),
  constraint notification_preferences_preparation_day_check
    check (preparation_day in ('before', 'same-day')),
  constraint notification_preferences_schedule_day_check
    check (schedule_day in ('before', 'same-day')),
  constraint notification_preferences_consent_status_check
    check (consent_status in ('unknown', 'accepted', 'declined'))
);

create table public.message_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.push_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  target_date date,
  trigger_kind text,
  template_set_code text not null,
  status smart_message_delivery_status not null default 'pending',
  request_payload jsonb not null default '{}'::jsonb,
  response_body jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_delivery_logs_trigger_kind_check
    check (
      trigger_kind in (
        'tomorrow_preparation_check',
        'today_final_check',
        'tomorrow_schedule_reminder',
        'today_schedule_reminder'
      ) or trigger_kind is null
    )
);

create table public.bug_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  family_id uuid references public.families(id) on delete set null,
  event_type text not null,
  severity text not null default 'error',
  screen text,
  step text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  export_attempts integer not null default 0,
  exported_at timestamptz,
  last_export_error text,
  created_at timestamptz not null default now(),
  constraint bug_events_severity_check check (severity in ('info', 'warning', 'error'))
);

create index children_family_id_idx on public.children(family_id);
create index family_invites_code_idx on public.family_invites(code);
create index family_invites_family_id_idx on public.family_invites(family_id);
create index notices_family_status_created_idx on public.notices(family_id, status, created_at desc);
create index todos_family_status_due_idx on public.todos(family_id, status, due_date);
create index todos_child_status_due_idx on public.todos(child_id, status, due_date);
create index calendar_events_family_date_idx on public.calendar_events(family_id, event_date);
create index push_schedules_due_idx on public.push_schedules(status, scheduled_at);
create unique index push_schedules_user_todo_pending_idx
  on public.push_schedules(user_id, todo_id)
  where status = 'pending';
create index notification_preferences_family_idx on public.notification_preferences(family_id, enabled);
create index message_delivery_logs_schedule_idx on public.message_delivery_logs(schedule_id, created_at desc);
create index message_delivery_logs_daily_dedup_idx on public.message_delivery_logs(user_id, child_id, trigger_kind, target_date, created_at desc);
create index bug_events_created_idx on public.bug_events(created_at desc);
create index bug_events_user_idx on public.bug_events(user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger touch_families_updated_at before update on public.families
for each row execute function public.touch_updated_at();

create trigger touch_children_updated_at before update on public.children
for each row execute function public.touch_updated_at();

create trigger touch_notices_updated_at before update on public.notices
for each row execute function public.touch_updated_at();

create trigger touch_todos_updated_at before update on public.todos
for each row execute function public.touch_updated_at();

create trigger touch_calendar_events_updated_at before update on public.calendar_events
for each row execute function public.touch_updated_at();

create trigger touch_push_schedules_updated_at before update on public.push_schedules
for each row execute function public.touch_updated_at();

create trigger touch_notification_preferences_updated_at before update on public.notification_preferences
for each row execute function public.touch_updated_at();

create or replace function public.create_push_schedules_for_todo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_schedules
  set status = 'cancelled'
  where todo_id = new.id
    and status = 'pending'
    and (
      new.remind_at is null
      or new.status <> 'pending'
    );

  if new.remind_at is null or new.status <> 'pending' then
    return new;
  end if;

  update public.push_schedules
  set scheduled_at = new.remind_at,
      family_id = new.family_id
  where todo_id = new.id
    and status = 'pending';

  insert into public.push_schedules (user_id, family_id, todo_id, scheduled_at)
  select fm.user_id, new.family_id, new.id, new.remind_at
  from public.family_members fm
  where fm.family_id = new.family_id
    and not exists (
      select 1
      from public.push_schedules ps
      where ps.user_id = fm.user_id
        and ps.todo_id = new.id
        and ps.status = 'pending'
    )
  on conflict do nothing;

  return new;
end;
$$;

create trigger create_push_schedules_after_todo_insert
after insert on public.todos
for each row execute function public.create_push_schedules_for_todo();

create trigger sync_push_schedules_after_todo_update
after update of remind_at, status, family_id on public.todos
for each row execute function public.create_push_schedules_for_todo();

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_family_owner(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, toss_user_hash)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    new.raw_user_meta_data ->> 'toss_user_hash'
  )
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    toss_user_hash = coalesce(
      public.profiles.toss_user_hash,
      new.raw_user_meta_data ->> 'toss_user_hash'
    )
  where public.profiles.id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.claim_profile_by_toss_hash(toss_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_profile public.profiles%rowtype;
  source_is_owner boolean := false;
begin
  if toss_hash is null or length(trim(toss_hash)) = 0 then
    return;
  end if;

  select *
  into source_profile
  from public.profiles
  where toss_user_hash = toss_hash
    and id <> auth.uid()
    and (toss_user_key is not null or current_family_id is not null)
  order by (toss_user_key is not null) desc, updated_at desc
  limit 1;

  update public.profiles
  set
    toss_user_hash = coalesce(public.profiles.toss_user_hash, toss_hash),
    toss_user_key = coalesce(public.profiles.toss_user_key, source_profile.toss_user_key),
    current_family_id = coalesce(public.profiles.current_family_id, source_profile.current_family_id),
    updated_at = now()
  where id = auth.uid();

  if source_profile.current_family_id is not null then
    select exists (
      select 1
      from public.families
      where id = source_profile.current_family_id
        and owner_id = source_profile.id
    )
    into source_is_owner;

    if source_is_owner then
      update public.families
      set owner_id = auth.uid(), updated_at = now()
      where id = source_profile.current_family_id
        and owner_id = source_profile.id;
    end if;

    insert into public.family_members (family_id, user_id, role, display_name)
    values (
      source_profile.current_family_id,
      auth.uid(),
      case when source_is_owner then 'owner'::public.family_role else 'member'::public.family_role end,
      null
    )
    on conflict (family_id, user_id) do update
    set role = excluded.role;
  end if;
end;
$$;

update public.family_members fm
set display_name = p.display_name
from public.profiles p
where fm.user_id = p.id
  and fm.display_name is null
  and p.display_name is not null;

create or replace function public.create_family_for_current_user(family_name text default '알림장쏙 가족')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
  current_user_id uuid := auth.uid();
  current_display_name text;
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  select display_name into current_display_name
  from public.profiles
  where id = current_user_id;

  insert into public.families (name, owner_id)
  values (family_name, current_user_id)
  returning id into new_family_id;

  insert into public.family_members (family_id, user_id, role, display_name)
  values (new_family_id, current_user_id, 'owner', current_display_name);

  update public.profiles
  set current_family_id = new_family_id
  where id = current_user_id;

  return new_family_id;
end;
$$;

create or replace function public.create_family_invite(
  target_family_id uuid default null,
  invited_display_name text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_family_id uuid;
  invite_code text;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  invite_family_id := target_family_id;

  if invite_family_id is null then
    select current_family_id into invite_family_id
    from public.profiles
    where id = current_user_id;
  end if;

  if invite_family_id is null then
    raise exception '가족 정보가 없어요.';
  end if;

  if not public.is_family_owner(invite_family_id) then
    raise exception '가족 초대는 소유자만 만들 수 있어요.';
  end if;

  insert into public.family_invites (family_id, created_by, intended_display_name)
  values (invite_family_id, current_user_id, nullif(trim(invited_display_name), ''))
  returning code into invite_code;

  return invite_code;
end;
$$;

create or replace function public.accept_family_invite(
  invite_code text,
  invite_display_name_override text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.family_invites%rowtype;
  current_user_id uuid := auth.uid();
  current_display_name text;
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  select * into invite_row
  from public.family_invites
  where code = invite_code
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_row.id is null then
    raise exception '초대 링크가 만료되었거나 올바르지 않아요.';
  end if;

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  select display_name into current_display_name
  from public.profiles
  where id = current_user_id;

  insert into public.family_members (family_id, user_id, role, display_name)
  values (
    invite_row.family_id,
    current_user_id,
    'member',
    coalesce(
      nullif(trim(invite_display_name_override), ''),
      nullif(trim(invite_row.intended_display_name), ''),
      current_display_name
    )
  )
  on conflict (family_id, user_id) do update
  set role = public.family_members.role,
      display_name = coalesce(
        nullif(trim(invite_display_name_override), ''),
        nullif(trim(invite_row.intended_display_name), ''),
        public.family_members.display_name,
        excluded.display_name
      );

  update public.profiles
  set current_family_id = invite_row.family_id
  where id = current_user_id;

  update public.family_invites
  set used_at = coalesce(used_at, now()),
      used_by = coalesce(used_by, current_user_id)
  where id = invite_row.id;

  return invite_row.family_id;
end;
$$;

create or replace function public.leave_current_family()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_family_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  select current_family_id into target_family_id
  from public.profiles
  where id = current_user_id;

  if target_family_id is null then
    return;
  end if;

  if public.is_family_owner(target_family_id) then
    raise exception '소유자는 먼저 소유권을 넘긴 뒤 나갈 수 있어요.';
  end if;

  delete from public.family_members
  where family_id = target_family_id
    and user_id = current_user_id;

  update public.profiles
  set current_family_id = null
  where id = current_user_id;
end;
$$;

create or replace function public.remove_family_member(target_user_id uuid, target_family_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_family_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception '로그인이 필요해요.';
  end if;

  resolved_family_id := target_family_id;

  if resolved_family_id is null then
    select current_family_id into resolved_family_id
    from public.profiles
    where id = current_user_id;
  end if;

  if resolved_family_id is null then
    raise exception '가족 정보가 없어요.';
  end if;

  if not public.is_family_owner(resolved_family_id) then
    raise exception '구성원 연결 해제는 소유자만 할 수 있어요.';
  end if;

  if target_user_id = current_user_id then
    raise exception '소유자 본인은 이 기능으로 해제할 수 없어요.';
  end if;

  delete from public.family_members
  where family_id = resolved_family_id
    and user_id = target_user_id
    and role = 'member';

  update public.profiles
  set current_family_id = null
  where id = target_user_id
    and current_family_id = resolved_family_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.children enable row level security;
alter table public.notices enable row level security;
alter table public.todos enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.push_schedules enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.message_delivery_logs enable row level security;
alter table public.bug_events enable row level security;

create policy "profiles select own" on public.profiles
for select using (id = auth.uid());

create policy "profiles insert own" on public.profiles
for insert with check (id = auth.uid());

create policy "profiles update own" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "families select member" on public.families
for select using (public.is_family_member(id));

create policy "family_members select member" on public.family_members
for select using (public.is_family_member(family_id));

create policy "family_invites select owner" on public.family_invites
for select using (public.is_family_owner(family_id));

create policy "family_invites insert owner" on public.family_invites
for insert with check (public.is_family_owner(family_id) and created_by = auth.uid());

create policy "notification_preferences select own" on public.notification_preferences
for select using (user_id = auth.uid() and public.is_family_member(family_id));

create policy "notification_preferences insert own" on public.notification_preferences
for insert with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy "notification_preferences update own" on public.notification_preferences
for update using (user_id = auth.uid() and public.is_family_member(family_id))
with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy "children select member" on public.children
for select using (public.is_family_member(family_id));

create policy "children write owner" on public.children
for all using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

create policy "notices select member" on public.notices
for select using (public.is_family_member(family_id));

create policy "notices insert member" on public.notices
for insert with check (public.is_family_member(family_id) and uploaded_by = auth.uid());

create policy "notices update member" on public.notices
for update using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create policy "todos select member" on public.todos
for select using (public.is_family_member(family_id));

create policy "todos insert member" on public.todos
for insert with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "todos update member" on public.todos
for update using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create policy "calendar_events select member" on public.calendar_events
for select using (public.is_family_member(family_id));

create policy "calendar_events insert member" on public.calendar_events
for insert with check (public.is_family_member(family_id) and created_by = auth.uid());

create policy "calendar_events update member" on public.calendar_events
for update using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

-- Server-only tables. Use Supabase service role from Edge Functions/API server.
create policy "calendar_connections deny client" on public.calendar_connections
for all using (false) with check (false);

create policy "push_schedules deny client" on public.push_schedules
for all using (false) with check (false);

create policy "message_delivery_logs deny client" on public.message_delivery_logs
for all using (false) with check (false);

create policy "bug_events insert self or anonymous" on public.bug_events
for insert with check (user_id is null or user_id = auth.uid());

create policy "bug_events select own" on public.bug_events
for select using (user_id = auth.uid());

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.profiles to service_role;
grant select, insert, update on public.families to authenticated;
grant select, insert, update, delete on public.family_members to authenticated;
grant select, insert, update on public.family_invites to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update on public.notices to authenticated;
grant select, insert, update on public.todos to authenticated;
grant select, insert, update on public.calendar_events to authenticated;
grant select, insert on public.bug_events to authenticated;
grant select, update on public.bug_events to service_role;
grant insert on public.message_delivery_logs to service_role;
grant update on public.push_schedules to service_role;
grant execute on function public.claim_profile_by_toss_hash(text) to authenticated;
grant execute on function public.create_family_for_current_user(text) to authenticated;
grant execute on function public.create_family_invite(uuid, text) to authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.leave_current_family() to authenticated;
grant execute on function public.remove_family_member(uuid, uuid) to authenticated;
