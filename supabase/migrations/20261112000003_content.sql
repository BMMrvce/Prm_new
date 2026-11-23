-- ════════════════════════════════════════════════════════════════════════════════════
-- 3 · Content: user-defined categories, notes (with collaborators and protection),
--     whiteboards, dashboards and file attachments.
-- ════════════════════════════════════════════════════════════════════════════════════

-- One table for every user-defined list of categories, so nothing is hardcoded:
-- meeting types, expense/income categories, habit, learning, goal and book categories.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null check (scope in ('meeting', 'expense', 'income', 'habit', 'learning', 'goal', 'book', 'note')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default 'slate' check (color ~ '^[a-z-]{2,20}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, scope, name)
);

create index categories_lookup_idx on public.categories(workspace_id, scope, position);

alter table public.meetings
  add constraint meetings_category_fk foreign key (category_id) references public.categories(id) on delete set null;

-- ── Notes ───────────────────────────────────────────────────────────────────────────
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  meeting_id uuid references public.meetings(id) on delete set null,
  parent_id uuid references public.notes(id) on delete set null,
  title text not null default '' check (char_length(title) <= 300),
  -- Sanitized HTML from the Notes editor.
  content text not null default '' check (octet_length(content) <= 1000000),
  pinned boolean not null default false,
  -- Protected notes are hidden by RLS unless this browser session is unlocked.
  protected boolean not null default false,
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', left(regexp_replace(coalesce(content, ''), '<[^>]*>', ' ', 'g'), 50000)), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notes_one_per_meeting on public.notes(user_id, meeting_id) where meeting_id is not null;
create index notes_workspace_recent_idx on public.notes(workspace_id, updated_at desc);
create index notes_user_idx on public.notes(user_id, workspace_id);
create index notes_project_idx on public.notes(project_id) where project_id is not null;
create index notes_search_idx on public.notes using gin(search);

create trigger notes_updated_at before update on public.notes
for each row execute function private.touch_updated_at();

create table public.note_members (
  note_id uuid not null references public.notes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create index note_members_user_idx on public.note_members(user_id);

-- Notes shared with the current user.
create or replace function private.shared_notes()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select nm.note_id from public.note_members nm
  where nm.user_id = (select auth.uid())
    and nm.workspace_id in (select private.member_workspaces());
$$;

create or replace function private.owned_notes()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select n.id from public.notes n where n.user_id = (select auth.uid());
$$;

grant execute on function private.shared_notes() to authenticated, service_role;
grant execute on function private.owned_notes() to authenticated, service_role;

create or replace function private.validate_note_member()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  note public.notes;
begin
  select * into note from public.notes where id = new.note_id;
  if note.protected then
    raise exception 'Protected notes cannot be shared' using errcode = '23514';
  end if;
  new.workspace_id := note.workspace_id;
  if new.user_id = note.user_id then
    raise exception 'The owner is already on the note' using errcode = '23514';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = note.workspace_id and user_id = new.user_id) then
    raise exception 'Notes can only be shared with workspace members' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger note_members_validate before insert on public.note_members
for each row execute function private.validate_note_member();

-- Collaborators edit text, title and pin; only the owner moves, protects or re-files it.
create or replace function private.guard_note_update()
returns trigger
language plpgsql
-- Runs as the caller: current_user tells browser requests apart from internal ones.
set search_path = ''
as $$
begin
  new.workspace_id := old.workspace_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  if old.user_id <> (select auth.uid()) and current_user = 'authenticated' then
    new.protected := old.protected;
    new.project_id := old.project_id;
    new.meeting_id := old.meeting_id;
    new.parent_id := old.parent_id;
  end if;
  if new.protected and not old.protected then
    if exists (select 1 from public.note_members where note_id = new.id) then
      raise exception 'Stop sharing the note before protecting it' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger notes_guard before update on public.notes
for each row execute function private.guard_note_update();

-- ── Whiteboards ─────────────────────────────────────────────────────────────────────
create table public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled board' check (char_length(trim(title)) between 1 and 200),
  -- Excalidraw scene: { elements, appState (subset) }. Images live in Storage.
  scene jsonb not null default '{"elements": []}'::jsonb check (jsonb_typeof(scene) = 'object' and octet_length(scene::text) <= 8000000),
  -- Bumped on every save so concurrent saves can be detected (optimistic concurrency).
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whiteboards_workspace_idx on public.whiteboards(workspace_id, updated_at desc);
create index whiteboards_project_idx on public.whiteboards(project_id) where project_id is not null;

create or replace function private.prepare_whiteboard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.scene is distinct from old.scene then new.version := old.version + 1; end if;
  end if;
  return new;
end;
$$;

create trigger whiteboards_prepare before insert or update on public.whiteboards
for each row execute function private.prepare_whiteboard();

-- ── Dashboards (one layout per person per workspace; null workspace = "All") ─────────
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  -- { version, widgets: [{ id, type, x, y, w, h, config }] }
  layout jsonb not null default '{"widgets": []}'::jsonb check (jsonb_typeof(layout) = 'object' and octet_length(layout::text) <= 200000),
  updated_at timestamptz not null default now()
);

