'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isColorKey } from '@/core/colors'
import { useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import { must, supabase } from '@/lib/supabase/client'
import { advanceDueDate, isoDay, type Frequency } from './logic'
import { moneyKeys } from './queries'

/** Savings goals with their contributions, and recurring payments. Both are owner-only. */

export type Contribution = { id: string; goalId: string; amount: number; direction: 'contribution' | 'withdrawal'; occurredOn: string; note: string | null }

export type SavingsGoal = {
  id: string
  name: string
  targetAmount: number
  targetDate: string | null
  color: ColorKey
  position: number
  archivedAt: string | null
  contributions: Contribution[]
}

type GoalRow = {
  id: string
  name: string
  target_amount: number | string
  target_date: string | null
  color: string
  position: number
  archived_at: string | null
  savings_contributions: { id: string; goal_id: string; amount: number | string; direction: Contribution['direction']; occurred_on: string; note: string | null }[]
}

export function useSavingsGoals(workspaceId: string) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.savings(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('savings_goals')
          .select('id, name, target_amount, target_date, color, position, archived_at, savings_contributions(id, goal_id, amount, direction, occurred_on, note)')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .order('position')
          .order('created_at')
          .returns<GoalRow[]>(),
      ).map(
        (row): SavingsGoal => ({
          id: row.id,
          name: row.name,
          targetAmount: Number(row.target_amount),
          targetDate: row.target_date,
          color: isColorKey(row.color) ? row.color : 'green',
          position: row.position,
          archivedAt: row.archived_at,
          contributions: row.savings_contributions
            .map((entry) => ({ id: entry.id, goalId: entry.goal_id, amount: Number(entry.amount), direction: entry.direction, occurredOn: entry.occurred_on, note: entry.note }))
            .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
        }),
      ),
  })
}

export type GoalInput = { id?: string; name: string; targetAmount: number; targetDate: string | null; color: ColorKey; archived?: boolean }

export function useSaveGoal(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (goal: GoalInput) => {
      const row: Record<string, unknown> = { name: goal.name.trim(), target_amount: goal.targetAmount, target_date: goal.targetDate, color: goal.color }
      if (goal.archived !== undefined) row.archived_at = goal.archived ? new Date().toISOString() : null
      if (goal.id) must(await supabase().from('savings_goals').update(row).eq('id', goal.id))
      else must(await supabase().from('savings_goals').insert({ ...row, workspace_id: workspaceId, user_id: user.id, position: Date.now() / 1000 }))
    },
    onMutate: async (goal) => {
      if (!goal.id) return {}
      await queryClient.cancelQueries({ queryKey: moneyKeys.savings(workspaceId) })
      const previous = queryClient.getQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId))
      queryClient.setQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId), (list) =>
        list?.map((item) =>
          item.id === goal.id
            ? {
                ...item,
                name: goal.name,
                targetAmount: goal.targetAmount,
                targetDate: goal.targetDate,
                color: goal.color,
                archivedAt: goal.archived === undefined ? item.archivedAt : goal.archived ? new Date().toISOString() : null,
              }
            : item,
        ),
      )
      return { previous }
    },
    onError: (_error, _goal, context) => {
      if (context?.previous) queryClient.setQueryData(moneyKeys.savings(workspaceId), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.savings(workspaceId) }),
  })
}

export function useDeleteGoal(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('savings_goals').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.savings(workspaceId) })
      const previous = queryClient.getQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId))
      queryClient.setQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId), (list) => list?.filter((item) => item.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(moneyKeys.savings(workspaceId), context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.savings(workspaceId) }),
  })
}

export type ContributionInput = Omit<Contribution, 'id'>

/** Adds money to (or takes it out of) a goal; progress updates before the server answers. */
export function useAddContribution(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ContributionInput) =>
      must(
        await supabase().from('savings_contributions').insert({
          goal_id: input.goalId,
          workspace_id: workspaceId,
          user_id: user.id,
          amount: input.amount,
          direction: input.direction,
          occurred_on: input.occurredOn,
          note: input.note?.trim() || null,
        }),
      ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.savings(workspaceId) })
      const previous = queryClient.getQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId))
      const optimistic: Contribution = { ...input, id: `temp-${Date.now()}` }
      queryClient.setQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId), (list) =>
        list?.map((goal) => (goal.id === input.goalId ? { ...goal, contributions: [optimistic, ...goal.contributions] } : goal)),
      )
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(moneyKeys.savings(workspaceId), context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.savings(workspaceId) }),
  })
}

