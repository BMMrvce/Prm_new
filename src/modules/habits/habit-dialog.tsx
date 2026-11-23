'use client'

import { useState, type FormEvent } from 'react'
import type { ColorKey, Workspace } from '@/core/types'
import { numberOrNull, WEEKDAY_SHORT, weekdayOrder, type WeekStart } from '@/modules/growth/logic'
import type { Habit, HabitFrequency, HabitTargetKind } from '@/modules/growth/types'
import { CategoryField } from '@/modules/growth/ui'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { ColorPicker } from '@/ui/pickers'
import { toast } from '@/ui/toast'
import { useSaveHabit } from './queries'

/** Create or edit a habit: what, how often, what it tracks, color and category. */
export function HabitDialog({ workspace, habit, onClose }: { workspace: Workspace; habit: Habit | null; onClose: () => void }) {
  const save = useSaveHabit(workspace.id)
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const [title, setTitle] = useState(habit?.title ?? '')
  const [categoryId, setCategoryId] = useState(habit?.categoryId ?? '')
  const [frequency, setFrequency] = useState<HabitFrequency>(habit?.frequency ?? 'daily')
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays.length ? habit.weekdays : [1, 2, 3, 4, 5])
  const [perWeek, setPerWeek] = useState(String(habit?.targetPerWeek ?? 3))
  const [targetKind, setTargetKind] = useState<HabitTargetKind>(habit?.targetKind ?? 'boolean')
  const [targetValue, setTargetValue] = useState(habit?.targetValue ? String(habit.targetValue) : '')
  const [targetUnit, setTargetUnit] = useState(habit?.targetUnit ?? '')
  const [colorKey, setColorKey] = useState<ColorKey>(habit?.color ?? 'blue')
  const [error, setError] = useState<string | null>(null)

  const toggleDay = (day: number) => setWeekdays((days) => (days.includes(day) ? days.filter((value) => value !== day) : [...days, day]))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    if (frequency === 'weekdays' && !weekdays.length) return setError('Pick at least one day.')
    const times = numberOrNull(perWeek, 1)
    if (frequency === 'weekly' && (times === null || times > 7 || !Number.isInteger(times))) return setError('Times a week must be a whole number from 1 to 7.')
    const value = numberOrNull(targetValue)
    if (targetKind !== 'boolean' && targetValue && !value) return setError('The target must be a number above zero.')
    setError(null)
    await save.mutateAsync({
      id: habit?.id,
      input: {
        title,
        categoryId: categoryId || null,
        frequency,
        weekdays,
        targetPerWeek: times,
        targetKind,
        targetValue: value || null,
        targetUnit: targetUnit || (targetKind === 'duration' ? 'minutes' : null),
        color: colorKey,
      },
    })
    toast.success(habit ? 'Habit saved' : 'Habit added')
    onClose()
  }

  return (
    <Dialog title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Habit">
          {(props) => <Input {...props} autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Read for 20 minutes" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How often">
            {(props) => (
              <Select {...props} value={frequency} onChange={(event) => setFrequency(event.target.value as HabitFrequency)}>
                <option value="daily">Every day</option>
                <option value="weekdays">On chosen days</option>
                <option value="weekly">A number of times a week</option>
              </Select>
            )}
          </Field>
          {frequency === 'weekly' && (
            <Field label="Times a week">
              {(props) => <Input {...props} type="number" min={1} max={7} step={1} value={perWeek} onChange={(event) => setPerWeek(event.target.value)} required />}
            </Field>
          )}
        </div>
        {frequency === 'weekdays' && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-2">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {weekdayOrder(weekStart).map((day) => {
                const checked = weekdays.includes(day)
                return (
                  <label
                    key={day}
                    className={cn(
                      'cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
                      checked ? 'border-primary bg-primary-light text-primary-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleDay(day)} />
                    {WEEKDAY_SHORT[day]}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Track">
            {(props) => (
              <Select {...props} value={targetKind} onChange={(event) => setTargetKind(event.target.value as HabitTargetKind)}>
                <option value="boolean">Done or not</option>
                <option value="duration">A duration</option>
                <option value="quantity">An amount</option>
              </Select>
            )}
          </Field>
          {targetKind !== 'boolean' && (
            <>
              <Field label="Target" optional>
                {(props) => <Input {...props} type="number" min={0} step="any" inputMode="decimal" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />}
              </Field>
              <Field label="Unit" optional>
                {(props) => (
                  <Input {...props} maxLength={30} value={targetUnit} onChange={(event) => setTargetUnit(event.target.value)} placeholder={targetKind === 'duration' ? 'minutes' : 'pages, glasses…'} />
                )}
              </Field>
            </>
          )}
        </div>
        <CategoryField workspace={workspace} scope="habit" value={categoryId} onChange={setCategoryId} />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-2">Color</p>
          <ColorPicker value={colorKey} onChange={setColorKey} label="Habit color" />
        </div>
        {error && (
          <p role="alert" className="text-xs text-error-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim()}>
            {habit ? 'Save habit' : 'Add habit'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
