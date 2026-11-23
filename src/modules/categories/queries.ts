'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isColorKey } from '@/core/colors'
import { keys } from '@/core/query'
import type { ColorKey } from '@/core/types'
import { must, supabase } from '@/lib/supabase/client'

/** Every user-defined list in the app lives in one table, keyed by scope. */
export type CategoryScope = 'meeting' | 'expense' | 'income' | 'habit' | 'learning' | 'goal' | 'book' | 'note'

export type Category = { id: string; workspaceId: string; scope: CategoryScope; name: string; color: ColorKey; position: number; archivedAt: string | null }

export const SCOPE_LABELS: Record<CategoryScope, { title: string; module: string; examples: string[] }> = {
  meeting: { title: 'Meeting types', module: 'calendar', examples: ['Client call', 'Internal', 'Interview'] },
  expense: { title: 'Expense categories', module: 'money', examples: ['Travel', 'Food', 'Software', 'Rent'] },
  income: { title: 'Income categories', module: 'money', examples: ['Salary', 'Invoices', 'Interest'] },
  habit: { title: 'Habit categories', module: 'habits', examples: ['Health', 'Focus', 'Learning'] },
  learning: { title: 'Learning areas', module: 'learning', examples: ['Cloud', 'Design', 'Languages'] },
  goal: { title: 'Goal areas', module: 'goals', examples: ['Career', 'Financial', 'Personal'] },
  book: { title: 'Book genres', module: 'reading', examples: ['Business', 'Fiction', 'Biography'] },
  note: { title: 'Note folders', module: 'notes', examples: ['Meetings', 'Ideas', 'Reference'] },
}

export function useCategories(workspaceId: string | undefined, scope: CategoryScope) {
  return useQuery({
    queryKey: keys.categories(workspaceId ?? 'none', scope),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: async () =>
      must(
        await supabase()
          .from('categories')
          .select('id, workspace_id, scope, name, color, position, archived_at')
          .eq('workspace_id', workspaceId!)
          .eq('scope', scope)
          .order('position')
          .order('name'),
      ).map(
        (row): Category => ({
          id: row.id,
          workspaceId: row.workspace_id,
          scope: row.scope,
          name: row.name,
          color: isColorKey(row.color) ? row.color : 'slate',
          position: row.position,
          archivedAt: row.archived_at,
        }),
      ),
  })
}

export function useSaveCategory(workspaceId: string, scope: CategoryScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (category: { id?: string; name: string; color: ColorKey; position?: number; archived?: boolean }) => {
      const row = {
        workspace_id: workspaceId,
        scope,
        name: category.name.trim(),
        color: category.color,
        position: category.position ?? Date.now() / 1000,
        archived_at: category.archived === undefined ? undefined : category.archived ? new Date().toISOString() : null,
      }
      if (category.id) return must(await supabase().from('categories').update(row).eq('id', category.id).select('id').single()).id as string
      return must(await supabase().from('categories').insert(row).select('id').single()).id as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories(workspaceId, scope) }),
  })
}

export function useDeleteCategory(workspaceId: string, scope: CategoryScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('categories').delete().eq('id', id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories(workspaceId, scope) }),
  })
}

/** Adds a scope's example categories in one insert (for a fresh, empty list). */
export function useSeedCategories(workspaceId: string, scope: CategoryScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const palette: ColorKey[] = ['blue', 'teal', 'amber', 'violet', 'green', 'pink', 'orange', 'slate']
      must(
        await supabase()
          .from('categories')
          .insert(SCOPE_LABELS[scope].examples.map((name, index) => ({ workspace_id: workspaceId, scope, name, color: palette[index % palette.length], position: index + 1 }))),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.categories(workspaceId, scope) }),
  })
}
