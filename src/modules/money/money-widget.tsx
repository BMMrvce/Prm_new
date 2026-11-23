'use client'

import { Wallet } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { moduleOption } from '@/core/modules'
import { workspaceHref } from '@/core/routes'
import { canAdmin, canWrite } from '@/core/workspaces'
import { DEFAULT_CURRENCY, money } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetAdd, WidgetFrame } from '@/modules/dashboard/widget-frame'
import { Skeleton } from '@/ui/spinner'
import { budgetUsage, monthKey, monthLabel, monthRange, summarizeMonth, usageTone } from './logic'
import { useBudget, useOpenClaimCount, useTransactions } from './queries'
import { Meter, TONE_TEXT, useMoney } from './shared'
import { TransactionDialog } from './transaction-dialog'

/** Dashboard card: this month's spending against the budget, and claims waiting on someone. */
export function MoneyWidget({ workspace }: WidgetProps) {
  const features = new Set(workspace ? (moduleOption<string[]>(workspace, 'money', 'features') ?? []) : [])
  const tracksSpending = features.has('expenses')
  const tracksClaims = features.has('claims')
  const admin = workspace ? canAdmin(workspace) : false
  const currency = workspace?.settings.currency ?? DEFAULT_CURRENCY
  const [month] = useState(() => monthKey())
  const [adding, setAdding] = useState(false)

  const transactions = useTransactions(tracksSpending ? workspace?.id : undefined, monthRange(month))
  const budget = useBudget(tracksSpending && features.has('budgets') ? workspace?.id : undefined)
  const claims = useOpenClaimCount(workspace?.id, admin, tracksClaims)

  const summary = useMemo(() => summarizeMonth(transactions.data ?? [], month, currency), [transactions.data, month, currency])
  const usage = useMemo(() => budgetUsage(budget.data, summary.byCategory, month), [budget.data, summary.byCategory, month])

  if (!workspace) return null
  const href = workspaceHref(workspace.slug, 'money')
  const format = (value: number) => money(value, currency)
  const tone = usageTone(usage.percent)

  return (
    <WidgetFrame
      title="Money"
      icon={<Wallet size={15} />}
      action={
        <span className="flex items-center gap-2">
          <Link href={href} className="text-xs font-medium text-primary-ink hover:underline">
            Open
          </Link>
          {canWrite(workspace) && <WidgetAdd label="Record money" onClick={() => setAdding(true)} />}
        </span>
      }
    >
      <div className="space-y-4 pt-1">
        {tracksSpending && (
          <div>
            <p className="text-xs text-ink-2">Spent in {monthLabel(month, 'short')}</p>
            {transactions.isPending ? (
              <Skeleton className="mt-1 h-7 w-32" />
            ) : transactions.error ? (
              <p className="mt-1 text-xs text-error-ink" role="alert">
                Could not load spending.
              </p>
            ) : (
              <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">
                {format(summary.expenses)}
                {usage.limit !== null && <span className="ml-1.5 text-ui font-normal text-ink-3">of {format(usage.limit)}</span>}
              </p>
            )}
            {usage.limit !== null && !transactions.isPending && (
              <>
                <Meter className="mt-2" percent={usage.percent ?? 0} tone={tone} label="Monthly budget used" />
                <p className={`mt-1 text-2xs ${TONE_TEXT[tone]}`}>
                  {usage.remaining !== null && usage.remaining < 0 ? `Over budget by ${format(-usage.remaining)}` : `${format(usage.remaining ?? 0)} left · about ${format(usage.perDay ?? 0)} a day`}
                </p>
              </>
            )}
          </div>
        )}
        {tracksClaims && (
          <Link href={`${href}?tab=claims`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-line-strong hover:bg-surface-2">
            <span className="text-ui text-ink">{admin ? 'Claims to review' : 'Your pending claims'}</span>
            {claims.isPending ? (
              <Skeleton className="h-5 w-6" />
            ) : (
              <span className={`rounded-md px-1.5 text-ui font-semibold tabular-nums ${claims.data ? 'bg-warning-light text-warning-ink' : 'text-ink-2'}`}>{claims.error ? '—' : claims.data}</span>
            )}
          </Link>
        )}
        {!tracksSpending && !tracksClaims && <p className="text-ui text-ink-2">Turn on expenses or claims for this workspace to see a summary here.</p>}
      </div>
      {adding && <AddMoney onClose={() => setAdding(false)} />}
    </WidgetFrame>
  )
}

/** The money form, opened right on the dashboard. */
function AddMoney({ onClose }: { onClose: () => void }) {
  const context = useMoney()
  return <TransactionDialog context={context} onClose={onClose} />
}
