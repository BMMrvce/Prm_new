'use client'

import { Check, Moon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { localDate } from '@/lib/format'
import { nextStatus, type EntryIndex, entryOn } from '@/modules/growth/logic'
import type { Habit, HabitEntryStatus } from '@/modules/growth/types'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/field'
import { useLogHabit } from './queries'

/** Logs today's state for a habit; repeating the current state clears it. */
export function useHabitLogger(workspaceId: string, index: EntryIndex, date = localDate()) {
  const log = useLogHabit(workspaceId)
  return (habit: Habit, requested: HabitEntryStatus, quantity?: number | null) => {
    const current = entryOn(index, habit.id, date)
    // Saving a new quantity on a completed entry updates it rather than clearing it.
    const status = quantity !== undefined && requested === 'completed' ? 'completed' : nextStatus(current?.status, requested)
    log.mutate({ habitId: habit.id, date, status, quantity })
  }
}

/**
 * Today's controls for one habit: a real checkbox to complete it, a toggle to mark a rest
 * day (skipped, never a failure) and, for duration and quantity habits, an inline amount.
 */
export function HabitCheck({
  habit,
  status,
  quantity,
  onLog,
  disabled,
  compact,
}: {
  habit: Habit
  status: HabitEntryStatus | undefined
  quantity: number | null
  onLog: (status: HabitEntryStatus, quantity?: number | null) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [asking, setAsking] = useState(false)
  const [amount, setAmount] = useState('')
  const needsAmount = habit.targetKind !== 'boolean'
  const done = status === 'completed'

  const onToggle = (checked: boolean) => {
    if (checked && needsAmount) {
      setAmount(habit.targetValue ? String(habit.targetValue) : '')
      setAsking(true)
      return
    }
    onLog('completed')
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    onLog('completed', Number.isFinite(value) && value > 0 ? value : null)
    setAsking(false)
  }

  if (asking)
    return (
      <form onSubmit={save} className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          autoFocus
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), setAsking(false))}
          aria-label={`${habit.targetKind === 'duration' ? 'Duration' : 'Amount'} for ${habit.title}${habit.targetUnit ? ` in ${habit.targetUnit}` : ''}`}
          className="h-8 w-20 text-xs"
        />
        {!compact && habit.targetUnit && <span className="text-2xs text-ink-3">{habit.targetUnit}</span>}
        <Button type="submit" size="sm" variant="primary">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </form>
    )

  return (
    <div className="flex shrink-0 items-center gap-1">
      {needsAmount && done && quantity !== null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setAmount(String(quantity))
            setAsking(true)
          }}
          className="rounded-md px-1.5 text-2xs text-ink-2 tabular-nums hover:bg-surface-2"
          aria-label={`Change amount for ${habit.title}`}
        >
          {quantity}
          {habit.targetValue ? `/${habit.targetValue}` : ''}
        </button>
      )}
      {!compact && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onLog('skipped')}
          aria-pressed={status === 'skipped'}
          aria-label={`Rest day for ${habit.title} (skipped, not missed)`}
          title="Rest day: skipped, not missed"
          className={cn(
            'grid size-8 place-items-center rounded-lg border disabled:opacity-50',
            status === 'skipped' ? 'border-line-strong bg-surface-3 text-ink' : 'border-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-2',
          )}
        >
          <Moon size={14} aria-hidden />
        </button>
      )}
      <label className={cn('relative grid size-8 cursor-pointer place-items-center', disabled && 'pointer-events-none opacity-50')}>
        <input
          type="checkbox"
          className="peer sr-only"
          checked={done}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={`Done today: ${habit.title}`}
        />
        <span
          aria-hidden
          className={cn(
            'grid size-6 place-items-center rounded-lg border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
            done ? 'border-success bg-success text-on-primary' : 'border-line-strong hover:border-success',
          )}
        >
          {done && <Check size={14} strokeWidth={3} className="animate-check" />}
        </span>
      </label>
    </div>
  )
}
