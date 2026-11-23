'use client'

import { CalendarClock, CheckSquare, ChevronLeft, ChevronRight, Footprints, MessageSquare, NotebookPen, NotebookText, Pencil, PenTool, Repeat, Target, Timer, Trash2, Wallet, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { color } from '@/core/colors'
import { useCurrentWorkspace } from '@/core/workspaces'
import { duration, localDate, timeOfDay } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { useTaskPanel } from '@/modules/tasks/task-bits'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ErrorNotice, PageHeader } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { EntryForm } from './entry-form'
import { isMissingTable, useDayTimeline, useDeleteEntry, useWorkLog, type TimelineKind, type WorkLogEntry } from './queries'

/** Color code and icon per kind of activity in the day timeline. */
const KIND: Record<TimelineKind, { icon: LucideIcon; label: string; tone: string }> = {
  task: { icon: CheckSquare, label: 'Tasks', tone: 'bg-cat-blue-light text-cat-blue-ink' },
  comment: { icon: MessageSquare, label: 'Comments', tone: 'bg-cat-violet-light text-cat-violet-ink' },
  note: { icon: NotebookPen, label: 'Notes', tone: 'bg-cat-amber-light text-cat-amber-ink' },
  board: { icon: PenTool, label: 'Whiteboards', tone: 'bg-cat-pink-light text-cat-pink-ink' },
  meeting: { icon: CalendarClock, label: 'Meetings', tone: 'bg-cat-teal-light text-cat-teal-ink' },
  time: { icon: Timer, label: 'Time', tone: 'bg-cat-orange-light text-cat-orange-ink' },
  money: { icon: Wallet, label: 'Money', tone: 'bg-cat-green-light text-cat-green-ink' },
  habit: { icon: Repeat, label: 'Habits', tone: 'bg-cat-green-light text-cat-green-ink' },
  plan: { icon: Target, label: 'Priorities', tone: 'bg-cat-red-light text-cat-red-ink' },
  daynote: { icon: NotebookText, label: 'Day note', tone: 'bg-cat-slate-light text-cat-slate-ink' },
}

const pad = (value: number) => String(value).padStart(2, '0')
const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

export function WorkLogPage() {
  return (
    <ModuleGate id="worklog">
      <WorkLog />
    </ModuleGate>
  )
}

