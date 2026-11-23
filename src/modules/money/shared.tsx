'use client'

import { ChevronLeft, ChevronRight, Tags } from 'lucide-react'
import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { color } from '@/core/colors'
import { moduleOption } from '@/core/modules'
import { workspaceHref } from '@/core/routes'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import { DEFAULT_CURRENCY, money } from '@/lib/format'
import { useCategories, useSeedCategories, type Category } from '@/modules/categories/queries'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { monthKey, monthLabel, shiftMonth, type Tone } from './logic'

export type MoneyFeature = 'expenses' | 'income' | 'claims' | 'budgets' | 'savings' | 'recurring'

/** Everything the money screens share: workspace, currency, enabled features and categories. */
export function useMoney() {
  const workspace = useCurrentWorkspace()
  const currency = workspace.settings.currency ?? DEFAULT_CURRENCY
  const features = useMemo(() => new Set(moduleOption<string[]>(workspace, 'money', 'features') ?? []) as Set<MoneyFeature>, [workspace])
  const expense = useCategories(workspace.id, 'expense')
  const income = useCategories(workspace.id, 'income')
  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const category of [...(expense.data ?? []), ...(income.data ?? [])]) map.set(category.id, category)
    return map
  }, [expense.data, income.data])
  return {
    workspace,
    currency,
    format: (value: number) => money(value, currency),
    features,
    writable: canWrite(workspace),
    expenseCategories: expense.data ?? [],
    incomeCategories: income.data ?? [],
    categoriesLoading: expense.isPending || income.isPending,
    categoryById,
  }
}

export type MoneyContext = ReturnType<typeof useMoney>

/** Categories offered for a kind of entry (archived ones are kept for old records only). */
export function categoriesFor(context: MoneyContext, kind: string) {
  const list = kind === 'income' ? context.incomeCategories : context.expenseCategories
  return list.filter((category) => !category.archivedAt)
}

export function CategoryLabel({ category, fallback = 'Uncategorised' }: { category: Category | undefined; fallback?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={cn('size-2 shrink-0 rounded-full', category ? color(category.color).dot : 'bg-line-strong')} aria-hidden />
      <span className="truncate">{category?.name ?? fallback}</span>
    </span>
  )
}

/** Shown where a category list is empty: seed suggestions or go to Settings → Categories. */
export function NoCategoriesHint({ scope, className }: { scope: 'expense' | 'income'; className?: string }) {
  const workspace = useCurrentWorkspace()
  const seed = useSeedCategories(workspace.id, scope)
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-xs text-ink-2', className)}>
      <Tags size={14} className="shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 flex-1">No {scope} categories yet.</span>
      {canWrite(workspace) && (
        <Button size="sm" variant="subtle" loading={seed.isPending} onClick={() => seed.mutate()}>
          Use suggestions
        </Button>
      )}
      <Link href={`${workspaceHref(workspace.slug, 'settings')}?tab=categories`} className="font-medium text-primary-ink underline-offset-2 hover:underline">
        Manage categories
      </Link>
    </div>
  )
}

export function MonthSwitcher({ month, onChange, className }: { month: string; onChange: (month: string) => void; className?: string }) {
  const current = monthKey()
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <IconButton label="Previous month" size="sm" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={16} />
      </IconButton>
      <p className="min-w-32 text-center text-ui font-semibold text-ink tabular-nums" aria-live="polite">
        {monthLabel(month)}
      </p>
      <IconButton label="Next month" size="sm" onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= current}>
        <ChevronRight size={16} />
      </IconButton>
      {month !== current && (
        <Button size="sm" variant="ghost" onClick={() => onChange(current)}>
          This month
        </Button>
      )}
    </div>
  )
}

const TONE_BAR: Record<Tone, string> = { ok: 'bg-primary', warn: 'bg-warning', over: 'bg-error' }

/** A thin progress bar; `barClass` overrides the tone color (e.g. a goal's own color). */
export function Meter({ percent, tone = 'ok', label, barClass, className }: { percent: number; tone?: Tone; label: string; barClass?: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', barClass ?? TONE_BAR[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export const TONE_TEXT: Record<Tone, string> = { ok: 'text-ink-2', warn: 'text-warning-ink', over: 'text-error-ink' }

export function Stat({ label, value, note, noteTone = 'ok', onClick }: { label: string; value: ReactNode; note?: ReactNode; noteTone?: Tone; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold text-ink tabular-nums">{value}</p>
      {note && <p className={cn('mt-0.5 truncate text-2xs', TONE_TEXT[noteTone])}>{note}</p>}
    </>
  )
  const className = 'neo-card animate-row min-w-0 rounded-xl px-4 py-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, 'hover:border-line-strong')}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

export const KIND_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer', reimbursement: 'Claim' }

/** Signed, colored amount: income in green, spending in the default ink. */
export function Amount({ kind, value, format, className }: { kind: string; value: number; format: (value: number) => string; className?: string }) {
  const sign = kind === 'income' ? '+' : kind === 'expense' ? '−' : ''
  return <span className={cn('font-semibold whitespace-nowrap tabular-nums', kind === 'income' ? 'text-success-ink' : 'text-ink', className)}>{`${sign}${format(value)}`}</span>
}

export function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString([], { day: 'numeric', month: 'short', year: year === new Date().getFullYear() ? undefined : 'numeric' })
}
