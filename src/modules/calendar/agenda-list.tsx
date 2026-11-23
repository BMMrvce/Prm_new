'use client'

import { CalendarPlus, CheckSquare, MapPin, Video } from 'lucide-react'
import { timeOfDay } from '@/lib/format'
import { cn } from '@/ui/cn'
import { IconTile } from '@/ui/misc'
import { describeItem, meetingTone, TASK_TONE, workspaceOf, type CalendarData, type CalendarItem } from './calendar-items'
import { isDayLong, isSafeLink, sameDate } from './logic'

/**
 * The days on screen as a list (the default on phones): each day's all-day items and
 * then its meetings and due tasks in time order. Empty days collapse to one line.
 */
export function AgendaList({
  days,
  data,
  now,
  showWorkspace,
  canCreate,
  onCreate,
  onOpen,
}: {
  days: Date[]
  data: CalendarData
  now: number
  showWorkspace: boolean
  canCreate: boolean
  onCreate: (day: Date) => void
  onOpen: (item: CalendarItem) => void
}) {
  const today = new Date(now)
  return (
    <ol className="neo-card divide-y divide-line-soft overflow-hidden rounded-xl" aria-label="Agenda">
      {days.map((day) => {
        const { allDay, timed } = data.itemsOn(day)
        const items = [...allDay, ...timed]
        const isToday = sameDate(day, today)
        const heading = day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <li key={day.toISOString()} className={cn('flex gap-3 px-3 py-3 sm:px-4', isToday && 'bg-primary-subtle/40')} aria-current={isToday ? 'date' : undefined}>
            <div className="w-12 shrink-0 text-center">
              <p className={cn('text-2xs font-medium tracking-wide uppercase', isToday ? 'text-primary-ink' : 'text-ink-3')}>{day.toLocaleDateString([], { weekday: 'short' })}</p>
              <p className={cn('mx-auto mt-0.5 grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums', isToday ? 'bg-primary text-on-primary' : 'text-ink')}>
                {day.getDate()}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="sr-only">{heading}</h3>
              {items.length ? (
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <AgendaRow key={`${item.kind}-${item.id}`} item={item} data={data} now={now} showWorkspace={showWorkspace} onOpen={onOpen} />
                  ))}
                </ul>
              ) : (
                <p className="pt-2 text-xs text-ink-3">Nothing scheduled</p>
              )}
              {canCreate && (
                <button type="button" onClick={() => onCreate(day)} className="mt-1.5 flex items-center gap-1 rounded-md px-1 py-0.5 text-2xs font-medium text-ink-3 hover:text-primary-ink">
                  <CalendarPlus size={12} aria-hidden /> Add meeting<span className="sr-only"> on {heading}</span>
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function AgendaRow({
  item,
  data,
  now,
  showWorkspace,
  onOpen,
}: {
  item: CalendarItem
  data: CalendarData
  now: number
  showWorkspace: boolean
  onOpen: (item: CalendarItem) => void
}) {
  const tone = item.kind === 'meeting' ? meetingTone(item.meeting, data.typesById) : TASK_TONE
  const workspace = showWorkspace ? workspaceOf(item, data.workspacesById) : undefined
  const label = describeItem(item, data, showWorkspace)
  const type = item.kind === 'meeting' && item.meeting.categoryId ? data.typesById.get(item.meeting.categoryId) : undefined
  const when =
    item.kind === 'meeting'
      ? item.meeting.allDay
        ? 'All day'
        : `${timeOfDay(item.meeting.startsAt)} – ${timeOfDay(item.meeting.endsAt)}`
      : isDayLong(item.task.dueAt!)
        ? 'Due today'
        : `Due ${timeOfDay(item.task.dueAt!)}`
  const ended = item.kind === 'meeting' && new Date(item.meeting.endsAt).getTime() < now
  const link = item.kind === 'meeting' && item.meeting.meetingUrl && isSafeLink(item.meeting.meetingUrl) ? item.meeting.meetingUrl : null
  return (
    <li className={cn('animate-row flex items-stretch gap-2', ended && 'opacity-60')}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`${item.kind === 'task' ? 'Task' : 'Meeting'}: ${label}`}
        className={cn('flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:brightness-95', tone.soft, item.kind === 'task' && 'border border-dashed border-primary/50')}
      >
        {item.kind === 'task' ? (
          <CheckSquare size={14} className={cn('mt-0.5 shrink-0', tone.ink)} aria-hidden />
        ) : (
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', tone.dot)} aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-ui font-medium', tone.ink)}>{item.kind === 'meeting' ? item.meeting.title : item.task.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-2">
            <span className="tabular-nums">{when}</span>
            {type && <span>{type.name}</span>}
            {item.kind === 'meeting' && item.meeting.location && (
              <span className="flex min-w-0 items-center gap-0.5">
                <MapPin size={10} aria-hidden />
                <span className="truncate">{item.meeting.location}</span>
              </span>
            )}
            {workspace && (
              <span className="flex items-center gap-1">
                <IconTile icon={workspace.icon} colorKey={workspace.color} size={14} />
                {workspace.name}
              </span>
            )}
          </span>
        </span>
      </button>
      {link && !ended && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="neo-control grid w-10 shrink-0 place-items-center rounded-lg text-primary-ink hover:bg-surface-2"
          aria-label={`Join ${item.kind === 'meeting' ? item.meeting.title : ''}`}
          title="Join"
        >
          <Video size={15} />
        </a>
      )}
    </li>
  )
}
