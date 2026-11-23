'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { keys } from './query'

/** Which cached queries a change to each table makes stale. */
function invalidate(queryClient: QueryClient, table: string, workspaceId: string | null, record: Record<string, unknown>) {
  const ws = (workspaceId ?? record.workspace_id) as string | undefined
  switch (table) {
    case 'tasks':
    case 'task_assignees':
    case 'task_labels':
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      if (record.task_id || record.id) queryClient.invalidateQueries({ queryKey: keys.task(String(record.task_id ?? record.id)) })
      break
    case 'comments':
      if (record.task_id) queryClient.invalidateQueries({ queryKey: keys.task(String(record.task_id)) })
      break
    case 'projects':
      if (ws) queryClient.invalidateQueries({ queryKey: keys.projects(ws) })
      break
    case 'task_statuses':
      if (ws) queryClient.invalidateQueries({ queryKey: keys.statuses(ws) })
      break
    case 'meetings':
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      break
    case 'notes':
      // Only the list: an open note syncs through its own live channel, never under the cursor.
      if (ws) queryClient.invalidateQueries({ queryKey: ['notes', ws, 'list'] })
      break
    case 'whiteboards':
      queryClient.invalidateQueries({ queryKey: ['whiteboards'] })
      break
    case 'time_entries':
      queryClient.invalidateQueries({ queryKey: ['time'] })
      break
    case 'transactions':
      if (ws) queryClient.invalidateQueries({ queryKey: ['ws', ws, 'money'] })
      break
    case 'workspace_members':
      queryClient.invalidateQueries({ queryKey: keys.workspaces })
      if (ws) queryClient.invalidateQueries({ queryKey: keys.people(ws) })
      break
  }
}

const WORKSPACE_TABLES = ['tasks', 'task_assignees', 'task_labels', 'comments', 'projects', 'task_statuses', 'meetings', 'notes', 'whiteboards', 'time_entries', 'workspace_members', 'transactions']

/**
 * Live updates for one workspace: row changes other people make are pushed by Supabase
 * Realtime (filtered by RLS on the server) and invalidate the matching caches.
 * Bursts are coalesced so a bulk change triggers one refetch, not hundreds.
 */
export function useWorkspaceRealtime(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!workspaceId) return
    const pending = new Map<string, Record<string, unknown>>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      pending.forEach((record, key) => invalidate(queryClient, key.split(':')[0], workspaceId, record))
      pending.clear()
    }
    let channel = supabase().channel(`db:${workspaceId}`)
    for (const table of WORKSPACE_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const record = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>
          pending.set(`${table}:${record.task_id ?? record.id ?? ''}`, record)
          clearTimeout(timer)
          timer = setTimeout(flush, 250)
        },
      )
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      supabase().removeChannel(channel)
    }
  }, [workspaceId, queryClient])
}

/** New notifications for the signed-in user, everywhere in the app. */
export function useNotificationRealtime(userId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase()
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () =>
        queryClient.invalidateQueries({ queryKey: keys.notifications }),
      )
      .subscribe()
    return () => {
      supabase().removeChannel(channel)
    }
  }, [userId, queryClient])
}
