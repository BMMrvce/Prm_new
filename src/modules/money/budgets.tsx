'use client'

import { Pencil, Wallet } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input } from '@/ui/field'
import { Card, EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { budgetUsage, monthRange, summarizeMonth, usageTone, type BudgetUsage } from './logic'
import { useBudget, useSaveBudget, useTransactions, type Budget } from './queries'
import { CategoryLabel, Meter, MonthSwitcher, NoCategoriesHint, TONE_TEXT, type MoneyContext } from './shared'

/** Spending against the monthly limit and each category limit. */
export function BudgetSummary({ context, usage, onEdit, onSelectCategory }: { context: MoneyContext; usage: BudgetUsage; onEdit?: () => void; onSelectCategory?: (categoryId: string) => void }) {
  const tone = usageTone(usage.percent)
  const hasLimits = usage.limit !== null || usage.categories.length > 0
  return (
    <Card
      title="Budget"
      description={usage.limit !== null ? `${context.format(usage.spent)} of ${context.format(usage.limit)} spent` : 'No monthly limit set'}
      actions={
        onEdit && context.writable ? (
          <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} onClick={onEdit}>
            {hasLimits ? 'Edit' : 'Set budget'}
          </Button>
        ) : undefined
      }
    >
      {!hasLimits ? (
        <p className="text-ui text-ink-2">Set a monthly limit, or limits per category, to see how much is left as the month goes on.</p>
      ) : (
        <div className="space-y-4">
          {usage.limit !== null && (
            <div>
              <Meter percent={usage.percent ?? 0} tone={tone} label="Monthly budget used" />
              <p className={`mt-1.5 text-xs ${TONE_TEXT[tone]}`}>
                {usage.percent}% used
                {usage.remaining !== null && usage.remaining < 0
                  ? ` · over by ${context.format(-usage.remaining)}`
                  : usage.perDay !== null
                    ? ` · ${context.format(usage.remaining ?? 0)} left, about ${context.format(usage.perDay)} a day`
                    : ''}
              </p>
            </div>
          )}
          {usage.categories.length > 0 && (
            <ul className="space-y-3">
              {usage.categories.map((item) => {
                const category = context.categoryById.get(item.categoryId)
                const row = (
                  <>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 text-ink">
                        <CategoryLabel category={category} fallback="Deleted category" />
                      </span>
                      <span className={`shrink-0 tabular-nums ${item.tone === 'ok' ? 'text-ink-2' : TONE_TEXT[item.tone]}`}>
                        {context.format(item.spent)} / {context.format(item.limit)}
                        {item.tone === 'over' && <span className="sr-only"> (over budget)</span>}
                      </span>
                    </div>
                    <Meter className="mt-1.5" percent={item.percent ?? 0} tone={item.tone} label={`${category?.name ?? 'Category'} budget used`} />
                  </>
                )
                return (
                  <li key={item.categoryId} className="animate-row">
                    {onSelectCategory ? (
                      <button type="button" className="block w-full rounded-md text-left" onClick={() => onSelectCategory(item.categoryId)}>
                        {row}
                      </button>
                    ) : (
                      row
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

export function BudgetsTab({ context, month, onMonth, onSelectCategory }: { context: MoneyContext; month: string; onMonth: (month: string) => void; onSelectCategory: (categoryId: string) => void }) {
  const budget = useBudget(context.workspace.id)
  const transactions = useTransactions(context.workspace.id, monthRange(month))
  const [editing, setEditing] = useState(false)
  const summary = useMemo(() => summarizeMonth(transactions.data ?? [], month, context.currency), [transactions.data, month, context.currency])
  const usage = useMemo(() => budgetUsage(budget.data, summary.byCategory, month), [budget.data, summary.byCategory, month])

  const unbudgeted = Object.entries(summary.byCategory)
    .filter(([categoryId]) => !budget.data?.categoryLimits[categoryId])
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} onChange={onMonth} />
      {budget.error || transactions.error ? (
        <ErrorNotice message={(budget.error ?? transactions.error)?.message} onRetry={() => (budget.error ? budget.refetch() : transactions.refetch())} />
      ) : budget.isPending || transactions.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <BudgetSummary context={context} usage={usage} onEdit={() => setEditing(true)} onSelectCategory={onSelectCategory} />
          <Card title="Spending without a category limit">
            {unbudgeted.length ? (
              <ul className="space-y-2">
                {unbudgeted.map(([categoryId, amount]) => (
                  <li key={categoryId || 'none'} className="animate-row flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 text-ink">
                      <CategoryLabel category={categoryId ? context.categoryById.get(categoryId) : undefined} />
                    </span>
                    <span className="shrink-0 text-ink-2 tabular-nums">{context.format(amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Wallet} title="Everything is covered" hint="All spending this month falls under a category limit." className="py-4" />
            )}
          </Card>
        </div>
      )}
      {editing && <BudgetDialog context={context} budget={budget.data ?? null} onClose={() => setEditing(false)} />}
    </div>
  )
}

/** Monthly limit plus optional limits per expense category (keyed by category id). */
export function BudgetDialog({ context, budget, onClose }: { context: MoneyContext; budget: Budget | null; onClose: () => void }) {
  const save = useSaveBudget(context.workspace.id)
  const categories = context.expenseCategories.filter((category) => !category.archivedAt || budget?.categoryLimits[category.id])
  const [limit, setLimit] = useState(budget?.monthlyLimit != null ? String(budget.monthlyLimit) : '')
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(budget?.categoryLimits ?? {}).map(([key, value]) => [key, String(value)])))
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parse = (value: string | undefined) => (value?.trim() ? Number(value) : null)
    const monthlyLimit = parse(limit)
    if (monthlyLimit !== null && (!Number.isFinite(monthlyLimit) || monthlyLimit < 0)) return setError('The monthly limit must be zero or more.')
    const categoryLimits: Record<string, number> = {}
    for (const category of categories) {
      const value = parse(limits[category.id])
      if (value === null || value === 0) continue
      if (!Number.isFinite(value) || value < 0) return setError(`The limit for ${category.name} must be zero or more.`)
      categoryLimits[category.id] = Math.round(value * 100) / 100
    }
    setError(null)
    await save.mutateAsync({ monthlyLimit: monthlyLimit === null ? null : Math.round(monthlyLimit * 100) / 100, categoryLimits })
    toast.success('Budget saved')
    onClose()
  }

  return (
    <Dialog
      title="Monthly budget"
      description={`Amounts in ${context.currency}. Leave a field empty for no limit. Only you can see your budget.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="budget-form" variant="primary" loading={save.isPending}>
            Save budget
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Overall monthly limit" optional>
          {(props) => <Input {...props} autoFocus type="number" inputMode="decimal" min="0" step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} />}
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-ink-2">Limits per category</legend>
          {categories.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((category) => (
                <Field key={category.id} label={<CategoryLabel category={category} />} optional>
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={limits[category.id] ?? ''}
                      onChange={(event) => setLimits((current) => ({ ...current, [category.id]: event.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : (
            <NoCategoriesHint scope="expense" />
          )}
        </fieldset>
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
