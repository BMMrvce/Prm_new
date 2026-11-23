'use client'

import { Pause, Play, Square, Timer } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { isModuleEnabled } from '@/core/modules'
import { useWorkspaces } from '@/core/workspaces'
import { duration } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { addDays, startOfDay } from '@/modules/calendar/logic'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { isOpen, useTasks } from '@/modules/tasks/queries'
import { Button } from '@/ui/button'
import { Input, Select } from '@/ui/field'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { sumSeconds } from './logic'
import { useTimeEntries } from './queries'
import { Stopwatch } from './running-timer'
import { timerLabel, useTimer } from './timer'

/** Pick an open task (or type what you are doing) and start tracking. */
export function StartTimerForm({ scope }: { scope: string | 'all' }) {
  const timer = useTimer()
  const { data: tasks = [] } = useTasks(scope)
  const { data: workspaces = [] } = useWorkspaces()
  const targets = useMemo(
    () => workspaces.filter((ws) => (scope === 'all' || ws.id === scope) && !ws.archivedAt && isModuleEnabled(ws, 'time')),
    [workspaces, scope],
  )
  const open = useMemo(() => tasks.filter((task) => isOpen(task) && targets.some((ws) => ws.id === task.workspaceId)), [tasks, targets])
  const [taskId, setTaskId] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const task = open.find((entry) => entry.id === taskId)
    const workspaceId = task?.workspaceId ?? targets[0]?.id
    if (!workspaceId || (!task && !description.trim())) return
    setBusy(true)
    try {
      await timer.start({ workspaceId, taskId: task?.id ?? null, description })
      setTaskId('')
      setDescription('')
    } finally {
      setBusy(false)
    }
  }

  if (!targets.length) return <p className="text-xs text-ink-3">Turn on Time in a workspace to track time.</p>
  return (
    <form onSubmit={submit} className="space-y-2">
      <Select value={taskId} onChange={(event) => setTaskId(event.target.value)} aria-label="Task to track" className="h-8 text-xs">
        <option value="">No task</option>
        {open.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Input
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={taskId ? 'Note (optional)' : 'What are you working on?'}
          aria-label="Timer description"
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!taskId && !description.trim()} icon={<Play size={13} aria-hidden />}>
          Start
        </Button>
      </div>
      {scope === 'all' && !taskId && targets.length > 1 && <p className="text-2xs text-ink-3">Timers without a task go to {targets[0].name}.</p>}
    </form>
  )
}

/** The running timer with controls (or a start form), and today's tracked total. */
export function TimerWidget({ scope }: WidgetProps) {
  const timer = useTimer()
  const now = useNow(60_000)
  const today = startOfDay(new Date(now ?? 0))
  const entries = useTimeEntries(now ? scope : undefined, 'me', today, addDays(today, 1))
  const tick = useNow(1_000, timer.active?.state === 'running')
  const total = sumSeconds(entries.data ?? [], tick ?? now ?? 0)
  const entry = timer.active
  const paused = entry?.state === 'paused'

  return (
    <WidgetFrame title="Time tracker" icon={<Timer size={15} />}>
      {timer.loading ? (
        <Skeleton className="h-24" />
      ) : entry ? (
        <div>
          <p className="truncate text-ui font-medium text-ink" title={timerLabel(entry)}>
            {timerLabel(entry)}
          </p>
          <p className="text-2xs text-ink-3">
            {paused ? 'Paused' : 'Tracking now'}
            {entry.workspace && scope === 'all' ? ` · ${entry.workspace.name}` : ''}
          </p>
          <Stopwatch entry={entry} className={paused ? 'mt-1 block text-3xl font-semibold text-ink-2' : 'mt-1 block text-3xl font-semibold text-ink'} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={timer.busy}
              onClick={() => (paused ? timer.resume(entry) : timer.pause(entry))}
              icon={paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button size="sm" variant="secondary" className="text-error-ink" disabled={timer.busy} onClick={() => timer.stop(entry)} icon={<Square size={11} aria-hidden />}>
              Stop
            </Button>
          </div>
        </div>
      ) : (
        <StartTimerForm scope={scope} />
      )}
      <div className="mt-3 border-t border-line-soft pt-2 text-xs text-ink-2">
        {entries.error ? (
          <ErrorNotice title="Could not load today's time" onRetry={() => void entries.refetch()} />
        ) : (
          <p className="flex justify-between">
            <span>Today</span>
            <strong className="font-semibold text-ink tabular-nums">{entries.isPending ? '…' : duration(total / 60)}</strong>
          </p>
        )}
      </div>
    </WidgetFrame>
  )
}
