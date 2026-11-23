'use client'

import { Clock, Pause, Play, Plus, Square } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUser } from '@/core/session'
import { useWorkspaces } from '@/core/workspaces'
import { duration, localDate } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { parseDuration } from '@/modules/tasks/logic'
import type { TaskDetail } from '@/modules/tasks/queries'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/field'
import { toast } from '@/ui/toast'
import { secondsOf } from './logic'
import { useLogTime, useTaskEntries } from './queries'
import { Stopwatch } from './running-timer'
import { timerLabel, useTimer } from './timer'

/**
 * Time on one task (for the task detail panel): logged total against the estimate,
 * start / pause / stop a timer here, and log time by hand.
 */
export function TaskTimeSection({ task }: { task: TaskDetail }) {
  const user = useUser()
  const timer = useTimer()
  const { data: workspaces = [] } = useWorkspaces()
  const workspace = workspaces.find((ws) => ws.id === task.workspaceId)
  const writable = Boolean(workspace && !workspace.archivedAt)
  const { data: entries = [], isPending, error, refetch } = useTaskEntries(task.id)
  const here = timer.active?.taskId === task.id ? timer.active : null
  const now = useNow(1_000, here?.state === 'running') ?? 0

  const [logging, setLogging] = useState(false)
  const [date, setDate] = useState(() => localDate())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const log = useLogTime()

  const total = entries.reduce((sum, entry) => sum + secondsOf(entry, now), 0) / 60
  const mine = entries.filter((entry) => entry.userId === user.id).reduce((sum, entry) => sum + secondsOf(entry, now), 0) / 60
  const estimate = task.estimateMinutes
  const ratio = estimate ? total / estimate : 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = parseDuration(amount)
    if (!minutes) return toast.error('Write the time like “1h 30m” or “45m”.')
    await log.mutateAsync({ workspaceId: task.workspaceId, taskId: task.id, date, minutes, description: note })
    toast.success(`Logged ${duration(minutes)}`)
    setAmount('')
    setNote('')
    setLogging(false)
  }

  return (
    <section aria-labelledby={`time-${task.id}`} className="space-y-2">
      <h3 id={`time-${task.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        <Clock size={13} aria-hidden /> Time
      </h3>
      {error ? (
        <button type="button" onClick={() => void refetch()} className="text-xs text-error-ink underline">
          Could not load time. Try again
        </button>
      ) : (
        <div className="text-xs">
          <p className="flex justify-between gap-2">
            <span className="text-ink-2">Logged</span>
            <span className="font-semibold text-ink tabular-nums">
              {isPending ? '…' : duration(total)}
              {estimate ? <span className="font-normal text-ink-3"> / {duration(estimate)}</span> : null}
            </span>
          </p>
          {estimate ? (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
              role="meter"
              aria-label="Time logged against the estimate"
              aria-valuemin={0}
              aria-valuemax={estimate}
              aria-valuenow={Math.round(Math.min(total, estimate))}
              aria-valuetext={`${duration(total)} of ${duration(estimate)}`}
            >
              <div className={cn('h-full rounded-full transition-[width] duration-500', ratio > 1 ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
          ) : null}
          {ratio > 1 && <p className="mt-1 text-2xs text-warning-ink">{duration(total - estimate!)} over the estimate</p>}
          {total > 0 && mine !== total && <p className="mt-1 text-2xs text-ink-3">You: {duration(mine)}</p>}
        </div>
      )}

      {writable && (
        <div className="space-y-2">
          {here ? (
            <div className="flex items-center gap-2 rounded-lg bg-accent-light px-2.5 py-1.5">
              <Stopwatch entry={here} className="flex-1 text-sm font-semibold text-accent-ink" />
              <Button
                size="sm"
                variant="ghost"
                disabled={timer.busy}
                onClick={() => (here.state === 'paused' ? timer.resume(here) : timer.pause(here))}
                icon={here.state === 'paused' ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
              >
                {here.state === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button size="sm" variant="ghost" className="text-error-ink" disabled={timer.busy} onClick={() => timer.stop(here)} icon={<Square size={11} aria-hidden />}>
                Stop
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={timer.busy}
              onClick={() => void timer.start({ workspaceId: task.workspaceId, taskId: task.id })}
              icon={<Play size={13} aria-hidden />}
              title={timer.active ? `Stops the timer on “${timerLabel(timer.active)}”` : undefined}
            >
              {timer.active ? 'Switch timer to this task' : 'Start timer'}
            </Button>
          )}
          {logging ? (
            <form onSubmit={submit} className="space-y-1.5">
              <div className="flex gap-1.5">
                <Input type="date" value={date} max={localDate()} required onChange={(event) => setDate(event.target.value)} aria-label="Date worked" className="h-8 text-xs" />
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1h 30m" aria-label="Time spent" required className="h-8 w-24 text-xs" autoFocus />
              </div>
              <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" aria-label="Note" className="h-8 text-xs" />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setLogging(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" type="submit" loading={log.isPending}>
                  Log
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setLogging(true)} icon={<Plus size={13} aria-hidden />}>
              Log time
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
