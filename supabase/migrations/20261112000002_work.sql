-- ════════════════════════════════════════════════════════════════════════════════════
-- 2 · Work: projects, statuses, tasks (Kanban, subtasks, recurrence, dependencies),
--     labels, comments, activity, time tracking, meetings, plan and day notes.
-- ════════════════════════════════════════════════════════════════════════════════════

create type public.project_status as enum ('planned', 'active', 'paused', 'completed', 'archived');
create type public.project_visibility as enum ('workspace', 'team', 'private');
create type public.task_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
create type public.status_category as enum ('backlog', 'todo', 'in_progress', 'done', 'cancelled');
create type public.timer_state as enum ('running', 'paused', 'stopped');

-- ── Projects ────────────────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 2000),
  color text not null default 'indigo' check (color ~ '^[a-z-]{2,20}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  status public.project_status not null default 'active',
  visibility public.project_visibility not null default 'workspace',
  lead_id uuid references public.profiles(id) on delete set null,
  start_date date,
  target_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug),
  constraint valid_project_dates check (target_date is null or start_date is null or target_date >= start_date),
  constraint team_visibility_needs_team check (visibility <> 'team' or team_id is not null)
);

create index projects_team_idx on public.projects(team_id) where team_id is not null;

create trigger projects_updated_at before update on public.projects
for each row execute function private.touch_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_idx on public.project_members(user_id);

-- Projects the current user can see:
--   owners/admins: all · members: workspace-wide, their team's, and ones they're on ·
--   guests: only ones they are on.
create or replace function private.visible_projects()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select p.id
  from public.projects p
  join public.workspace_members m on m.workspace_id = p.workspace_id and m.user_id = (select auth.uid())
  where p.workspace_id in (select private.member_workspaces())
    and (
      m.role in ('owner', 'admin')
      or (m.role = 'member' and p.visibility = 'workspace')
      or (m.role = 'member' and p.visibility = 'team' and p.team_id in (select private.my_teams()))
      or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = m.user_id)
    );
$$;

grant execute on function private.visible_projects() to authenticated, service_role;

-- Workspaces where the current user is a full member (not a guest), archived or not.
create or replace function private.nonguest_workspaces()
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
    and (not w.protected or (select private.vault_unlocked()));
$$;

-- Projects the current user was added to.
create or replace function private.my_projects()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select pm.project_id from public.project_members pm
  where pm.user_id = (select auth.uid())
    and pm.workspace_id in (select private.member_workspaces());
$$;

grant execute on function private.nonguest_workspaces() to authenticated, service_role;
grant execute on function private.my_projects() to authenticated, service_role;

create or replace function private.validate_project_member()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select workspace_id into new.workspace_id from public.projects where id = new.project_id;
  if not exists (select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.user_id) then
    raise exception 'Add people to the workspace before adding them to a project' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger project_members_validate before insert or update on public.project_members
for each row execute function private.validate_project_member();

-- ── Statuses (Kanban columns), workspace-wide ───────────────────────────────────────
create table public.task_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  category public.status_category not null,
  color text not null default 'slate' check (color ~ '^[a-z-]{2,20}$'),
  position numeric(20, 10) not null default 1000,
  created_at timestamptz not null default now()
);

create index task_statuses_workspace_idx on public.task_statuses(workspace_id, position);

-- ── Labels ──────────────────────────────────────────────────────────────────────────
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default 'slate' check (color ~ '^[a-z-]{2,20}$'),
  unique (workspace_id, name)
);

-- ── Tasks ───────────────────────────────────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  status_id uuid references public.task_statuses(id) on delete set null,
  -- Denormalized from the status so boards across workspaces can group and filter fast.
  status_category public.status_category not null default 'todo',
  parent_id uuid references public.tasks(id) on delete cascade,
  task_number bigint not null,
  title text not null check (char_length(trim(title)) between 1 and 300),
  -- Sanitized HTML from the editor.
  description text not null default '' check (octet_length(description) <= 200000),
  priority public.task_priority not null default 'none',
  creator_id uuid not null references public.profiles(id),
  start_at timestamptz,
  due_at timestamptz,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes between 0 and 100000),
  -- Order inside a column / list (fractional, so one drag updates one row).
  position double precision not null default 0,
  -- { "freq": "daily" | "weekly" | "monthly" | "yearly", "interval": 1 }
  recurrence jsonb check (
    recurrence is null or (
      recurrence ->> 'freq' in ('daily', 'weekly', 'monthly', 'yearly')
      and coalesce((recurrence ->> 'interval')::int, 1) between 1 and 365
    )
  ),
  recurred_at timestamptz,
  completed_at timestamptz,
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', left(regexp_replace(coalesce(description, ''), '<[^>]*>', ' ', 'g'), 20000)), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, task_number),
  constraint valid_task_dates check (due_at is null or start_at is null or due_at >= start_at),
  constraint not_own_parent check (parent_id is null or parent_id <> id)
);

