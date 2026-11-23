'use client'

import { Play, Square, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ProgressBar } from '@/modules/growth/ui'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

type Timer = { startedAt: number; targetMinutes: number }

const PRESETS = [25, 45, 60, 90]
const EVENT = 'focus-timer-change'

/**
 * The running timer lives in localStorage as a start time and a target, so a reload or a
 * trip to another page never loses it: remaining time is always computed from the clock.
 */
function storageKey(workspaceId: string) {
  return `focus-timer:${workspaceId}`
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener(EVENT, listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener(EVENT, listener)
  }
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, timer: Timer | null) {
  try {
    if (timer) window.localStorage.setItem(key, JSON.stringify(timer))
    else window.localStorage.removeItem(key)
  } catch {
    // Storage blocked: the timer still runs, it just will not survive a reload.
  }
  window.dispatchEvent(new Event(EVENT))
}

function parse(raw: string | null): Timer | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Timer>
    return typeof value.startedAt === 'number' && typeof value.targetMinutes === 'number' ? { startedAt: value.startedAt, targetMinutes: value.targetMinutes } : null
  } catch {
    return null
  }
}

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

/** Deep-work countdown. Stopping or finishing hands the minutes to `onLog`. */
export function FocusTimer({ workspaceId, onLog, disabled }: { workspaceId: string; onLog: (minutes: number, early: boolean) => void; disabled?: boolean }) {
  const key = storageKey(workspaceId)
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null)
  const timer = parse(raw)
  const [now, setNow] = useState(() => Date.now())
  const [custom, setCustom] = useState('50')

  const running = timer?.startedAt
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const elapsed = timer ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0
  const total = timer ? timer.targetMinutes * 60 : 0
  const remaining = Math.max(0, total - elapsed)
  const finished = Boolean(timer) && remaining === 0

  const start = (minutes: number) => {
    setNow(Date.now())
    write(key, { startedAt: Date.now(), targetMinutes: minutes })
  }
  const finish = (early: boolean) => {
    if (!timer) return
    write(key, null)
    onLog(early ? Math.max(1, Math.round(elapsed / 60)) : timer.targetMinutes, early)
  }

  if (!timer)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((minutes) => (
            <Button key={minutes} disabled={disabled} onClick={() => start(minutes)} className="min-w-16 flex-1">
              {minutes} min
            </Button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const minutes = Math.round(Number(custom))
            if (minutes >= 1 && minutes <= 600) start(minutes)
          }}
        >
          <Input type="number" min={1} max={600} value={custom} onChange={(event) => setCustom(event.target.value)} aria-label="Custom length in minutes" className="w-24" />
          <span className="text-xs text-ink-3">minutes</span>
          <Button type="submit" variant="primary" icon={<Play size={14} aria-hidden />} disabled={disabled} className="ml-auto">
            Start
          </Button>
        </form>
      </div>
    )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight text-ink tabular-nums" aria-hidden>
          {finished ? clock(0) : clock(remaining)}
        </p>
        <p className="sr-only" role="status">
          {finished ? `Session complete: ${timer.targetMinutes} minutes.` : `Focus session running, ${Math.ceil(remaining / 60)} minutes left.`}
        </p>
        <div className="flex gap-2">
          {finished ? (
            <Button variant="primary" onClick={() => finish(false)}>
              Log {timer.targetMinutes} minutes
            </Button>
          ) : (
            <>
              <Button icon={<Square size={13} aria-hidden />} onClick={() => finish(true)}>
                Stop and log
              </Button>
              <Button variant="ghost" icon={<X size={14} aria-hidden />} onClick={() => write(key, null)}>
                Discard
              </Button>
            </>
          )}
        </div>
      </div>
      <ProgressBar value={total ? (elapsed / total) * 100 : 0} label="Session progress" />
      <p className="text-xs text-ink-2">{finished ? 'Nice work. Log how it went.' : `${timer.targetMinutes}-minute session. Notifications off, one task open.`}</p>
    </div>
  )
}
