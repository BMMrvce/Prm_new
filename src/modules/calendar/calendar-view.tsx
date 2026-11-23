'use client'

import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { safeReturn } from '@/core/return-to'
import { useEffect, useMemo, useState } from 'react'
import { useWorkspaces } from '@/core/workspaces'
import { useNow } from '@/lib/use-now'
import { useTaskPanel } from '@/modules/tasks/task-bits'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Dot, ErrorNotice } from '@/ui/misc'
import { Skeleton, Spinner } from '@/ui/spinner'
import { TabPanel, Tabs } from '@/ui/tabs'
import { AgendaList } from './agenda-list'
import { useCalendarData, type CalendarItem } from './calendar-items'
import { parseDay, rangeTitle, sameDate, shiftCursor, startOfDay, visibleRange, type CalendarMode, type WeekStart } from './logic'
import { MeetingDialog, useCalendarWorkspaces, type MeetingDraft } from './meeting-dialog'
import { MonthGrid } from './month-grid'
import type { Meeting } from './queries'
import { TimeGrid } from './time-grid'

const MODES: { value: CalendarMode; label: string; key: string }[] = [
  { value: 'day', label: 'Day', key: 'd' },
  { value: 'week', label: 'Week', key: 'w' },
  { value: 'month', label: 'Month', key: 'm' },
  { value: 'agenda', label: 'Agenda', key: 'a' },
]

const isMode = (value: string | null): value is CalendarMode => MODES.some((mode) => mode.value === value)

/**
 * Meetings and task due dates for one workspace or for every workspace ('all'), by day,
 * week, month or as an agenda. `?date=YYYY-MM-DD` and `?view=day|week|month|agenda`
 * choose where it opens. Renders after mount because it depends on the viewer's clock.
 */
export function CalendarView({ scope }: { scope: string | 'all' }) {
  const now = useNow(60_000)
  if (!now) return <CalendarSkeleton />
  return <CalendarBody scope={scope} now={now} />
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading calendar">
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-[520px] w-full rounded-xl" />
    </div>
  )
}

