'use client'

import { CalendarClock, PieChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { color } from '@/core/colors'
import { cn } from '@/ui/cn'
import { Card, EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { BudgetDialog, BudgetSummary } from './budgets'
import { budgetUsage, dueState, monthKey, monthRange, savingsProgress, summarizeMonth, usageTone } from './logic'
import { useRecurring, useSavingsGoals } from './plan-queries'
import { useBudget, useTransactions } from './queries'
import { Amount, CategoryLabel, formatDay, Meter, MonthSwitcher, Stat, type MoneyContext } from './shared'

export type OverviewLinks = {
  /** Opens Transactions filtered to a kind and/or category. */
  transactions: (filter: { kind?: 'expense' | 'income'; categoryId?: string }) => void
  tab: (tab: 'savings' | 'recurring' | 'budgets') => void
}

export function OverviewTab({ context, month, onMonth, links }: { context: MoneyContext; month: string; onMonth: (month: string) => void; links: OverviewLinks }) {
  const { features } = context
  const transactions = useTransactions(context.workspace.id, monthRange(month))
  const budget = useBudget(features.has('budgets') ? context.workspace.id : undefined)
  const [editingBudget, setEditingBudget] = useState(false)
  const summary = useMemo(() => summarizeMonth(transactions.data ?? [], month, context.currency), [transactions.data, month, context.currency])
  const usage = useMemo(() => budgetUsage(budget.data, summary.byCategory, month), [budget.data, summary.byCategory, month])

  const categories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1])
  const largest = categories[0]?.[1] ?? 0

  if (transactions.error) return <ErrorNotice message={transactions.error.message} onRetry={() => transactions.refetch()} />

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} onChange={onMonth} />
      {transactions.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {features.has('expenses') && <Stat label="Spent" value={context.format(summary.expenses)} onClick={() => links.transactions({ kind: 'expense' })} />}
          {features.has('income') && <Stat label="Income" value={context.format(summary.income)} onClick={() => links.transactions({ kind: 'income' })} />}
          {features.has('expenses') && features.has('income') && (
            <Stat label="Net" value={`${summary.net < 0 ? '−' : ''}${context.format(Math.abs(summary.net))}`} note={summary.net < 0 ? 'Spent more than earned' : summary.income > 0 ? `${Math.round((summary.net / summary.income) * 100)}% kept` : undefined} noteTone={summary.net < 0 ? 'warn' : 'ok'} />
          )}
          {features.has('budgets') && (
            <Stat
              label="Budget left"
              value={usage.remaining === null ? '—' : context.format(usage.remaining)}
              note={usage.remaining === null ? 'No monthly limit' : usage.remaining < 0 ? 'Over budget' : month === monthKey() ? `About ${context.format(usage.perDay ?? 0)} a day` : undefined}
              noteTone={usage.remaining !== null && usage.remaining < 0 ? 'over' : usageTone(usage.percent)}
              onClick={() => links.tab('budgets')}
            />
          )}
        </div>
      )}
      {summary.otherCurrency > 0 && (
        <p className="text-xs text-ink-3">
          {summary.otherCurrency} {summary.otherCurrency === 1 ? 'entry is' : 'entries are'} in another currency and not counted here.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {features.has('expenses') && (
          <Card title="Spending by category" description={categories.length ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'} · ${context.currency}` : undefined}>
            {transactions.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : categories.length ? (
              <ul className="space-y-3" aria-label="Spending by category, largest first">
                {categories.map(([categoryId, amount]) => {
                  const category = categoryId ? context.categoryById.get(categoryId) : undefined
                  const share = summary.expenses ? Math.round((amount / summary.expenses) * 100) : 0
                  return (
                    <li key={categoryId || 'none'} className="animate-row">
                      <button
                        type="button"
                        onClick={() => links.transactions({ kind: 'expense', categoryId: categoryId || 'none' })}
                        className="block w-full rounded-md text-left"
                        aria-label={`${category?.name ?? 'Uncategorised'}: ${context.format(amount)}, ${share}% of spending. Show these transactions`}
                      >
                        <span className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 text-ink">
                            <CategoryLabel category={category} />
                          </span>
                          <span className="shrink-0 text-ink-2 tabular-nums">
                            {context.format(amount)} <span className="text-ink-3">· {share}%</span>
                          </span>
                        </span>
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <span className={cn('block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', category ? color(category.color).dot : 'bg-line-strong')} style={{ width: `${largest ? (amount / largest) * 100 : 0}%` }} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState icon={PieChart} title="No spending this month" hint="Expenses you add show up here by category." className="py-4" />
            )}
          </Card>
        )}
        {features.has('budgets') &&
          (budget.isPending ? <Skeleton className="h-40 rounded-xl" /> : <BudgetSummary context={context} usage={usage} onEdit={() => setEditingBudget(true)} onSelectCategory={(categoryId) => links.transactions({ kind: 'expense', categoryId })} />)}
        {features.has('recurring') && <ComingUp context={context} onOpen={() => links.tab('recurring')} />}
        {features.has('savings') && <SavingsSnapshot context={context} onOpen={() => links.tab('savings')} />}
        <RecentCard context={context} entries={transactions.data ?? []} onViewAll={() => links.transactions({})} />
      </div>
      {editingBudget && <BudgetDialog context={context} budget={budget.data ?? null} onClose={() => setEditingBudget(false)} />}
    </div>
  )
}

function RecentCard({ context, entries, onViewAll }: { context: MoneyContext; entries: { id: string; kind: string; description: string; amount: number; occurredOn: string; currency: string }[]; onViewAll: () => void }) {
  if (!entries.length) return null
  return (
    <Card
      title="Latest this month"
      actions={
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-primary-ink hover:underline">
          View all
        </button>
      }
    >
      <ul className="space-y-2.5">
        {entries.slice(0, 5).map((entry) => (
          <li key={entry.id} className="animate-row flex items-center gap-3 text-ui">
            <span className="w-14 shrink-0 text-2xs text-ink-3 tabular-nums">{formatDay(entry.occurredOn)}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{entry.description}</span>
            <Amount kind={entry.kind} value={entry.amount} format={(value) => (entry.currency === context.currency ? context.format(value) : `${entry.currency} ${value.toFixed(2)}`)} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ComingUp({ context, onOpen }: { context: MoneyContext; onOpen: () => void }) {
  const { data, isPending } = useRecurring(context.workspace.id)
  const due = (data ?? []).filter((item) => item.active && dueState(item.nextDueDate) !== 'later').slice(0, 5)
  return (
    <Card
      title="Coming up"
      description="Recurring payments due within a week"
      actions={
        <button type="button" onClick={onOpen} className="text-xs font-medium text-primary-ink hover:underline">
          All recurring
        </button>
      }
    >
      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : due.length ? (
        <ul className="space-y-2.5">
          {due.map((item) => {
            const state = dueState(item.nextDueDate)
            return (
              <li key={item.id} className="animate-row flex items-center gap-3 text-ui">
                <span className={cn('w-20 shrink-0 text-2xs font-medium', state === 'overdue' ? 'text-error-ink' : state === 'today' ? 'text-warning-ink' : 'text-ink-3')}>
                  {state === 'overdue' ? 'Overdue' : state === 'today' ? 'Today' : formatDay(item.nextDueDate)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                <Amount kind={item.kind} value={item.amount} format={context.format} />
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={CalendarClock} title="Nothing due this week" className="py-4" />
      )}
    </Card>
  )
}

function SavingsSnapshot({ context, onOpen }: { context: MoneyContext; onOpen: () => void }) {
  const { data, isPending } = useSavingsGoals(context.workspace.id)
  const goals = (data ?? []).filter((goal) => !goal.archivedAt)
  if (!isPending && !goals.length) return null
  return (
    <Card
      title="Savings goals"
      actions={
        <button type="button" onClick={onOpen} className="text-xs font-medium text-primary-ink hover:underline">
          Manage
        </button>
      }
    >
      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <ul className="space-y-3">
          {goals.slice(0, 4).map((goal) => {
            const progress = savingsProgress(goal.targetAmount, goal.contributions)
            return (
              <li key={goal.id} className="animate-row">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{goal.name}</span>
                  <span className="shrink-0 text-ink-2 tabular-nums">{progress.percent}%</span>
                </div>
                <Meter className="mt-1.5" percent={progress.percent} label={`${goal.name} progress`} barClass={color(goal.color).dot} />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