create index tasks_workspace_board_idx on public.tasks(workspace_id, status_category, position);
create index tasks_project_idx on public.tasks(project_id, status_category) where project_id is not null;
create index tasks_status_idx on public.tasks(status_id);
create index tasks_parent_idx on public.tasks(parent_id) where parent_id is not null;
create index tasks_due_idx on public.tasks(workspace_id, due_at) where completed_at is null and due_at is not null;
create index tasks_creator_idx on public.tasks(creator_id);
create index tasks_search_idx on public.tasks using gin(search);

create trigger tasks_updated_at before update on public.tasks
for each row execute function private.touch_updated_at();

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_idx on public.task_assignees(user_id, workspace_id);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (task_id, label_id)
);

create index task_labels_label_idx on public.task_labels(label_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_id uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create index task_dependencies_reverse_idx on public.task_dependencies(depends_on_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index comments_task_idx on public.comments(task_id, created_at);

-- Tasks assigned to the current user (in workspaces they can currently read).
create or replace function private.my_assigned_tasks()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select a.task_id from public.task_assignees a
  where a.user_id = (select auth.uid())
    and a.workspace_id in (select private.member_workspaces());
$$;

grant execute on function private.my_assigned_tasks() to authenticated, service_role;

-- ── Task bookkeeping triggers ───────────────────────────────────────────────────────

-- Number tasks per workspace (ACME-12) and fill defaults.
create or replace function private.prepare_task()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.task_number := old.task_number;
    new.workspace_id := old.workspace_id;
    new.creator_id := old.creator_id;
    new.created_at := old.created_at;
  end if;

  if new.project_id is not null then
    if not exists (select 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id) then
      raise exception 'Project belongs to another workspace' using errcode = '23514';
    end if;
  end if;
  if new.parent_id is not null then
    if not exists (select 1 from public.tasks where id = new.parent_id and workspace_id = new.workspace_id) then
      raise exception 'Parent task belongs to another workspace' using errcode = '23514';
    end if;
  end if;

  if new.status_id is null then
    select id into new.status_id from public.task_statuses
    where workspace_id = new.workspace_id and category = 'todo'
    order by position limit 1;
  elsif not exists (select 1 from public.task_statuses where id = new.status_id and workspace_id = new.workspace_id) then
    raise exception 'Status belongs to another workspace' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    update public.workspaces
    set next_task_number = next_task_number + 1
    where id = new.workspace_id
    returning next_task_number - 1 into new.task_number;
    if new.position = 0 then
      new.position := extract(epoch from clock_timestamp()) * 1000;
    end if;
  end if;

  if new.status_id is not null and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id) then
    select category into new.status_category from public.task_statuses where id = new.status_id;
  end if;

  if new.status_category = 'done' then
    new.completed_at := coalesce(new.completed_at, case when tg_op = 'UPDATE' then old.completed_at end, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_prepare before insert or update on public.tasks
for each row execute function private.prepare_task();

-- When a recurring task is completed, create its next occurrence once.
create or replace function private.spawn_recurring_task()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  step interval;
  n integer := coalesce((new.recurrence ->> 'interval')::int, 1);
  next_id uuid;
begin
  if new.recurrence is null or new.status_category <> 'done' or old.status_category = 'done' or new.recurred_at is not null then
    return null;
  end if;
  step := case new.recurrence ->> 'freq'
    when 'daily' then make_interval(days => n)
    when 'weekly' then make_interval(weeks => n)
    when 'monthly' then make_interval(months => n)
    else make_interval(years => n)
  end;

  insert into public.tasks (workspace_id, project_id, parent_id, title, description, priority, creator_id,
                            start_at, due_at, estimate_minutes, recurrence)
  values (new.workspace_id, new.project_id, new.parent_id, new.title, new.description, new.priority, new.creator_id,
          new.start_at + step, coalesce(new.due_at, now()) + step, new.estimate_minutes, new.recurrence)
  returning id into next_id;

  insert into public.task_assignees (task_id, workspace_id, user_id)
  select next_id, workspace_id, user_id from public.task_assignees where task_id = new.id;
  insert into public.task_labels (task_id, label_id, workspace_id)
  select next_id, label_id, workspace_id from public.task_labels where task_id = new.id;

  update public.tasks set recurred_at = now() where id = new.id;
  return null;
end;
$$;

create trigger tasks_recur after update on public.tasks
for each row execute function private.spawn_recurring_task();

-- Changing a status's category moves its tasks along.
create or replace function private.sync_status_category()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.category is distinct from old.category then
    update public.tasks set status_category = new.category,
      completed_at = case when new.category = 'done' then coalesce(completed_at, now()) else null end
    where status_id = new.id;
  end if;
  return null;
end;
$$;

create trigger task_statuses_sync after update on public.task_statuses
for each row execute function private.sync_status_category();

-- Rows that point at a task carry its workspace (access checks rely on it).
create or replace function private.inherit_task_workspace()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  select workspace_id into new.workspace_id from public.tasks where id = new.task_id;
  if new.workspace_id is null then raise exception 'Task not found' using errcode = '23503'; end if;
  return new;
end;
$$;

create trigger task_assignees_10_workspace before insert on public.task_assignees
for each row execute function private.inherit_task_workspace();
create trigger task_labels_10_workspace before insert on public.task_labels
for each row execute function private.inherit_task_workspace();
create trigger task_dependencies_10_workspace before insert on public.task_dependencies
for each row execute function private.inherit_task_workspace();
create trigger comments_10_workspace before insert on public.comments
for each row execute function private.inherit_task_workspace();

create or replace function private.validate_assignee()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.user_id) then
    raise exception 'Only workspace members can be assigned' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_assignees_20_validate before insert on public.task_assignees
for each row execute function private.validate_assignee();

create or replace function private.validate_task_link()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_table_name = 'task_labels' then
    if not exists (select 1 from public.labels where id = new.label_id and workspace_id = new.workspace_id) then
      raise exception 'Label belongs to another workspace' using errcode = '23514';
    end if;
  elsif tg_table_name = 'task_dependencies' then
    if not exists (select 1 from public.tasks where id = new.depends_on_id and workspace_id = new.workspace_id) then
      raise exception 'Dependencies must be in the same workspace' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger task_labels_20_validate before insert on public.task_labels
for each row execute function private.validate_task_link();
create trigger task_dependencies_20_validate before insert on public.task_dependencies
for each row execute function private.validate_task_link();

-- ── Activity timeline (written only by triggers) ────────────────────────────────────
create table public.activity_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) <= 40),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_workspace_idx on public.activity_events(workspace_id, created_at desc);
create index activity_task_idx on public.activity_events(task_id, created_at desc) where task_id is not null;

