import { describe, expect, it } from 'vitest'
import { localDate } from '@/lib/format'
import {
  addDays,
  isDayLong,
  layoutColumns,
  meetingInputs,
  meetingTimes,
  minutesInto,
  monthGrid,
  normaliseUrl,
  overlapsDay,
  shiftCursor,
  startOfWeek,
  visibleRange,
  weekRangeOf,
} from './logic'

// Thursday, 12 November 2026 (local time).
const thursday = new Date(2026, 10, 12, 15, 30)
const day = (date: Date) => localDate(date)

describe('week ranges', () => {
  it('starts on Monday when weekStart is 1', () => {
    const [start, end] = weekRangeOf(thursday, 1)
    expect(day(start)).toBe('2026-11-09')
    expect(day(end)).toBe('2026-11-16')
    expect(start.getHours()).toBe(0)
  })

  it('starts on Sunday when weekStart is 0', () => {
    const [start, end] = weekRangeOf(thursday, 0)
    expect(day(start)).toBe('2026-11-08')
    expect(day(end)).toBe('2026-11-15')
  })

  it('keeps a day that is itself the week start', () => {
    expect(day(startOfWeek(new Date(2026, 10, 9, 8), 1))).toBe('2026-11-09')
    expect(day(startOfWeek(new Date(2026, 10, 8, 23), 1))).toBe('2026-11-02')
    expect(day(startOfWeek(new Date(2026, 10, 8, 23), 0))).toBe('2026-11-08')
  })
})

describe('month grid', () => {
  it('covers whole weeks from the week start, Monday first', () => {
    const days = monthGrid(thursday, 1)
    expect(days.length % 7).toBe(0)
    expect(day(days[0])).toBe('2026-10-26')
    expect(day(days[days.length - 1])).toBe('2026-12-06')
    expect(days.every((date, index) => index === 0 || date.getTime() > days[index - 1].getTime())).toBe(true)
  })

  it('covers whole weeks Sunday first', () => {
    const days = monthGrid(thursday, 0)
    expect(day(days[0])).toBe('2026-11-01')
    expect(day(days[days.length - 1])).toBe('2026-12-05')
    expect(days).toHaveLength(35)
  })

  it('handles a February that fits exactly four weeks', () => {
    // February 2026 starts on a Sunday and has 28 days.
    expect(monthGrid(new Date(2026, 1, 10), 0)).toHaveLength(28)
    expect(monthGrid(new Date(2026, 1, 10), 1)).toHaveLength(35)
  })
})

describe('visible ranges and navigation', () => {
  it('loads only the days on screen', () => {
    const week = visibleRange('week', thursday, 1)
    expect(week.days).toHaveLength(7)
    expect(day(week.start)).toBe('2026-11-09')
    expect(day(week.end)).toBe('2026-11-16')
    const single = visibleRange('day', thursday, 1)
    expect(day(single.start)).toBe('2026-11-12')
    expect(day(single.end)).toBe('2026-11-13')
  })

  it('moves by a day, a week or a month', () => {
    expect(day(shiftCursor('day', thursday, -1))).toBe('2026-11-11')
    expect(day(shiftCursor('week', thursday, 1))).toBe('2026-11-19')
    expect(day(shiftCursor('month', new Date(2026, 0, 31), 1))).toBe('2026-02-01')
  })
})

describe('day maths', () => {
  it('clamps times to the day and detects overlaps', () => {
    const start = new Date(2026, 10, 11, 22).toISOString()
    const end = new Date(2026, 10, 12, 1, 30).toISOString()
    expect(overlapsDay(start, end, thursday)).toBe(true)
    expect(overlapsDay(start, end, addDays(thursday, 1))).toBe(false)
    expect(minutesInto(start, thursday)).toBe(0)
    expect(minutesInto(end, thursday)).toBe(90)
  })

  it('treats midnight and 23:59 due times as all-day', () => {
    expect(isDayLong(new Date(2026, 10, 12, 23, 59).toISOString())).toBe(true)
    expect(isDayLong(new Date(2026, 10, 12, 0, 0).toISOString())).toBe(true)
    expect(isDayLong(new Date(2026, 10, 12, 14, 0).toISOString())).toBe(false)
  })
})

describe('overlap layout', () => {
  it('gives lone blocks the full width', () => {
    const placed = layoutColumns([
      { id: 'a', start: 60, end: 120 },
      { id: 'b', start: 120, end: 180 },
    ])
    expect(placed.map((block) => [block.id, block.column, block.columns])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  it('splits overlapping blocks and reuses freed columns', () => {
    const placed = layoutColumns([
      { id: 'c', start: 60, end: 120 },
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
      { id: 'd', start: 300, end: 330 },
    ])
    const byId = Object.fromEntries(placed.map((block) => [block.id, [block.column, block.columns]]))
    expect(byId).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] })
  })

  it('uses three columns when three blocks overlap at once', () => {
    const placed = layoutColumns([
      { id: 'a', start: 0, end: 120 },
      { id: 'b', start: 10, end: 60 },
      { id: 'c', start: 20, end: 40 },
    ])
    expect(placed.map((block) => block.column)).toEqual([0, 1, 2])
    expect(placed.every((block) => block.columns === 3)).toBe(true)
  })
})

describe('meeting form values', () => {
  it('turns local inputs into timestamps and back', () => {
    const result = meetingTimes({ allDay: false, startDate: '2026-11-12', startTime: '09:30', endDate: '2026-11-12', endTime: '10:15' })
    if ('error' in result) throw new Error(result.error)
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(45 * 60_000)
    expect(meetingInputs({ startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString(), allDay: false })).toMatchObject({
      startDate: '2026-11-12',
      startTime: '09:30',
      endTime: '10:15',
    })
  })

  it('stores all-day meetings as whole local days', () => {
    const result = meetingTimes({ allDay: true, startDate: '2026-11-12', startTime: '', endDate: '2026-11-13', endTime: '' })
    if ('error' in result) throw new Error(result.error)
    expect(localDate(result.startsAt)).toBe('2026-11-12')
    expect(localDate(result.endsAt)).toBe('2026-11-14')
    expect(meetingInputs({ startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString(), allDay: true }).endDate).toBe('2026-11-13')
  })

  it('rejects meetings that end before they start', () => {
    expect(meetingTimes({ allDay: false, startDate: '2026-11-12', startTime: '10:00', endDate: '2026-11-12', endTime: '09:00' })).toHaveProperty('error')
  })

  it('only accepts http(s) links', () => {
    expect(normaliseUrl('meet.example.com/abc')).toBe('https://meet.example.com/abc')
    expect(normaliseUrl('  ')).toBeNull()
    expect(normaliseUrl('javascript:alert(1)')).toHaveProperty('error')
  })
})
