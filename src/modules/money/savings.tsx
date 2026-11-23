'use client'

import { Archive, ArchiveRestore, ChevronDown, Minus, MoreHorizontal, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { color } from '@/core/colors'
import type { ColorKey } from '@/core/types'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Field, Input } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { ColorPicker } from '@/ui/pickers'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { parseAmount, savingsProgress } from './logic'
import { useAddContribution, useDeleteContribution, useDeleteGoal, useSaveGoal, useSavingsGoals, type SavingsGoal } from './plan-queries'
import { today } from './queries'
import { formatDay, Meter, type MoneyContext } from './shared'

export function SavingsTab({ context }: { context: MoneyContext }) {
  const { data, isPending, error, refetch } = useSavingsGoals(context.workspace.id)
  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const goals = (data ?? []).filter((goal) => Boolean(goal.archivedAt) === showArchived)
  const archivedCount = (data ?? []).filter((goal) => goal.archivedAt).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-2">Progress is worked out from what you add and withdraw. Only you can see your goals.</p>
        <div className="flex items-center gap-2">
          {(archivedCount > 0 || showArchived) && (
            <Button size="sm" variant="ghost" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? 'Show active' : `Archived (${archivedCount})`}
            </Button>
          )}
          {context.writable && !showArchived && (
            <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
              New goal
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : goals.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} context={context} onEdit={() => setEditing(goal)} />
          ))}
        </div>
      ) : (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={PiggyBank}
            title={showArchived ? 'No archived goals' : 'No savings goals yet'}
            hint={showArchived ? undefined : 'Saving for a trip, a laptop or a rainy-day fund? Set a target and track every deposit.'}
            action={
              !showArchived && context.writable ? (
                <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
                  Create a goal
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {editing && <GoalDialog context={context} goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function GoalCard({ goal, context, onEdit }: { goal: SavingsGoal; context: MoneyContext; onEdit: () => void }) {
  const save = useSaveGoal(context.workspace.id)
  const remove = useDeleteGoal(context.workspace.id)
  const removeEntry = useDeleteContribution(context.workspace.id)
  const [moving, setMoving] = useState<'contribution' | 'withdrawal' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [history, setHistory] = useState(false)
  const progress = savingsProgress(goal.targetAmount, goal.contributions)
  const archived = Boolean(goal.archivedAt)

  return (
    <section className="neo-card animate-row flex flex-col rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 size-3 shrink-0 rounded', color(goal.color).dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-card font-semibold text-ink">{goal.name}</h3>
          <p className="text-xs text-ink-2 tabular-nums">
            {context.format(progress.saved)} of {context.format(goal.targetAmount)}
            {goal.targetDate && ` · by ${formatDay(goal.targetDate)}`}
          </p>
        </div>
        {context.writable && (
          <Menu
            label={`Actions for ${goal.name}`}
            items={[
              { label: 'Edit goal', icon: <Pencil size={14} />, onSelect: onEdit },
              {
                label: archived ? 'Restore' : 'Archive',
                icon: archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
                onSelect: () => save.mutate({ id: goal.id, name: goal.name, targetAmount: goal.targetAmount, targetDate: goal.targetDate, color: goal.color, archived: !archived }),
              },
              { label: 'Delete goal', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(true) },
            ]}
            trigger={(props) => (
              <button {...props} type="button" aria-label={`Actions for ${goal.name}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                <MoreHorizontal size={16} />
              </button>
            )}
          />
        )}
      </div>
      <Meter className="mt-4" percent={progress.percent} label={`${goal.name} progress`} barClass={color(goal.color).dot} />
      <p className="mt-1.5 text-xs text-ink-2">{progress.reached ? 'Target reached' : `${progress.percent}% · ${context.format(progress.remaining)} to go`}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {context.writable && !archived && (
          <>
            <Button size="sm" variant="subtle" icon={<Plus size={14} aria-hidden />} onClick={() => setMoving('contribution')}>
              Add money
            </Button>
            <Button size="sm" variant="ghost" icon={<Minus size={14} aria-hidden />} onClick={() => setMoving('withdrawal')} disabled={progress.saved <= 0}>
              Withdraw
            </Button>
          </>
        )}
        {goal.contributions.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={history} onClick={() => setHistory((value) => !value)} icon={<ChevronDown size={14} aria-hidden className={cn('transition-transform', history && 'rotate-180')} />}>
            History
          </Button>
        )}
      </div>
      {history && (
        <ul className="animate-reveal mt-3 space-y-1.5 border-t border-line-soft pt-3">
          {goal.contributions.slice(0, 50).map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 text-ink-3 tabular-nums">{formatDay(entry.occurredOn)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{entry.note || (entry.direction === 'contribution' ? 'Added' : 'Withdrawn')}</span>
              <span className={cn('tabular-nums', entry.direction === 'contribution' ? 'text-success-ink' : 'text-ink')}>
                {entry.direction === 'contribution' ? '+' : '−'}
                {context.format(entry.amount)}
              </span>
              {context.writable && !entry.id.startsWith('temp-') && (
                <IconButton label="Delete this entry" size="sm" onClick={() => removeEntry.mutate(entry.id)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {moving && <ContributionDialog context={context} goal={goal} direction={moving} max={progress.saved} onClose={() => setMoving(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this goal?"
          message={`“${goal.name}” and its ${goal.contributions.length} entries will be deleted. Archive it instead to keep the history.`}
          busy={remove.isPending}
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            remove.mutate(goal.id, { onSuccess: () => toast.success('Goal deleted') })
            setDeleting(false)
          }}
        />
      )}
    </section>
  )
}

function GoalDialog({ context, goal, onClose }: { context: MoneyContext; goal?: SavingsGoal; onClose: () => void }) {
  const save = useSaveGoal(context.workspace.id)
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [colorKey, setColorKey] = useState<ColorKey>(goal?.color ?? 'green')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = parseAmount(target)
    if (!name.trim()) return setError('Give the goal a name.')
    if (amount === null) return setError('Enter a target above zero.')
    setError(null)
    await save.mutateAsync({ id: goal?.id, name, targetAmount: amount, targetDate: targetDate || null, color: colorKey })
    toast.success(goal ? 'Goal saved' : 'Goal created')
    onClose()
  }

  return (
    <Dialog
      title={goal ? 'Edit goal' : 'New savings goal'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="goal-form" variant="primary" loading={save.isPending}>
            {goal ? 'Save' : 'Create goal'}
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name">{(props) => <Input {...props} autoFocus value={name} maxLength={120} placeholder="Emergency fund" onChange={(event) => setName(event.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Target (${context.currency})`}>
            {(props) => <Input {...props} type="number" inputMode="decimal" min="0.01" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} />}
          </Field>
          <Field label="Target date" optional>
            {(props) => <Input {...props} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />}
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">Color</p>
          <ColorPicker value={colorKey} onChange={setColorKey} />
        </div>
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}

function ContributionDialog({ context, goal, direction, max, onClose }: { context: MoneyContext; goal: SavingsGoal; direction: 'contribution' | 'withdrawal'; max: number; onClose: () => void }) {
  const add = useAddContribution(context.workspace.id)
  const [amount, setAmount] = useState('')
  const [occurredOn, setOccurredOn] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const withdrawing = direction === 'withdrawal'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (value === null) return setError('Enter an amount above zero.')
    if (withdrawing && value > max) return setError(`You can withdraw up to ${context.format(max)}.`)
    if (!occurredOn) return setError('Pick a date.')
    // Optimistic: the card updates at once; a failure rolls back and shows a toast.
    add.mutate({ goalId: goal.id, amount: value, direction, occurredOn, note: note || null })
    onClose()
  }

  return (
    <Dialog
      title={withdrawing ? `Withdraw from ${goal.name}` : `Add to ${goal.name}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="contribution-form" variant="primary">
            {withdrawing ? 'Withdraw' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="contribution-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={`Amount (${context.currency})`} hint={withdrawing ? `Saved so far: ${context.format(max)}` : undefined}>
          {(props) => <Input {...props} autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />}
        </Field>
        <Field label="Date">{(props) => <Input {...props} type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />}</Field>
        <Field label="Note" optional>
          {(props) => <Input {...props} value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} />}
        </Field>
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
