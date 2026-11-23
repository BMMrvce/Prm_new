import { localDate } from '@/lib/format'

/**
 * Date maths for the calendar: week and month ranges that honour the workspace's first
 * day of the week, the overlapping-meeting layout of the day/week timeline, and the
 * conversion between the meeting form's local inputs and stored timestamps. Everything
 * here works in the browser's local time and is free of React, so it is unit tested.
 */

export type CalendarMode = 'day' | 'week' | 'month' | 'agenda'
/** 0 = Sunday, 1 = Monday (Workspace.settings.weekStart). */
export type WeekStart = 0 | 1

export const DAY_MINUTES = 24 * 60

export function startOfDay(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

/** Adds calendar days (safe across daylight-saving changes). */
export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Local midnight of the first day of the week containing `date`. */
export function startOfWeek(date: Date, weekStart: WeekStart) {
  const day = startOfDay(date)
  return addDays(day, -((day.getDay() - weekStart + 7) % 7))
}

/** [first day 00:00, the same weekday a week later) for the week containing `date`. */
export function weekRangeOf(date: Date, weekStart: WeekStart): [Date, Date] {
  const start = startOfWeek(date, weekStart)
  return [start, addDays(start, 7)]
}

/** Whole weeks covering the month of `cursor`, starting on the workspace's week start. */
export function monthGrid(cursor: Date, weekStart: WeekStart) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const end = addDays(startOfWeek(last, weekStart), 7)
  const days: Date[] = []
  for (let day = startOfWeek(first, weekStart); day < end; day = addDays(day, 1)) days.push(day)
  return days
}

/** The days a view shows for `cursor`. */
export function visibleDays(mode: CalendarMode, cursor: Date, weekStart: WeekStart) {
  if (mode === 'day') return [startOfDay(cursor)]
  if (mode === 'month') return monthGrid(cursor, weekStart)
  const start = startOfWeek(cursor, weekStart)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** [start, end) of what a view shows: the range to load. */
export function visibleRange(mode: CalendarMode, cursor: Date, weekStart: WeekStart) {
  const days = visibleDays(mode, cursor, weekStart)
  return { start: days[0], end: addDays(days[days.length - 1], 1), days }
}

/** The cursor one step back or forward in a view. */
export function shiftCursor(mode: CalendarMode, cursor: Date, direction: 1 | -1) {
  if (mode === 'month') return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
  return addDays(startOfDay(cursor), direction * (mode === 'day' ? 1 : 7))
}

/** "Thursday, 12 November 2026", "9 – 15 Nov 2026", "30 Nov – 6 Dec 2026" or "November 2026". */
export function rangeTitle(mode: CalendarMode, cursor: Date, weekStart: WeekStart) {
  if (mode === 'month') return cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  if (mode === 'day') return cursor.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const [first, next] = weekRangeOf(cursor, weekStart)
  const last = addDays(next, -1)
  const short = (date: Date, withYear: boolean) =>
    date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  if (first.getMonth() === last.getMonth()) return `${first.getDate()} – ${short(last, true)}`
  return `${short(first, first.getFullYear() !== last.getFullYear())} – ${short(last, true)}`
}

/** Parses a `YYYY-MM-DD` URL value as a local date. */
export function parseDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Whether [startIso, endIso) touches the local day `day`. */
export function overlapsDay(startIso: string, endIso: string, day: Date) {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = addDays(startOfDay(day), 1).getTime()
  return new Date(startIso).getTime() < dayEnd && new Date(endIso).getTime() > dayStart
}

/** Minutes since local midnight of `day`, clamped to that day. */
export function minutesInto(iso: string, day: Date) {
  const minutes = (new Date(iso).getTime() - startOfDay(day).getTime()) / 60_000
  return Math.min(DAY_MINUTES, Math.max(0, minutes))
}

/** A due time at midnight or 23:59 means "some time that day": it goes in the all-day row. */
export function isDayLong(iso: string) {
  const date = new Date(iso)
  const minutes = date.getHours() * 60 + date.getMinutes()
  return minutes === 0 || minutes >= 23 * 60 + 59
}

/** `HH:MM` of a date. */
export function clock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** `HH:MM` for a number of minutes after midnight. */
export function clockOf(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** "9 AM", "9:30 AM" (locale aware) for minutes after midnight. */
export function hourLabel(minutes: number) {
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString([], {
    hour: 'numeric',
    minute: minutes % 60 ? '2-digit' : undefined,
  })
}

// ── Overlapping blocks on the timeline ──────────────────────────────────────────────

export type Span = { start: number; end: number }
export type Placed<T> = T & { column: number; columns: number }

/**
 * Side-by-side layout for overlapping blocks (like Google Calendar): blocks that overlap,
 * directly or through a chain, form a cluster that shares the width; each block takes
 * the first column that is free at its start.
 */
export function layoutColumns<T extends Span>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const placed: Placed<T>[] = []
  let cluster: Placed<T>[] = []
  let columnEnds: number[] = []
  let clusterEnd = -Infinity
  const close = () => {
    for (const block of cluster) block.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }
  for (const item of sorted) {
    if (item.start >= clusterEnd) close()
    let column = columnEnds.findIndex((end) => end <= item.start)
    if (column === -1) column = columnEnds.push(item.end) - 1
    else columnEnds[column] = item.end
    const block = { ...item, column, columns: 1 }
    cluster.push(block)
    placed.push(block)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  close()
  return placed
}

// ── Meeting form values ⇄ timestamps ────────────────────────────────────────────────

export type MeetingTimesInput = { allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string }

/**
 * Timestamps for the form's local values. All-day meetings run from local midnight of the
 * first day to local midnight after the last day. Returns an error message when invalid.
 */
export function meetingTimes(input: MeetingTimesInput): { startsAt: Date; endsAt: Date } | { error: string } {
  const startDay = parseDay(input.startDate)
  const endDay = parseDay(input.endDate || input.startDate)
  if (!startDay || !endDay) return { error: 'Pick a date.' }
  if (input.allDay) {
    if (endDay < startDay) return { error: 'The last day cannot be before the first.' }
    return { startsAt: startDay, endsAt: addDays(endDay, 1) }
  }
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) return { error: 'Pick a start and end time.' }
  const startsAt = new Date(`${input.startDate}T${input.startTime}`)
  const endsAt = new Date(`${input.endDate || input.startDate}T${input.endTime}`)
  if (endsAt <= startsAt) return { error: 'The meeting must end after it starts.' }
  return { startsAt, endsAt }
}

/** The form's local values for stored timestamps (inverse of `meetingTimes`). */
export function meetingInputs(meeting: { startsAt: string; endsAt: string; allDay: boolean }): MeetingTimesInput {
  const starts = new Date(meeting.startsAt)
  const ends = new Date(meeting.endsAt)
  const lastDay = meeting.allDay ? addDays(ends, -1) : ends
  return {
    allDay: meeting.allDay,
    startDate: localDate(starts),
    startTime: clock(starts),
    endDate: localDate(lastDay < starts ? starts : lastDay),
    endTime: clock(ends),
  }
}

/** Accepts only http(s) links (the database rejects anything else). */
export function normaliseUrl(value: string): string | null | { error: string } {
  const text = value.trim()
  if (!text) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'Use an http:// or https:// link.' }
    return url.toString()
  } catch {
    return { error: 'That does not look like a link.' }
  }
}

/** Only http(s) links are rendered as links (defence in depth; the database checks too). */
export function isSafeLink(url: string) {
  return /^https?:\/\//i.test(url)
}
