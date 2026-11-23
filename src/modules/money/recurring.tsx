'use client'

import { CalendarClock, CheckCircle2, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Field, Input, Select, Switch } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { toast } from '@/ui/toast'
import { advanceDueDate, dueState, monthlyCommitments, nextMonthDay, nextWeekday, ordinal, parseAmount, type Frequency } from './logic'
import { useDeleteRecurring, useMarkRecurringPaid, useRecurring, useSaveRecurring, type RecurringPayment } from './plan-queries'
import { today } from './queries'
import { Amount, categoriesFor, CategoryLabel, formatDay, KIND_LABEL, NoCategoriesHint, Stat, type MoneyContext } from './shared'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayOf = (date: string) => Number(date.slice(8, 10))
const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay()

/** "Every month on the 5th", "Every Monday", "Every year on 5 Jan"… */
function scheduleLabel(item: Pick<RecurringPayment, 'frequency' | 'nextDueDate' | 'anchorDay'>) {
  const day = item.anchorDay ?? dayOf(item.nextDueDate)
  const onDay = day >= 31 ? 'the last day' : `the ${ordinal(day)}`
  if (item.frequency === 'weekly') return `Every ${WEEKDAYS[weekdayOf(item.nextDueDate)]}`
  if (item.frequency === 'monthly') return `Every month on ${onDay}`
  if (item.frequency === 'quarterly') return `Every 3 months on ${onDay}`
  return `Every year on ${new Date(`${item.nextDueDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly' },
]

const DUE_TEXT = { overdue: 'text-error-ink', today: 'text-warning-ink', soon: 'text-ink', later: 'text-ink-2' }

export function RecurringTab({ context }: { context: MoneyContext }) {
  const { data, isPending, error, refetch } = useRecurring(context.workspace.id)
  const [editing, setEditing] = useState<RecurringPayment | 'new' | null>(null)
  const items = data ?? []
  const active = items.filter((item) => item.active)
  const paused = items.filter((item) => !item.active)
  const { out, incoming } = monthlyCommitments(items)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-2">Bills, subscriptions and regular income. Nothing is recorded until you mark it paid.</p>
        {context.writable && (
          <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
            Add recurring
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Going out each month" value={context.format(out)} note="averaged over the year" />
        <Stat label="Coming in each month" value={context.format(incoming)} />
      </div>
      {error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : items.length ? (
        <>
          <List title="Active" items={active} context={context} onEdit={setEditing} />
          {paused.length > 0 && <List title="Paused" items={paused} context={context} onEdit={setEditing} />}
        </>
      ) : (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={CalendarClock}
            title="No recurring payments yet"
            hint="Add rent, subscriptions, loan repayments or a salary to see what is due next."
            action={
              context.writable ? (
                <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
                  Add one
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {editing && <RecurringDialog context={context} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function List({ title, items, context, onEdit }: { title: string; items: RecurringPayment[]; context: MoneyContext; onEdit: (item: RecurringPayment) => void }) {
  if (!items.length) return null
  return (
    <section className="neo-card overflow-hidden rounded-xl">
      <h2 className="border-b border-line-soft px-4 py-3 text-ui font-semibold text-ink">
        {title} <span className="ml-1 text-xs font-normal text-ink-3">{items.length}</span>
      </h2>
      <ul>
        {items.map((item) => (
          <Row key={item.id} item={item} context={context} onEdit={() => onEdit(item)} />
        ))}
      </ul>
    </section>
  )
}

function Row({ item, context, onEdit }: { item: RecurringPayment; context: MoneyContext; onEdit: () => void }) {
  const save = useSaveRecurring(context.workspace.id)
  const remove = useDeleteRecurring(context.workspace.id)
  const markPaid = useMarkRecurringPaid(context.workspace.id)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const state = dueState(item.nextDueDate)
  const category = item.categoryId ? context.categoryById.get(item.categoryId) : undefined
  const frequency = scheduleLabel(item)

  return (
    <li className="animate-row flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 last:border-b-0 sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui text-ink">{item.name}</p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-2xs text-ink-2">
          {item.active && (
            <span className={cn('font-medium', DUE_TEXT[state])}>{state === 'overdue' ? `Overdue since ${formatDay(item.nextDueDate)}` : state === 'today' ? 'Due today' : `Due ${formatDay(item.nextDueDate)}`}</span>
          )}
          <span>{frequency}</span>
          <CategoryLabel category={category} />
        </p>
      </div>
      <Amount kind={item.kind} value={item.amount} format={context.format} className="text-ui" />
      {context.writable && (
        <div className="flex shrink-0 items-center gap-1">
          {item.active && (
            <Button size="sm" variant={state === 'later' ? 'ghost' : 'subtle'} icon={<CheckCircle2 size={14} aria-hidden />} loading={markPaid.isPending} onClick={() => setConfirmPaid(true)} aria-label={`Mark ${item.name} as paid`}>
              {item.kind === 'income' ? 'Received' : 'Mark paid'}
            </Button>
          )}
          <Menu
            label={`Actions for ${item.name}`}
            items={[
              { label: 'Edit', icon: <Pencil size={14} />, onSelect: onEdit },
              { label: item.active ? 'Pause' : 'Resume', icon: item.active ? <Pause size={14} /> : <Play size={14} />, onSelect: () => save.mutate({ ...item, active: !item.active }) },
              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(true) },
            ]}
            trigger={(props) => (
              <button {...props} type="button" aria-label={`Actions for ${item.name}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                <MoreHorizontal size={16} />
              </button>
            )}
          />
        </div>
      )}
      {confirmPaid && (
        <ConfirmDialog
          title={item.kind === 'income' ? 'Record this income?' : 'Mark as paid?'}
          message={
            <>
              Adds a {KIND_LABEL[item.kind].toLowerCase()} of <strong className="text-ink">{context.format(item.amount)}</strong> dated today to your transactions, and moves the next due date to{' '}
              <strong className="text-ink">{formatDay(advanceDueDate(item.nextDueDate, item.frequency))}</strong>.
            </>
          }
          confirmLabel={item.kind === 'income' ? 'Record income' : 'Mark paid'}
          tone="primary"
          busy={markPaid.isPending}
          onClose={() => setConfirmPaid(false)}
          onConfirm={() => {
            markPaid.mutate({ item, currency: context.currency }, { onSuccess: () => toast.success(`${item.name} recorded`) })
            setConfirmPaid(false)
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this recurring payment?"
          message={`“${item.name}” stops showing up. Transactions already recorded are kept.`}
          busy={remove.isPending}
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            remove.mutate(item.id, { onSuccess: () => toast.success('Recurring payment deleted') })
            setDeleting(false)
          }}
        />
      )}
    </li>
  )
}

function RecurringDialog({ context, item, onClose }: { context: MoneyContext; item?: RecurringPayment; onClose: () => void }) {
  const save = useSaveRecurring(context.workspace.id)
  const enabled = (['expense', 'income'] as const).filter((kind) => context.features.has(kind === 'expense' ? 'expenses' : 'income'))
  const kinds = enabled.length ? enabled : (['expense', 'income'] as const)
  const [kind, setKind] = useState<'expense' | 'income'>(item?.kind ?? kinds[0] ?? 'expense')
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? 'monthly')
  const [nextDueDate, setNextDueDate] = useState(item?.nextDueDate ?? today())
  // Monthly / quarterly: which day of the month. Weekly: which weekday. Yearly: a date.
  const [day, setDay] = useState(item ? (item.anchorDay ?? dayOf(item.nextDueDate)) : dayOf(today()))
  const [weekday, setWeekday] = useState(item ? weekdayOf(item.nextDueDate) : weekdayOf(today()))
  const [scheduleChanged, setScheduleChanged] = useState(!item)
  const usesDay = frequency === 'monthly' || frequency === 'quarterly'
  // An existing item keeps its due date unless the schedule was changed.
  const dueDate = !scheduleChanged && item ? item.nextDueDate : usesDay ? nextMonthDay(day) : frequency === 'weekly' ? nextWeekday(weekday) : nextDueDate
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '')
  const [active, setActive] = useState(item?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const categories = categoriesFor(context, kind)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (!name.trim()) return setError('Give it a name, like “Rent” or “Music subscription”.')
    if (value === null) return setError('Enter an amount above zero.')
    if (!dueDate) return setError('Pick when it is due.')
    setError(null)
    await save.mutateAsync({ id: item?.id, name, kind, amount: value, frequency, nextDueDate: dueDate, anchorDay: usesDay ? day : null, categoryId: categoryId || null, active })
    toast.success(item ? 'Saved' : 'Recurring payment added')
    onClose()
  }

  return (
    <Dialog
      title={item ? 'Edit recurring payment' : 'New recurring payment'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="recurring-form" variant="primary" loading={save.isPending}>
            {item ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={submit} className="space-y-4" noValidate>
        {kinds.length > 1 && (
          <Tabs
            label="Type"
            value={kind}
            onChange={(value) => {
              setKind(value)
              setCategoryId('')
            }}
            items={[
              { value: 'expense', label: 'Money out' },
              { value: 'income', label: 'Money in' },
            ]}
          />
        )}
        <Field label="Name">{(props) => <Input {...props} autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount (${context.currency})`}>
            {(props) => <Input {...props} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />}
          </Field>
          <Field label="How often">
            {(props) => (
              <Select
                {...props}
                value={frequency}
                onChange={(event) => {
                  setFrequency(event.target.value as Frequency)
                  setScheduleChanged(true)
                }}
              >
                {FREQUENCIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {usesDay ? (
            <Field label="Day of the month" hint={`Next due ${formatDay(dueDate)}.${day >= 29 ? ' Shorter months use their last day.' : ''}`}>
              {(props) => (
                <Select
                  {...props}
                  value={String(day)}
                  onChange={(event) => {
                    setDay(Number(event.target.value))
                    setScheduleChanged(true)
                  }}
                >
                  {Array.from({ length: 30 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {ordinal(index + 1)}
                    </option>
                  ))}
                  <option value={31}>Last day of the month</option>
                </Select>
              )}
            </Field>
          ) : frequency === 'weekly' ? (
            <Field label="Day of the week" hint={`Next due ${formatDay(dueDate)}.`}>
              {(props) => (
                <Select
                  {...props}
                  value={String(weekday)}
                  onChange={(event) => {
                    setWeekday(Number(event.target.value))
                    setScheduleChanged(true)
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((value) => (
                    <option key={value} value={value}>
                      {WEEKDAYS[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Next due" hint="Every year on this date.">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={nextDueDate}
                  onChange={(event) => {
                    setNextDueDate(event.target.value)
                    setScheduleChanged(true)
                  }}
                />
              )}
            </Field>
          )}
          {categories.length ? (
            <Field label="Category" optional>
              {(props) => (
                <Select {...props} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <NoCategoriesHint scope={kind} className="self-end" />
          )}
        </div>
        {item && <Switch checked={active} onChange={setActive} label="Active" description="Paused items are kept but not counted or shown as due." />}
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
