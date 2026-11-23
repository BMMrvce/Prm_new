import { entrySeconds, localDate } from '@/lib/format'
import { addDays, parseDay, startOfDay, startOfWeek, weekRangeOf, type WeekStart } from '@/modules/calendar/logic'

/**
 * Pure time-tracking maths: report ranges, what pausing or stopping a timer writes, when a
 * manual log sits in the day, and the totals behind the Time page's charts and tables.
 */

export type TimerState = 'running' | 'paused' | 'stopped'
export type EntryTimes = { state: TimerState; startedAt: string; pausedAt?: string | null; endedAt: string | null; accumulatedSeconds: number }

/** The database caps one entry at 366 days. */
export const MAX_ENTRY_SECONDS = 31_622_400

const clampSeconds = (seconds: number) => Math.min(MAX_ENTRY_SECONDS, Math.max(0, Math.floor(seconds)))

/** Seconds on an entry, counting a running timer up to `now`. */
export const secondsOf = (entry: EntryTimes, now: number) => entrySeconds(entry, now)

// ── Report ranges ───────────────────────────────────────────────────────────────────

export type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'custom'

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this-week', label: 'This week' },
  { value: 'last-week', label: 'Last week' },
  { value: 'this-month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]

/** Longest custom range (keeps the query and the chart small). */
export const MAX_RANGE_DAYS = 366

/** [start, end) for a preset; custom uses inclusive `YYYY-MM-DD` from / to dates. */
export function presetRange(preset: RangePreset, now: Date, weekStart: WeekStart, custom?: { from: string; to: string }) {
  if (preset === 'this-week') {
    const [start, end] = weekRangeOf(now, weekStart)
    return { start, end }
  }
  if (preset === 'last-week') {
    const [start] = weekRangeOf(now, weekStart)
    return { start: addDays(start, -7), end: start }
  }
  if (preset === 'this-month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) }
  let from = parseDay(custom?.from) ?? startOfDay(now)
  let to = parseDay(custom?.to) ?? from
  if (to < from) [from, to] = [to, from]
  const end = addDays(to, 1)
  return { start: from, end: end.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000 ? addDays(from, MAX_RANGE_DAYS) : end }
}

// ── Timer transitions ───────────────────────────────────────────────────────────────

/** Columns to write when pausing a running entry: the time so far is banked. */
export function pausePatch(entry: EntryTimes, now: number) {
  return {
    state: 'paused' as const,
    paused_at: new Date(now).toISOString(),
    accumulated_seconds: clampSeconds(secondsOf(entry, now)),
  }
}

/**
 * Columns to write when stopping an entry. A paused entry ends when it was paused, so the
 * idle time after a pause is never counted.
 */
export function stopPatch(entry: EntryTimes, now: number) {
  const pausedAt = entry.state === 'paused' && entry.pausedAt ? new Date(entry.pausedAt).getTime() : null
  const endedAt = Math.max(new Date(entry.startedAt).getTime(), pausedAt ?? now)
  return {
    state: 'stopped' as const,
    ended_at: new Date(endedAt).toISOString(),
    accumulated_seconds: clampSeconds(secondsOf(entry, now)),
  }
}

/**
 * When a manual log for `date` sits: ending now when logging today (so "45m" means the
 * last 45 minutes), otherwise from 09:00 that day.
 */
export function manualTimes(date: string, minutes: number, now: Date) {
  const day = parseDay(date) ?? startOfDay(now)
  const length = Math.max(1, Math.round(minutes)) * 60_000
  if (localDate(day) === localDate(now)) {
    const startedAt = new Date(Math.max(day.getTime(), now.getTime() - length))
    return { startedAt, endedAt: new Date(startedAt.getTime() + length) }
  }
  const startedAt = new Date(day)
  startedAt.setHours(9, 0, 0, 0)
  return { startedAt, endedAt: new Date(startedAt.getTime() + length) }
}

/** Moves an entry to another day, keeping its time of day and length. */
export function moveToDay(startedAt: string, date: string) {
  const day = parseDay(date)
  const start = new Date(startedAt)
  if (!day) return start
  day.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
  return day
}

// ── Totals ──────────────────────────────────────────────────────────────────────────

export type Bucket = { start: Date; end: Date; seconds: number; unit: 'day' | 'week' }

/**
 * Totals per local day of the range (per week when it is longer than nine weeks), by
 * the day each entry started.
 */
export function timeBuckets(entries: EntryTimes[], start: Date, end: Date, now: number, weekStart: WeekStart): Bucket[] {
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  const unit = days > 63 ? 'week' : 'day'
  const buckets: Bucket[] = []
  for (let from = unit === 'week' ? startOfWeek(start, weekStart) : startOfDay(start); from < end; ) {
    const to = addDays(from, unit === 'week' ? 7 : 1)
    buckets.push({ start: from, end: to, seconds: 0, unit })
    from = to
  }
  for (const entry of entries) {
    const at = new Date(entry.startedAt).getTime()
    const bucket = buckets.find((item) => at >= item.start.getTime() && at < item.end.getTime())
    if (bucket) bucket.seconds += secondsOf(entry, now)
  }
  return buckets
}

/** Seconds grouped by a key, largest first. */
export function totalsBy<T extends EntryTimes>(entries: T[], keyOf: (entry: T) => string, now: number) {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const key = keyOf(entry)
    totals.set(key, (totals.get(key) ?? 0) + secondsOf(entry, now))
  }
  return [...totals].map(([key, seconds]) => ({ key, seconds })).sort((a, b) => b.seconds - a.seconds)
}

export function sumSeconds(entries: EntryTimes[], now: number) {
  return entries.reduce((total, entry) => total + secondsOf(entry, now), 0)
}

export type EstimateRow = { id: string; title: string; estimateMinutes: number; loggedMinutes: number; ratio: number; differenceMinutes: number }

/** Estimate against time logged for tasks that have an estimate, most over first. */
export function estimateRows(tasks: { id: string; title: string; estimateMinutes: number | null }[], loggedSeconds: Map<string, number>): EstimateRow[] {
  return tasks
    .filter((task): task is typeof task & { estimateMinutes: number } => Boolean(task.estimateMinutes && task.estimateMinutes > 0))
    .map((task) => {
      const loggedMinutes = (loggedSeconds.get(task.id) ?? 0) / 60
      return {
        id: task.id,
        title: task.title,
        estimateMinutes: task.estimateMinutes,
        loggedMinutes,
        ratio: loggedMinutes / task.estimateMinutes,
        differenceMinutes: loggedMinutes - task.estimateMinutes,
      }
    })
    .sort((a, b) => b.ratio - a.ratio || a.title.localeCompare(b.title))
}
