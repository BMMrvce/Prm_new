'use client'

import { CheckSquare, Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { localDate, timeOfDay } from '@/lib/format'
import { cn } from '@/ui/cn'
import { describeItem, ItemChip, itemStart, meetingTone, workspaceOf, type CalendarData, type CalendarItem } from './calendar-items'
import { DAY_MINUTES, hourLabel, layoutColumns, minutesInto, sameDate } from './logic'
import { IconTile } from '@/ui/misc'

/** Clicks on the grid snap to half hours. */
const SNAP = 30

const dayName = (day: Date) => day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Day and week views: an hour grid with one column per day (like Google Calendar).
 * Meetings are blocks sized by their length, side by side when they overlap; tasks due at
 * a time are short dashed blocks; all-day meetings and end-of-day tasks sit in the row
 * above. Clicking an empty half hour creates a meeting there.
 */
export function TimeGrid({
  days,
  data,
  now,
  showWorkspace,
  canCreate,
  hourHeight = 48,
  onCreate,
  onOpen,
  onOpenDay,
}: {
  days: Date[]
  data: CalendarData
  now: number
  showWorkspace: boolean
  canCreate: boolean
  hourHeight?: number
  /** Create a meeting on `day`, at `minutes` after midnight, or all day when null. */
  onCreate: (day: Date, minutes: number | null) => void
  onOpen: (item: CalendarItem) => void
  onOpenDay?: (day: Date) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ day: number; minutes: number } | null>(null)
  const perMinute = hourHeight / 60
  const today = new Date(now)
  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  const week = days.length > 1
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }

  // Open on the current hour when today is shown, else on the first meeting, else 8 AM.
  const firstKey = localDate(days[0])
  useLayoutEffect(() => {
    const showsToday = days.some((day) => sameDate(day, new Date()))
    const starts = days.flatMap((day) => data.itemsOn(day).timed.map((item) => minutesInto(itemStart(item), day)))
    const target = showsToday ? new Date().getHours() * 60 : starts.length ? Math.min(...starts) : 8 * 60
    scroller.current?.scrollTo({ top: Math.max(0, (target - 60) * perMinute) })
    // Only when the shown days change, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length])

  const slotAt = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const minutes = (event.clientY - rect.top) / perMinute
    return Math.min(DAY_MINUTES - SNAP, Math.max(0, Math.floor(minutes / SNAP) * SNAP))
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className={cn(week && 'min-w-[640px]')}>
        {week && (
          <div className="grid border-b border-line bg-surface-2/60" style={columns}>
            <span aria-hidden />
            {days.map((day) => {
              const isToday = sameDate(day, today)
              return (
                <div key={day.toISOString()} className="flex justify-center border-l border-line-soft py-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenDay?.(day)}
                    aria-label={`Open ${dayName(day)}`}
                    aria-current={isToday ? 'date' : undefined}
                    className="flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-surface-3"
                  >
                    <span className={cn('text-2xs font-medium tracking-wide uppercase', isToday ? 'text-primary-ink' : 'text-ink-3')}>
                      {day.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <span className={cn('grid size-7 place-items-center rounded-full text-ui font-semibold tabular-nums', isToday ? 'bg-primary text-on-primary' : 'text-ink')}>
                      {day.getDate()}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* All-day meetings and tasks due some time that day. */}
        <div className="grid border-b border-line" style={columns}>
          <span className="self-center pr-2 text-right text-2xs font-medium text-ink-3">All day</span>
          {days.map((day) => {
            const { allDay } = data.itemsOn(day)
            return (
              <div
                key={day.toISOString()}
                className={cn('group relative min-h-9 min-w-0 space-y-1 border-l border-line-soft p-1', canCreate && 'cursor-pointer hover:bg-surface-2/60')}
                onClick={(event) => canCreate && event.target === event.currentTarget && onCreate(day, null)}
                aria-hidden={allDay.length === 0 && !canCreate ? true : undefined}
              >
                {allDay.map((item) => (
                  <ItemChip key={`${item.kind}-${item.id}`} item={item} data={data} showWorkspace={showWorkspace} showTime={false} onOpen={onOpen} />
                ))}
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => onCreate(day, 9 * 60)}
                    className="sr-only rounded-md px-1.5 py-0.5 text-2xs font-medium text-primary-ink focus:not-sr-only focus:block"
                  >
                    Add meeting on {dayName(day)}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div ref={scroller} className="h-[min(68vh,640px)] overflow-y-auto overscroll-contain">
          <div className="relative grid" style={{ ...columns, height: 24 * hourHeight }}>
            <div className="relative" aria-hidden>
              {Array.from({ length: 23 }, (_, index) => (
                <span key={index} className="absolute right-2 -translate-y-1/2 text-2xs text-ink-3 tabular-nums" style={{ top: (index + 1) * hourHeight }}>
                  {hourLabel((index + 1) * 60)}
                </span>
              ))}
            </div>
            {days.map((day, dayIndex) => {
              const isToday = sameDate(day, today)
              const blocks = layoutColumns(
                data.itemsOn(day).timed.map((item) => {
                  const start = minutesInto(itemStart(item), day)
                  const end = item.kind === 'meeting' ? Math.max(minutesInto(item.meeting.endsAt, day), start + 20) : start + 30
                  return { item, start, end }
                }),
              )
              return (
                <div
                  key={day.toISOString()}
                  role="group"
                  aria-label={dayName(day)}
                  className={cn('relative border-l border-line-soft', canCreate && 'cursor-pointer', isToday && 'bg-primary-subtle/30')}
                  style={{
                    backgroundImage:
                      'linear-gradient(to bottom, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 50%, transparent) 1px, transparent 1px)',
                    backgroundSize: `100% ${hourHeight}px, 100% ${hourHeight}px`,
                    backgroundPosition: `0 0, 0 ${hourHeight / 2}px`,
                  }}
                  onMouseMove={(event) => setHover(canCreate && event.target === event.currentTarget ? { day: dayIndex, minutes: slotAt(event) } : null)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(event) => canCreate && event.target === event.currentTarget && onCreate(day, slotAt(event))}
                >
                  {hover?.day === dayIndex && (
                    <div
                      className="pointer-events-none absolute inset-x-1 flex items-center gap-1 rounded-md border border-dashed border-primary/50 bg-primary-subtle/70 px-2 text-2xs font-medium text-primary-ink"
                      style={{ top: hover.minutes * perMinute + 1, height: SNAP * perMinute - 2 }}
                      aria-hidden
                    >
                      <Plus size={11} /> {hourLabel(hover.minutes)}
                    </div>
                  )}
                  {blocks.map(({ item, start, end, column, columns: count }) => {
                    const height = Math.max(18, (end - start) * perMinute - 2)
                    const width = 100 / count
                    const style = { top: start * perMinute + 1, height, left: `calc(${column * width}% + 2px)`, width: `calc(${width}% - 4px)` }
                    const label = describeItem(item, data, showWorkspace)
                    const tight = height < 38
                    const workspace = showWorkspace ? workspaceOf(item, data.workspacesById) : undefined
                    if (item.kind === 'task')
                      return (
                        <button
                          type="button"
                          key={`task-${item.id}`}
                          onClick={() => onOpen(item)}
                          title={label}
                          aria-label={`Task: ${label}`}
                          className="animate-row absolute z-[1] flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-dashed border-primary/60 bg-surface px-1.5 text-left text-2xs text-primary-ink shadow-sm hover:bg-primary-subtle"
                          style={style}
                        >
                          <CheckSquare size={11} className="shrink-0" aria-hidden />
                          <span className="truncate font-medium">{item.task.title}</span>
                        </button>
                      )
                    const tone = meetingTone(item.meeting, data.typesById)
                    const ended = new Date(item.meeting.endsAt).getTime() < now
                    return (
                      <button
                        type="button"
                        key={`meeting-${item.id}`}
                        onClick={() => onOpen(item)}
                        title={label}
                        aria-label={`Meeting: ${label}`}
                        className={cn(
                          'animate-row absolute z-[1] min-w-0 overflow-hidden rounded-md py-0.5 pr-1.5 pl-2.5 text-left shadow-sm hover:brightness-95',
                          tone.soft,
                          tone.ink,
                          tight && 'flex items-center gap-1.5',
                          ended && 'opacity-60',
                        )}
                        style={style}
                      >
                        <span className={cn('absolute inset-y-0 left-0 w-[3px]', tone.dot)} aria-hidden />
                        <span className={cn('flex min-w-0 items-center gap-1 truncate text-xs font-semibold', tight && 'flex-1')}>
                          {workspace && <IconTile icon={workspace.icon} colorKey={workspace.color} size={14} />}
                          <span className="truncate">{item.meeting.title}</span>
                        </span>
                        <span className={cn('block truncate text-2xs opacity-80 tabular-nums', tight && 'shrink-0')}>
                          {timeOfDay(item.meeting.startsAt)}
                          {!tight && `–${timeOfDay(item.meeting.endsAt)}`}
                          {!tight && item.meeting.location ? ` · ${item.meeting.location}` : ''}
                        </span>
                      </button>
                    )
                  })}
                  {isToday && (
                    <div className="pointer-events-none absolute inset-x-0 z-[2] flex items-center" style={{ top: nowMinutes * perMinute }} aria-hidden>
                      <span className="-ml-1 size-2.5 rounded-full bg-error" />
                      <span className="h-0.5 flex-1 bg-error" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
