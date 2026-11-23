'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'
import { manualTimes, moveToDay, type TimerState } from './logic'

export type TimeEntry = {
  id: string
  workspaceId: string
  taskId: string | null
  projectId: string | null
  userId: string
  state: TimerState
  description: string | null
  startedAt: string
  pausedAt: string | null
  endedAt: string | null
  accumulatedSeconds: number
  task: { title: string; number: number; estimateMinutes: number | null } | null
  project: { name: string; color: string } | null
}

/** The running or paused timer, with where it lives (for links from the header). */
export type ActiveTimer = TimeEntry & { workspace: { slug: string; name: string } | null }

type EntryRow = {
  id: string
  workspace_id: string
  task_id: string | null
  project_id: string | null
  user_id: string
  state: TimerState
  description: string | null
  started_at: string
  paused_at: string | null
  ended_at: string | null
  accumulated_seconds: number
  task: { title: string; task_number: number; estimate_minutes: number | null } | null
  project: { name: string; color: string } | null
  workspace?: { slug: string; name: string } | null
}

export const ENTRY_COLUMNS =
  'id, workspace_id, task_id, project_id, user_id, state, description, started_at, paused_at, ended_at, accumulated_seconds, task:tasks(title, task_number, estimate_minutes), project:projects(name, color)'

export function toEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    projectId: row.project_id,
    userId: row.user_id,
    state: row.state,
    description: row.description,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    endedAt: row.ended_at,
    accumulatedSeconds: row.accumulated_seconds,
    task: row.task ? { title: row.task.title, number: row.task.task_number, estimateMinutes: row.task.estimate_minutes } : null,
    project: row.project,
  }
}

/** Every key starts with 'time', so realtime changes to time_entries refresh them all. */
export const timeKeys = {
  active: (userId: string) => ['time', 'active', userId] as const,
  entries: (scope: string, who: string, start: Date, end: Date) => ['time', 'entries', scope, who, start.toISOString(), end.toISOString()] as const,
  task: (taskId: string) => ['time', 'task', taskId] as const,
  totals: (taskIds: string[]) => ['time', 'task-totals', ...taskIds] as const,
}

/** The user's active (running or paused) timer in any workspace; at most one exists. */
export async function fetchActiveTimer(userId: string): Promise<ActiveTimer | null> {
  const row = maybe(
    await supabase()
      .from('time_entries')
      .select(`${ENTRY_COLUMNS}, workspace:workspaces(slug, name)`)
      .eq('user_id', userId)
      .in('state', ['running', 'paused'])
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle<EntryRow>(),
  )
  return row ? { ...toEntry(row), workspace: row.workspace ?? null } : null
}

export function useActiveTimer() {
  const user = useUser()
  return useQuery({
    queryKey: timeKeys.active(user.id),
    queryFn: () => fetchActiveTimer(user.id),
    staleTime: 30_000,
  })
}

/**
 * Time entries that started in [start, end): the user's own (`who` = 'me') or everyone's
 * the user may see ('everyone': admins see the workspace's, RLS decides). `scope` is a
 * workspace id or 'all'.
 */
export function useTimeEntries(scope: string | 'all' | undefined, who: 'me' | 'everyone', start: Date, end: Date) {
  const user = useUser()
  return useQuery({
    queryKey: timeKeys.entries(scope ?? 'none', who === 'me' ? user.id : 'everyone', start, end),
    enabled: Boolean(scope),
    placeholderData: (previous) => previous,
    queryFn: async () => {
      let query = supabase().from('time_entries').select(ENTRY_COLUMNS).gte('started_at', start.toISOString()).lt('started_at', end.toISOString())
      if (scope !== 'all') query = query.eq('workspace_id', scope!)
      if (who === 'me') query = query.eq('user_id', user.id)
      return must(await query.order('started_at', { ascending: false }).limit(5000).returns<EntryRow[]>()).map(toEntry)
    },
  })
}

/** Every visible entry on one task (for its logged total). */
export function useTaskEntries(taskId: string | undefined) {
  return useQuery({
    queryKey: timeKeys.task(taskId ?? 'none'),
    enabled: Boolean(taskId),
    queryFn: async () =>
      must(await supabase().from('time_entries').select(ENTRY_COLUMNS).eq('task_id', taskId!).order('started_at', { ascending: false }).limit(2000).returns<EntryRow[]>()).map(
        toEntry,
      ),
  })
}

/** All-time entries of several tasks, for estimate-vs-actual (uses the task_id index). */
export function useTaskTotals(taskIds: string[]) {
  return useQuery({
    queryKey: timeKeys.totals(taskIds),
    enabled: taskIds.length > 0,
    placeholderData: (previous) => previous,
    queryFn: async () =>
      must(
        await supabase()
          .from('time_entries')
          .select('task_id, state, started_at, ended_at, accumulated_seconds')
          .in('task_id', taskIds)
          .limit(10000)
          .returns<Pick<EntryRow, 'task_id' | 'state' | 'started_at' | 'ended_at' | 'accumulated_seconds'>[]>(),
      ).map((row) => ({ taskId: row.task_id!, state: row.state, startedAt: row.started_at, endedAt: row.ended_at, accumulatedSeconds: row.accumulated_seconds })),
  })
}

// ── Manual logs and edits ───────────────────────────────────────────────────────────

export type ManualLog = { workspaceId: string; taskId: string | null; date: string; minutes: number; description: string }

export function useLogTime() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ManualLog) => {
      const { startedAt, endedAt } = manualTimes(input.date, input.minutes, new Date())
      must(
        await supabase()
          .from('time_entries')
          .insert({
            // The database copies the workspace and project from the task when there is one.
            workspace_id: input.workspaceId,
            task_id: input.taskId,
            user_id: user.id,
            state: 'stopped',
            started_at: startedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            accumulated_seconds: Math.round(input.minutes * 60),
            description: input.description.trim() || null,
          }),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['time'] }),
  })
}

export function useUpdateEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ entry, changes }: { entry: TimeEntry; changes: { taskId: string | null; date: string; minutes: number; description: string } }) => {
      const row: Record<string, unknown> = { task_id: changes.taskId, description: changes.description.trim() || null }
      // Only finished entries can move or change length; a live timer keeps its clock.
      if (entry.state === 'stopped') {
        const startedAt = moveToDay(entry.startedAt, changes.date)
        row.started_at = startedAt.toISOString()
        row.accumulated_seconds = Math.round(changes.minutes * 60)
        row.ended_at = new Date(startedAt.getTime() + changes.minutes * 60_000).toISOString()
      }
      must(await supabase().from('time_entries').update(row).eq('id', entry.id))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['time'] }),
  })
}

export function useDeleteEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('time_entries').delete().eq('id', id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['time'] }),
  })
}
