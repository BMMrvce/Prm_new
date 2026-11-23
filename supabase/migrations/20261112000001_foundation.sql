-- ════════════════════════════════════════════════════════════════════════════════════
-- 1 · Foundation: people, workspaces, membership, teams, modules and access helpers.
--
-- Access model
--   • A workspace is anything the user organises work in (a company, a client, home…).
--   • Membership carries a role: owner > admin > member > guest.
--   • A workspace can be *protected*: its data is hidden by RLS unless the current
--     browser session holds an unexpired unlock grant (see 20261112000005_security.sql).
--   • Every policy goes through the set-returning helpers in the `private` schema, which
--     Postgres evaluates once per statement (initPlan), so policies stay cheap on big
--     tables: `workspace_id in (select private.member_workspaces())`.
-- ════════════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Helper functions live here. The schema is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');

-- ── Shared trigger: keep updated_at current ─────────────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Profiles ────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  locale text not null default 'en' check (char_length(locale) <= 16),
  -- { theme, reminders: { digest_time, meeting_lead_minutes, due_lead_minutes }, … }
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  -- { completed_at, step, tour: { completed_at, dismissed_at } }
  onboarding jsonb not null default '{}'::jsonb check (jsonb_typeof(onboarding) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- ── Workspaces ──────────────────────────────────────────────────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 64),
  description text check (description is null or char_length(description) <= 500),
  -- Lucide icon name and a theme color key (never a hex; the UI maps keys to tokens).
  icon text not null default 'briefcase' check (char_length(icon) <= 40),
  color text not null default 'indigo' check (color ~ '^[a-z-]{2,20}$'),
  -- The template it was created from (informational only; behaviour comes from modules).
  template text not null default 'blank' check (char_length(template) <= 40),
  task_prefix text not null default 'TSK' check (task_prefix ~ '^[A-Z0-9]{2,6}$'),
  next_task_number bigint not null default 1 check (next_task_number > 0),
  -- { currency, week_start, date_format, … }
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  protected boolean not null default false,
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at before update on public.workspaces
for each row execute function private.touch_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email extensions.citext not null check (char_length(email) <= 254),
  role public.workspace_role not null default 'member' check (role <> 'owner'),
  -- sha256 of the token in the invite link; the token itself is never stored.
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create index workspace_invitations_email_idx on public.workspace_invitations(email)
  where accepted_at is null;

-- Teams group members inside a workspace; projects can be visible to one team only.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  color text not null default 'teal' check (color ~ '^[a-z-]{2,20}$'),
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members(user_id);
create index team_members_workspace_idx on public.team_members(workspace_id);

-- Which feature modules a workspace uses, in which order, with per-module settings.
create table public.workspace_modules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_id text not null check (module_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  enabled boolean not null default true,
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  primary key (workspace_id, module_id)
);

-- Per-person preferences for a workspace: pin, order in the switcher, hidden modules.
create table public.user_workspace_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pinned boolean not null default false,
  position integer not null default 0,
  hidden_modules text[] not null default '{}',
  last_opened_at timestamptz,
  primary key (user_id, workspace_id)
);

-- Unlock grants are defined here so the access helpers below can refer to them. A grant
-- belongs to one browser session (the JWT's session_id) and expires on its own. Only the
-- server writes them, after checking the user's PIN (see /api/security).
create table public.unlock_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.unlock_grants enable row level security;
revoke all on public.unlock_grants from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Access helpers. SECURITY DEFINER so they can read membership without recursing into
-- RLS; STABLE so Postgres caches them within a statement.
-- ════════════════════════════════════════════════════════════════════════════════════

create or replace function private.vault_unlocked()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.unlock_grants g
    where g.user_id = (select auth.uid())
      and g.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and g.expires_at > now()
  );
$$;

-- Workspaces whose data the current user may read right now.
create or replace function private.member_workspaces()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid())
    and (not w.protected or (select private.vault_unlocked()));
$$;

-- Workspaces where the current user may create and edit content (not guests).
create or replace function private.writable_workspaces()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin', 'member')
    and w.archived_at is null
    and (not w.protected or (select private.vault_unlocked()));
$$;

-- Workspaces the current user administers.
create or replace function private.admin_workspaces()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid())
    and m.role in ('owner', 'admin')
    and (not w.protected or (select private.vault_unlocked()));
$$;

