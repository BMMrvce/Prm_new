'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { duration } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'
import { toast } from '@/ui/toast'
import { pausePatch, secondsOf, stopPatch, type EntryTimes } from './logic'
import { ENTRY_COLUMNS, fetchActiveTimer, timeKeys, toEntry, useActiveTimer, type ActiveTimer } from './queries'

export type StartInput = { workspaceId: string; taskId?: string | null; description?: string | null }

/** What a timer is on, for messages: the task title, the description or "Untitled". */
export const timerLabel = (entry: Pick<ActiveTimer, 'task' | 'description'>) => entry.task?.title ?? entry.description ?? 'Untitled timer'

async function stopEntry(entry: EntryTimes & { id: string }) {
  // Matching the state keeps a stale tab from rewriting an entry that already stopped.
  must(await supabase().from('time_entries').update(stopPatch(entry, Date.now())).eq('id', entry.id).in('state', ['running', 'paused']))
}

/**
 * The user's one active timer (running or paused, in any workspace) and its actions.
 * The database allows a single active timer per person, so starting a new one first
 * stops the current one, and says so; if another tab or device won a race, its timer
 * is stopped too and the start is retried once.
 */
export function useTimer() {
  const user = useUser()
  const queryClient = useQueryClient()
  const active = useActiveTimer()
  const key = timeKeys.active(user.id)
  const settle = () => queryClient.invalidateQueries({ queryKey: ['time'] })

  const start = useMutation({
    mutationFn: async ({ input }: { input: StartInput; resume?: boolean }) => {
      const db = supabase()
      const previous = await fetchActiveTimer(user.id)
      if (previous) await stopEntry(previous)
      const insert = () =>
        db
          .from('time_entries')
          .insert({
            workspace_id: input.workspaceId,
            task_id: input.taskId ?? null,
            description: input.description?.trim() || null,
            user_id: user.id,
            state: 'running',
            started_at: new Date().toISOString(),
          })
          .select(`${ENTRY_COLUMNS}, workspace:workspaces(slug, name)`)
          .single()
      let result = await insert()
      if (result.error?.code === '23505') {
        const other = await fetchActiveTimer(user.id)
        if (other) await stopEntry(other)
        result = await insert()
      }
      const row = must(result) as unknown as Parameters<typeof toEntry>[0] & { workspace: ActiveTimer['workspace'] }
      const entry: ActiveTimer = { ...toEntry(row), workspace: row.workspace ?? null }
      return { previous, entry }
    },
    onSuccess: ({ previous, entry }, { resume }) => {
      queryClient.setQueryData(key, entry)
      if (resume) toast.success('Timer resumed')
      else if (previous)
        toast.info(`Stopped “${timerLabel(previous)}” at ${duration(secondsOf(previous, Date.now()) / 60)}. Now tracking “${timerLabel(entry)}”.`)
      else toast.success(`Tracking “${timerLabel(entry)}”`)
    },
    onSettled: settle,
  })

  const pause = useMutation({
    mutationFn: async (entry: ActiveTimer) => {
      const patch = pausePatch(entry, Date.now())
      must(await supabase().from('time_entries').update(patch).eq('id', entry.id).eq('state', 'running'))
      return patch
    },
    onSuccess: (patch, entry) =>
      queryClient.setQueryData<ActiveTimer | null>(key, () => ({ ...entry, state: 'paused' as const, pausedAt: patch.paused_at, accumulatedSeconds: patch.accumulated_seconds })),
    onSettled: settle,
  })

  const stop = useMutation({
    mutationFn: async (entry: ActiveTimer) => {
      await stopEntry(entry)
      return secondsOf(entry, Date.now())
    },
    onMutate: async (entry) => {
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData(key, null)
      return { entry }
    },
    onError: (_error, entry) => queryClient.setQueryData(key, entry),
    onSuccess: (seconds, entry) => toast.success(`Logged ${duration(seconds / 60)} on “${timerLabel(entry)}”`),
    onSettled: settle,
  })

  return {
    active: active.data ?? null,
    loading: active.isPending,
    busy: start.isPending || pause.isPending || stop.isPending,
    /** Starts tracking; stops (and reports) any timer already running anywhere. */
    start: (input: StartInput) => start.mutateAsync({ input }),
    pause: (entry: ActiveTimer) => pause.mutate(entry),
    /** Each run is its own entry, so time lands on the day it was worked. */
    resume: (entry: ActiveTimer) =>
      start.mutate({ input: { workspaceId: entry.workspaceId, taskId: entry.taskId, description: entry.description }, resume: true }),
    stop: (entry: ActiveTimer) => stop.mutate(entry),
  }
}
