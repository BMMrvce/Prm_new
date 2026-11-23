'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'
import { isoDay, receiptPath, type ClaimStatus, type TransactionKind } from './logic'

/**
 * Money data: transactions (expenses, income, transfers and reimbursement claims) and the
 * monthly budget. Savings goals and recurring payments live in plan-queries.ts.
 * Every key sits under ['ws', workspaceId, 'money'] so one invalidation refreshes it all.
 */

export const moneyKeys = {
  all: (workspaceId: string) => ['ws', workspaceId, 'money'] as const,
  transactions: (workspaceId: string, from: string, to: string) => ['ws', workspaceId, 'money', 'transactions', from, to] as const,
  claims: (workspaceId: string) => ['ws', workspaceId, 'money', 'claims'] as const,
  myClaims: (workspaceId: string, since: string) => ['ws', workspaceId, 'money', 'claims', 'mine', since] as const,
  review: (workspaceId: string, scope: 'open' | 'done') => ['ws', workspaceId, 'money', 'claims', 'review', scope] as const,
  claimCount: (workspaceId: string, admin: boolean) => ['ws', workspaceId, 'money', 'claims', 'count', admin] as const,
  budget: (workspaceId: string) => ['ws', workspaceId, 'money', 'budget'] as const,
  savings: (workspaceId: string) => ['ws', workspaceId, 'money', 'savings'] as const,
  recurring: (workspaceId: string) => ['ws', workspaceId, 'money', 'recurring'] as const,
}

export type Transaction = {
  id: string
  workspaceId: string
  userId: string
  kind: TransactionKind
  categoryId: string | null
  description: string
  amount: number
  currency: string
  occurredOn: string
  status: 'recorded' | ClaimStatus
  paymentMethod: string | null
  note: string | null
  receiptPath: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const TRANSACTION_COLUMNS =
  'id, workspace_id, user_id, kind, category_id, description, amount, currency, occurred_on, status, payment_method, note, receipt_path, reviewed_by, reviewed_at, created_at'

type TransactionRow = {
  id: string
  workspace_id: string
  user_id: string
  kind: TransactionKind
  category_id: string | null
  description: string
  amount: number | string
  currency: string
  occurred_on: string
  status: Transaction['status']
  payment_method: string | null
  note: string | null
  receipt_path: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    kind: row.kind,
    categoryId: row.category_id,
    description: row.description,
    // numeric columns arrive as strings.
    amount: Number(row.amount),
    currency: row.currency,
    occurredOn: row.occurred_on,
    status: row.status,
    paymentMethod: row.payment_method,
    note: row.note,
    receiptPath: row.receipt_path,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }
}

const byNewest = (a: Transaction, b: Transaction) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)

/** Your expenses, income and transfers with `from <= occurred_on < to` (one month or a few). */
export function useTransactions(workspaceId: string | undefined, span: { from: string; to: string }) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.transactions(workspaceId ?? 'none', span.from, span.to),
    enabled: Boolean(workspaceId),
    // Keep the last period on screen while the next loads, but never another workspace's.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === workspaceId ? previous : undefined),
    queryFn: async () =>
      must(
        await supabase()
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .in('kind', ['expense', 'income', 'transfer'])
          .gte('occurred_on', span.from)
          .lt('occurred_on', span.to)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(2000)
          .returns<TransactionRow[]>(),
      ).map(toTransaction),
  })
}

/** Your own claims: everything since `since`, plus any still open however old. */
export function useMyClaims(workspaceId: string, since: string) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.myClaims(workspaceId, since),
    queryFn: async () =>
      must(
        await supabase()
          .from('transactions')
          .select(TRANSACTION_COLUMNS)
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .eq('kind', 'reimbursement')
          .or(`status.in.(pending,approved),occurred_on.gte.${since}`)
          .order('occurred_on', { ascending: false })
          .limit(500)
          .returns<TransactionRow[]>(),
      ).map(toTransaction),
  })
}

/**
 * Other people's claims for a workspace admin: 'open' is the review queue (pending, and
 * approved but not yet paid); 'done' is what was settled in the last 90 days.
 */
