import { describe, expect, it } from 'vitest'
import { localDate } from '@/lib/format'
import { estimateRows, manualTimes, moveToDay, pausePatch, presetRange, stopPatch, sumSeconds, timeBuckets, totalsBy, type EntryTimes } from './logic'

// Thursday, 12 November 2026, 15:00 local.
const now = new Date(2026, 10, 12, 15, 0)
const at = (hours: number, minutes = 0, day = 12) => new Date(2026, 10, day, hours, minutes).toISOString()
const stopped = (start: string, seconds: number): EntryTimes => ({ state: 'stopped', startedAt: start, endedAt: start, accumulatedSeconds: seconds })

describe('report ranges', () => {
  it('honours the week start for this and last week', () => {
    const monday = presetRange('this-week', now, 1)
    expect(localDate(monday.start)).toBe('2026-11-09')
    expect(localDate(monday.end)).toBe('2026-11-16')
    const sunday = presetRange('last-week', now, 0)
    expect(localDate(sunday.start)).toBe('2026-11-01')
    expect(localDate(sunday.end)).toBe('2026-11-08')
  })

  it('covers the calendar month', () => {
    const month = presetRange('this-month', now, 1)
    expect(localDate(month.start)).toBe('2026-11-01')
    expect(localDate(month.end)).toBe('2026-12-01')
  })

  it('makes custom ranges inclusive, ordered and bounded', () => {
    const custom = presetRange('custom', now, 1, { from: '2026-11-10', to: '2026-11-03' })
    expect(localDate(custom.start)).toBe('2026-11-03')
    expect(localDate(custom.end)).toBe('2026-11-11')
    const long = presetRange('custom', now, 1, { from: '2020-01-01', to: '2026-01-01' })
    expect((long.end.getTime() - long.start.getTime()) / 86_400_000).toBeLessThanOrEqual(366)
  })
})

describe('timer transitions', () => {
  const running: EntryTimes = { state: 'running', startedAt: at(14, 0), endedAt: null, accumulatedSeconds: 120 }

  it('banks the running time when pausing', () => {
    const patch = pausePatch(running, now.getTime())
    expect(patch.state).toBe('paused')
    expect(patch.accumulated_seconds).toBe(120 + 3600)
    expect(patch.paused_at).toBe(now.toISOString())
  })

  it('stops a running entry now and a paused one when it was paused', () => {
    expect(stopPatch(running, now.getTime())).toEqual({ state: 'stopped', ended_at: now.toISOString(), accumulated_seconds: 3720 })
    const paused: EntryTimes = { state: 'paused', startedAt: at(10), pausedAt: at(11), endedAt: null, accumulatedSeconds: 3600 }
    expect(stopPatch(paused, now.getTime())).toEqual({ state: 'stopped', ended_at: at(11), accumulated_seconds: 3600 })
  })
})

describe('manual logs', () => {
  it('ends a log for today now', () => {
    const { startedAt, endedAt } = manualTimes('2026-11-12', 45, now)
    expect(endedAt.toISOString()).toBe(now.toISOString())
    expect(startedAt.toISOString()).toBe(at(14, 15))
  })

  it('starts a log for another day at 09:00', () => {
    const { startedAt, endedAt } = manualTimes('2026-11-10', 90, now)
    expect(startedAt.toISOString()).toBe(at(9, 0, 10))
    expect(endedAt.toISOString()).toBe(at(10, 30, 10))
  })

  it('keeps the time of day when moving an entry', () => {
    expect(moveToDay(at(13, 20), '2026-11-02').toISOString()).toBe(at(13, 20, 2))
  })
})

describe('totals', () => {
  const entries: (EntryTimes & { project: string })[] = [
    { ...stopped(at(9, 0, 9), 3600), project: 'A' },
    { ...stopped(at(10, 0, 9), 1800), project: 'B' },
    { ...stopped(at(9, 0, 12), 600), project: 'A' },
    { state: 'running', startedAt: at(14, 30), endedAt: null, accumulatedSeconds: 0, project: 'B' },
  ]

  it('buckets by local day and counts running timers live', () => {
    const buckets = timeBuckets(entries, new Date(2026, 10, 9), new Date(2026, 10, 16), now.getTime(), 1)
    expect(buckets).toHaveLength(7)
    expect(buckets[0].seconds).toBe(5400)
    expect(buckets[3].seconds).toBe(600 + 1800)
    expect(buckets.every((bucket) => bucket.unit === 'day')).toBe(true)
  })

  it('switches to weeks for long ranges', () => {
    const buckets = timeBuckets(entries, new Date(2026, 0, 1), new Date(2027, 0, 1), now.getTime(), 1)
    expect(buckets[0].unit).toBe('week')
    expect(buckets.reduce((total, bucket) => total + bucket.seconds, 0)).toBe(sumSeconds(entries, now.getTime()))
  })

  it('groups by any key, largest first', () => {
    expect(totalsBy(entries, (entry) => entry.project, now.getTime())).toEqual([
      { key: 'A', seconds: 4200 },
      { key: 'B', seconds: 3600 },
    ])
  })

  it('compares estimates with time logged', () => {
    const rows = estimateRows(
      [
        { id: 'a', title: 'Alpha', estimateMinutes: 60 },
        { id: 'b', title: 'Beta', estimateMinutes: 120 },
        { id: 'c', title: 'No estimate', estimateMinutes: null },
      ],
      new Map([
        ['a', 5400],
        ['b', 3600],
      ]),
    )
    expect(rows.map((row) => [row.id, row.ratio, row.differenceMinutes])).toEqual([
      ['a', 1.5, 30],
      ['b', 0.5, -60],
    ])
  })
})
