'use client'

import { Plus } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/ui/cn'
import { ItemChip, meetingTone, TASK_TONE, type CalendarData, type CalendarItem } from './calendar-items'
import { sameDate } from './logic'

const MAX_CHIPS = 3

const dayName = (day: Date) => day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * The month at a glance: whole weeks from the workspace's first weekday, up to three
 * items per day (dots on phones). Arrow keys move between days, Enter opens a day,
 * clicking empty space in a day creates a meeting on it.
 */
export function MonthGrid({
  days,
  cursor,
  data,
  now,
  showWorkspace,
  canCreate,
  onCreate,
  onOpen,
  onOpenDay,
}: {
  days: Date[]
  cursor: Date
  data: CalendarData
  now: number
  showWorkspace: boolean
  canCreate: boolean
  onCreate: (day: Date) => void
  onOpen: (item: CalendarItem) => void
  onOpenDay: (day: Date) => void
}) {
  const grid = useRef<HTMLDivElement>(null)
  const today = new Date(now)
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7))
  // One tab stop for the whole grid: today when shown, else the 1st of the month.
  const focusIndex = Math.max(
    0,
    days.findIndex((day) => sameDate(day, today) && day.getMonth() === cursor.getMonth()) === -1
      ? days.findIndex((day) => day.getDate() === 1 && day.getMonth() === cursor.getMonth())
      : days.findIndex((day) => sameDate(day, today)),
  )

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    const index = Number(target.dataset.dayIndex)
    if (Number.isNaN(index)) return
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
    let next = step === undefined ? undefined : index + step
    if (event.key === 'Home') next = index - (index % 7)
    if (event.key === 'End') next = index - (index % 7) + 6
    if (next === undefined || next < 0 || next >= days.length) return
    event.preventDefault()
    const buttons = grid.current?.querySelectorAll<HTMLButtonElement>('[data-day-index]')
    buttons?.forEach((button) => (button.tabIndex = -1))
    const button = buttons?.[next]
    if (button) {
      button.tabIndex = 0
      button.focus()
    }
  }

  return (
    <div ref={grid} role="grid" aria-label={cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })} onKeyDown={onKeyDown} className="overflow-hidden rounded-xl border border-line bg-line">
      <div role="row" className="grid grid-cols-7 border-b border-line bg-surface-2">
        {weeks[0].map((day) => (
          <div role="columnheader" key={day.getDay()} aria-label={day.toLocaleDateString([], { weekday: 'long' })} className="py-2 text-center text-2xs font-semibold tracking-wide text-ink-3 uppercase">
            <span className="sm:hidden" aria-hidden>
              {day.toLocaleDateString([], { weekday: 'narrow' })}
            </span>
            <span className="hidden sm:inline" aria-hidden>
              {day.toLocaleDateString([], { weekday: 'short' })}
            </span>
          </div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div role="row" key={week[0].toISOString()} className="grid grid-cols-7 gap-px">
          {week.map((day, dayIndex) => {
            const index = weekIndex * 7 + dayIndex
            const { allDay, timed } = data.itemsOn(day)
            const items = [...allDay, ...timed]
            const isToday = sameDate(day, today)
            const outside = day.getMonth() !== cursor.getMonth()
            const hidden = items.length - MAX_CHIPS
            return (
              <div
                role="gridcell"
                key={day.toISOString()}
                onClick={(event) => canCreate && event.target === event.currentTarget && onCreate(day)}
                className={cn(
                  'group relative flex min-h-16 min-w-0 flex-col p-1 sm:min-h-28 sm:p-1.5',
                  canCreate && 'cursor-pointer hover:bg-surface-2',
                  isToday ? 'bg-primary-subtle' : outside ? 'bg-surface-2' : 'bg-surface',
                )}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-day-index={index}
                    tabIndex={index === focusIndex ? 0 : -1}
                    onClick={() => onOpenDay(day)}
                    aria-label={`${dayName(day)}${items.length ? `, ${items.length} ${items.length === 1 ? 'item' : 'items'}` : ''}. Open day`}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'grid size-7 place-items-center rounded-full text-ui font-medium tabular-nums',
                      isToday ? 'bg-primary font-semibold text-on-primary hover:bg-primary-hover' : outside ? 'text-ink-3 hover:bg-surface-3' : 'text-ink hover:bg-surface-3',
                    )}
                  >
                    {day.getDate()}
                  </button>
                  {canCreate && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onCreate(day)}
                      aria-label={`Add meeting on ${dayName(day)}`}
                      className="hidden size-6 place-items-center rounded-md text-ink-3 group-hover:grid hover:bg-surface-3 hover:text-ink"
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>

                {/* Phones: a dot per item. */}
                {items.length > 0 && (
                  <span className="mt-auto flex justify-center gap-1 pb-1 sm:hidden" aria-hidden>
                    {items.slice(0, MAX_CHIPS).map((item) => (
                      <span
                        key={`${item.kind}-${item.id}`}
                        className={cn('size-1.5 rounded-full', item.kind === 'meeting' ? meetingTone(item.meeting, data.typesById).dot : TASK_TONE.dot)}
                      />
                    ))}
                  </span>
                )}

                <div className="mt-1 hidden min-w-0 space-y-1 sm:block">
                  {items.slice(0, MAX_CHIPS).map((item) => (
                    <ItemChip key={`${item.kind}-${item.id}`} item={item} data={data} showWorkspace={showWorkspace} onOpen={onOpen} />
                  ))}
                  {hidden > 0 && (
                    <button type="button" onClick={() => onOpenDay(day)} className="px-1.5 text-2xs font-medium text-ink-2 hover:text-ink">
                      +{hidden} more
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
