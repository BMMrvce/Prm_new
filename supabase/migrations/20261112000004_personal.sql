-- ════════════════════════════════════════════════════════════════════════════════════
-- 4 · Money and personal growth. Each is an optional module; categories come from
--     public.categories, so every list is the user's own.
-- ════════════════════════════════════════════════════════════════════════════════════

-- ── Money ───────────────────────────────────────────────────────────────────────────
-- kind: expense / income / transfer are personal records; reimbursement is a claim that
-- workspace admins review (pending → approved / rejected → paid).
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income', 'transfer', 'reimbursement')),
  category_id uuid references public.categories(id) on delete set null,
  description text not null check (char_length(trim(description)) between 1 and 240),
  amount numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null default current_date,
  status text not null default 'recorded' check (status in ('recorded', 'pending', 'approved', 'rejected', 'paid')),
  payment_method text check (payment_method is null or char_length(payment_method) <= 40),
  note text check (note is null or char_length(note) <= 1000),
  -- attachments bucket path of the receipt, if any.
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 500),
  project_id uuid references public.projects(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_have_review_status check (kind = 'reimbursement' or status = 'recorded')
);

create index transactions_user_idx on public.transactions(workspace_id, user_id, occurred_on desc);
create index transactions_claims_idx on public.transactions(workspace_id, status) where kind = 'reimbursement';

create trigger transactions_updated_at before update on public.transactions
for each row execute function private.touch_updated_at();

-- Owners edit their own records. Claims are editable while pending or rejected (editing a
-- rejected claim resubmits it); the status only changes through review_claim().
create or replace function private.guard_transaction()
returns trigger
language plpgsql
-- Runs as the caller: current_user tells browser requests apart from internal ones.
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := case when new.kind = 'reimbursement' then 'pending' else 'recorded' end;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  -- review_claim() runs as the function owner and may change the status.
  if current_user <> 'authenticated' then return new; end if;

  new.workspace_id := old.workspace_id;
  new.user_id := old.user_id;
  new.kind := old.kind;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.status := old.status;
  if old.kind = 'reimbursement' then
    if old.status not in ('pending', 'rejected') then
      raise exception 'Reviewed claims can no longer be edited' using errcode = '42501';
    end if;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

create trigger transactions_guard before insert or update on public.transactions
for each row execute function private.guard_transaction();

-- Reviewing goes through this function so admins cannot alter anything but the status.
create or replace function public.review_claim(claim_id uuid, new_status text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  claim public.transactions;
begin
  select * into claim from public.transactions where id = claim_id and kind = 'reimbursement' for update;
  if claim.id is null or claim.workspace_id not in (select private.admin_workspaces()) then
    raise exception 'Claim not found' using errcode = '42501';
  end if;
  if claim.user_id = auth.uid() then
    raise exception 'You cannot review your own claim' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'approved', 'rejected', 'paid') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.transactions
  set status = new_status, reviewed_by = auth.uid(), reviewed_at = now()
  where id = claim_id;
end;
$$;

revoke all on function public.review_claim(uuid, text) from public, anon;
grant execute on function public.review_claim(uuid, text) to authenticated;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  monthly_limit numeric(14, 2) check (monthly_limit is null or monthly_limit >= 0),
  -- { "<category_id>": limit }
  category_limits jsonb not null default '{}'::jsonb check (jsonb_typeof(category_limits) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create trigger budgets_updated_at before update on public.budgets
for each row execute function private.touch_updated_at();

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date date,
  color text not null default 'green' check (color ~ '^[a-z-]{2,20}$'),
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_idx on public.savings_goals(workspace_id, user_id);

create trigger savings_goals_updated_at before update on public.savings_goals
for each row execute function private.touch_updated_at();

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  direction text not null check (direction in ('contribution', 'withdrawal')),
  occurred_on date not null default current_date,
  note text check (note is null or char_length(note) <= 240),
  created_at timestamptz not null default now()
);

create index savings_contributions_goal_idx on public.savings_contributions(goal_id, occurred_on desc);

create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('expense', 'income')),
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_payments_user_idx on public.recurring_payments(workspace_id, user_id, active, next_due_date);

create trigger recurring_payments_updated_at before update on public.recurring_payments
for each row execute function private.touch_updated_at();

