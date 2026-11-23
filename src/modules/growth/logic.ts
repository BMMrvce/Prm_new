import { localDate } from '@/lib/format'
import type { Book, FocusSession, Goal, Habit, HabitEntry, LearningStatus, Milestone, ReadingSession } from './types'

/**
 * Pure logic for the growth modules: day keys, habit schedules, streaks, weekly targets,
 * heatmap cells and progress figures. Days are `YYYY-MM-DD` strings in local time, so
 * nothing here depends on timezones once the key is made.
 */

export type WeekStart = 0 | 1
export type DayKey = string

// ── Day keys ────────────────────────────────────────────────────────────────────────

export function parseDay(key: DayKey) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = parseDay(key)
  date.setDate(date.getDate() + days)
  return localDate(date)
}

export const weekdayOf = (key: DayKey) => parseDay(key).getDay()

/** The local day an ISO timestamp falls on. */
export const dayOf = (iso: string): DayKey => localDate(new Date(iso))

export function startOfWeek(key: DayKey, weekStart: WeekStart = 1): DayKey {
  return addDays(key, -((weekdayOf(key) - weekStart + 7) % 7))
}

/** The seven days of the week containing `key`. */
export function weekDays(key: DayKey, weekStart: WeekStart = 1): DayKey[] {
  const start = startOfWeek(key, weekStart)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Every day from `from` to `to`, both included. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = []
  for (let key = from; key <= to && days.length < 4000; key = addDays(key, 1)) days.push(key)
  return days
}

