'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { money } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'

export type WorkLogEntry = {
  id: string
  date: string
  body: string
  minutes: number | null
  projectId: string | null
  taskId: string | null
  createdAt: string
}

export type DayActivity = {
  id: number
  action: string
  taskId: string | null
  taskTitle: string | null
  createdAt: string
}

type EntryRow = {
  id: string
  log_date: string
  body: string
  minutes: number | null
  project_id: string | null
  task_id: string | null
  created_at: string
}

const COLUMNS = 'id, log_date, body, minutes, project_id, task_id, created_at'

const toEntry = (row: EntryRow): WorkLogEntry => ({
  id: row.id,
  date: row.log_date,
  body: row.body,
  minutes: row.minutes,
  projectId: row.project_id,
  taskId: row.task_id,
  createdAt: row.created_at,
})

/** True when the database has no work log table yet (migration 07 not run). */
export function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

export const workLogKeys = {
  all: (workspaceId: string) => ['ws', workspaceId, 'worklog'] as const,
  range: (workspaceId: string, from: string, to: string) =>
    ['ws', workspaceId, 'worklog', from, to] as const,
  activity: (workspaceId: string, day: string) =>
    ['ws', workspaceId, 'worklog-activity', day] as const,
}

/** Your entries between two `YYYY-MM-DD` days (inclusive), oldest day first. */
export function useWorkLog(workspaceId: string, from: string, to: string) {
  const user = useUser()
  return useQuery({
    queryKey: workLogKeys.range(workspaceId, from, to),
    enabled: Boolean(workspaceId),
    retry: (count, error) => !isMissingTable(error) && count < 2,
    queryFn: async () =>
      (
        must(
          await supabase()
            .from('work_log_entries')
            .select(COLUMNS)
            .eq('workspace_id', workspaceId)
            .eq('user_id', user.id)
            .gte('log_date', from)
            .lte('log_date', to)
            .order('log_date')
            .order('created_at'),
        ) as EntryRow[]
      ).map(toEntry),
  })
}

export type TimelineKind = 'task' | 'comment' | 'note' | 'board' | 'meeting' | 'time' | 'money' | 'habit' | 'plan' | 'daynote'

/** One thing you did on a day, gathered automatically from the rest of the app. */
export type TimelineItem = {
  id: string
  kind: TimelineKind
  /** ISO time, or null for things that only have a date (money, habits). */
  at: string | null
  text: string
  detail?: string
  taskId?: string | null
  minutes?: number
}

const ACTION_TEXT: Record<string, string> = {
  'task.created': 'Created task',
  'task.status': 'Moved task',
  'task.due': 'Rescheduled task',
  'task.priority': 'Changed priority of',
  'task.renamed': 'Renamed task',
  'comment.created': 'Commented on',
}

type Rows<T> = { data: T[] | null; error: unknown }
/** A source that fails (module not set up, no access) just contributes nothing. */
const quiet = <T,>(result: Rows<T>) => (result.error ? [] : (result.data ?? []))

/**
 * Your whole day in this workspace, recorded automatically: task changes and comments,
 * notes and boards you created or edited, meetings, tracked time, money, habits,
 * priorities you finished and your day note. Everything is read under RLS, so it only
 * ever contains what you can already see.
 */
