-- ════════════════════════════════════════════════════════════════════════════════════
-- 6 · Fixes found after review: receipt privacy, recurring-payment anchor day,
--     indexes for the reminder job, and live updates for money.
-- ════════════════════════════════════════════════════════════════════════════════════

-- Receipts (attachments/<workspace>/receipts/…) are private: only the person who uploaded
-- them and the workspace's admins (who review claims) may read them. Other workspace
-- files keep the member-wide rule.
drop policy if exists "workspace files read" on storage.objects;
create policy "workspace files read" on storage.objects for select to authenticated
  using (
    bucket_id in ('attachments', 'whiteboards')
    and private.try_uuid((storage.foldername(name))[1]) in (select private.member_workspaces())
    and (
      bucket_id <> 'attachments'
      or coalesce((storage.foldername(name))[2], '') <> 'receipts'
      or owner_id = (select auth.uid())::text
      or private.try_uuid((storage.foldername(name))[1]) in (select private.admin_workspaces())
    )
  );

-- The day of month a recurring payment belongs to, so 31 Jan → 28 Feb → 31 Mar.
alter table public.recurring_payments
  add column if not exists anchor_day smallint check (anchor_day is null or anchor_day between 1 and 31);

-- The reminder job scans across all workspaces by time.
create index if not exists meetings_starts_at_idx on public.meetings(starts_at);
create index if not exists tasks_open_due_idx on public.tasks(due_at) where completed_at is null and due_at is not null;

-- New claims and reviews appear live (RLS still decides who receives each change).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end;
$$;
