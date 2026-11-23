'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isColorKey } from '@/core/colors'
import { useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import { localDate } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'
import { fetchPaged } from '@/modules/growth/fetch'
import { addDays, ENTRY_WINDOW_DAYS } from '@/modules/growth/logic'
import type { FocusSession, Habit, HabitEntry, HabitEntryStatus } from '@/modules/growth/types'

export const habitKeys = {
  all: (workspaceId: string) => ['ws', workspaceId, 'habits'] as const,
  list: (workspaceId: string) => ['ws', workspaceId, 'habits', 'list'] as const,
  entries: (workspaceId: string) => ['ws', workspaceId, 'habits', 'entries'] as const,
  focus: (workspaceId: string) => ['ws', workspaceId, 'habits', 'focus'] as const,
}

/** How far back focus sessions are loaded. */
const FOCUS_WINDOW_DAYS = 180

const HABIT_COLUMNS =
  'id, workspace_id, title, category_id, frequency, weekdays, target_per_week, target_kind, target_value, target_unit, color, position, archived_at, created_at'
const ENTRY_COLUMNS = 'id, habit_id, entry_date, status, quantity_value, note'
const FOCUS_COLUMNS = 'id, session_date, duration_minutes, distraction_count, tasks_completed, concentration_rating, note, created_at'

type HabitRow = {
  id: string
  workspace_id: string
  title: string
  category_id: string | null
  frequency: Habit['frequency']
  weekdays: number[] | null
  target_per_week: number | null
  target_kind: Habit['targetKind']
  target_value: number | string | null
  target_unit: string | null
  color: string
  position: number
  archived_at: string | null
  created_at: string
}
type EntryRow = { id: string; habit_id: string; entry_date: string; status: HabitEntryStatus; quantity_value: number | string | null; note: string | null }
type FocusRow = {
  id: string
  session_date: string
  duration_minutes: number
  distraction_count: number
  tasks_completed: number
  concentration_rating: number
  note: string | null
  created_at: string
}

const num = (value: number | string | null) => (value === null ? null : Number(value))

function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    categoryId: row.category_id,
    frequency: row.frequency,
    weekdays: row.weekdays ?? [],
    targetPerWeek: row.target_per_week,
    targetKind: row.target_kind,
    targetValue: num(row.target_value),
    targetUnit: row.target_unit,
    color: isColorKey(row.color) ? row.color : 'blue',
    position: Number(row.position),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }
}

const toEntry = (row: EntryRow): HabitEntry => ({
  id: row.id,
  habitId: row.habit_id,
  date: row.entry_date,
  status: row.status,
  quantity: num(row.quantity_value),
  note: row.note,
})

const toFocus = (row: FocusRow): FocusSession => ({
  id: row.id,
  date: row.session_date,
  durationMinutes: row.duration_minutes,
  distractions: row.distraction_count,
  tasksCompleted: row.tasks_completed,
  concentration: row.concentration_rating,
  note: row.note,
  createdAt: row.created_at,
})

/** Your habits in a workspace, archived ones included (they are few). */
export function useHabits(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: habitKeys.list(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('habits')
          .select(HABIT_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .order('position')
          .order('created_at')
          .returns<HabitRow[]>(),
      ).map(toHabit),
  })
}

/** Habit entries for the last 53 weeks: enough for streaks, the week grid and the heatmap. */
export function useHabitEntries(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: habitKeys.entries(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = addDays(localDate(), -ENTRY_WINDOW_DAYS)
      const rows = await fetchPaged<EntryRow>((from, to) =>
        supabase()
          .from('habit_entries')
          .select(ENTRY_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .gte('entry_date', since)
          .order('entry_date')
          .order('id')
          .range(from, to)
          .returns<EntryRow[]>(),
      )
      return rows.map(toEntry)
    },
  })
}

export type HabitInput = Omit<Habit, 'id' | 'workspaceId' | 'position' | 'archivedAt' | 'createdAt'>

function habitRow(input: HabitInput) {
  return {
    title: input.title.trim(),
    category_id: input.categoryId,
    frequency: input.frequency,
    weekdays: input.frequency === 'weekdays' ? [...input.weekdays].sort() : null,
    target_per_week: input.frequency === 'weekly' ? (input.targetPerWeek ?? 1) : null,
    target_kind: input.targetKind,
    target_value: input.targetKind === 'boolean' ? null : input.targetValue,
    target_unit: input.targetKind === 'boolean' ? null : input.targetUnit?.trim() || null,
    color: input.color,
  }
}

export function useSaveHabit(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: HabitInput }) => {
      if (id) return must(await supabase().from('habits').update(habitRow(input)).eq('id', id))
      return must(
        await supabase()
          .from('habits')
          .insert({ ...habitRow(input), workspace_id: workspaceId, user_id: user.id, position: Date.now() / 1000 }),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: habitKeys.list(workspaceId) }),
  })
}

/** Archives or restores a habit, optimistically. */
export function useArchiveHabit(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = habitKeys.list(workspaceId)
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) =>
      must(await supabase().from('habits').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)),
    onMutate: async ({ id, archived }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Habit[]>(key)
      queryClient.setQueryData<Habit[]>(key, (list) => list?.map((habit) => (habit.id === id ? { ...habit, archivedAt: archived ? new Date().toISOString() : null } : habit)))
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteHabit(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('habits').delete().eq('id', id)),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Habit[]>(habitKeys.list(workspaceId), (list) => list?.filter((habit) => habit.id !== id))
      queryClient.setQueryData<HabitEntry[]>(habitKeys.entries(workspaceId), (list) => list?.filter((entry) => entry.habitId !== id))
    },
  })
}