function WorkLog() {
  const workspace = useCurrentWorkspace()
  const [today] = useState(() => localDate())
  const [selected, setSelected] = useState(today)
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }))
  const weekStart = workspace.settings.weekStart ?? 1

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const from = dayKey(cursor.year, cursor.month, 1)
  const to = dayKey(cursor.year, cursor.month, daysInMonth)
  const log = useWorkLog(workspace.id, from, to)

  const byDay = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>()
    for (const entry of log.data ?? []) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return map
  }, [log.data])

  const monthMinutes = (log.data ?? []).reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)
  const loggedDays = byDay.size
  const leading = (new Date(cursor.year, cursor.month, 1).getDay() - weekStart + 7) % 7
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 7 + ((index + weekStart) % 7)).toLocaleDateString(undefined, {
      weekday: 'narrow',
    }),
  )
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })

  const moveDay = (days: number) => {
    const date = new Date(`${selected}T00:00:00`)
    date.setDate(date.getDate() + days)
    const next = localDate(date)
    setSelected(next)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
  }

  const goToday = () => {
    setSelected(today)
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })
  }

  return (
    <>
      <PageHeader
        title="Work log"
        description="Write down what you worked on. Only you can see your log."
        actions={
          <Button size="sm" variant="secondary" onClick={goToday}>
            Today
          </Button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="neo-card rounded-xl p-4" aria-label="Calendar">
          <div className="mb-3 flex items-center gap-1">
            <h2 className="flex-1 text-card font-semibold">{monthLabel}</h2>
            <IconButton label="Previous month" size="sm" variant="ghost" onClick={() => move(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton label="Next month" size="sm" variant="ghost" onClick={() => move(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="grid">
            {weekdays.map((label, index) => (
              <span key={index} className="pb-1 text-2xs font-medium text-ink-3">
                {label}
              </span>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const key = dayKey(cursor.year, cursor.month, index + 1)
              const count = byDay.get(key)?.length ?? 0
              const isSelected = key === selected
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  aria-pressed={isSelected}
                  aria-label={`${key}${count ? `, ${count} entr${count === 1 ? 'y' : 'ies'}` : ''}`}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg text-ui transition-colors',
                    isSelected
                      ? 'bg-primary font-semibold text-on-primary'
                      : count
                        ? 'bg-primary-light text-primary-ink hover:bg-primary-light/70'
                        : 'text-ink-2 hover:bg-surface-2',
                    key === today && !isSelected && 'ring-1 ring-primary',
                  )}
                >
                  {index + 1}
                  {count > 0 && (
                    <span
                      className={cn(
                        'absolute bottom-1 size-1 rounded-full',
                        isSelected ? 'bg-on-primary' : 'bg-primary',
                      )}
                      aria-hidden
                    />
                  )}
                </button>
              )
            })}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line-soft pt-3">
            <div>
              <dt className="text-2xs text-ink-3">Days logged</dt>
              <dd className="text-card font-semibold tabular-nums">{loggedDays}</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-3">Time logged</dt>
              <dd className="text-card font-semibold tabular-nums">
                {monthMinutes ? duration(monthMinutes) : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <DayPanel
          key={selected}
          workspaceId={workspace.id}
          day={selected}
          entries={byDay.get(selected) ?? []}
          loading={log.isPending}
          error={log.error}
          onRetry={() => log.refetch()}
          onMove={moveDay}
        />
      </div>
    </>
  )
}

function DayPanel({
  workspaceId,
  day,
  entries,
  loading,
  error,
  onRetry,
  onMove,
}: {
  workspaceId: string
  day: string
  entries: WorkLogEntry[]
  loading: boolean
  error: Error | null
  onRetry: () => void
  onMove: (days: number) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const remove = useDeleteEntry(workspaceId)
  const projects = useProjects(workspaceId)
  const activity = useDayTimeline(workspaceId, day)
  const counts = useMemo(() => {
    const map = new Map<TimelineKind, number>()
    for (const item of activity.data ?? []) map.set(item.kind, (map.get(item.kind) ?? 0) + 1)
    return [...map.entries()]
  }, [activity.data])
  const panel = useTaskPanel()
  const projectMap = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project])),
    [projects.data],
  )
  const total = entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)
  const title = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-5">
      <section className="neo-card rounded-xl">
        <header className="flex items-center gap-2 border-b border-line-soft px-5 py-3">
          <IconButton label="Previous day" size="sm" variant="ghost" onClick={() => onMove(-1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <h2 className="min-w-0 flex-1 truncate text-card font-semibold">{title}</h2>
          {total > 0 && <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-2xs font-semibold text-primary-ink tabular-nums">{duration(total)} logged</span>}
          <IconButton label="Next day" size="sm" variant="ghost" onClick={() => onMove(1)}>
            <ChevronRight size={16} />
          </IconButton>
        </header>
        <div className="space-y-5 p-5">
          {isMissingTable(error) ? (
            <SetupNotice />
          ) : (
            <>
              <EntryForm workspaceId={workspaceId} date={day} />
              {error ? (
                <ErrorNotice message={error.message} onRetry={onRetry} />
              ) : loading ? (
                <Skeleton className="h-20" />
              ) : entries.length ? (
                <ol className="relative space-y-1 before:absolute before:inset-y-2 before:left-[75px] before:w-px before:bg-line" aria-label="Entries">
                  {entries.map((entry) => {
                    const project = entry.projectId ? projectMap.get(entry.projectId) : undefined
                    return (
                      <li key={entry.id} className="group relative flex gap-3">
                        <span className="w-14 shrink-0 pt-2.5 text-right text-2xs text-ink-3 tabular-nums">{timeOfDay(entry.createdAt)}</span>
                        <span className="relative z-10 mt-3.5 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-surface" aria-hidden />
                        <div className="min-w-0 flex-1 rounded-lg px-3 py-2 hover:bg-surface-2">
                          {editing === entry.id ? (
                            <EntryForm workspaceId={workspaceId} date={day} entry={entry} onDone={() => setEditing(null)} />
                          ) : (
                            <div className="flex gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-ui leading-6 whitespace-pre-wrap text-ink">{entry.body}</p>
                                {(entry.minutes || project) && (
                                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
                                    {entry.minutes ? <span className="rounded-full bg-surface-3 px-2 py-0.5 font-medium text-ink-2 tabular-nums">{duration(entry.minutes)}</span> : null}
                                    {project && (
                                      <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5', color(project.color).soft, color(project.color).ink)}>
                                        <span className={cn('size-1.5 rounded-full', color(project.color).dot)} aria-hidden />
                                        {project.name}
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                                <IconButton label="Edit entry" size="sm" variant="ghost" onClick={() => setEditing(entry.id)}>
                                  <Pencil size={14} />
                                </IconButton>
                                <IconButton label="Delete entry" size="sm" variant="ghost" onClick={() => remove.mutate(entry.id, { onSuccess: () => toast.success('Entry deleted') })}>
                                  <Trash2 size={14} />
                                </IconButton>
                              </div>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="text-center text-xs text-ink-3">Nothing written for this day yet. Your automatic timeline is below.</p>
              )}
            </>
          )}
        </div>
      </section>

      <section className="neo-card rounded-xl">
        <header className="border-b border-line-soft px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Footprints size={16} className="text-ink-2" aria-hidden />
            <h2 className="text-card font-semibold">Your day, recorded automatically</h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-2">Everything you did in this workspace that day: tasks, comments, notes, boards, meetings, time, money, habits and priorities.</p>
          {counts.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Summary">
              {counts.map(([kind, count]) => {
                const { icon: KindIcon, label, tone } = KIND[kind]
                return (
                  <li key={kind} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium', tone)}>
                    <KindIcon size={11} aria-hidden /> {label} {count}
                  </li>
                )
              })}
            </ul>
          )}
        </header>
        <div className="p-5">
          {activity.isPending ? (
            <Skeleton className="h-24" />
          ) : activity.error ? (
            <ErrorNotice message={activity.error.message} onRetry={() => activity.refetch()} />
          ) : activity.data?.length ? (
            <ol className="relative space-y-3 before:absolute before:inset-y-1 before:left-[83px] before:w-px before:bg-line">
              {activity.data.map((item) => {
                const { icon: KindIcon, tone } = KIND[item.kind]
                return (
                  <li key={item.id} className="relative flex items-start gap-3 text-ui">
                    <span className="w-16 shrink-0 pt-1 text-right text-2xs text-ink-3 tabular-nums">{item.at ? timeOfDay(item.at) : 'All day'}</span>
                    <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full ring-4 ring-surface', tone)}>
                      <KindIcon size={12} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5 text-ink-2">
                      {item.text}{' '}
                      {item.taskId ? (
                        <button type="button" onClick={() => panel.open(item.taskId!)} className="font-medium text-ink hover:text-primary-ink hover:underline">
                          {item.detail}
                        </button>
                      ) : (
                        <span className="font-medium break-words text-ink">{item.detail}</span>
                      )}
                      {item.minutes ? <span className="ml-1.5 text-2xs text-ink-3 tabular-nums">{duration(item.minutes)}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-ui text-ink-3">Nothing recorded for this day yet. As you work on tasks, notes, boards, meetings and more, it shows up here.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** Shown until the work log table exists in the database. */
export function SetupNotice() {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-light px-4 py-3 text-ui text-warning-ink" role="alert">
      <p className="font-medium">The work log isn’t set up in your database yet.</p>
      <p className="mt-1">
        In Supabase, open SQL Editor → New query, paste the file <code className="font-mono text-xs">supabase/migrations/20261113000007_work_log.sql</code>, click Run, then reload this page.
        Your automatic day timeline below already works.
      </p>
    </div>
  )
}
