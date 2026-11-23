import { localDate, type Priority } from '@/lib/format'

/** Where an open task sits relative to today, by its due date. */
export type DueBucket = 'overdue' | 'today' | 'upcoming' | 'later' | 'anytime'

export const BUCKETS: { key: DueBucket; label: string; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'bg-error' },
  { key: 'today', label: 'Today', tone: 'bg-accent' },
  { key: 'upcoming', label: 'Next 7 days', tone: 'bg-primary' },
  { key: 'later', label: 'Later', tone: 'bg-ink-3' },
  { key: 'anytime', label: 'No due date', tone: 'bg-line-strong' },
]

/** Whole days from today to the local due day (negative when past). */
export function daysUntil(dueAt: string, now: Date) {
  const day = (date: Date) => new Date(`${localDate(date)}T12:00`).getTime()
  return Math.round((day(new Date(dueAt)) - day(now)) / 86_400_000)
}

export function dueBucket(dueAt: string | null, now: Date): DueBucket {
  if (!dueAt) return 'anytime'
  const days = daysUntil(dueAt, now)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return days <= 7 ? 'upcoming' : 'later'
}

/** "Today", "Tomorrow", "Yesterday", "Mon 9 Nov", with a tone for the chip. */
export function dueLabel(dueAt: string, now: Date): { text: string; tone: 'error' | 'accent' | 'muted' } {
  const days = daysUntil(dueAt, now)
  if (days === 0) return { text: 'Today', tone: 'accent' }
  if (days === 1) return { text: 'Tomorrow', tone: 'muted' }
  if (days === -1) return { text: 'Yesterday', tone: 'error' }
  const date = new Date(dueAt)
  const sameYear = date.getFullYear() === now.getFullYear()
  return {
    text: date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }),
    tone: days < 0 ? 'error' : 'muted',
  }
}

export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'none', label: 'No priority' },
]

/** Sort by due date (earliest first, undated last), then priority, then title. */
export function compareTasks(a: { dueAt: string | null; priority: Priority; title: string }, b: { dueAt: string | null; priority: Priority; title: string }) {
  if (a.dueAt !== b.dueAt) {
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt < b.dueAt ? -1 : 1
  }
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title)
}

export function groupByDue<T extends { dueAt: string | null; priority: Priority; title: string }>(tasks: T[], now: Date) {
  const groups = new Map<DueBucket, T[]>()
  for (const task of [...tasks].sort(compareTasks)) {
    const bucket = dueBucket(task.dueAt, now)
    groups.set(bucket, [...(groups.get(bucket) ?? []), task])
  }
  return BUCKETS.filter((bucket) => groups.has(bucket.key)).map((bucket) => ({ ...bucket, tasks: groups.get(bucket.key)! }))
}

/**
 * A position between two neighbours for a dropped card, so a move updates only that
 * card. Positions are floats; when neighbours get too close the caller can renumber.
 */
export function positionBetween(before: number | undefined, after: number | undefined) {
  if (before === undefined && after === undefined) return Date.now()
  if (before === undefined) return after! - 1024
  if (after === undefined) return before + 1024
  return (before + after) / 2
}

/** "ACME-12" */
export function taskCode(prefix: string | undefined, number: number) {
  return `${prefix ?? 'T'}-${number}`
}

/** Parses "2h 30m", "90m", "1.5h" or "45" (minutes) into minutes; null when empty/invalid. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text))
  const match = text.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (!match || (!match[1] && !match[2])) return null
  return Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0))
}