create unique index dashboards_one_per_scope on public.dashboards(user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger dashboards_updated_at before update on public.dashboards
for each row execute function private.touch_updated_at();

-- ── Attachments (files on tasks, notes, receipts) ───────────────────────────────────
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  -- Path inside the private `attachments` bucket: <workspace_id>/<random>/<file name>.
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  size_bytes bigint not null check (size_bytes between 0 and 52428800),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index attachments_task_idx on public.attachments(task_id) where task_id is not null;
create index attachments_note_idx on public.attachments(note_id) where note_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════
-- Row level security
-- ════════════════════════════════════════════════════════════════════════════════════
alter table public.categories enable row level security;
alter table public.notes enable row level security;
alter table public.note_members enable row level security;
alter table public.whiteboards enable row level security;
alter table public.dashboards enable row level security;
alter table public.attachments enable row level security;

create policy "categories read" on public.categories for select to authenticated
  using (workspace_id in (select private.member_workspaces()));
create policy "categories write" on public.categories for all to authenticated
  using (workspace_id in (select private.writable_workspaces()))
  with check (workspace_id in (select private.writable_workspaces()));

-- Notes: private to the owner unless shared; protected ones need an unlocked session.
create policy "notes read" on public.notes for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (user_id = (select auth.uid()) or id in (select private.shared_notes()))
    and (not protected or (select private.vault_unlocked()))
  );
create policy "notes create" on public.notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and workspace_id in (select private.member_workspaces())
    and (not protected or (select private.vault_unlocked()))
  );
create policy "notes edit" on public.notes for update to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (user_id = (select auth.uid()) or id in (select private.shared_notes()))
    and (not protected or (select private.vault_unlocked()))
  )
  with check (not protected or (select private.vault_unlocked()));
create policy "notes delete" on public.notes for delete to authenticated
  using (user_id = (select auth.uid()) and (not protected or (select private.vault_unlocked())));

create policy "note members read" on public.note_members for select to authenticated
  using (note_id in (select private.owned_notes()) or note_id in (select private.shared_notes()));
create policy "note members owner add" on public.note_members for insert to authenticated
  with check (note_id in (select private.owned_notes()));
create policy "note members remove" on public.note_members for delete to authenticated
  using (note_id in (select private.owned_notes()) or user_id = (select auth.uid()));

-- Whiteboards follow project visibility when filed under a project.
create policy "whiteboards read" on public.whiteboards for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (project_id is null or project_id in (select private.visible_projects()))
  );
create policy "whiteboards create" on public.whiteboards for insert to authenticated
  with check (created_by = (select auth.uid()) and workspace_id in (select private.writable_workspaces()));
create policy "whiteboards update" on public.whiteboards for update to authenticated
  using (
    workspace_id in (select private.writable_workspaces())
    and (project_id is null or project_id in (select private.visible_projects()))
  )
  with check (workspace_id in (select private.writable_workspaces()));
create policy "whiteboards delete" on public.whiteboards for delete to authenticated
  using (created_by = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

create policy "dashboards own" on public.dashboards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select private.member_workspaces()))
  );

create policy "attachments read" on public.attachments for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (task_id is null or task_id in (select t.id from public.tasks t))
    and (note_id is null or note_id in (select n.id from public.notes n))
  );
create policy "attachments create" on public.attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
create policy "attachments delete" on public.attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) or workspace_id in (select private.admin_workspaces()));

-- ── Storage buckets ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('attachments', 'attachments', false, 52428800),
  ('whiteboards', 'whiteboards', false, 10485760),
  ('avatars', 'avatars', false, 2097152)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- attachments/<workspace_id>/… and whiteboards/<workspace_id>/<board_id>/…
create policy "workspace files read" on storage.objects for select to authenticated
  using (
    bucket_id in ('attachments', 'whiteboards')
    and private.try_uuid((storage.foldername(name))[1]) in (select private.member_workspaces())
  );
create policy "workspace files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('attachments', 'whiteboards')
    and private.try_uuid((storage.foldername(name))[1]) in (select private.member_workspaces())
  );
create policy "workspace files delete" on storage.objects for delete to authenticated
  using (
    bucket_id in ('attachments', 'whiteboards')
    and (owner_id = (select auth.uid())::text
         or private.try_uuid((storage.foldername(name))[1]) in (select private.admin_workspaces()))
  );

-- avatars/<user_id>/…: you write your own; co-members can read.
create policy "avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and private.try_uuid((storage.foldername(name))[1]) in (select private.co_member_ids()));
create policy "avatars write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