/**
 * Sets (or clears, with `status: null`) one habit's state for one day. The entries cache
 * is patched immediately and the saved row swapped in afterwards, so a check-off never
 * waits on the network or refetches a year of entries.
 */
export function useLogHabit(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  const key = habitKeys.entries(workspaceId)
  return useMutation({
    mutationFn: async ({ habitId, date, status, quantity }: { habitId: string; date: string; status: HabitEntryStatus | null; quantity?: number | null }) => {
      if (!status) {
        must(await supabase().from('habit_entries').delete().eq('habit_id', habitId).eq('entry_date', date))
        return null
      }
      const row = must(
        await supabase()
          .from('habit_entries')
          .upsert(
            { workspace_id: workspaceId, user_id: user.id, habit_id: habitId, entry_date: date, status, quantity_value: status === 'completed' ? (quantity ?? null) : null },
            { onConflict: 'habit_id,entry_date' },
          )
          .select(ENTRY_COLUMNS)
          .single<EntryRow>(),
      )
      return toEntry(row)
    },
    onMutate: async ({ habitId, date, status, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HabitEntry[]>(key)
      queryClient.setQueryData<HabitEntry[]>(key, (list = []) => {
        const rest = list.filter((entry) => !(entry.habitId === habitId && entry.date === date))
        return status ? [...rest, { id: `pending-${habitId}-${date}`, habitId, date, status, quantity: quantity ?? null, note: null }] : rest
      })
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(key, context?.previous),
    onSuccess: (saved, { habitId, date }) => {
      if (!saved) return
      queryClient.setQueryData<HabitEntry[]>(key, (list = []) => [...list.filter((entry) => !(entry.habitId === habitId && entry.date === date)), saved])
    },
  })
}

const STARTERS: (HabitInput & { color: ColorKey })[] = [
  { title: 'Read for 20 minutes', categoryId: null, frequency: 'daily', weekdays: [], targetPerWeek: null, targetKind: 'duration', targetValue: 20, targetUnit: 'minutes', color: 'violet' },
  { title: 'Move: exercise or a walk', categoryId: null, frequency: 'daily', weekdays: [], targetPerWeek: null, targetKind: 'duration', targetValue: 30, targetUnit: 'minutes', color: 'green' },
  { title: 'Drink enough water', categoryId: null, frequency: 'daily', weekdays: [], targetPerWeek: null, targetKind: 'quantity', targetValue: 8, targetUnit: 'glasses', color: 'teal' },
  { title: 'One block of deep work', categoryId: null, frequency: 'weekdays', weekdays: [1, 2, 3, 4, 5], targetPerWeek: null, targetKind: 'boolean', targetValue: null, targetUnit: null, color: 'blue' },
  { title: 'Practise a skill', categoryId: null, frequency: 'weekly', weekdays: [], targetPerWeek: 3, targetKind: 'boolean', targetValue: null, targetUnit: null, color: 'pink' },
  { title: 'Review the week', categoryId: null, frequency: 'weekly', weekdays: [], targetPerWeek: 1, targetKind: 'boolean', targetValue: null, targetUnit: null, color: 'amber' },
]

export const STARTER_TITLES = STARTERS.map((habit) => habit.title)

/** Optional starter set for an empty habit list; each can be edited or removed. */
export function useAddStarterHabits(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      must(
        await supabase()
          .from('habits')
          .insert(STARTERS.map((habit, index) => ({ ...habitRow(habit), workspace_id: workspaceId, user_id: user.id, position: index + 1 }))),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: habitKeys.list(workspaceId) }),
  })
}

// ── Focus sessions ──────────────────────────────────────────────────────────────────

export function useFocusSessions(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: habitKeys.focus(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = addDays(localDate(), -FOCUS_WINDOW_DAYS)
      const rows = await fetchPaged<FocusRow>((from, to) =>
        supabase()
          .from('focus_sessions')
          .select(FOCUS_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .gte('session_date', since)
          .order('session_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to)
          .returns<FocusRow[]>(),
      )
      return rows.map(toFocus)
    },
  })
}

export type FocusInput = Omit<FocusSession, 'id' | 'createdAt'>

export function useSaveFocusSession(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: FocusInput }) => {
      const row = {
        session_date: input.date,
        duration_minutes: Math.round(input.durationMinutes),
        distraction_count: Math.round(input.distractions),
        tasks_completed: Math.round(input.tasksCompleted),
        concentration_rating: input.concentration,
        note: input.note?.trim() || null,
      }
      if (id) return must(await supabase().from('focus_sessions').update(row).eq('id', id))
      return must(await supabase().from('focus_sessions').insert({ ...row, workspace_id: workspaceId, user_id: user.id }))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: habitKeys.focus(workspaceId) }),
  })
}

export function useDeleteFocusSession(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = habitKeys.focus(workspaceId)
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('focus_sessions').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FocusSession[]>(key)
      queryClient.setQueryData<FocusSession[]>(key, (list) => list?.filter((session) => session.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(key, context?.previous),
  })
}
