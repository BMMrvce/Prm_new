'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { keys } from '@/core/query'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'
import { createLatestQueue } from './save-queue'

export type WidgetInstance = { id: string; type: string; x: number; y: number; w: number; h: number; config?: Record<string, unknown> }
export type DashboardLayout = { version: 1; widgets: WidgetInstance[] }

/** One saved layout per person per workspace; `null` workspace is the All-workspaces home. */
export function useDashboard(workspaceId: string | null) {
  const user = useUser()
  return useQuery({
    queryKey: keys.dashboard(workspaceId ?? 'all'),
    queryFn: async () => {
      let query = supabase().from('dashboards').select('id, layout').eq('user_id', user.id)
      query = workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)
      const row = maybe(await query.maybeSingle<{ id: string; layout: DashboardLayout }>())
      return row ? { id: row.id, layout: row.layout } : null
    },
    staleTime: Infinity,
  })
}

type SavedDashboard = { id?: string; layout: DashboardLayout } | null

/**
 * Autosave for the layout. Saves run one at a time, newest layout last (see save-queue),
 * so the first save creates the row before later ones update it and an older layout can
 * never land after a newer one. The screen updates immediately; `onError` hears about
 * failed saves.
 */
export function useSaveDashboard(workspaceId: string | null, onError: (error: unknown) => void) {
  const user = useUser()
  const queryClient = useQueryClient()
  const key = keys.dashboard(workspaceId ?? 'all')
  const reportError = useRef(onError)
  useEffect(() => {
    reportError.current = onError
  })

  const [queue] = useState(() => {
    async function write(layout: DashboardLayout) {
      let id = queryClient.getQueryData<SavedDashboard>(key)?.id
      if (!id) {
        // Another tab may have created the row since this one loaded.
        let query = supabase().from('dashboards').select('id').eq('user_id', user.id)
        query = workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)
        id = maybe(await query.maybeSingle<{ id: string }>())?.id
      }
      if (id) {
        const updated = must(await supabase().from('dashboards').update({ layout }).eq('id', id).select('id'))
        if (!updated.length) id = undefined // reset elsewhere: create it again
      }
      if (!id) {
        id = must(await supabase().from('dashboards').insert({ user_id: user.id, workspace_id: workspaceId, layout }).select('id').single<{ id: string }>()).id
      }
      const savedId = id
      queryClient.setQueryData<SavedDashboard>(key, (old) => ({ id: savedId, layout: old?.layout ?? layout }))
    }
    return createLatestQueue(write, (error) => reportError.current(error))
  })

  return useMemo(
    () => ({
      /** Shows `layout` right away without writing it (for debounced edits). */
      show(layout: DashboardLayout) {
        queryClient.setQueryData<SavedDashboard>(key, (old) => ({ id: old?.id, layout }))
      },
      save(layout: DashboardLayout) {
        queryClient.setQueryData<SavedDashboard>(key, (old) => ({ id: old?.id, layout }))
        return queue.push(layout)
      },
      get busy() {
        return queue.busy
      },
    }),
    // `key` is derived from workspaceId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, queryClient, workspaceId],
  )
}

export function useResetDashboard(workspaceId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('dashboards').delete().eq('id', id)),
    onSuccess: () => queryClient.setQueryData(keys.dashboard(workspaceId ?? 'all'), null),
  })
}