export function useDeleteContribution(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('savings_contributions').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.savings(workspaceId) })
      const previous = queryClient.getQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId))
      queryClient.setQueryData<SavingsGoal[]>(moneyKeys.savings(workspaceId), (list) =>
        list?.map((goal) => ({ ...goal, contributions: goal.contributions.filter((entry) => entry.id !== id) })),
      )
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(moneyKeys.savings(workspaceId), context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.savings(workspaceId) }),
  })
}

// ── Recurring payments ──────────────────────────────────────────────────────────────

export type RecurringPayment = {
  id: string
  name: string
  kind: 'expense' | 'income'
  categoryId: string | null
  amount: number
  frequency: Frequency
  nextDueDate: string
  /** Day of month the payment belongs to, so 31 Jan → 28 Feb → 31 Mar instead of drifting. */
  anchorDay?: number | null
  active: boolean
}

type RecurringRow = {
  id: string
  name: string
  kind: RecurringPayment['kind']
  category_id: string | null
  amount: number | string
  frequency: Frequency
  next_due_date: string
  anchor_day: number | null
  active: boolean
}

const RECURRING_COLUMNS = 'id, name, kind, category_id, amount, frequency, next_due_date, anchor_day, active'

const toRecurring = (row: RecurringRow): RecurringPayment => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  categoryId: row.category_id,
  amount: Number(row.amount),
  frequency: row.frequency,
  nextDueDate: row.next_due_date,
  anchorDay: row.anchor_day,
  active: row.active,
})

export function useRecurring(workspaceId: string) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.recurring(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('recurring_payments')
          .select(RECURRING_COLUMNS)
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .order('next_due_date')
          .returns<RecurringRow[]>(),
      ).map(toRecurring),
  })
}

export type RecurringInput = Omit<RecurringPayment, 'id'> & { id?: string }

export function useSaveRecurring(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecurringInput) => {
      const row = {
        name: input.name.trim(),
        kind: input.kind,
        category_id: input.categoryId,
        amount: input.amount,
        frequency: input.frequency,
        next_due_date: input.nextDueDate,
        // The chosen date's day of month is the anchor for every later occurrence.
        anchor_day: input.anchorDay ?? (Number(input.nextDueDate.slice(8, 10)) || null),
        active: input.active,
      }
      if (input.id) must(await supabase().from('recurring_payments').update(row).eq('id', input.id))
      else must(await supabase().from('recurring_payments').insert({ ...row, workspace_id: workspaceId, user_id: user.id }))
    },
    onMutate: async (input) => {
      if (!input.id) return {}
      await queryClient.cancelQueries({ queryKey: moneyKeys.recurring(workspaceId) })
      const previous = queryClient.getQueryData<RecurringPayment[]>(moneyKeys.recurring(workspaceId))
      queryClient.setQueryData<RecurringPayment[]>(moneyKeys.recurring(workspaceId), (list) =>
        list?.map((item) => (item.id === input.id ? { ...item, ...input, id: item.id } : item)),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(moneyKeys.recurring(workspaceId), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.recurring(workspaceId) }),
  })
}

export function useDeleteRecurring(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('recurring_payments').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.recurring(workspaceId) })
      const previous = queryClient.getQueryData<RecurringPayment[]>(moneyKeys.recurring(workspaceId))
      queryClient.setQueryData<RecurringPayment[]>(moneyKeys.recurring(workspaceId), (list) => list?.filter((item) => item.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(moneyKeys.recurring(workspaceId), context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.recurring(workspaceId) }),
  })
}

/**
 * "Mark paid": records a real transaction dated today and moves the due date on by one
 * period. Not atomic — if the second write fails the transaction stays and the error says so.
 */
export function useMarkRecurringPaid(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ item, currency, paidOn = isoDay(new Date()) }: { item: RecurringPayment; currency: string; paidOn?: string }) => {
      must(
        await supabase().from('transactions').insert({
          workspace_id: workspaceId,
          user_id: user.id,
          kind: item.kind,
          category_id: item.categoryId,
          description: item.name.slice(0, 240),
          amount: item.amount,
          currency,
          occurred_on: paidOn,
          note: `Recurring payment due ${item.nextDueDate}`,
        }),
      )
      const next = advanceDueDate(item.nextDueDate, item.frequency, item.anchorDay ?? undefined)
      const { error } = await supabase().from('recurring_payments').update({ next_due_date: next }).eq('id', item.id)
      if (error) throw new Error(`The payment was recorded, but the next due date could not be moved: ${error.message}`)
      return next
    },
    onSuccess: (next, { item }) =>
      queryClient.setQueryData<RecurringPayment[]>(moneyKeys.recurring(workspaceId), (list) =>
        list?.map((entry) => (entry.id === item.id ? { ...entry, nextDueDate: next } : entry)).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.all(workspaceId) }),
  })
}
