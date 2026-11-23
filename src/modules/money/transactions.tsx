'use client'

import { Download, MoreHorizontal, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { downloadCsv, toCsv } from '@/lib/csv'
import { Button } from '@/ui/button'
import { ConfirmDialog } from '@/ui/dialog'
import { Input, Select } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { monthKey, monthLabel, monthRange, monthsWindow, round, type TransactionKind } from './logic'
import { useDeleteTransaction, useTransactions, type Transaction } from './queries'
import { Amount, CategoryLabel, formatDay, KIND_LABEL, MonthSwitcher, type MoneyContext } from './shared'
import { entryKinds, TransactionDialog } from './transaction-dialog'

export type TransactionFilters = {
  month: string
  /** One month, or the twelve months up to this one. */
  range: 'month' | 'year'
  kind: 'all' | Exclude<TransactionKind, 'reimbursement'>
  /** '' = any, 'none' = uncategorised, otherwise a category id. */
  categoryId: string
  search: string
}

export const defaultFilters = (): TransactionFilters => ({ month: monthKey(), range: 'month', kind: 'all', categoryId: '', search: '' })

export function TransactionsTab({ context, filters, onFilters }: { context: MoneyContext; filters: TransactionFilters; onFilters: (filters: TransactionFilters) => void }) {
  const span = filters.range === 'month' ? monthRange(filters.month) : monthsWindow(monthKey(), 12)
  const { data, isPending, error, refetch, isPlaceholderData } = useTransactions(context.workspace.id, span)
  const remove = useDeleteTransaction(context.workspace.id)
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const search = useDeferredValue(filters.search.trim().toLowerCase())
  const set = (changes: Partial<TransactionFilters>) => onFilters({ ...filters, ...changes })
  const kinds = entryKinds(context)

  const shown = useMemo(
    () =>
      (data ?? []).filter((entry) => {
        if (filters.kind !== 'all' && entry.kind !== filters.kind) return false
        if (filters.categoryId === 'none' ? entry.categoryId !== null : filters.categoryId && entry.categoryId !== filters.categoryId) return false
        if (!search) return true
        const category = entry.categoryId ? context.categoryById.get(entry.categoryId)?.name ?? '' : ''
        return [entry.description, entry.note ?? '', entry.paymentMethod ?? '', category].some((text) => text.toLowerCase().includes(search))
      }),
    [data, filters.kind, filters.categoryId, search, context.categoryById],
  )

  const totals = useMemo(() => {
    let incoming = 0
    let out = 0
    for (const entry of shown) {
      if (entry.currency !== context.currency) continue
      if (entry.kind === 'income') incoming += entry.amount
      else if (entry.kind === 'expense') out += entry.amount
    }
    return { incoming: round(incoming), out: round(out) }
  }, [shown, context.currency])

  const exportCsv = () => {
    const rows = shown.map((entry) => [
      entry.occurredOn,
      KIND_LABEL[entry.kind],
      entry.description,
      entry.categoryId ? context.categoryById.get(entry.categoryId)?.name ?? '' : '',
      entry.amount.toFixed(2),
      entry.currency,
      entry.paymentMethod ?? '',
      entry.note ?? '',
    ])
    const period = filters.range === 'month' ? filters.month : `${span.from.slice(0, 7)}-to-${filters.month}`
    downloadCsv(`transactions-${context.workspace.slug}-${period}.csv`, toCsv(['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Payment method', 'Note'], rows))
  }

  const categories = [...context.expenseCategories, ...context.incomeCategories]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filters.range === 'month' ? <MonthSwitcher month={filters.month} onChange={(month) => set({ month })} /> : <p className="text-ui font-semibold text-ink">Last 12 months</p>}
          <Button size="sm" variant="ghost" onClick={() => set({ range: filters.range === 'month' ? 'year' : 'month', month: monthKey() })}>
            {filters.range === 'month' ? 'Show last 12 months' : 'Show one month'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Download size={14} aria-hidden />} onClick={exportCsv} disabled={!shown.length}>
            Export CSV
          </Button>
          {context.writable && kinds.length > 0 && (
            <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
              Add
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input type="search" aria-label="Search transactions" placeholder="Search description, note, category" className="pl-8" value={filters.search} onChange={(event) => set({ search: event.target.value })} />
        </div>
        <Select aria-label="Filter by type" value={filters.kind} onChange={(event) => set({ kind: event.target.value as TransactionFilters['kind'] })}>
          <option value="all">All types</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by category" value={filters.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </Select>
      </div>

      <section className="neo-card overflow-hidden rounded-xl" aria-busy={isPlaceholderData || undefined}>
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-4 py-3">
          <h2 className="text-ui font-semibold text-ink">
            {filters.range === 'month' ? monthLabel(filters.month) : 'Last 12 months'}
            <span className="ml-2 text-xs font-normal text-ink-3">{shown.length} shown</span>
          </h2>
          <p className="text-xs text-ink-2 tabular-nums">
            In <span className="font-medium text-success-ink">{context.format(totals.incoming)}</span> · Out <span className="font-medium text-ink">{context.format(totals.out)}</span>
          </p>
        </header>
        {error ? (
          <div className="p-4">
            <ErrorNotice message={error.message} onRetry={() => refetch()} />
          </div>
        ) : isPending ? (
          <div className="space-y-2 p-4" aria-label="Loading transactions">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : shown.length ? (
          <ul className={isPlaceholderData ? 'opacity-60' : undefined}>
            {shown.map((entry) => (
              <TransactionRow key={entry.id} entry={entry} context={context} onEdit={() => setEditing(entry)} onDelete={() => setDeleting(entry)} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Receipt}
            title={data?.length ? 'Nothing matches these filters' : 'No transactions in this period'}
            hint={data?.length ? 'Clear the search or pick another type or category.' : 'Add expenses and income as they happen to see where your money goes.'}
            action={
              data?.length ? (
                <Button size="sm" onClick={() => set({ kind: 'all', categoryId: '', search: '' })}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </section>

      {editing && <TransactionDialog context={context} transaction={editing === 'new' ? undefined : editing} initialKind={filters.kind === 'all' ? undefined : filters.kind} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this transaction?"
          message={`“${deleting.description}” (${context.format(deleting.amount)}) will be removed for good.`}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            remove.mutate(deleting, { onSuccess: () => toast.success('Transaction deleted') })
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function TransactionRow({ entry, context, onEdit, onDelete }: { entry: Transaction; context: MoneyContext; onEdit: () => void; onDelete: () => void }) {
  const category = entry.categoryId ? context.categoryById.get(entry.categoryId) : undefined
  return (
    <li className="animate-row flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60">
      <span className="hidden w-16 shrink-0 text-xs text-ink-3 tabular-nums sm:block">{formatDay(entry.occurredOn)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui text-ink">{entry.description}</p>
        <p className="flex min-w-0 items-center gap-2 text-2xs text-ink-2">
          <span className="sm:hidden">{formatDay(entry.occurredOn)}</span>
          {entry.kind === 'transfer' ? <span>Transfer</span> : <CategoryLabel category={category} />}
          {entry.paymentMethod && <span className="truncate text-ink-3">· {entry.paymentMethod}</span>}
        </p>
      </div>
      <div className="text-right">
        <Amount kind={entry.kind} value={entry.amount} format={(value) => (entry.currency === context.currency ? context.format(value) : `${entry.currency} ${value.toFixed(2)}`)} className="text-ui" />
      </div>
      {context.writable && (
        <Menu
          label={`Actions for ${entry.description}`}
          items={[
            { label: 'Edit', icon: <Pencil size={14} />, onSelect: onEdit },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
          ]}
          trigger={(props) => (
            <button {...props} type="button" aria-label={`Actions for ${entry.description}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
              <MoreHorizontal size={16} />
            </button>
          )}
        />
      )}
    </li>
  )
}
