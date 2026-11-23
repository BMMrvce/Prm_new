-- ════════════════════════════════════════════════════════════════════════════════════
-- 5 · System: notifications, connected accounts, push reminders, the privacy vault
--     (PIN + unlock grants), rate limits, security log, search and realtime.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── Notifications (written by triggers and the server; read by their recipient) ─────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  title text not null check (char_length(title) <= 200),
  body text check (body is null or char_length(body) <= 500),
  -- In-app path to open, e.g. /w/acme/tasks?task=<id>. Always a relative path.
  link text check (link is null or (link ~ '^/[a-zA-Z0-9]' and char_length(link) <= 500)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications read own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (workspace_id is null or workspace_id in (select private.member_workspaces())));
create policy "notifications mark read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only read_at may change from the browser.
create or replace function private.guard_notification_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  incoming timestamptz := new.read_at;
begin
  if current_user = 'authenticated' then
    new := old;
    new.read_at := incoming;
  end if;
  return new;
end;
$$;

create trigger notifications_guard before update on public.notifications
for each row execute function private.guard_notification_update();

create or replace function private.actor_name()
returns text
language sql
stable
security definer set search_path = ''
as $$
  select coalesce((select nullif(full_name, '') from public.profiles where id = (select auth.uid())), 'Someone');
$$;

create or replace function private.workspace_slug(target uuid)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select slug from public.workspaces where id = target;
$$;

create or replace function private.notify_assignee()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    insert into public.notifications (user_id, workspace_id, kind, title, body, link)
    select new.user_id, new.workspace_id, 'task.assigned',
           private.actor_name() || ' assigned you a task', left(t.title, 200),
           '/w/' || private.workspace_slug(new.workspace_id) || '/tasks?task=' || t.id
    from public.tasks t where t.id = new.task_id;
  end if;
  return null;
end;
$$;

create trigger task_assignees_notify after insert on public.task_assignees
for each row execute function private.notify_assignee();

-- Comments notify the task's creator and assignees (except the author).
create or replace function private.notify_comment()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, workspace_id, kind, title, body, link)
  select distinct r.user_id, new.workspace_id, 'comment.created',
         private.actor_name() || ' commented on ' || left(t.title, 120), left(new.body, 200),
         '/w/' || private.workspace_slug(new.workspace_id) || '/tasks?task=' || t.id
  from public.tasks t
  cross join lateral (
    select t.creator_id as user_id
    union select a.user_id from public.task_assignees a where a.task_id = t.id
  ) r
  where t.id = new.task_id and r.user_id <> new.author_id;
  return null;
end;
$$;

create trigger comments_notify after insert on public.comments
for each row execute function private.notify_comment();

create or replace function private.notify_note_member()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, workspace_id, kind, title, body, link)
  select new.user_id, new.workspace_id, 'note.shared',
         private.actor_name() || ' shared a note with you', coalesce(nullif(n.title, ''), 'Untitled'),
         '/w/' || private.workspace_slug(new.workspace_id) || '/notes?note=' || n.id
  from public.notes n where n.id = new.note_id;
  return null;
end;
$$;

create trigger note_members_notify after insert on public.note_members
for each row execute function private.notify_note_member();

create or replace function private.notify_invitation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select u.id, 'workspace.invited',
         private.actor_name() || ' invited you to ' || w.name, 'Open to accept or decline', '/invitations'
  from auth.users u, public.workspaces w
  where lower(u.email) = lower(new.email) and w.id = new.workspace_id;
  return null;
end;
$$;

create trigger invitations_notify after insert or update of token_hash on public.workspace_invitations
for each row execute function private.notify_invitation();

