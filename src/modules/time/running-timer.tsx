'use client'

import { Pause, Play, Square } from 'lucide-react'
import Link from 'next/link'
import { taskHref, workspaceHref } from '@/core/routes'
import { stopwatch } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/ui/cn'
import { secondsOf } from './logic'
import type { ActiveTimer } from './queries'
import { timerLabel, useTimer } from './timer'

/** Live HH:MM:SS for an entry; ticks every second only while it runs. */
export function Stopwatch({ entry, className }: { entry: ActiveTimer; className?: string }) {
  const now = useNow(1_000, entry.state === 'running')
  return (
    <span className={cn('tabular-nums', className)} role="timer" aria-live="off">
      {stopwatch(secondsOf(entry, now ?? Date.now()))}
    </span>
  )
}

/** Compact header pill for the active timer; renders nothing when no timer exists. */
export function RunningTimerPill() {
  const timer = useTimer()
  const entry = timer.active
  if (!entry) return null
  const paused = entry.state === 'paused'
  const label = timerLabel(entry)
  const href = entry.workspace ? (entry.taskId ? taskHref(entry.workspace.slug, entry.taskId) : workspaceHref(entry.workspace.slug, 'time')) : null
  return (
    <div
      className={cn('neo-control animate-reveal flex h-9 min-w-0 items-center gap-1.5 rounded-lg pr-1 pl-2.5', !paused && 'ring-1 ring-accent/40')}
      role="group"
      aria-label={`${paused ? 'Paused' : 'Running'} timer: ${label}`}
    >
      <span className={cn('size-2 shrink-0 rounded-full', paused ? 'bg-warning' : 'bg-accent motion-safe:animate-pulse')} aria-hidden />
      {href ? (
        <Link href={href} className="hidden max-w-40 truncate text-xs text-ink-2 hover:text-ink md:block" title={label}>
          {label}
        </Link>
      ) : (
        <span className="hidden max-w-40 truncate text-xs text-ink-2 md:block">{label}</span>
      )}
      <Stopwatch entry={entry} className={cn('text-xs font-semibold', paused ? 'text-ink-2' : 'text-ink')} />
      <button
        type="button"
        disabled={timer.busy}
        onClick={() => (paused ? timer.resume(entry) : timer.pause(entry))}
        aria-label={paused ? 'Resume timer' : 'Pause timer'}
        title={paused ? 'Resume' : 'Pause'}
        className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <button
        type="button"
        disabled={timer.busy}
        onClick={() => timer.stop(entry)}
        aria-label="Stop timer"
        title="Stop"
        className="grid size-7 place-items-center rounded-md text-error-ink hover:bg-error-light disabled:opacity-50"
      >
        <Square size={12} />
      </button>
    </div>
  )
}
