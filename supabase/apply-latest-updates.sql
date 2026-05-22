-- 알림장쏙 최신 추가분 적용 SQL
-- Supabase SQL Editor에서 이 파일 전체를 한 번에 실행하세요.
-- 기존 전체 schema.sql 재실행보다 안전하게 "초대/알림/구성원 해제" 추가분만 반영합니다.

create extension if not exists pgcrypto;

grant select, update on public.profiles to service_role;
grant insert on public.message_delivery_logs to service_role;
grant update on public.push_schedules to service_role;

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

grant execute on function public.claim_profile_by_toss_hash(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'toss_user_key'
  ) then
    alter table public.profiles add column toss_user_key text;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'smart_message_delivery_status'
  ) then
    create type public.smart_message_delivery_status as enum ('pending', 'sent', 'failed', 'skipped');
  end if;
end
$$;

create table if not exists public.notification_preferences (
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

alter table public.calendar_events
  add column if not exists description text;
alter table public.calendar_events
  add column if not exists reminder_at timestamptz;
alter table public.calendar_events
  add column if not exists confidence double precision;
alter table public.calendar_events
  add column if not exists needs_user_confirmation boolean not null default false;
alter table public.calendar_events
  add column if not exists reason text;

alter table public.notification_preferences
  alter column enabled set default false;
alter table public.notification_preferences
  add column if not exists schedule_enabled boolean not null default false;
alter table public.notification_preferences
  add column if not exists schedule_day text not null default 'before';
alter table public.notification_preferences
  add column if not exists schedule_time time not null default '18:30';
alter table public.notification_preferences
  add column if not exists consent_status text not null default 'unknown';
alter table public.notification_preferences
  add column if not exists consent_last_prompted_at timestamptz;
alter table public.notification_preferences
  add column if not exists consent_accepted_at timestamptz;
alter table public.notification_preferences
  add column if not exists consent_declined_at timestamptz;

create table if not exists public.message_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.push_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  target_date date,
  trigger_kind text,
  template_set_code text not null,
  status public.smart_message_delivery_status not null default 'pending',
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

alter table public.message_delivery_logs
  alter column schedule_id drop not null;
alter table public.message_delivery_logs
  alter column todo_id drop not null;
alter table public.message_delivery_logs
  add column if not exists child_id uuid references public.children(id) on delete cascade;
alter table public.message_delivery_logs
  add column if not exists target_date date;
alter table public.message_delivery_logs
  add column if not exists trigger_kind text;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_schedule_day_check;
alter table public.notification_preferences
  add constraint notification_preferences_schedule_day_check
  check (schedule_day in ('before', 'same-day'));

alter table public.message_delivery_logs
  drop constraint if exists message_delivery_logs_trigger_kind_check;
alter table public.message_delivery_logs
  add constraint message_delivery_logs_trigger_kind_check
  check (
    trigger_kind in (
      'tomorrow_preparation_check',
      'today_final_check',
      'tomorrow_schedule_reminder',
      'today_schedule_reminder'
    ) or trigger_kind is null
  );

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code text not null unique default replace(replace(rtrim(encode(gen_random_bytes(9), 'base64'), '='), '+', '-'), '/', '_'),
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists family_invites_code_idx on public.family_invites(code);
create index if not exists family_invites_family_id_idx on public.family_invites(family_id);
create index if not exists push_schedules_due_idx on public.push_schedules(status, scheduled_at);
drop index if exists public.push_schedules_user_todo_idx;
create unique index if not exists push_schedules_user_todo_pending_idx
  on public.push_schedules(user_id, todo_id)
  where status = 'pending';
create index if not exists notification_preferences_family_idx on public.notification_preferences(family_id, enabled);
create index if not exists message_delivery_logs_schedule_idx on public.message_delivery_logs(schedule_id, created_at desc);
create index if not exists message_delivery_logs_daily_dedup_idx
  on public.message_delivery_logs(user_id, child_id, trigger_kind, target_date, created_at desc);

drop trigger if exists touch_notification_preferences_updated_at on public.notification_preferences;
create trigger touch_notification_preferences_updated_at
before update on public.notification_preferences
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

drop trigger if exists create_push_schedules_after_todo_insert on public.todos;
create trigger create_push_schedules_after_todo_insert
after insert on public.todos
for each row execute function public.create_push_schedules_for_todo();

drop trigger if exists sync_push_schedules_after_todo_update on public.todos;
create trigger sync_push_schedules_after_todo_update
after update of remind_at, status, family_id on public.todos
for each row execute function public.create_push_schedules_for_todo();

update public.family_members fm
set display_name = p.display_name
from public.profiles p
where fm.user_id = p.id
  and fm.display_name is null
  and p.display_name is not null;

alter table public.family_invites
add column if not exists intended_display_name text;

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

alter table public.family_invites enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.message_delivery_logs enable row level security;

drop policy if exists "family_invites select owner" on public.family_invites;
create policy "family_invites select owner" on public.family_invites
for select using (public.is_family_owner(family_id));

drop policy if exists "family_invites insert owner" on public.family_invites;
create policy "family_invites insert owner" on public.family_invites
for insert with check (public.is_family_owner(family_id) and created_by = auth.uid());

drop policy if exists "notification_preferences select own" on public.notification_preferences;
create policy "notification_preferences select own" on public.notification_preferences
for select using (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists "notification_preferences insert own" on public.notification_preferences;
create policy "notification_preferences insert own" on public.notification_preferences
for insert with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists "notification_preferences update own" on public.notification_preferences;
create policy "notification_preferences update own" on public.notification_preferences
for update using (user_id = auth.uid() and public.is_family_member(family_id))
with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists "message_delivery_logs deny client" on public.message_delivery_logs;
create policy "message_delivery_logs deny client" on public.message_delivery_logs
for all using (false) with check (false);

grant select, insert, update on public.family_invites to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant execute on function public.create_family_invite(uuid, text) to authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.leave_current_family() to authenticated;
grant execute on function public.remove_family_member(uuid, uuid) to authenticated;
