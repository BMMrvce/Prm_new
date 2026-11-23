/**
 * Pure rules for the reminder job (no I/O), so timing and dedupe can be unit tested.
 * `reminders.ts` loads rows and calls these.
 */

export const DEFAULT_MEETING_LEAD = 10
export const DEFAULT_DUE_LEAD = 60
export const DEFAULT_DIGEST_TIME = '09:00'
/** Longest lead the job looks ahead for, whatever a profile says. */
export const MAX_MEETING_LEAD = 120
export const MAX_DUE_LEAD = 1440
/** How long after the digest time it may still go out if the scheduler was late. */
export const DIGEST_GRACE_MINUTES = 30

export type ReminderSettings = { digestTime: string | null; meetingLead: number; dueLead: number }

const clampLead = (value: unknown, fallback: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : fallback

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * A profile's reminder settings with defaults. A missing digest time means the default
 * (the preferences page shows it on at 09:00); an explicit null switches it off. A lead of
 * 0 switches that reminder off.
 */
export function reminderSettings(preferences: unknown): ReminderSettings {
  const reminders = (preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>).reminders : null) as
    | Record<string, unknown>
    | null
    | undefined
  const rawDigest = reminders?.digestTime
  const digestTime = rawDigest === null ? null : typeof rawDigest === 'string' && HHMM.test(rawDigest) ? rawDigest : DEFAULT_DIGEST_TIME
  return {
    digestTime,
    meetingLead: clampLead(reminders?.meetingLeadMinutes, DEFAULT_MEETING_LEAD, MAX_MEETING_LEAD),
    dueLead: clampLead(reminders?.dueLeadMinutes, DEFAULT_DUE_LEAD, MAX_DUE_LEAD),
  }
}

function formatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    return null
  }
}

/** Local calendar day (YYYY-MM-DD) and minute of the day of `date` in `timeZone` (UTC if invalid). */
export function localParts(date: Date, timeZone: string) {
  const format = formatter(timeZone) ?? formatter('UTC')!
  const parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/**
 * When the user's digest is due right now, the local day it is for (the dedupe key);
 * otherwise null. Due from `digestTime` until `grace` minutes later, including a window
 * that runs past local midnight (a 23:50 digest still counts for the day it started).
 */
export function digestDay(now: Date, timeZone: string, digestTime: string | null, grace = DIGEST_GRACE_MINUTES) {
  const match = digestTime ? HHMM.exec(digestTime) : null
  if (!match) return null
  const start = Number(match[1]) * 60 + Number(match[2])
  const local = localParts(now, timeZone)
  if (local.minutes >= start && local.minutes - start <= grace) return local.day
  if (local.minutes < start && local.minutes + 1440 - start <= grace) {
    return localParts(new Date(now.getTime() - (local.minutes + 1) * 60_000), timeZone).day
  }
  return null
}

/** True when `iso` is after `now` and no more than `leadMinutes` ahead (0 = off). */
export function withinLead(iso: string, now: Date, leadMinutes: number) {
  if (leadMinutes <= 0) return false
  const delta = new Date(iso).getTime() - now.getTime()
  return Number.isFinite(delta) && delta > 0 && delta <= leadMinutes * 60_000
}

export function minutesUntil(iso: string, now: Date) {
  return Math.max(1, Math.round((new Date(iso).getTime() - now.getTime()) / 60_000))
}

/** Dedupe keys: one delivery per user per meeting start / due time / local day. */
export const reminderKey = {
  meeting: (id: string, startsAt: string) => `meeting:${id}:${new Date(startsAt).toISOString()}`,
  due: (id: string, dueAt: string) => `due:${id}:${new Date(dueAt).toISOString()}`,
  digest: (day: string) => `digest:${day}`,
}

/** Who is reminded of a task: its assignees, or its creator when nobody is assigned; members only. */
export function taskRecipients(task: { creatorId: string; assigneeIds: string[] }, members: Set<string>) {
  const people = task.assigneeIds.length ? task.assigneeIds : [task.creatorId]
  return [...new Set(people)].filter((id) => members.has(id))
}

/**
 * The text a push notification may carry. Protected workspaces never put titles on a lock
 * screen: their reminders only name the workspace.
 */
export function pushText(
  workspace: { name: string; protected: boolean },
  detailed: { title: string; body: string },
): { title: string; body: string } {
  if (!workspace.protected) return detailed
  return { title: clip(`You have a reminder in ${workspace.name}`, 120), body: 'Unlock the workspace to see it.' }
}

/** Trims to the database's column limits. */
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
