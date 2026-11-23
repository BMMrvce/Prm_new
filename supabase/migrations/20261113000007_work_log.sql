-- Work log: what you did, day by day. Private to its author, like the other personal
-- modules; optional links to a project or task in the same workspace.

create table public.work_log_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  log_date date not null,
  body text not null check (char_length(body) between 1 and 4000),
  minutes integer check (minutes is null or minutes between 0 and 1440),
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_log_entries_day_idx on public.work_log_entries(workspace_id, user_id, log_date desc);

create trigger work_log_entries_updated_at before update on public.work_log_entries
for each row execute function private.touch_updated_at();

alter table public.work_log_entries enable row level security;

create policy "own rows" on public.work_log_entries for all to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
  with check (
    user_id = (select auth.uid())
    and workspace_id in (select private.member_workspaces())
    and (project_id is null or project_id in (select private.visible_projects()))
  );

-- "Also on this day" reads your own activity by date.
create index if not exists activity_actor_idx on public.activity_events(workspace_id, actor_id, created_at desc);

-- Switch the new module on in workspaces that use Tasks, after their existing modules.
-- (Anyone can switch it off again under Settings → Modules.)
insert into public.workspace_modules (workspace_id, module_id, enabled, position)
select m.workspace_id, 'worklog', true, coalesce(max(m.position), 0) + 1
from public.workspace_modules m
where exists (select 1 from public.workspace_modules t where t.workspace_id = m.workspace_id and t.module_id = 'tasks' and t.enabled)
group by m.workspace_id
on conflict (workspace_id, module_id) do nothing;
