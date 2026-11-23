'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { must, supabase } from '@/lib/supabase/client'
import type { Goal, GoalStatus, Milestone } from '@/modules/growth/types'

export const goalKeys = {
  list: (workspaceId: string) => ['ws', workspaceId, 'goals', 'list'] as const,
}

const COLUMNS =
  'id, workspace_id, title, category_id, status, target_date, notes, position, completed_at, created_at, goal_milestones(id, goal_id, title, target_date, completed_at, position)'

type MilestoneRow = { id: string; goal_id: string; title: string; target_date: string | null; completed_at: string | null; position: number }
type GoalRow = {
  id: string
  workspace_id: string
  title: string
  category_id: string | null
  status: GoalStatus
  target_date: string | null
  notes: string | null
  position: number
  completed_at: string | null
  created_at: string
  goal_milestones: MilestoneRow[]
}

const toMilestone = (row: MilestoneRow): Milestone => ({
  id: row.id,
  goalId: row.goal_id,
  title: row.title,
  targetDate: row.target_date,
  completedAt: row.completed_at,
  position: Number(row.position),
})

const toGoal = (row: GoalRow): Goal => ({
  id: row.id,
  workspaceId: row.workspace_id,
  title: row.title,
  categoryId: row.category_id,
  status: row.status,
  targetDate: row.target_date,
  notes: row.notes,
  position: Number(row.position),
  completedAt: row.completed_at,
  createdAt: row.created_at,
  milestones: (row.goal_milestones ?? []).map(toMilestone).sort((a, b) => a.position - b.position),
})

/** Your goals with their milestones (one query, embedded). */
export function useGoals(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: goalKeys.list(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('goals')
          .select(COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .order('position')
          .order('created_at')
          .limit(1000)
          .returns<GoalRow[]>(),
      ).map(toGoal),
  })
}

/** Patches the cached goals and returns a rollback. */
async function patch(queryClient: QueryClient, workspaceId: string, fn: (goals: Goal[]) => Goal[]) {
  const key = goalKeys.list(workspaceId)
  await queryClient.cancelQueries({ queryKey: key })
  const previous = queryClient.getQueryData<Goal[]>(key)
  if (previous) queryClient.setQueryData(key, fn(previous))
  return { previous }
}

function optimistic<T>(queryClient: QueryClient, workspaceId: string, fn: (input: T) => (goals: Goal[]) => Goal[]) {
  const key = goalKeys.list(workspaceId)
  return {
    onMutate: (input: T) => patch(queryClient, workspaceId, fn(input)),
    onError: (_error: unknown, _input: T, context?: { previous?: Goal[] }) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  }
}

export type GoalInput = Pick<Goal, 'title' | 'categoryId' | 'status' | 'targetDate' | 'notes'>

const completedAt = (status: GoalStatus, previous?: string | null) => (status === 'completed' ? (previous ?? new Date().toISOString()) : null)

export function useSaveGoal(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ goal, input, milestones }: { goal?: Goal; input: GoalInput; milestones?: string[] }) => {
      const row = {
        title: input.title.trim(),
        category_id: input.categoryId,
        status: input.status,
        target_date: input.targetDate || null,
        notes: input.notes?.trim() || null,
        completed_at: completedAt(input.status, goal?.completedAt),
      }
      if (goal) return must(await supabase().from('goals').update(row).eq('id', goal.id))
      const saved = must(await supabase().from('goals').insert({ ...row, workspace_id: workspaceId, user_id: user.id, position: Date.now() / 1000 }).select('id').single())
      const titles = (milestones ?? []).map((title) => title.trim()).filter(Boolean)
      if (titles.length)
        must(
          await supabase()
            .from('goal_milestones')
            .insert(titles.map((title, index) => ({ goal_id: saved.id, workspace_id: workspaceId, user_id: user.id, title, position: index + 1 }))),
        )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.list(workspaceId) }),
  })
}

export function useSetGoalStatus(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ goal, status }: { goal: Goal; status: GoalStatus }) =>
      must(await supabase().from('goals').update({ status, completed_at: completedAt(status, goal.completedAt) }).eq('id', goal.id)),
    ...optimistic<{ goal: Goal; status: GoalStatus }>(queryClient, workspaceId, ({ goal, status }) => (goals) =>
      goals.map((item) => (item.id === goal.id ? { ...item, status, completedAt: completedAt(status, goal.completedAt) } : item)),
    ),
  })
}

export function useDeleteGoal(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('goals').delete().eq('id', id)),
    ...optimistic<string>(queryClient, workspaceId, (id) => (goals) => goals.filter((goal) => goal.id !== id)),
  })
}

export function useAddMilestone(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ goal, title }: { goal: Goal; title: string }) =>
      must(
        await supabase()
          .from('goal_milestones')
          .insert({ goal_id: goal.id, workspace_id: workspaceId, user_id: user.id, title: title.trim(), position: (goal.milestones.at(-1)?.position ?? 0) + 1 }),
      ),
    ...optimistic<{ goal: Goal; title: string }>(queryClient, workspaceId, ({ goal, title }) => (goals) =>
      goals.map((item) =>
        item.id === goal.id
          ? { ...item, milestones: [...item.milestones, { id: `pending-${Date.now()}`, goalId: goal.id, title: title.trim(), targetDate: null, completedAt: null, position: (goal.milestones.at(-1)?.position ?? 0) + 1 }] }
          : item,
      ),
    ),
  })
}

export function useToggleMilestone(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ milestone, done }: { milestone: Milestone; done: boolean }) =>
      must(await supabase().from('goal_milestones').update({ completed_at: done ? new Date().toISOString() : null }).eq('id', milestone.id)),
    ...optimistic<{ milestone: Milestone; done: boolean }>(queryClient, workspaceId, ({ milestone, done }) => (goals) =>
      goals.map((goal) =>
        goal.id === milestone.goalId
          ? { ...goal, milestones: goal.milestones.map((item) => (item.id === milestone.id ? { ...item, completedAt: done ? new Date().toISOString() : null } : item)) }
          : goal,
      ),
    ),
  })
}

export function useDeleteMilestone(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (milestone: Milestone) => must(await supabase().from('goal_milestones').delete().eq('id', milestone.id)),
    ...optimistic<Milestone>(queryClient, workspaceId, (milestone) => (goals) =>
      goals.map((goal) => (goal.id === milestone.goalId ? { ...goal, milestones: goal.milestones.filter((item) => item.id !== milestone.id) } : goal)),
    ),
  })
}