create or replace function private.log_task_activity()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
    values (new.workspace_id, new.project_id, new.id, actor, 'task.created', jsonb_build_object('title', new.title));
  else
    if new.status_id is distinct from old.status_id then
      insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
      values (new.workspace_id, new.project_id, new.id, actor, 'task.status',
        jsonb_build_object('from', (select name from public.task_statuses where id = old.status_id),
                           'to', (select name from public.task_statuses where id = new.status_id)));
    end if;
    if new.due_at is distinct from old.due_at then
      insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
      values (new.workspace_id, new.project_id, new.id, actor, 'task.due', jsonb_build_object('to', new.due_at));
    end if;
    if new.priority is distinct from old.priority then
      insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
      values (new.workspace_id, new.project_id, new.id, actor, 'task.priority', jsonb_build_object('to', new.priority));
    end if;
    if new.title is distinct from old.title then
      insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
      values (new.workspace_id, new.project_id, new.id, actor, 'task.renamed', jsonb_build_object('to', new.title));
    end if;
  end if;
  return null;
end;
$$;

create trigger tasks_activity after insert or update on public.tasks
for each row execute function private.log_task_activity();

create or replace function private.log_comment_activity()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.activity_events (workspace_id, project_id, task_id, actor_id, action, data)
  select new.workspace_id, t.project_id, new.task_id, new.author_id, 'comment.created',
         jsonb_build_object('excerpt', left(new.body, 140))
  from public.tasks t where t.id = new.task_id;
  return null;