export function useClaimsToReview(workspaceId: string, scope: 'open' | 'done', enabled: boolean) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.review(workspaceId, scope),
    enabled,
    queryFn: async () => {
      let query = supabase()
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('kind', 'reimbursement')
        .neq('user_id', user.id)
      query =
        scope === 'open'
          ? query.in('status', ['pending', 'approved']).order('occurred_on', { ascending: true })
          : query
              .in('status', ['rejected', 'paid'])
              .gte('reviewed_at', new Date(Date.now() - 90 * 86_400_000).toISOString())
              .order('reviewed_at', { ascending: false })
      return must(await query.limit(500).returns<TransactionRow[]>()).map(toTransaction)
    },
  })
}

/** Claims waiting on someone: the admin's review queue, or your own pending claims. */
export function useOpenClaimCount(workspaceId: string | undefined, admin: boolean, enabled = true) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.claimCount(workspaceId ?? 'none', admin),
    enabled: enabled && Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase()
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId!)
        .eq('kind', 'reimbursement')
        .eq('status', 'pending')
      query = admin ? query.neq('user_id', user.id) : query.eq('user_id', user.id)
      const { count, error } = await query
      if (error) throw new Error(error.message)
      return count ?? 0
    },
  })
}

// ── Writes ──────────────────────────────────────────────────────────────────────────

/** Applies `fn` to every cached transaction or claim list of the workspace. */
function patchLists(queryClient: QueryClient, workspaceId: string, fn: (list: Transaction[]) => Transaction[]) {
  const snapshots = queryClient.getQueriesData<Transaction[]>({
    queryKey: moneyKeys.all(workspaceId),
    predicate: (query) => ['transactions', 'claims'].includes(String(query.queryKey[3])) && Array.isArray(query.state.data),
  })
  for (const [key, data] of snapshots) if (data) queryClient.setQueryData(key, fn(data))
  return snapshots
}

function restore(queryClient: QueryClient, snapshots: [readonly unknown[], Transaction[] | undefined][] | undefined) {
  snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
}

export type TransactionInput = {
  id?: string
  kind: TransactionKind
  description: string
  amount: number
  currency: string
  occurredOn: string
  categoryId: string | null
  paymentMethod?: string | null
  note?: string | null
  receiptPath?: string | null
}

/** Creates or edits one of your transactions or claims. Editing a rejected claim resubmits it. */
export function useSaveTransaction(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      const row = {
        category_id: input.categoryId,
        description: input.description.trim(),
        amount: input.amount,
        currency: input.currency,
        occurred_on: input.occurredOn,
        payment_method: input.paymentMethod?.trim() || null,
        note: input.note?.trim() || null,
        receipt_path: input.receiptPath ?? null,
      }
      const saved = input.id
        ? await supabase().from('transactions').update(row).eq('id', input.id).select(TRANSACTION_COLUMNS).single<TransactionRow>()
        : await supabase()
            .from('transactions')
            .insert({ ...row, workspace_id: workspaceId, user_id: user.id, kind: input.kind })
            .select(TRANSACTION_COLUMNS)
            .single<TransactionRow>()
      return toTransaction(must(saved))
    },
    onSuccess: (saved) => {
      // Show the change at once in lists that already hold it; refetch the rest.
      patchLists(queryClient, workspaceId, (list) => (list.some((item) => item.id === saved.id) ? list.map((item) => (item.id === saved.id ? saved : item)).sort(byNewest) : list))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.all(workspaceId) }),
  })
}

export function useDeleteTransaction(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (transaction: Pick<Transaction, 'id' | 'receiptPath'>) => {
      must(await supabase().from('transactions').delete().eq('id', transaction.id))
      // The record is gone either way; a leftover file is only tidied up on a best-effort basis.
      if (transaction.receiptPath) await supabase().storage.from('attachments').remove([transaction.receiptPath])
    },
    onMutate: async (transaction) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.all(workspaceId) })
      return { snapshots: patchLists(queryClient, workspaceId, (list) => list.filter((item) => item.id !== transaction.id)) }
    },
    onError: (_error, _transaction, context) => restore(queryClient, context?.snapshots),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.all(workspaceId) }),
  })
}