export function useDayTimeline(workspaceId: string, day: string) {
  const user = useUser()
  return useQuery({
    queryKey: workLogKeys.activity(workspaceId, day),
    queryFn: async () => {
      const start = new Date(`${day}T00:00:00`)
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      const from = start.toISOString()
      const to = end.toISOString()
      const inDay = (column: string) => `and(${column}.gte.${from},${column}.lt.${to})`
      const db = supabase()

      const [activity, notes, boards, meetings, time, spending, habits, plan, dayNote] = await Promise.all([
        db.from('activity_events').select('id, action, task_id, created_at, tasks(title)').eq('workspace_id', workspaceId).eq('actor_id', user.id).gte('created_at', from).lt('created_at', to).order('created_at').limit(200),
        db.from('notes').select('id, title, created_at, updated_at').eq('workspace_id', workspaceId).eq('user_id', user.id).or(`${inDay('created_at')},${inDay('updated_at')}`).limit(100),
        db.from('whiteboards').select('id, title, created_by, created_at, updated_at').eq('workspace_id', workspaceId).or(`created_by.eq.${user.id},updated_by.eq.${user.id}`).gte('updated_at', from).limit(100),
        db.from('meetings').select('id, title, starts_at, ends_at, all_day').eq('workspace_id', workspaceId).gte('starts_at', from).lt('starts_at', to).limit(100),
        db.from('time_entries').select('id, description, started_at, ended_at, accumulated_seconds, state, task_id, tasks(title)').eq('workspace_id', workspaceId).eq('user_id', user.id).gte('started_at', from).lt('started_at', to).limit(200),
        db.from('transactions').select('id, kind, description, amount, currency, created_at').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('occurred_on', day).limit(100),
        db.from('habit_entries').select('id, status, updated_at, habits(title)').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('entry_date', day).limit(100),
        db.from('plan_items').select('id, title, completed_at').eq('workspace_id', workspaceId).eq('user_id', user.id).gte('completed_at', from).lt('completed_at', to).limit(100),
        db.from('daily_notes').select('id, content, updated_at').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('note_date', day).limit(1),
      ])

      const items: TimelineItem[] = []
      for (const row of quiet(activity as Rows<{ id: number; action: string; task_id: string | null; created_at: string; tasks: { title: string } | null }>))
        items.push({ id: `a${row.id}`, kind: row.action.startsWith('comment') ? 'comment' : 'task', at: row.created_at, text: ACTION_TEXT[row.action] ?? row.action, detail: row.tasks?.title ?? 'a task', taskId: row.task_id })
      for (const row of quiet(notes as Rows<{ id: string; title: string; created_at: string; updated_at: string }>)) {
        const created = row.created_at >= from && row.created_at < to
        items.push({ id: `n${row.id}`, kind: 'note', at: created ? row.created_at : row.updated_at, text: created ? 'Wrote note' : 'Edited note', detail: row.title || 'Untitled' })
      }
      for (const row of quiet(boards as Rows<{ id: string; title: string; created_at: string; updated_at: string }>)) {
        if (!(row.created_at >= from && row.created_at < to) && !(row.updated_at >= from && row.updated_at < to)) continue
        const created = row.created_at >= from && row.created_at < to
        items.push({ id: `b${row.id}`, kind: 'board', at: created ? row.created_at : row.updated_at, text: created ? 'Created whiteboard' : 'Worked on whiteboard', detail: row.title || 'Untitled' })
      }
      for (const row of quiet(meetings as Rows<{ id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean }>))
        items.push({ id: `m${row.id}`, kind: 'meeting', at: row.all_day ? null : row.starts_at, text: 'Meeting', detail: row.title })
      for (const row of quiet(time as Rows<{ id: string; description: string | null; started_at: string; accumulated_seconds: number; task_id: string | null; tasks: { title: string } | null }>))
        items.push({ id: `t${row.id}`, kind: 'time', at: row.started_at, text: 'Tracked time on', detail: row.tasks?.title ?? row.description ?? 'a timer', taskId: row.task_id, minutes: Math.round(Number(row.accumulated_seconds ?? 0) / 60) })
      for (const row of quiet(spending as Rows<{ id: string; kind: string; description: string; amount: number; currency: string; created_at: string }>))
        items.push({ id: `x${row.id}`, kind: 'money', at: null, text: row.kind === 'income' ? 'Income' : row.kind === 'reimbursement' ? 'Claim' : 'Expense', detail: `${row.description} · ${money(Number(row.amount), row.currency)}` })
      for (const row of quiet(habits as Rows<{ id: string; status: string; habits: { title: string } | null }>))
        items.push({ id: `h${row.id}`, kind: 'habit', at: null, text: row.status === 'done' ? 'Habit done' : `Habit ${row.status}`, detail: row.habits?.title ?? 'a habit' })
      for (const row of quiet(plan as Rows<{ id: string; title: string; completed_at: string }>))
        items.push({ id: `p${row.id}`, kind: 'plan', at: row.completed_at, text: 'Finished priority', detail: row.title })
      for (const row of quiet(dayNote as Rows<{ id: string; content: string; updated_at: string }>))
        if (row.content.trim()) items.push({ id: `d${row.id}`, kind: 'daynote', at: row.updated_at, text: 'Day note', detail: row.content.trim().slice(0, 200) })

      // Undated items first ("all day"), then in time order.
      return items.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    },
  })
}

/** Your entries for one project, newest day first. */
export function useProjectWorkLog(workspaceId: string, projectId: string) {
  const user = useUser()
  return useQuery({
    queryKey: [...workLogKeys.all(workspaceId), 'project', projectId],
    retry: (count, error) => !isMissingTable(error) && count < 2,
    queryFn: async () =>
      (
        must(
          await supabase()
            .from('work_log_entries')
            .select(COLUMNS)
            .eq('workspace_id', workspaceId)
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .order('log_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(300),
        ) as EntryRow[]
      ).map(toEntry),
  })
}

export type EntryInput = {
  date: string
  body: string
  minutes: number | null
  projectId: string | null
  taskId?: string | null
}

export function useSaveEntry(workspaceId: string) {
  const queryClient = useQueryClient()
  const user = useUser()
  return useMutation({
    mutationFn: async ({ id, ...input }: EntryInput & { id?: string }) => {
      const row = {
        log_date: input.date,
        body: input.body.trim(),
        minutes: input.minutes,
        project_id: input.projectId,
        task_id: input.taskId ?? null,
      }
      if (id) return must(await supabase().from('work_log_entries').update(row).eq('id', id))
      return must(
        await supabase()
          .from('work_log_entries')
          .insert({ ...row, workspace_id: workspaceId, user_id: user.id }),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: workLogKeys.all(workspaceId) }),
  })
}

export function useDeleteEntry(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      must(await supabase().from('work_log_entries').delete().eq('id', id)),
    onMutate: (id) => {
      queryClient.setQueriesData<WorkLogEntry[]>(
        { queryKey: workLogKeys.all(workspaceId) },
        (list) => list?.filter((entry) => entry.id !== id),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: workLogKeys.all(workspaceId) }),
  })
}