end;
$$;

create trigger comments_activity after insert on public.comments
for each row execute function private.log_comment_activity();

-- ── Time tracking ───────────────────────────────────────────────────────────────────
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  -- Copied from the task so access checks avoid a join.
  project_id uuid references public.projects(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state public.timer_state not null default 'stopped',
  description text check (description is null or char_length(description) <= 500),
  started_at timestamptz not null,
  paused_at timestamptz,
  ended_at timestamptz,
  accumulated_seconds integer not null default 0 check (accumulated_seconds between 0 and 31622400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_time_entry check (ended_at is null or ended_at >= started_at)
);

create unique index one_active_timer_per_user on public.time_entries(user_id)
  where state in ('running', 'paused') and ended_at is null;
create index time_entries_workspace_idx on public.time_entries(workspace_id, started_at desc);
create index time_entries_user_idx on public.time_entries(user_id, started_at desc);
create index time_entries_task_idx on public.time_entries(task_id) where task_id is not null;
create index time_entries_project_idx on public.time_entries(project_id) where project_id is not null;

create trigger time_entries_updated_at before update on public.time_entries
for each row execute function private.touch_updated_at();

create or replace function private.prepare_time_entry()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.task_id is not null then
    select workspace_id, project_id into new.workspace_id, new.project_id from public.tasks where id = new.task_id;
  else
    new.project_id := null;
  end if;
  return new;
end;
$$;

create trigger time_entries_prepare before insert or update of task_id on public.time_entries
for each row execute function private.prepare_time_entry();

-- ── Meetings ────────────────────────────────────────────────────────────────────────
-- User-defined meeting categories (and any other workspace-wide categories) live in
-- public.categories (20261112000003_content.sql).
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  category_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (location is null or char_length(location) <= 300),
  meeting_url text check (meeting_url is null or (char_length(meeting_url) <= 1000 and meeting_url ~* '^https?://')),
  external_provider text,
  external_id text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_meeting_dates check (ends_at > starts_at)
);

create index meetings_workspace_time_idx on public.meetings(workspace_id, starts_at);
create unique index meetings_external_idx on public.meetings(workspace_id, external_provider, external_id)
  where external_id is not null;

create trigger meetings_updated_at before update on public.meetings
for each row execute function private.touch_updated_at();

-- ── Personal day planning (owner only) ──────────────────────────────────────────────
create table public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note_date date not null,
  content text not null default '' check (octet_length(content) <= 50000),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, note_date)
);

create trigger daily_notes_updated_at before update on public.daily_notes
for each row execute function private.touch_updated_at();

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  title text not null check (char_length(trim(title)) between 1 and 300),
  task_id uuid references public.tasks(id) on delete set null,
  position double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index plan_items_lookup_idx on public.plan_items(user_id, workspace_id, plan_date);

-- ════════════════════════════════════════════════════════════════════════════════════
-- Row level security
-- ════════════════════════════════════════════════════════════════════════════════════
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.task_statuses enable row level security;
alter table public.labels enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.comments enable row level security;
alter table public.activity_events enable row level security;
alter table public.time_entries enable row level security;
alter table public.meetings enable row level security;
alter table public.daily_notes enable row level security;
alter table public.plan_items enable row level security;

-- Projects
-- Same rules as private.visible_projects(), written against the row itself so that
-- `insert … returning` can read back a project created in the same statement.
create policy "projects read" on public.projects for select to authenticated
  using (
    workspace_id in (select private.admin_workspaces())
    or (visibility = 'workspace' and workspace_id in (select private.nonguest_workspaces()))
    or (visibility = 'team' and team_id in (select private.my_teams()) and workspace_id in (select private.nonguest_workspaces()))
    or id in (select private.my_projects())
    or (created_by = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
  );
create policy "projects create" on public.projects for insert to authenticated
  with check (workspace_id in (select private.writable_workspaces()) and created_by = (select auth.uid()));
create policy "projects update" on public.projects for update to authenticated
  using (id in (select private.visible_projects()) and workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));