-- ── Connected accounts (server-only; secrets are encrypted by the app) ──────────────
create table public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Mailboxes belong to one workspace; account-wide connections (YouTube) have none.
  workspace_id uuid references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('mail', 'youtube', 'calendar')),
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,30}$'),
  account text not null default '' check (char_length(account) <= 254),
  -- AES-256-GCM sealed JSON, prefixed with the key id: "<kid>.<iv>.<tag>.<data>".
  secret text not null,
  -- Non-secret settings, e.g. the chosen YouTube playlist or IMAP host.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_connections_scope_idx
  on public.user_connections(user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

create trigger user_connections_updated_at before update on public.user_connections
for each row execute function private.touch_updated_at();

alter table public.user_connections enable row level security;
revoke all on public.user_connections from anon, authenticated;

-- What the browser may know about its connections: never the secret.
create or replace function public.my_connections()
returns table (id uuid, workspace_id uuid, kind text, provider text, account text, settings jsonb, updated_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select c.id, c.workspace_id, c.kind, c.provider, c.account, c.settings, c.updated_at
  from public.user_connections c
  where c.user_id = (select auth.uid())
    and (c.workspace_id is null or c.workspace_id in (select private.member_workspaces()));
$$;

revoke all on function public.my_connections() from public, anon;
grant execute on function public.my_connections() to authenticated;

-- ── Push reminders (server-only) ────────────────────────────────────────────────────
create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table public.reminder_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index reminder_deliveries_sent_idx on public.reminder_deliveries(sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_deliveries enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.reminder_deliveries from anon, authenticated;

-- ── Privacy vault: PIN, lockout and audit (server-only) ─────────────────────────────
create table public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- scrypt hash: "scrypt$N$r$p$<salt b64>$<hash b64>"
  pin_hash text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  auto_lock_minutes integer not null default 15 check (auto_lock_minutes between 1 and 240),
  updated_at timestamptz not null default now()
);

create table public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index security_events_user_idx on public.security_events(user_id, created_at desc);

create table public.rate_limits (
  bucket text primary key check (char_length(bucket) <= 200),
  hits integer not null default 0,
  reset_at timestamptz not null
);

alter table public.user_security enable row level security;
alter table public.security_events enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.user_security from anon, authenticated;
revoke all on public.security_events from anon, authenticated;
revoke all on public.rate_limits from anon, authenticated;

-- Your own recent security events (sign-ins to the vault, failed PINs, …).
create policy "security events read own" on public.security_events for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.security_events to authenticated;

-- Fixed-window rate limiter for the server: true when the call is allowed.
create or replace function public.rate_limit_hit(bucket_key text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  current_hits integer;
begin
  insert into public.rate_limits as r (bucket, hits, reset_at)
  values (bucket_key, 1, now() + make_interval(secs => window_seconds))
  on conflict (bucket) do update
    set hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
        reset_at = case when r.reset_at <= now() then now() + make_interval(secs => window_seconds) else r.reset_at end
  returning hits into current_hits;
  return current_hits <= max_hits;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- What the browser may know about the vault.
create or replace function public.my_security_status()
returns table (has_pin boolean, auto_lock_minutes integer, unlocked_until timestamptz, locked_until timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select
    coalesce((select s.pin_hash is not null from public.user_security s where s.user_id = (select auth.uid())), false),
    coalesce((select s.auto_lock_minutes from public.user_security s where s.user_id = (select auth.uid())), 15),
    (select g.expires_at from public.unlock_grants g
      where g.user_id = (select auth.uid())
        and g.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and g.expires_at > now()),
    (select s.locked_until from public.user_security s where s.user_id = (select auth.uid()) and s.locked_until > now());
$$;

revoke all on function public.my_security_status() from public, anon;
grant execute on function public.my_security_status() to authenticated;

-- Housekeeping, run by the cron route: expired grants, old deliveries and rate buckets.
create or replace function public.housekeeping()
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.unlock_grants where expires_at < now() - interval '1 hour';
  delete from public.rate_limits where reset_at < now() - interval '1 hour';
  delete from public.reminder_deliveries where sent_at < now() - interval '14 days';
  delete from public.security_events where created_at < now() - interval '180 days';
$$;

revoke all on function public.housekeeping() from public, anon, authenticated;
grant execute on function public.housekeeping() to service_role;

-- ── Search across everything the user can see ───────────────────────────────────────
-- SECURITY INVOKER: every row still passes RLS. Prefix-matches each word.
create or replace function public.search_all(term text, target_workspace uuid default null, max_results integer default 30)
returns table (kind text, id uuid, workspace_id uuid, title text, subtitle text, ref text, rank real)
language plpgsql
stable
set search_path = ''
as $$
declare
  words text[];
  query tsquery;
begin
  words := array(
    select w from regexp_split_to_table(lower(coalesce(term, '')), '[^[:alnum:]]+') as w
    where w <> '' limit 8
  );
  if array_length(words, 1) is null then return; end if;
  query := to_tsquery('simple', array_to_string(array(select quote_literal(w) || ':*' from unnest(words) w), ' & '));

  return query
  (
    select 'task'::text, t.id, t.workspace_id, t.title,
           (select w.task_prefix from public.workspaces w where w.id = t.workspace_id) || '-' || t.task_number,
           null::text, ts_rank(t.search, query)
    from public.tasks t
    where t.search @@ query and (target_workspace is null or t.workspace_id = target_workspace)
    order by ts_rank(t.search, query) desc limit max_results
  )
  union all
  (
    select 'note'::text, n.id, n.workspace_id, coalesce(nullif(n.title, ''), 'Untitled'),
           left(regexp_replace(n.content, '<[^>]*>', ' ', 'g'), 120), null::text, ts_rank(n.search, query)
    from public.notes n
    where n.search @@ query and (target_workspace is null or n.workspace_id = target_workspace)
    order by ts_rank(n.search, query) desc limit max_results
  )
  union all
  (
    select 'project'::text, p.id, p.workspace_id, p.name, p.description, p.slug, 1.0::real
    from public.projects p
    where p.name ilike '%' || replace(replace(trim(term), '%', ''), '_', '\_') || '%'
      and (target_workspace is null or p.workspace_id = target_workspace)
    limit 10
  )
  union all
  (
    select 'whiteboard'::text, b.id, b.workspace_id, b.title, null::text, null::text, 0.9::real
    from public.whiteboards b
    where b.title ilike '%' || replace(replace(trim(term), '%', ''), '_', '\_') || '%'
      and (target_workspace is null or b.workspace_id = target_workspace)
    limit 10
  );
end;
$$;

revoke all on function public.search_all(text, uuid, integer) from public, anon;
grant execute on function public.search_all(text, uuid, integer) to authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────────────
-- Row changes stream to subscribers (RLS applies to every event).
do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'task_assignees', 'task_labels', 'comments', 'projects', 'task_statuses',
    'meetings', 'notes', 'notifications', 'whiteboards', 'time_entries', 'workspace_members'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Private broadcast channels for live collaboration and presence:
--   note:<note_id> · board:<whiteboard_id> · workspace:<workspace_id>
create or replace function private.can_join_topic(topic text)
returns boolean
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  kind text := split_part(topic, ':', 1);
  target uuid := private.try_uuid(split_part(topic, ':', 2));
begin
  if target is null then return false; end if;
  if kind = 'note' then
    return exists (
      select 1 from public.notes n
      where n.id = target and not n.protected
        and n.workspace_id in (select private.member_workspaces())
        and (n.user_id = (select auth.uid()) or n.id in (select private.shared_notes()))
    );
  elsif kind = 'board' then
    return exists (
      select 1 from public.whiteboards b
      where b.id = target
        and b.workspace_id in (select private.member_workspaces())
        and (b.project_id is null or b.project_id in (select private.visible_projects()))
    );
  elsif kind = 'workspace' then
    return target in (select private.member_workspaces());
  end if;
  return false;
end;
$$;

grant execute on function private.can_join_topic(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists "members receive broadcasts" on realtime.messages;
    drop policy if exists "members send broadcasts" on realtime.messages;
    create policy "members receive broadcasts" on realtime.messages for select to authenticated
      using (private.can_join_topic((select realtime.topic())));
    create policy "members send broadcasts" on realtime.messages for insert to authenticated
      with check (private.can_join_topic((select realtime.topic())));
  end if;
end;
$$;

-- Every helper in `private` is callable from policies, never through the API.
grant execute on all functions in schema private to authenticated, service_role;
