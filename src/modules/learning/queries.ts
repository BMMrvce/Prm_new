'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { must, supabase } from '@/lib/supabase/client'
import type { LearningStatus, LearningTopic } from '@/modules/growth/types'

export const learningKeys = {
  topics: (workspaceId: string) => ['ws', workspaceId, 'learning', 'topics'] as const,
}

const COLUMNS = 'id, workspace_id, title, category_id, status, resources, notes, position, archived_at, updated_at'

type TopicRow = {
  id: string
  workspace_id: string
  title: string
  category_id: string | null
  status: LearningStatus
  resources: string | null
  notes: string | null
  position: number
  archived_at: string | null
  updated_at: string
}

const toTopic = (row: TopicRow): LearningTopic => ({
  id: row.id,
  workspaceId: row.workspace_id,
  title: row.title,
  categoryId: row.category_id,
  status: row.status,
  resources: row.resources,
  notes: row.notes,
  position: Number(row.position),
  archivedAt: row.archived_at,
  updatedAt: row.updated_at,
})

/** Your learning topics, archived ones included. */
export function useLearningTopics(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: learningKeys.topics(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('learning_topics')
          .select(COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .order('position')
          .order('updated_at', { ascending: false })
          .limit(1000)
          .returns<TopicRow[]>(),
      ).map(toTopic),
  })
}

export type TopicInput = Pick<LearningTopic, 'title' | 'categoryId' | 'status' | 'resources' | 'notes'>

export function useSaveTopic(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TopicInput }) => {
      const row = {
        title: input.title.trim(),
        category_id: input.categoryId,
        status: input.status,
        resources: input.resources?.trim() || null,
        notes: input.notes?.trim() || null,
      }
      if (id) return must(await supabase().from('learning_topics').update(row).eq('id', id))
      return must(await supabase().from('learning_topics').insert({ ...row, workspace_id: workspaceId, user_id: user.id, position: Date.now() / 1000 }))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: learningKeys.topics(workspaceId) }),
  })
}

/** Optimistic change of a topic's stage or archive state. */
export function useUpdateTopic(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = learningKeys.topics(workspaceId)
  return useMutation({
    mutationFn: async ({ id, status, archived }: { id: string; status?: LearningStatus; archived?: boolean }) => {
      const row: Record<string, unknown> = {}
      if (status) row.status = status
      if (archived !== undefined) row.archived_at = archived ? new Date().toISOString() : null
      must(await supabase().from('learning_topics').update(row).eq('id', id))
    },
    onMutate: async ({ id, status, archived }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LearningTopic[]>(key)
      queryClient.setQueryData<LearningTopic[]>(key, (list) =>
        list?.map((topic) =>
          topic.id === id
            ? {
                ...topic,
                status: status ?? topic.status,
                archivedAt: archived === undefined ? topic.archivedAt : archived ? new Date().toISOString() : null,
                updatedAt: new Date().toISOString(),
              }
            : topic,
        ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTopic(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('learning_topics').delete().eq('id', id)),
    onSuccess: (_data, id) => queryClient.setQueryData<LearningTopic[]>(learningKeys.topics(workspaceId), (list) => list?.filter((topic) => topic.id !== id)),
  })
}
