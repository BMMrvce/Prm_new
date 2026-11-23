'use client'

import { CheckSquare, Video } from 'lucide-react'
import { useMemo } from 'react'
import { color } from '@/core/colors'
import type { Workspace } from '@/core/types'
import { useWorkspaces } from '@/core/workspaces'
import { localDate, timeOfDay } from '@/lib/format'
import type { Category } from '@/modules/categories/queries'
import { isOpen, useTasks, type Task } from '@/modules/tasks/queries'
import { cn } from '@/ui/cn'
import { IconTile } from '@/ui/misc'
import { isDayLong, overlapsDay } from './logic'
import { useMeetings, useMeetingTypes, type Meeting } from './queries'

/** Something shown on the calendar: a meeting, or an open task on its due date. */
export type CalendarItem = { kind: 'meeting'; id: string; meeting: Meeting } | { kind: 'task'; id: string; task: Task }

export type DayItems = { allDay: CalendarItem[]; timed: CalendarItem[] }

export type Tone = { soft: string; ink: string; dot: string }

const NEUTRAL: Tone = { soft: 'bg-surface-2', ink: 'text-ink-2', dot: 'bg-ink-3' }
export const TASK_TONE: Tone = { soft: 'bg-primary-subtle', ink: 'text-primary-ink', dot: 'bg-primary' }

/**
 * Everything the calendar views need for the visible days: meetings in the range, open
 * tasks due in it, meeting types (for colors) and workspaces (on cross-workspace pages).
 */
export function useCalendarData(scope: string | 'all', days: Date[], start: Date, end: Date) {
  const meetings = useMeetings(scope, start, end)
  const tasks = useTasks(scope)
  const types = useMeetingTypes(scope)
  const { data: workspaces = [] } = useWorkspaces()

  const workspacesById = useMemo(() => new Map(workspaces.map((ws) => [ws.id, ws])), [workspaces])
  const typesById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types])

  const byDay = useMemo(() => {
    const map = new Map<string, DayItems>()
    const live = (workspaceId: string) => scope !== 'all' || !workspacesById.get(workspaceId)?.archivedAt
    const due = (tasks.data ?? []).filter((task) => task.dueAt && isOpen(task) && live(task.workspaceId))
    const list = (meetings.data ?? []).filter((meeting) => live(meeting.workspaceId))
    for (const day of days) {
      const items: DayItems = { allDay: [], timed: [] }
      for (const meeting of list) {
        if (!overlapsDay(meeting.startsAt, meeting.endsAt, day)) continue
        items[meeting.allDay ? 'allDay' : 'timed'].push({ kind: 'meeting', id: meeting.id, meeting })
      }
      const dayKey = localDate(day)
      for (const task of due) {
        if (localDate(new Date(task.dueAt!)) !== dayKey) continue
        items[isDayLong(task.dueAt!) ? 'allDay' : 'timed'].push({ kind: 'task', id: task.id, task })
      }
      items.timed.sort((a, b) => itemStart(a).localeCompare(itemStart(b)))
      map.set(dayKey, items)
    }
    return map
  }, [days, meetings.data, tasks.data, scope, workspacesById])

  return {
    byDay,
    itemsOn: (day: Date) => byDay.get(localDate(day)) ?? { allDay: [], timed: [] },
    typesById,
    workspacesById,
    loading: meetings.isPending || tasks.isPending,
    fetching: meetings.isFetching,
    error: meetings.error ?? tasks.error,
    retry: () => {
      void meetings.refetch()
      void tasks.refetch()
    },
  }
}

export type CalendarData = ReturnType<typeof useCalendarData>

export const itemStart = (item: CalendarItem) => (item.kind === 'meeting' ? item.meeting.startsAt : item.task.dueAt!)

export function meetingTone(meeting: Meeting, typesById: Map<string, Category>): Tone {
  const type = meeting.categoryId ? typesById.get(meeting.categoryId) : undefined
  if (!type) return NEUTRAL
  const tone = color(type.color)
  return { soft: tone.soft, ink: tone.ink, dot: tone.dot }
}

/** "09:30–10:15 · Weekly sync · Client call · Acme" for tooltips and screen readers. */
export function describeItem(item: CalendarItem, data: Pick<CalendarData, 'typesById' | 'workspacesById'>, showWorkspace: boolean) {
  const workspace = showWorkspace ? workspaceOf(item, data.workspacesById)?.name : undefined
  if (item.kind === 'task') {
    const time = isDayLong(item.task.dueAt!) ? 'Due' : `Due ${timeOfDay(item.task.dueAt!)}`
    return [time, item.task.title, workspace].filter(Boolean).join(' · ')
  }
  const { meeting } = item
  const when = meeting.allDay ? 'All day' : `${timeOfDay(meeting.startsAt)}–${timeOfDay(meeting.endsAt)}`
  const type = meeting.categoryId ? data.typesById.get(meeting.categoryId)?.name : undefined
  return [when, meeting.title, type, meeting.location, workspace].filter(Boolean).join(' · ')
}

export function workspaceOf(item: CalendarItem, workspacesById: Map<string, Workspace>) {
  return workspacesById.get(item.kind === 'meeting' ? item.meeting.workspaceId : item.task.workspaceId)
}

/**
 * One compact line for a meeting or task (month cells, all-day row, agenda, widgets).
 * A real button so it is reachable by keyboard; the tone carries the meeting type.
 */
export function ItemChip({
  item,
  data,
  showWorkspace,
  showTime = true,
  onOpen,
  className,
}: {
  item: CalendarItem
  data: Pick<CalendarData, 'typesById' | 'workspacesById'>
  showWorkspace: boolean
  showTime?: boolean
  onOpen: (item: CalendarItem) => void
  className?: string
}) {
  const tone = item.kind === 'meeting' ? meetingTone(item.meeting, data.typesById) : TASK_TONE
  const workspace = showWorkspace ? workspaceOf(item, data.workspacesById) : undefined
  const label = describeItem(item, data, showWorkspace)
  const timed = item.kind === 'meeting' ? !item.meeting.allDay : !isDayLong(item.task.dueAt!)
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen(item)
      }}
      title={label}
      aria-label={item.kind === 'task' ? `Task: ${label}` : `Meeting: ${label}`}
      className={cn(
        'animate-row flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-2xs hover:brightness-95',
        tone.soft,
        tone.ink,
        item.kind === 'task' && 'border border-dashed border-primary/50',
        className,
      )}
    >
      {item.kind === 'task' ? <CheckSquare size={11} className="shrink-0" aria-hidden /> : <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />}
      {showTime && timed && <span className="shrink-0 tabular-nums">{timeOfDay(itemStart(item))}</span>}
      <span className="min-w-0 flex-1 truncate font-medium">{item.kind === 'meeting' ? item.meeting.title : item.task.title}</span>
      {item.kind === 'meeting' && item.meeting.meetingUrl && <Video size={11} className="shrink-0 opacity-70" aria-hidden />}
      {workspace && <IconTile icon={workspace.icon} colorKey={workspace.color} size={14} />}
    </button>
  )
}