create policy "projects delete" on public.projects for delete to authenticated
  using (workspace_id in (select private.admin_workspaces()) or created_by = (select auth.uid()));

create policy "project members read" on public.project_members for select to authenticated
  using (project_id in (select private.visible_projects()));
create policy "project members write" on public.project_members for all to authenticated
  using (project_id in (select private.visible_projects()) and workspace_id in (select private.writable_workspaces()))
  with check (project_id in (select private.visible_projects()) and workspace_id in (select private.writable_workspaces()));

-- Statuses and labels
create policy "statuses read" on public.task_statuses for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "statuses admin write" on public.task_statuses for all to authenticated
  using (workspace_id in (select private.admin_workspaces()))
  with check (workspace_id in (select private.admin_workspaces()));

create policy "labels read" on public.labels for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "labels write" on public.labels for all to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));

-- Tasks
-- Visible when: in a visible project, or project-less in a workspace you can write to,
-- or assigned to you. Every branch is a once-per-statement set, so this scales.
create policy "tasks read" on public.tasks for select to authenticated
  using (
    project_id in (select private.visible_projects())
    or (project_id is null and workspace_id in (select private.writable_workspaces()))
    or id in (select private.my_assigned_tasks())
  );
create policy "tasks create" on public.tasks for insert to authenticated
  with check (
    creator_id = (select auth.uid())
    and workspace_id in (select private.writable_workspaces())
    and (project_id is null or project_id in (select private.visible_projects()))
  );
-- Assignees (even guests) can move their own tasks along.
create policy "tasks update" on public.tasks for update to authenticated
  using (
    (workspace_id in (select private.writable_workspaces())
      and (project_id is null or project_id in (select private.visible_projects())))
    or id in (select private.my_assigned_tasks())
  )
  with check (project_id is null or project_id in (select private.visible_projects()));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (workspace_id in (select private.admin_workspaces()) or (creator_id = (select auth.uid()) and workspace_id in (select private.writable_workspaces())));

create policy "assignees read" on public.task_assignees for select to authenticated
  using (workspace_id in (select private.member_workspaces()) and task_id in (select t.id from public.tasks t));
create policy "assignees write" on public.task_assignees for all to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));

create policy "task labels read" on public.task_labels for select to authenticated
  using (workspace_id in (select private.member_workspaces()) and task_id in (select t.id from public.tasks t));
create policy "task labels write" on public.task_labels for all to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));

create policy "dependencies read" on public.task_dependencies for select to authenticated
  using (workspace_id in (select private.member_workspaces()) and task_id in (select t.id from public.tasks t));
create policy "dependencies write" on public.task_dependencies for all to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));

-- Comments: anyone who can see the task may comment (guests included).
create policy "comments read" on public.comments for select to authenticated
  using (workspace_id in (select private.member_workspaces()) and task_id in (select t.id from public.tasks t));
create policy "comments create" on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and workspace_id in (select private.member_workspaces())
    and task_id in (select t.id from public.tasks t)
  );
create policy "comments edit own" on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "comments delete" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

create policy "activity read" on public.activity_events for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (project_id is null or project_id in (select private.visible_projects()))
  );

-- Time: your own entries; admins see the workspace's; everyone on a project sees its time.
create policy "time read" on public.time_entries for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (
      user_id = (select auth.uid())
      or workspace_id in (select private.admin_workspaces())
      or project_id in (select private.visible_projects())
    )
  );
create policy "time create" on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
create policy "time update own" on public.time_entries for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
create policy "time delete" on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

-- Meetings
create policy "meetings read" on public.meetings for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "meetings create" on public.meetings for insert to authenticated
  with check (created_by = (select auth.uid()) and workspace_id in (select private.writable_workspaces()));
create policy "meetings update" on public.meetings for update to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));
create policy "meetings delete" on public.meetings for delete to authenticated
  using (created_by = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

-- Personal planning: only you.
create policy "daily notes own" on public.daily_notes for all to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
  with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
create policy "plan own" on public.plan_items for all to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
  with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
