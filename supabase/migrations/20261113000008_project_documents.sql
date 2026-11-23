-- Project documents: links to the cloud folder and files where a project's documents
-- live (OneDrive, SharePoint, Google Drive, Dropbox or any https link). The files stay
-- in your own storage; the app only keeps the link, title and order.

create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'file' check (kind in ('folder', 'file')),
  title text not null check (char_length(title) between 1 and 200),
  url text not null check (char_length(url) <= 2000 and url ~ '^https://[^\s]+$'),
  note text check (note is null or char_length(note) <= 500),
  position double precision not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_links_project_idx on public.project_links(project_id, kind, position);
create index project_links_workspace_idx on public.project_links(workspace_id);

create trigger project_links_updated_at before update on public.project_links
for each row execute function private.touch_updated_at();

alter table public.project_links enable row level security;

-- Anyone who can see the project sees its documents; members who can write manage them.
create policy "project links read" on public.project_links for select to authenticated
  using (project_id in (select private.visible_projects()));
create policy "project links create" on public.project_links for insert to authenticated
  with check (
    workspace_id in (select private.writable_workspaces())
    and project_id in (select private.visible_projects())
    and exists (select 1 from public.projects p where p.id = project_id and p.workspace_id = project_links.workspace_id)
  );
create policy "project links update" on public.project_links for update to authenticated
  using (workspace_id in (select private.writable_workspaces()) and project_id in (select private.visible_projects()))
  with check (workspace_id in (select private.writable_workspaces()) and project_id in (select private.visible_projects()));
create policy "project links delete" on public.project_links for delete to authenticated
  using (workspace_id in (select private.writable_workspaces()) and project_id in (select private.visible_projects()));

-- Project work log: your entries for one project, newest first.
create index if not exists work_log_entries_project_idx on public.work_log_entries(project_id, log_date desc) where project_id is not null;
