'use client'

import { Check, Minus } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { color } from '@/core/colors'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import {
  addDays,
  entryOn,
  formatDay,
  formatMinutes,
  habitRate,
  heatmapIntensity,
  heatmapWeeks,
  isDueOn,
  livesOn,
  longestStreak,
  WEEKDAY_SHORT,
  weekdayOf,
  weekDays,
  type EntryIndex,
  type WeekStart,
} from '@/modules/growth/logic'
import type { FocusSession, Habit, HabitEntryStatus } from '@/modules/growth/types'
import { ProgressBar } from '@/modules/growth/ui'
import { cn } from '@/ui/cn'
import { Card } from '@/ui/misc'
import { useLogHabit } from './queries'

type Props = { workspace: Workspace; habits: Habit[]; index: EntryIndex; focus: FocusSession[]; today: string }

/** This week's grid, the year heatmap with a day drill-down, and per-habit rates. */
export function HabitInsights({ workspace, habits, index, focus, today }: Props) {
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const active = useMemo(() => habits.filter((habit) => !habit.archivedAt), [habits])
  const from = addDays(today, -29)
  const rates = active
    .map((habit) => ({ habit, rate: habitRate(habit, index, from, today) }))
    .filter((item): item is { habit: Habit; rate: number } => item.rate !== null)
    .sort((a, b) => b.rate - a.rate)
  const streaks = active
    .map((habit) => ({ habit, streak: longestStreak(habit, index, today, weekStart) }))
    .filter((item) => item.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 5)

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <Card title="This week" description="Tap a past day to mark it done, then rest day, then clear.">
          <WeekGrid workspace={workspace} habits={active} index={index} today={today} />
        </Card>
      )}
      <Heatmap workspace={workspace} habits={habits} index={index} focus={focus} today={today} />
      {active.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Last 30 days" description="Share of scheduled days completed.">
            {rates.length ? (
              <ul className="space-y-3">
                {rates.map(({ habit, rate }) => (
                  <li key={habit.id} className="text-xs">
                    <div className="mb-1 flex justify-between gap-3">
                      <span className="truncate text-ink-2">{habit.title}</span>
                      <span className="font-medium text-ink tabular-nums">{rate}%</span>
                    </div>
                    <ProgressBar value={rate} label={`${habit.title}: ${rate}%`} tone={color(habit.color).dot} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">Nothing scheduled yet.</p>
            )}
          </Card>
          <Card title="Longest streaks" description="Over the last year.">
            {streaks.length ? (
              <ul className="space-y-2">
                {streaks.map(({ habit, streak }) => (
                  <li key={habit.id} className="flex items-center justify-between gap-3 text-ui">
                    <span className="truncate text-ink">{habit.title}</span>
                    <span className="shrink-0 text-ink-2 tabular-nums">
                      {streak} {habit.frequency === 'weekly' ? (streak === 1 ? 'week' : 'weeks') : streak === 1 ? 'day' : 'days'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">No streaks yet. Keep going.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

const CYCLE: Record<string, HabitEntryStatus | null> = { none: 'completed', completed: 'skipped', skipped: null }

function WeekGrid({ workspace, habits, index, today }: Omit<Props, 'focus'>) {
  const days = weekDays(today, workspace.settings.weekStart ?? 1)
  const log = useLogHabit(workspace.id)
  const writable = canWrite(workspace)
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[440px] border-separate border-spacing-1 text-xs">
        <caption className="sr-only">Habits this week</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left font-normal text-ink-3">
              <span className="sr-only">Habit</span>
            </th>
            {days.map((day) => (
              <th key={day} scope="col" className={cn('w-9 text-center font-medium', day === today ? 'text-primary-ink' : 'text-ink-3')}>
                {WEEKDAY_SHORT[weekdayOf(day)].slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => (
            <tr key={habit.id}>
              <th scope="row" className="max-w-40 truncate pr-2 text-left font-normal text-ink-2">
                {habit.title}
              </th>
              {days.map((day) => {
                const status = entryOn(index, habit.id, day)?.status
                const scheduled = isDueOn(habit, day) && habit.frequency !== 'weekly'
                const future = day > today
                const label = `${habit.title}, ${formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}: ${status === 'completed' ? 'done' : status === 'skipped' ? 'rest day' : future ? 'upcoming' : scheduled ? 'not done' : 'not scheduled'}`
                return (
                  <td key={day} className="text-center">
                    <button
                      type="button"
                      disabled={future || !writable || !livesOn({ ...habit, archivedAt: null }, day)}
                      onClick={() => log.mutate({ habitId: habit.id, date: day, status: CYCLE[status ?? 'none'] })}
                      aria-label={label}
                      title={label}
                      className={cn(
                        'mx-auto grid size-7 place-items-center rounded-md disabled:cursor-default',
                        status === 'completed'
                          ? `${color(habit.color).dot} text-on-primary`
                          : status === 'skipped'
                            ? 'bg-surface-3 text-ink-2'
                            : scheduled && !future
                              ? 'border border-line-strong bg-field hover:border-primary'
                              : 'border border-dashed border-line',
                      )}
                    >
                      {status === 'completed' && <Check size={13} strokeWidth={3} aria-hidden className="animate-check" />}
                      {status === 'skipped' && <Minus size={13} strokeWidth={3} aria-hidden />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const INTENSITY = ['bg-surface-3', 'bg-success/25', 'bg-success/50', 'bg-success/75', 'bg-success']

function Heatmap({ workspace, habits, index, focus, today }: Props) {
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const weeks = useMemo(() => heatmapWeeks(habits, index, today, weekStart), [habits, index, today, weekStart])
  const [selected, setSelected] = useState(today)
  const gridRef = useRef<HTMLDivElement>(null)
  const cells = weeks.flat()
  const cell = cells.find((item) => item.date === selected)
  const first = cells[0]?.date ?? today

  const move = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, Home: -400, End: 400 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    let next = addDays(selected, step)
    if (next < first) next = first
    if (next > today) next = today
    setSelected(next)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus())
  }

  const dayEntries = habits
    .map((habit) => ({ habit, entry: entryOn(index, habit.id, selected) }))
    .filter((item) => item.entry || (item.habit.frequency !== 'weekly' && isDueOn(item.habit, selected) && livesOn(item.habit, selected)))
  const dayFocus = focus.filter((session) => session.date === selected)

  return (
    <Card title="Activity" description="A year of habit completion. Use the arrow keys to move between days.">
      <div className="overflow-x-auto pb-1">
        <div ref={gridRef} role="group" aria-label="Habit activity by day" onKeyDown={move} className="flex w-max gap-[3px]">
          <div className="mr-1 grid grid-rows-7 gap-[3px] text-[10px] leading-[11px] text-ink-3" aria-hidden>
            {weekDays(today, weekStart).map((day, row) => (
              <span key={day} className="h-[11px]">
                {row % 2 === 1 ? WEEKDAY_SHORT[weekdayOf(day)] : ''}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].date} className="grid grid-rows-7 gap-[3px]">
              {week.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  data-day={day.date}
                  tabIndex={day.date === selected ? 0 : -1}
                  aria-pressed={day.date === selected}
                  onClick={() => setSelected(day.date)}
                  aria-label={`${formatDay(day.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${day.rate === null ? 'nothing due' : `${day.completed} of ${day.due} done`}`}
                  title={`${formatDay(day.date, { day: 'numeric', month: 'short', year: 'numeric' })}${day.rate === null ? '' : ` · ${day.completed}/${day.due}`}`}
                  className={cn('size-[11px] rounded-[2px] outline-offset-1', INTENSITY[heatmapIntensity(day.rate)], day.date === selected && 'ring-2 ring-ink-2')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-2xs text-ink-3" aria-hidden>
        Less
        {INTENSITY.map((tone) => (
          <span key={tone} className={cn('size-[11px] rounded-[2px]', tone)} />
        ))}
        More
      </div>
      <div className="animate-reveal mt-4 border-t border-line-soft pt-4" aria-live="polite" key={selected}>
        <h3 className="text-ui font-semibold text-ink">{formatDay(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
        {cell && cell.rate !== null && <p className="text-xs text-ink-2">{`${cell.completed} of ${cell.due} done${cell.skipped ? ` · ${cell.skipped} rest` : ''}`}</p>}
        {!dayEntries.length && !dayFocus.length ? (
          <p className="mt-2 text-xs text-ink-3">Nothing logged on this day.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {dayEntries.map(({ habit, entry }) => (
              <li key={habit.id} className="flex items-center gap-2 text-ui">
                <span className={cn('size-2 shrink-0 rounded-full', color(habit.color).dot)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">{habit.title}</span>
                <span className={cn('shrink-0 text-xs', entry?.status === 'completed' ? 'text-success-ink' : 'text-ink-3')}>
                  {entry?.status === 'completed' ? `Done${entry.quantity !== null ? ` · ${entry.quantity} ${habit.targetUnit ?? ''}` : ''}` : entry?.status === 'skipped' ? 'Rest day' : 'Not done'}
                </span>
              </li>
            ))}
            {dayFocus.map((session) => (
              <li key={session.id} className="flex items-center gap-2 text-ui">
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ink">Focus session</span>
                <span className="shrink-0 text-xs text-ink-2">
                  {formatMinutes(session.durationMinutes)} · concentration {session.concentration}/5
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
