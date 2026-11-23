'use client'

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { errorMessage, toast } from '@/ui/toast'

/**
 * React Query is the app's data layer: every Supabase read is a cached query keyed by
 * workspace, every write a mutation that updates or invalidates those caches. Realtime
 * events (core/realtime.ts) invalidate the same keys, so other people's changes appear
 * without reloading.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is kept fresh by realtime; avoid refetching on every mount.
            staleTime: 60_000,
            gcTime: 15 * 60_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => count < 2 && !/permission|JWT|42501|PGRST/i.test(String((error as Error)?.message)),
          },
          mutations: { retry: 0 },
        },
        mutationCache: new MutationCache({
          // One place to report failed writes; a mutation can opt out with meta.silent.
          onError: (error, _variables, _context, mutation) => {
            if (!mutation.meta?.silent) toast.error(errorMessage(error))
          },
        }),
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Query keys in one place so invalidation never misses a spelling. */
export const keys = {
  profile: ['profile'] as const,
  workspaces: ['workspaces'] as const,
  invitations: ['my-invitations'] as const,
  notifications: ['notifications'] as const,
  security: ['security-status'] as const,
  connections: ['connections'] as const,
  ws: (workspaceId: string) => ['ws', workspaceId] as const,
  people: (workspaceId: string) => ['ws', workspaceId, 'people'] as const,
  wsInvites: (workspaceId: string) => ['ws', workspaceId, 'invitations'] as const,
  teams: (workspaceId: string) => ['ws', workspaceId, 'teams'] as const,
  statuses: (workspaceId: string) => ['ws', workspaceId, 'statuses'] as const,
  labels: (workspaceId: string) => ['ws', workspaceId, 'labels'] as const,
  categories: (workspaceId: string, scope: string) => ['ws', workspaceId, 'categories', scope] as const,
  projects: (workspaceId: string) => ['ws', workspaceId, 'projects'] as const,
  tasks: (scope: string) => ['tasks', scope] as const,
  task: (taskId: string) => ['task', taskId] as const,
  dashboard: (scope: string) => ['dashboard', scope] as const,
}