function CalendarBody({ scope, now }: { scope: string | 'all'; now: number }) {
  const params = useSearchParams()
  const panel = useTaskPanel()
  const { data: workspaces = [] } = useWorkspaces()
  const workspace = scope === 'all' ? undefined : workspaces.find((ws) => ws.id === scope)
  const weekStart: WeekStart = workspace?.settings.weekStart ?? 1
  const canCreate = useCalendarWorkspaces(scope).length > 0

  const today = startOfDay(new Date(now))
  const [picked, setCursor] = useState<Date | null>(null)
  const [pickedMode, setMode] = useState<CalendarMode | null>(null)
  // Opened from a "+" elsewhere (?new=1&return=…): start a new meeting at the next half hour.
  const returnTo = params.get('new') === '1' ? safeReturn(params.get('return')) : null
  const router = useRouter()
  const [editing, setEditing] = useState<{ meeting?: Meeting; draft?: MeetingDraft } | null>(() => {
    if (params.get('new') !== '1') return null
    const next = new Date(now)
    const minutes = Math.ceil((next.getHours() * 60 + next.getMinutes() + 1) / 30) * 30
    return { draft: { day: startOfDay(next), minutes: Math.min(minutes, 23 * 60 + 30) } }
  })
  const closeEditor = () => {
    setEditing(null)
    if (returnTo) router.push(returnTo)
  }

  const urlView = params.get('view')
  const cursor = picked ?? parseDay(params.get('date')) ?? today
  // Phones open on the agenda; wider screens on the week.
  const mode: CalendarMode = pickedMode ?? (isMode(urlView) ? urlView : window.matchMedia('(max-width: 639px)').matches ? 'agenda' : 'week')

  const cursorTime = cursor.getTime()
  const range = useMemo(() => visibleRange(mode, new Date(cursorTime), weekStart), [mode, cursorTime, weekStart])
  const data = useCalendarData(scope, range.days, range.start, range.end)
  const showsToday = range.days.some((day) => sameDate(day, today)) && (mode !== 'month' || cursor.getMonth() === today.getMonth())
  const unit = mode === 'day' ? 'day' : mode === 'month' ? 'month' : 'week'

  const go = (direction: 1 | -1) => setCursor(shiftCursor(mode, cursor, direction))
  const openDay = (day: Date) => {
    setCursor(day)
    setMode('day')
  }
  const open = (item: CalendarItem) => (item.kind === 'meeting' ? setEditing({ meeting: item.meeting }) : panel.open(item.task.id))
  const create = (day: Date, minutes: number | null = 9 * 60) => setEditing({ draft: { day, minutes } })

  // Shortcuts: ← / → previous and next, T today, D / W / M / A views.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('dialog[open]')) return
      const key = event.key.toLowerCase()
      const inWidget = target.closest('[role="grid"], [role="tablist"]')
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !inWidget) {
        setCursor((current) => shiftCursor(mode, current ?? cursor, event.key === 'ArrowLeft' ? -1 : 1))
      } else if (key === 't') setCursor(startOfDay(new Date()))
      else if (MODES.some((entry) => entry.key === key)) setMode(MODES.find((entry) => entry.key === key)!.value)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, cursor])

  const empty = !data.loading && range.days.every((day) => {
    const items = data.itemsOn(day)
    return !items.allDay.length && !items.timed.length
  })
  const types = scope === 'all' ? [] : [...data.typesById.values()].filter((type) => !type.archivedAt)
  const common = { data, now, showWorkspace: scope === 'all', canCreate, onOpen: open }

  return (
    <section aria-label="Calendar" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setCursor(today)} disabled={showsToday} aria-keyshortcuts="t" title="Today (T)">
          Today
        </Button>
        <div className="flex">
          <IconButton label={`Previous ${unit}`} onClick={() => go(-1)} aria-keyshortcuts="ArrowLeft">
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label={`Next ${unit}`} onClick={() => go(1)} aria-keyshortcuts="ArrowRight">
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <h2 className="flex min-w-0 items-center gap-2 text-card font-semibold text-ink" aria-live="polite">
          <span className="truncate">{rangeTitle(mode, cursor, weekStart)}</span>
          {data.fetching && <Spinner size={14} className="text-ink-3" label="Loading" />}
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs idBase="calendar" label="Calendar view" items={MODES.map(({ value, label }) => ({ value, label }))} value={mode} onChange={setMode} />
          {canCreate && (
            <Button variant="primary" size="sm" icon={<CalendarPlus size={15} aria-hidden />} onClick={() => create(showsToday ? today : range.days.find((day) => day.getMonth() === cursor.getMonth()) ?? cursor)}>
              New meeting
            </Button>
          )}
        </div>
      </div>

      {types.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-2" aria-label="Meeting types">
          {types.map((type) => (
            <li key={type.id} className="flex items-center gap-1.5">
              <Dot colorKey={type.color} /> {type.name}
            </li>
          ))}
        </ul>
      )}

      {data.error && <ErrorNotice title="Could not load the calendar" message={data.error.message} onRetry={data.retry} />}

      <TabPanel idBase="calendar" value={mode} className={cn(data.loading && 'opacity-60 transition-opacity')}>
        {mode === 'month' ? (
          <MonthGrid {...common} days={range.days} cursor={cursor} onCreate={(day) => create(day)} onOpenDay={openDay} />
        ) : mode === 'agenda' ? (
          <AgendaList {...common} days={range.days} onCreate={(day) => create(day)} />
        ) : (
          <TimeGrid {...common} days={range.days} onCreate={create} onOpenDay={openDay} />
        )}
        {empty && mode !== 'agenda' && (
          <p className="mt-2 text-xs text-ink-3">
            Nothing scheduled this {unit}.{canCreate ? ' Click an empty slot or day to add a meeting.' : ''}
          </p>
        )}
      </TabPanel>

      {editing && <MeetingDialog key={editing.meeting?.id ?? 'new'} scope={scope} meeting={editing.meeting} draft={editing.draft} onClose={closeEditor} />}
    </section>
  )
}