/** Admin review. The server refuses your own claims and anyone outside your admin workspaces. */
export function useReviewClaim(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ClaimStatus }) => must(await supabase().rpc('review_claim', { claim_id: id, new_status: status })),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.claims(workspaceId) })
      const reviewedAt = new Date().toISOString()
      return {
        snapshots: patchLists(queryClient, workspaceId, (list) => list.map((item) => (item.id === id ? { ...item, status, reviewedBy: user.id, reviewedAt } : item))),
      }
    },
    onError: (_error, _vars, context) => restore(queryClient, context?.snapshots),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.claims(workspaceId) }),
  })
}

// ── Receipts (private `attachments` bucket) ─────────────────────────────────────────

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const RECEIPT_TYPES = 'image/png,image/jpeg,image/webp,image/heic,application/pdf'

/** Checks a picked file; returns a sentence to show, or null when it is fine. */
export function receiptProblem(file: File) {
  if (file.size > RECEIPT_MAX_BYTES) return 'Receipts can be up to 10 MB.'
  if (!RECEIPT_TYPES.split(',').includes(file.type)) return 'Use a PNG, JPEG, WebP, HEIC image or a PDF.'
  return null
}

export async function uploadReceipt(workspaceId: string, file: File) {
  const path = receiptPath(workspaceId, crypto.randomUUID(), file.name)
  must(await supabase().storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false }))
  return path
}

export async function removeReceipt(path: string) {
  await supabase().storage.from('attachments').remove([path])
}

/** Opens a receipt in a new tab through a short-lived signed link. */
export async function openReceipt(path: string) {
  // Open the tab synchronously (inside the click) so popup blockers allow it.
  const tab = window.open('', '_blank')
  try {
    const { signedUrl } = must(await supabase().storage.from('attachments').createSignedUrl(path, 120))
    if (tab) {
      tab.opener = null
      tab.location.href = signedUrl
    } else window.location.assign(signedUrl)
  } catch (error) {
    tab?.close()
    throw error
  }
}

// ── Budget ──────────────────────────────────────────────────────────────────────────

export type Budget = { id: string; monthlyLimit: number | null; categoryLimits: Record<string, number> }

export function useBudget(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: moneyKeys.budget(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const row = maybe(
        await supabase()
          .from('budgets')
          .select('id, monthly_limit, category_limits')
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .maybeSingle<{ id: string; monthly_limit: number | string | null; category_limits: Record<string, number | string> | null }>(),
      )
      if (!row) return null
      const categoryLimits: Record<string, number> = {}
      for (const [key, value] of Object.entries(row.category_limits ?? {})) if (Number(value) > 0) categoryLimits[key] = Number(value)
      return { id: row.id, monthlyLimit: row.monthly_limit === null ? null : Number(row.monthly_limit), categoryLimits } satisfies Budget
    },
  })
}

export function useSaveBudget(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (budget: Omit<Budget, 'id'>) =>
      must(
        await supabase()
          .from('budgets')
          .upsert(
            { workspace_id: workspaceId, user_id: user.id, monthly_limit: budget.monthlyLimit, category_limits: budget.categoryLimits },
            { onConflict: 'workspace_id,user_id' },
          ),
      ),
    onMutate: async (budget) => {
      await queryClient.cancelQueries({ queryKey: moneyKeys.budget(workspaceId) })
      const previous = queryClient.getQueryData<Budget | null>(moneyKeys.budget(workspaceId))
      const next: Budget = { id: previous?.id ?? 'new', monthlyLimit: budget.monthlyLimit, categoryLimits: budget.categoryLimits }
      queryClient.setQueryData<Budget | null>(moneyKeys.budget(workspaceId), next)
      return { previous }
    },
    onError: (_error, _budget, context) => queryClient.setQueryData(moneyKeys.budget(workspaceId), context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: moneyKeys.budget(workspaceId) }),
  })
}

/** Today as `YYYY-MM-DD` (local). */
export const today = () => isoDay(new Date())