/** Weekday names in display order for a week start (index = position, value = 0–6). */
export function weekdayOrder(weekStart: WeekStart = 1) {
  return Array.from({ length: 7 }, (_, index) => (index + weekStart) % 7)
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDay(key: DayKey, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return parseDay(key).toLocaleDateString([], options)
}

// ── Habit schedules ─────────────────────────────────────────────────────────────────

/** How far back habit entries are loaded: enough for a 53-week heatmap. */
export const ENTRY_WINDOW_DAYS = 371

/** Whether a habit is scheduled on a day. Weekly habits can be logged any day. */
export function isDueOn(habit: Pick<Habit, 'frequency' | 'weekdays'>, key: DayKey) {
  if (habit.frequency === 'weekdays') return habit.weekdays.includes(weekdayOf(key))
  return true
}

/** Whether the habit existed on a day (created on or before it, not archived yet). */
export function livesOn(habit: Pick<Habit, 'createdAt' | 'archivedAt'>, key: DayKey) {
  return dayOf(habit.createdAt) <= key && (!habit.archivedAt || key < dayOf(habit.archivedAt))
}

export type EntryIndex = Map<string, Map<DayKey, HabitEntry>>

/** Entries by habit, then by day, so lookups in loops are O(1). */
export function indexEntries(entries: HabitEntry[]): EntryIndex {
  const index: EntryIndex = new Map()
  for (const entry of entries) {
    let byDay = index.get(entry.habitId)
    if (!byDay) index.set(entry.habitId, (byDay = new Map()))
    byDay.set(entry.date, entry)
  }
  return index
}

export const entryOn = (index: EntryIndex, habitId: string, key: DayKey) => index.get(habitId)?.get(key)

/** Logging the state already shown clears it (undo); anything else sets it. */
export function nextStatus(current: HabitEntry['status'] | undefined, requested: HabitEntry['status']) {
  return current === requested ? null : requested
}

/** Completed entries in the week starting `weekStartKey`. */
export function weekCompletions(habitId: string, index: EntryIndex, weekStartKey: DayKey) {
  const byDay = index.get(habitId)
  if (!byDay) return 0
  let count = 0
  for (let offset = 0; offset < 7; offset++) if (byDay.get(addDays(weekStartKey, offset))?.status === 'completed') count++
  return count
}

function earliestEntry(habitId: string, index: EntryIndex) {
  let earliest: DayKey | null = null
  for (const key of index.get(habitId)?.keys() ?? []) if (earliest === null || key < earliest) earliest = key
  return earliest
}

/**
 * Current streak: consecutive due days completed (or, for weekly habits, consecutive
 * weeks that met the target), counting back from today. Skipped days neither extend
 * nor break it; today (or this week) gets grace while it is still in progress.
 */
export function currentStreak(habit: Habit, index: EntryIndex, today: DayKey, weekStart: WeekStart = 1) {
  if (habit.frequency === 'weekly') {
    const target = habit.targetPerWeek ?? 1
    const thisWeek = startOfWeek(today, weekStart)
    const firstWeek = startOfWeek(earliestEntry(habit.id, index) ?? today, weekStart)
    let streak = 0
    for (let week = thisWeek; week >= firstWeek; week = addDays(week, -7)) {
      if (weekCompletions(habit.id, index, week) >= target) streak++
      else if (week !== thisWeek) break
    }
    return streak
  }
  const byDay = index.get(habit.id)
  const earliest = earliestEntry(habit.id, index)
  if (!byDay || !earliest) return 0
  let streak = 0
  for (let key = today; key >= earliest; key = addDays(key, -1)) {
    if (!isDueOn(habit, key)) continue
    const status = byDay.get(key)?.status
    if (status === 'completed') streak++
    else if (status !== 'skipped' && key !== today) break
  }
  return streak
}

/** Longest streak over the loaded window, in days (or weeks for weekly habits). */
export function longestStreak(habit: Habit, index: EntryIndex, today: DayKey, weekStart: WeekStart = 1) {
  const earliest = earliestEntry(habit.id, index)
  if (!earliest) return 0
  let longest = 0
  let current = 0
  if (habit.frequency === 'weekly') {
    const target = habit.targetPerWeek ?? 1
    const thisWeek = startOfWeek(today, weekStart)
    for (let week = startOfWeek(earliest, weekStart); week <= thisWeek; week = addDays(week, 7)) {
      if (weekCompletions(habit.id, index, week) >= target) longest = Math.max(longest, ++current)
      else if (week !== thisWeek) current = 0
    }
    return longest
  }
  const byDay = index.get(habit.id)!
  for (let key = earliest; key <= today; key = addDays(key, 1)) {
    if (!isDueOn(habit, key)) continue
    const status = byDay.get(key)?.status
    if (status === 'completed') longest = Math.max(longest, ++current)
    else if (status !== 'skipped' && key !== today) current = 0
  }
  return longest
}

export type DayStats = { date: DayKey; due: number; completed: number; skipped: number; rate: number | null }

/**
 * One day across habits. Scheduled habits count as due; weekly habits (and work done on
 * an unscheduled day) only count when completed, so they add to a day but never count
 * against it. Skipped is a rest day and is left out of both sides.
 */
export function dayStats(habits: Habit[], index: EntryIndex, key: DayKey): DayStats {
  let due = 0
  let completed = 0
  let skipped = 0
  for (const habit of habits) {
    const status = entryOn(index, habit.id, key)?.status
    if (status === 'skipped') {
      skipped++
      continue
    }
    const scheduled = habit.frequency !== 'weekly' && isDueOn(habit, key) && livesOn(habit, key)
    if (scheduled || status === 'completed') due++
    if (status === 'completed') completed++
  }
  return { date: key, due, completed, skipped, rate: due ? Math.round((completed / due) * 100) : null }
}

/**
 * Consistency so far this week: completed over due for scheduled habits up to today, and
 * completions over target (capped) for weekly habits. Null when nothing was due yet.
 */
export function weekConsistency(habits: Habit[], index: EntryIndex, today: DayKey, weekStart: WeekStart = 1) {
  const start = startOfWeek(today, weekStart)
  const days = dayRange(start, today)
  let due = 0
  let completed = 0
  for (const habit of habits) {
    if (habit.frequency === 'weekly') {
      if (!livesOn(habit, today)) continue
      const target = habit.targetPerWeek ?? 1
      due += target
      completed += Math.min(weekCompletions(habit.id, index, start), target)
      continue
    }
    for (const key of days) {
      if (!livesOn(habit, key) || !isDueOn(habit, key)) continue
      const status = entryOn(index, habit.id, key)?.status
      if (status === 'skipped') continue
      due++
      if (status === 'completed') completed++
    }
  }
  return due ? Math.round((completed / due) * 100) : null
}

/** A habit's completion rate over a range (weekly habits: completions over prorated target). */
export function habitRate(habit: Habit, index: EntryIndex, from: DayKey, to: DayKey) {
  const days = dayRange(from, to).filter((key) => livesOn(habit, key))
  if (!days.length) return null
  if (habit.frequency === 'weekly') {
    const done = days.filter((key) => entryOn(index, habit.id, key)?.status === 'completed').length
    const expected = ((habit.targetPerWeek ?? 1) * days.length) / 7
    return Math.min(100, Math.round((done / expected) * 100))
  }
  let due = 0
  let completed = 0
  for (const key of days) {
    if (!isDueOn(habit, key)) continue
    const status = entryOn(index, habit.id, key)?.status
    if (status === 'skipped') continue
    due++
    if (status === 'completed') completed++
  }
  return due ? Math.round((completed / due) * 100) : null
}

/** 0–4 heatmap intensity for a day's completion rate. */
export function heatmapIntensity(rate: number | null): 0 | 1 | 2 | 3 | 4 {
  if (rate === null || rate <= 0) return 0
  if (rate < 40) return 1
  if (rate < 70) return 2
  if (rate < 100) return 3
  return 4
}

/** First day shown on the heatmap: the start of the week 52 weeks ago. */
export const heatmapStart = (today: DayKey, weekStart: WeekStart = 1) => startOfWeek(addDays(today, -364), weekStart)

/** Heatmap as week columns (7 cells each, the current week possibly shorter). */
export function heatmapWeeks(habits: Habit[], index: EntryIndex, today: DayKey, weekStart: WeekStart = 1) {
  const weeks: DayStats[][] = []
  for (const key of dayRange(heatmapStart(today, weekStart), today)) {
    if (key === startOfWeek(key, weekStart) || !weeks.length) weeks.push([])
    weeks[weeks.length - 1].push(dayStats(habits, index, key))
  }
  return weeks
}

/** Whether a logged quantity reaches the habit's target (always true without one). */
export function meetsTarget(habit: Pick<Habit, 'targetKind' | 'targetValue'>, quantity: number | null) {
  if (habit.targetKind === 'boolean' || !habit.targetValue) return true
  return (quantity ?? 0) >= habit.targetValue
}

export function targetLabel(habit: Habit) {
  const parts: string[] = []
  if (habit.targetKind !== 'boolean' && habit.targetValue) parts.push(`${habit.targetValue} ${habit.targetUnit ?? (habit.targetKind === 'duration' ? 'min' : '')}`.trim())
  if (habit.frequency === 'weekly') parts.push(`${habit.targetPerWeek ?? 1}× a week`)
  if (habit.frequency === 'weekdays') parts.push(habit.weekdays.length === 7 ? 'Every day' : [...habit.weekdays].sort().map((day) => WEEKDAY_SHORT[day]).join(', ') || 'No days chosen')
  return parts.join(' · ')
}

// ── Focus ───────────────────────────────────────────────────────────────────────────

export function focusSummary(sessions: FocusSession[], from: DayKey, to: DayKey) {
  const inRange = sessions.filter((session) => session.date >= from && session.date <= to)
  const minutes = inRange.reduce((sum, session) => sum + session.durationMinutes, 0)
  return {
    sessions: inRange.length,
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    distractions: inRange.reduce((sum, session) => sum + session.distractions, 0),
    avgConcentration: inRange.length ? Math.round((inRange.reduce((sum, session) => sum + session.concentration, 0) / inRange.length) * 10) / 10 : null,
  }
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

// ── Reading ─────────────────────────────────────────────────────────────────────────

export function pagesRead(sessions: ReadingSession[]) {
  return sessions.reduce((sum, session) => sum + (session.pages ?? 0), 0)
}

/** Percent read: from logged pages over total pages; completed books are 100. */
export function bookProgress(book: Pick<Book, 'status' | 'totalPages'>, pages: number) {
  if (book.status === 'completed') return 100
  if (!book.totalPages) return null
  return Math.min(100, Math.round((pages / book.totalPages) * 100))
}

/** Average pages a day over the last `days` days (today included). */
export function readingPace(sessions: ReadingSession[], today: DayKey, days = 7) {
  const since = addDays(today, -(days - 1))
  const pages = pagesRead(sessions.filter((session) => session.date >= since && session.date <= today))
  return Math.round((pages / days) * 10) / 10
}

/** Distinct days with at least one session in a range. */
export function readingDays(sessions: ReadingSession[], from: DayKey, to: DayKey) {
  return new Set(sessions.filter((session) => session.date >= from && session.date <= to).map((session) => session.date)).size
}

/** Pages per day for a range, for the trend bars. */
export function pagesByDay(sessions: ReadingSession[], from: DayKey, to: DayKey) {
  const totals = new Map<DayKey, number>()
  for (const session of sessions) if (session.date >= from && session.date <= to) totals.set(session.date, (totals.get(session.date) ?? 0) + (session.pages ?? 0))
  return dayRange(from, to).map((date) => ({ date, pages: totals.get(date) ?? 0 }))
}

export const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

// ── Learning ────────────────────────────────────────────────────────────────────────

export const LEARNING_STAGES: { key: LearningStatus; label: string; hint: string }[] = [
  { key: 'not_started', label: 'Not started', hint: 'On the list' },
  { key: 'learning', label: 'Learning', hint: 'Reading, watching, taking notes' },
  { key: 'practised', label: 'Practised', hint: 'Used it hands-on' },
  { key: 'mastered', label: 'Mastered', hint: 'Could teach it' },
]

export function nextStage(status: LearningStatus): LearningStatus | null {
  const index = LEARNING_STAGES.findIndex((stage) => stage.key === status)
  return LEARNING_STAGES[index + 1]?.key ?? null
}

// ── Goals ───────────────────────────────────────────────────────────────────────────

/** Progress is the share of milestones completed; a completed goal is 100. */
export function goalProgress(goal: Pick<Goal, 'status'> & { milestones: Pick<Milestone, 'completedAt'>[] }) {
  const total = goal.milestones.length
  const done = goal.milestones.filter((milestone) => milestone.completedAt).length
  const percent = goal.status === 'completed' ? 100 : total ? Math.round((done / total) * 100) : null
  return { done, total, percent }
}

/** Days until a target date (negative when past). */
export function daysUntil(target: DayKey, today: DayKey) {
  return Math.round((parseDay(target).getTime() - parseDay(today).getTime()) / 86_400_000)
}

/** Parses a number field: empty → null, otherwise a finite number ≥ `min`. */
export function numberOrNull(value: string, min = 0) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min ? parsed : null
}
