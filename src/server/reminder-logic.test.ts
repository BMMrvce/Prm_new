import { describe, expect, it } from 'vitest'
import { digestDay, localParts, pushText, reminderKey, reminderSettings, taskRecipients, withinLead } from './reminder-logic'

const at = (iso: string) => new Date(iso)

describe('reminderSettings', () => {
  it('uses defaults when nothing is saved', () => {
    expect(reminderSettings({})).toEqual({ digestTime: '09:00', meetingLead: 10, dueLead: 60 })
    expect(reminderSettings(null)).toEqual({ digestTime: '09:00', meetingLead: 10, dueLead: 60 })
  })

  it('keeps an explicit null digest (off) and clamps leads', () => {
    expect(reminderSettings({ reminders: { digestTime: null, meetingLeadMinutes: 0, dueLeadMinutes: 99999 } })).toEqual({
      digestTime: null,
      meetingLead: 0,
      dueLead: 1440,
    })
  })

  it('ignores malformed values', () => {
    expect(reminderSettings({ reminders: { digestTime: '25:99', meetingLeadMinutes: 'soon' } })).toMatchObject({ digestTime: '09:00', meetingLead: 10 })
  })
})

describe('withinLead', () => {
  const now = at('2026-11-12T10:00:00Z')
  it('is true only for future times inside the lead', () => {
    expect(withinLead('2026-11-12T10:05:00Z', now, 10)).toBe(true)
    expect(withinLead('2026-11-12T10:10:00Z', now, 10)).toBe(true)
    expect(withinLead('2026-11-12T10:10:01Z', now, 10)).toBe(false)
    expect(withinLead('2026-11-12T10:00:00Z', now, 10)).toBe(false)
    expect(withinLead('2026-11-12T09:59:00Z', now, 10)).toBe(false)
  })
  it('is off at lead 0 and for bad dates', () => {
    expect(withinLead('2026-11-12T10:05:00Z', now, 0)).toBe(false)
    expect(withinLead('nope', now, 10)).toBe(false)
  })
})

describe('dedupe keys', () => {
  it('are stable for the same instant however it is written', () => {
    expect(reminderKey.meeting('m1', '2026-11-12T10:00:00+00:00')).toBe(reminderKey.meeting('m1', '2026-11-12T10:00:00.000Z'))
    expect(reminderKey.due('t1', '2026-11-12T15:30:00+05:30')).toBe('due:t1:2026-11-12T10:00:00.000Z')
  })
  it('change when a meeting or deadline moves, so the new time is reminded again', () => {
    expect(reminderKey.meeting('m1', '2026-11-12T10:00:00Z')).not.toBe(reminderKey.meeting('m1', '2026-11-12T11:00:00Z'))
  })
})

describe('taskRecipients', () => {
  const members = new Set(['a', 'b', 'creator'])
  it('reminds assignees, else the creator, members only, once each', () => {
    expect(taskRecipients({ creatorId: 'creator', assigneeIds: ['a', 'b', 'a'] }, members)).toEqual(['a', 'b'])
    expect(taskRecipients({ creatorId: 'creator', assigneeIds: [] }, members)).toEqual(['creator'])
    expect(taskRecipients({ creatorId: 'creator', assigneeIds: ['gone'] }, members)).toEqual([])
  })
})

describe('localParts / digestDay (time zones)', () => {
  it('computes the local day and minute', () => {
    expect(localParts(at('2026-11-12T03:45:00Z'), 'Asia/Kolkata')).toEqual({ day: '2026-11-12', minutes: 9 * 60 + 15 })
    expect(localParts(at('2026-11-12T03:45:00Z'), 'America/Los_Angeles')).toEqual({ day: '2026-11-11', minutes: 19 * 60 + 45 })
  })

  it('falls back to UTC for an unknown zone', () => {
    expect(localParts(at('2026-11-12T03:45:00Z'), 'Mars/Olympus')).toEqual({ day: '2026-11-12', minutes: 3 * 60 + 45 })
  })

  it('is due from the digest time through the grace window, in the user zone', () => {
    // 09:00 in Kolkata is 03:30 UTC.
    expect(digestDay(at('2026-11-12T03:29:00Z'), 'Asia/Kolkata', '09:00')).toBeNull()
    expect(digestDay(at('2026-11-12T03:30:00Z'), 'Asia/Kolkata', '09:00')).toBe('2026-11-12')
    expect(digestDay(at('2026-11-12T04:00:00Z'), 'Asia/Kolkata', '09:00')).toBe('2026-11-12')
    expect(digestDay(at('2026-11-12T04:01:00Z'), 'Asia/Kolkata', '09:00')).toBeNull()
  })

  it('handles daylight saving (New York 09:00 is 14:00 UTC in winter, 13:00 in summer)', () => {
    expect(digestDay(at('2026-11-12T14:00:00Z'), 'America/New_York', '09:00')).toBe('2026-11-12')
    expect(digestDay(at('2026-07-01T13:00:00Z'), 'America/New_York', '09:00')).toBe('2026-07-01')
    expect(digestDay(at('2026-07-01T14:00:00Z'), 'America/New_York', '09:00', 30)).toBeNull()
  })

  it('keeps a late-evening digest on its own day past midnight', () => {
    // 23:50 UTC digest, now 00:10 UTC the next day: still the previous day's digest.
    expect(digestDay(at('2026-11-13T00:10:00Z'), 'UTC', '23:50')).toBe('2026-11-12')
    expect(digestDay(at('2026-11-13T00:30:00Z'), 'UTC', '23:50')).toBeNull()
  })

  it('is never due when switched off or malformed', () => {
    expect(digestDay(at('2026-11-12T09:00:00Z'), 'UTC', null)).toBeNull()
    expect(digestDay(at('2026-11-12T09:00:00Z'), 'UTC', '9am')).toBeNull()
  })
})

describe('pushText', () => {
  it('passes titles through for normal workspaces', () => {
    expect(pushText({ name: 'Acme', protected: false }, { title: 'Standup in 5 min', body: 'Acme' })).toEqual({ title: 'Standup in 5 min', body: 'Acme' })
  })
  it('never reveals content from protected workspaces', () => {
    const text = pushText({ name: 'Health', protected: true }, { title: 'Therapy in 5 min', body: 'Dr. X' })
    expect(text.title).toBe('You have a reminder in Health')
    expect(JSON.stringify(text)).not.toMatch(/Therapy|Dr\. X/)
  })
})