-- ── Growth: habits, reading, focus, learning, goals ─────────────────────────────────
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category_id uuid references public.categories(id) on delete set null,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'weekdays')),
  -- frequency = 'weekdays': 0 = Sunday … 6 = Saturday.
  weekdays smallint[] check (weekdays is null or weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  -- frequency = 'weekly': times per week.
  target_per_week smallint check (target_per_week is null or target_per_week between 1 and 7),
  target_kind text not null default 'boolean' check (target_kind in ('boolean', 'duration', 'quantity')),
  target_value numeric check (target_value is null or target_value > 0),
  target_unit text check (target_unit is null or char_length(target_unit) <= 30),
  color text not null default 'blue' check (color ~ '^[a-z-]{2,20}$'),
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index habits_user_idx on public.habits(workspace_id, user_id, archived_at);

create trigger habits_updated_at before update on public.habits
for each row execute function private.touch_updated_at();

-- One row per habit per day; no row means "not done" (history is never fabricated).
create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  entry_date date not null,
  status text not null check (status in ('completed', 'skipped')),
  quantity_value numeric check (quantity_value is null or quantity_value >= 0),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, entry_date)
);

create index habit_entries_lookup_idx on public.habit_entries(workspace_id, user_id, entry_date);

create trigger habit_entries_updated_at before update on public.habit_entries
for each row execute function private.touch_updated_at();

create table public.books (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  author text not null default '' check (char_length(author) <= 200),
  status text not null default 'planned' check (status in ('planned', 'reading', 'completed')),
  category_id uuid references public.categories(id) on delete set null,
  total_pages integer check (total_pages is null or total_pages > 0),
  cover_url text check (cover_url is null or (char_length(cover_url) <= 1000 and cover_url ~* '^https://')),
  rating smallint check (rating is null or rating between 1 and 5),
  learned text check (learned is null or char_length(learned) <= 4000),
  interesting text check (interesting is null or char_length(interesting) <= 4000),
  apply text check (apply is null or char_length(apply) <= 4000),
  action text check (action is null or char_length(action) <= 4000),
  pages_per_day_goal numeric check (pages_per_day_goal is null or pages_per_day_goal > 0),
  started_at date,
  completed_at date,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index books_user_idx on public.books(workspace_id, user_id, status);

create trigger books_updated_at before update on public.books
for each row execute function private.touch_updated_at();

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  session_date date not null,
  pages_read integer check (pages_read is null or pages_read >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  chapter text check (chapter is null or char_length(chapter) <= 120),
  takeaway text check (takeaway is null or char_length(takeaway) <= 4000),
  created_at timestamptz not null default now()
);

create index reading_sessions_lookup_idx on public.reading_sessions(workspace_id, user_id, session_date);
create index reading_sessions_book_idx on public.reading_sessions(book_id);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  distraction_count integer not null default 0 check (distraction_count >= 0),
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  concentration_rating smallint not null check (concentration_rating between 1 and 5),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index focus_sessions_lookup_idx on public.focus_sessions(workspace_id, user_id, session_date);

create table public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'learning', 'practised', 'mastered')),
  resources text check (resources is null or char_length(resources) <= 4000),
  notes text check (notes is null or char_length(notes) <= 4000),
  position double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_topics_user_idx on public.learning_topics(workspace_id, user_id, archived_at);

create trigger learning_topics_updated_at before update on public.learning_topics
for each row execute function private.touch_updated_at();

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  target_date date,
  notes text check (notes is null or char_length(notes) <= 4000),
  position double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_idx on public.goals(workspace_id, user_id, status);

create trigger goals_updated_at before update on public.goals
for each row execute function private.touch_updated_at();

create table public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  target_date date,
  completed_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index goal_milestones_goal_idx on public.goal_milestones(goal_id, position);

-- ════════════════════════════════════════════════════════════════════════════════════
-- Row level security: all of these are yours alone, except reimbursement claims, which
-- the workspace's admins can read (and review through review_claim()).
-- ════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    'budgets', 'savings_goals', 'savings_contributions', 'recurring_payments',
    'habits', 'habit_entries', 'books', 'reading_sessions', 'focus_sessions',
    'learning_topics', 'goals', 'goal_milestones'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
         with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))',
      t
    );
  end loop;
end;
$$;

alter table public.transactions enable row level security;

create policy "transactions read" on public.transactions for select to authenticated
  using (
    workspace_id in (select private.member_workspaces())
    and (user_id = (select auth.uid())
         or (kind = 'reimbursement' and workspace_id in (select private.admin_workspaces())))
  );
create policy "transactions create" on public.transactions for insert to authenticated
  with check (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()));
create policy "transactions update own" on public.transactions for update to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select private.member_workspaces()))
  with check (user_id = (select auth.uid()));
create policy "transactions delete own" on public.transactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (kind <> 'reimbursement' or status in ('pending', 'rejected'))
  );