create or replace function private.owner_workspaces()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = (select auth.uid()) and m.role = 'owner';
$$;

-- Everyone who shares at least one workspace with the current user (including them).
create or replace function private.co_member_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select distinct other.user_id
  from public.workspace_members mine
  join public.workspace_members other on other.workspace_id = mine.workspace_id
  where mine.user_id = (select auth.uid());
$$;

create or replace function private.my_teams()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select team_id from public.team_members where user_id = (select auth.uid());
$$;

create or replace function private.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ── Workspace bootstrap ─────────────────────────────────────────────────────────────

-- Turn a name into a unique slug: "Acme Corp" → "acme-corp", then "acme-corp-2", …
create or replace function private.unique_workspace_slug(base_name text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  base text := trim(both '-' from regexp_replace(lower(base_name), '[^a-z0-9]+', '-', 'g'));
  candidate text;
  n integer := 1;
begin
  if base = '' then base := 'workspace'; end if;
  base := left(base, 48);
  candidate := base;
  while exists (select 1 from public.workspaces where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Creates a workspace with its owner membership, default statuses and chosen modules in
-- one transaction. Templates are presets chosen in the app; nothing here is fixed.
create or replace function public.create_workspace(
  workspace_name text,
  modules text[] default '{}',
  template text default 'blank',
  icon text default 'briefcase',
  color text default 'indigo',
  prefix text default null,
  description text default null,
  module_config jsonb default '{}'::jsonb
)
returns public.workspaces
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  created public.workspaces;
  clean_prefix text;
  module_name text;
  i integer := 0;
begin
  if me is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if char_length(trim(coalesce(workspace_name, ''))) not between 1 and 80 then
    raise exception 'Workspace name must be 1–80 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_members where user_id = me and role = 'owner') >= 50 then
    raise exception 'You can own at most 50 workspaces' using errcode = '54000';
  end if;

  clean_prefix := upper(left(regexp_replace(coalesce(nullif(prefix, ''), workspace_name), '[^A-Za-z0-9]', '', 'g'), 4));
  if char_length(clean_prefix) < 2 then clean_prefix := 'TSK'; end if;

  insert into public.profiles (id) values (me) on conflict (id) do nothing;

  insert into public.workspaces (name, slug, description, icon, color, template, task_prefix, created_by)
  values (
    trim(workspace_name),
    private.unique_workspace_slug(workspace_name),
    nullif(trim(coalesce(description, '')), ''),
    coalesce(nullif(icon, ''), 'briefcase'),
    coalesce(nullif(color, ''), 'indigo'),
    coalesce(nullif(template, ''), 'blank'),
    clean_prefix,
    me
  )
  returning * into created;

  insert into public.workspace_members (workspace_id, user_id, role) values (created.id, me, 'owner');

  insert into public.task_statuses (workspace_id, name, category, color, position) values
    (created.id, 'Backlog', 'backlog', 'slate', 1),
    (created.id, 'To do', 'todo', 'blue', 2),
    (created.id, 'In progress', 'in_progress', 'amber', 3),
    (created.id, 'Done', 'done', 'green', 4),
    (created.id, 'Cancelled', 'cancelled', 'slate', 5);

  foreach module_name in array coalesce(modules, '{}') loop
    if module_name ~ '^[a-z][a-z0-9-]{1,39}$' then
      i := i + 1;
      insert into public.workspace_modules (workspace_id, module_id, enabled, position, config)
      values (created.id, module_name, true, i,
              case when jsonb_typeof(module_config -> module_name) = 'object' then module_config -> module_name else '{}'::jsonb end)
      on conflict do nothing;
    end if;
  end loop;

  insert into public.user_workspace_prefs (user_id, workspace_id, position, last_opened_at)
  values (me, created.id, (select coalesce(max(position), 0) + 1 from public.user_workspace_prefs where user_id = me), now());

  return created;
end;
$$;

revoke all on function public.create_workspace(text, text[], text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_workspace(text, text[], text, text, text, text, text, jsonb) to authenticated;

-- An owner can never leave a workspace without another owner.
create or replace function private.keep_an_owner()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  ws uuid := coalesce(old.workspace_id, new.workspace_id);
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    -- Cascading workspace deletes remove every member at once; allow that.
    if not exists (select 1 from public.workspaces where id = ws) then
      return coalesce(new, old);
    end if;
    if not exists (
      select 1 from public.workspace_members
      where workspace_id = ws and role = 'owner' and user_id <> old.user_id
    ) then
      raise exception 'A workspace needs at least one owner' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger workspace_members_keep_owner
before update or delete on public.workspace_members
for each row execute function private.keep_an_owner();

-- Only owners may grant or take away the owner role.
create or replace function private.guard_member_role()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (new.role = 'owner' or old.role = 'owner')
     and new.workspace_id not in (select private.owner_workspaces()) then
    raise exception 'Only an owner can change owners' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger workspace_members_guard_role
before update on public.workspace_members
for each row execute function private.guard_member_role();

-- Team members must belong to the workspace.
create or replace function private.validate_team_member()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select t.workspace_id into new.workspace_id from public.teams t where t.id = new.team_id;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = new.workspace_id and user_id = new.user_id
  ) then
    raise exception 'Only workspace members can join its teams' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger team_members_validate before insert or update on public.team_members
for each row execute function private.validate_team_member();

-- ── Invitations ─────────────────────────────────────────────────────────────────────

-- Admins invite by email. Returns the one-time token for the invite link.
create or replace function public.invite_member(target_workspace uuid, invitee_email text, invitee_role public.workspace_role default 'member')
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  clean_email text := lower(trim(invitee_email));
begin
  if target_workspace not in (select private.admin_workspaces()) then
    raise exception 'Only admins can invite people' using errcode = '42501';
  end if;
  if invitee_role = 'owner' then raise exception 'Invite as admin, then promote' using errcode = '22023'; end if;
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace and lower(u.email) = clean_email
  ) then
    raise exception 'That person is already a member' using errcode = '23505';
  end if;
  if (select count(*) from public.workspace_invitations
      where invited_by = auth.uid() and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many invitations today' using errcode = '54000';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values (target_workspace, clean_email, invitee_role, encode(extensions.digest(token, 'sha256'), 'hex'), auth.uid())
  on conflict (workspace_id, email) do update
    set role = excluded.role, token_hash = excluded.token_hash, invited_by = excluded.invited_by,
        expires_at = now() + interval '14 days', accepted_at = null, created_at = now();

  return token;
end;
$$;

-- Invitations addressed to the signed-in user's confirmed email.
create or replace function public.my_invitations()
returns table (id uuid, workspace_id uuid, workspace_name text, role public.workspace_role, invited_by_name text, expires_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select i.id, i.workspace_id, w.name, i.role, p.full_name, i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  left join public.profiles p on p.id = i.invited_by
  join auth.users u on u.id = auth.uid()
  where i.accepted_at is null
    and i.expires_at > now()
    and u.email_confirmed_at is not null
    and lower(u.email) = lower(i.email);
$$;

-- Accept by id (from the in-app list) or by token (from an invite link). Either way the
-- invitation must be addressed to the signed-in user's confirmed email.
create or replace function public.accept_invitation(invitation_id uuid default null, token text default null)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  invite public.workspace_invitations;
  my_email text;
begin
  select lower(email) into my_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if my_email is null then
    raise exception 'Confirm your email address before joining a workspace' using errcode = '42501';
  end if;

  select * into invite from public.workspace_invitations
  where accepted_at is null and expires_at > now()
    and (
      (invitation_id is not null and id = invitation_id)
      or (token is not null and token_hash = encode(extensions.digest(token, 'sha256'), 'hex'))
    )
  for update;

  if invite.id is null or lower(invite.email) <> my_email then
    raise exception 'This invitation is invalid, expired or for another email address' using errcode = '42501';
  end if;

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (invite.workspace_id, auth.uid(), invite.role)
  on conflict (workspace_id, user_id) do nothing;
  insert into public.user_workspace_prefs (user_id, workspace_id, last_opened_at)
  values (auth.uid(), invite.workspace_id, now())
  on conflict do nothing;
  update public.workspace_invitations set accepted_at = now() where id = invite.id;
  return invite.workspace_id;
end;
$$;

revoke all on function public.invite_member(uuid, text, public.workspace_role) from public, anon;
revoke all on function public.my_invitations() from public, anon;
revoke all on function public.accept_invitation(uuid, text) from public, anon;
grant execute on function public.invite_member(uuid, text, public.workspace_role) to authenticated;
grant execute on function public.my_invitations() to authenticated;
grant execute on function public.accept_invitation(uuid, text) to authenticated;

-- Find co-members to assign or mention: only people who share a workspace with you.
create or replace function public.search_people(term text, target_workspace uuid default null)
returns table (id uuid, full_name text, email text, avatar_url text)
language sql
stable
security definer set search_path = ''
as $$
  select distinct p.id, p.full_name, u.email::text, p.avatar_url
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = p.id
  where m.workspace_id in (select private.member_workspaces())
    and (target_workspace is null or m.workspace_id = target_workspace)
    and char_length(trim(coalesce(term, ''))) >= 1
    and (
      u.email ilike replace(replace(replace(trim(term), '\', ''), '%', ''), '_', '\_') || '%'
      or p.full_name ilike '%' || replace(replace(replace(trim(term), '\', ''), '%', ''), '_', '\_') || '%'
    )
  order by p.full_name nulls last
  limit 10;
$$;

revoke all on function public.search_people(text, uuid) from public, anon;
grant execute on function public.search_people(text, uuid) to authenticated;

-- Members of a workspace with their email (only for people inside that workspace).
create or replace function public.workspace_people(target_workspace uuid)
returns table (user_id uuid, full_name text, email text, avatar_url text, role public.workspace_role, joined_at timestamptz)
language sql
stable
security definer set search_path = ''
as $$
  select m.user_id, p.full_name, u.email::text, p.avatar_url, m.role, m.joined_at
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.workspace_id = target_workspace
    and target_workspace in (select private.member_workspaces())
  order by m.role, p.full_name nulls last;
$$;

revoke all on function public.workspace_people(uuid) from public, anon;
grant execute on function public.workspace_people(uuid) to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.workspace_modules enable row level security;
alter table public.user_workspace_prefs enable row level security;

-- Profiles: yourself and people you share a workspace with. Nobody else.
create policy "profiles read" on public.profiles for select to authenticated
  using (id in (select private.co_member_ids()) or id = (select auth.uid()));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Workspaces: members see the row even while it is locked (name and icon only reach the
-- switcher; everything inside stays hidden). Created only through create_workspace().
create policy "workspaces read" on public.workspaces for select to authenticated
  using (id in (select workspace_id from public.workspace_members where user_id = (select auth.uid())));
create policy "workspaces admin update" on public.workspaces for update to authenticated
  using (id in (select private.admin_workspaces()))
  with check (id in (select private.admin_workspaces()));
create policy "workspaces owner delete" on public.workspaces for delete to authenticated
  using (id in (select private.owner_workspaces()));

-- Prevent edits to bookkeeping columns through the API.
create or replace function private.guard_workspace_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only requests from the browser are restricted; internal functions (task numbering)
  -- and the server (protection, after a PIN check) run as other roles.
  if current_user = 'authenticated' then
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.next_task_number := old.next_task_number;
    new.protected := old.protected;
  end if;
  return new;
end;
$$;

create trigger workspaces_guard before update on public.workspaces
for each row execute function private.guard_workspace_update();

create policy "members read" on public.workspace_members for select to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select private.member_workspaces()));
create policy "members admin update" on public.workspace_members for update to authenticated
  using (workspace_id in (select private.admin_workspaces()))
  with check (workspace_id in (select private.admin_workspaces()));
-- Admins remove people; anyone can leave.
create policy "members remove" on public.workspace_members for delete to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

create policy "invitations admin read" on public.workspace_invitations for select to authenticated
  using (workspace_id in (select private.admin_workspaces()));
create policy "invitations admin delete" on public.workspace_invitations for delete to authenticated
  using (workspace_id in (select private.admin_workspaces()));

create policy "teams read" on public.teams for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "teams admin write" on public.teams for all to authenticated
  using (workspace_id in (select private.admin_workspaces()))
  with check (workspace_id in (select private.admin_workspaces()));

create policy "team members read" on public.team_members for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "team members admin write" on public.team_members for all to authenticated
  using (workspace_id in (select private.admin_workspaces()))
  with check (workspace_id in (select private.admin_workspaces()));

create policy "modules read" on public.workspace_modules for select to authenticated
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid())));
create policy "modules admin write" on public.workspace_modules for all to authenticated
  using (workspace_id in (select private.admin_workspaces()))
  with check (workspace_id in (select private.admin_workspaces()));

create policy "prefs own" on public.user_workspace_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and workspace_id in (select workspace_id from public.workspace_members where user_id = (select auth.uid()))
  );
