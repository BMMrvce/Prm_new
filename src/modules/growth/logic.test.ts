import { describe, expect, it } from 'vitest'
import {
  addDays,
  bookProgress,
  currentStreak,
  dayStats,
  focusSummary,
  goalProgress,
  heatmapIntensity,
  heatmapWeeks,
  habitRate,
  indexEntries,
  isDueOn,
  isHttpsUrl,
  longestStreak,
  nextStage,
  nextStatus,
  numberOrNull,
  pagesByDay,
  readingPace,
  startOfWeek,
  weekConsistency,
  weekDays,
} from './logic'
import type { FocusSession, Habit, HabitEntry, ReadingSession } from './types'

// Thursday 12 November 2026.
const today = '2026-11-12'

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    workspaceId: 'w',
    title: 'Read',
    categoryId: null,
    frequency: 'daily',
    weekdays: [],
    targetPerWeek: null,
    targetKind: 'boolean',
    targetValue: null,
    targetUnit: null,
    color: 'blue',
    position: 0,
    archivedAt: null,
    createdAt: '2026-01-01T09:00:00',
    ...overrides,
  }
}

let nextId = 0
function entry(date: string, status: HabitEntry['status'] = 'completed', habitId = 'h1'): HabitEntry {
  return { id: `e${nextId++}`, habitId, date, status, quantity: null, note: null }
}

const back = (days: number) => addDays(today, -days)

describe('day keys', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('starts weeks on Monday or Sunday', () => {
    expect(startOfWeek(today, 1)).toBe('2026-11-09')
    expect(startOfWeek(today, 0)).toBe('2026-11-08')
    expect(startOfWeek('2026-11-08', 1)).toBe('2026-11-02')
    expect(weekDays(today, 1)).toHaveLength(7)
    expect(weekDays(today, 1)[6]).toBe('2026-11-15')
  })
})

describe('schedules', () => {
  it('is due on chosen weekdays only', () => {
    const weekdays = habit({ frequency: 'weekdays', weekdays: [1, 3, 5] })
    expect(isDueOn(weekdays, '2026-11-09')).toBe(true) // Monday
    expect(isDueOn(weekdays, '2026-11-10')).toBe(false) // Tuesday
    expect(isDueOn(habit(), '2026-11-10')).toBe(true)
  })

  it('clears an entry when the same state is logged again', () => {
    expect(nextStatus('completed', 'completed')).toBeNull()
    expect(nextStatus('skipped', 'completed')).toBe('completed')
    expect(nextStatus(undefined, 'skipped')).toBe('skipped')
  })
})

describe('streaks', () => {
  it('counts back from today, with grace for today and skips that do not break', () => {
    const index = indexEntries([entry(back(1)), entry(back(2), 'skipped'), entry(back(3)), entry(back(5))])
    expect(currentStreak(habit(), index, today)).toBe(2)
    const withToday = indexEntries([entry(today), entry(back(1))])
    expect(currentStreak(habit(), withToday, today)).toBe(2)
  })

  it('ignores days a weekday habit is not scheduled', () => {
    // Mon/Wed/Fri: Mon 9th, Fri 6th, Wed 4th done; the Tuesday/Thursday gaps do not matter.
    const mwf = habit({ frequency: 'weekdays', weekdays: [1, 3, 5] })
    const index = indexEntries([entry('2026-11-09'), entry('2026-11-06'), entry('2026-11-04')])
    // Wednesday 11th was missed, so the streak is broken.
    expect(currentStreak(mwf, index, today)).toBe(0)
    expect(currentStreak(mwf, index, '2026-11-10')).toBe(3)
  })

  it('finds the longest run', () => {
    const index = indexEntries([entry(back(10)), entry(back(9)), entry(back(8)), entry(back(5)), entry(back(4))])
    expect(longestStreak(habit(), index, today)).toBe(3)
  })

  it('counts weekly habits in weeks that met the target', () => {
    const weekly = habit({ frequency: 'weekly', targetPerWeek: 2 })
    // Last week (2–8 Nov) twice, the week before once, this week once so far.
    const index = indexEntries([entry('2026-11-03'), entry('2026-11-05'), entry('2026-10-28'), entry('2026-11-10')])
    expect(currentStreak(weekly, index, today)).toBe(1)
    expect(longestStreak(weekly, index, today)).toBe(1)
  })
})

describe('consistency', () => {
  it('summarises a day, leaving weekly habits and skips out of what is due', () => {
    const habits = [habit(), habit({ id: 'h2' }), habit({ id: 'h3', frequency: 'weekly', targetPerWeek: 3 }), habit({ id: 'h4' })]
    const index = indexEntries([entry(today), entry(today, 'skipped', 'h2'), entry(today, 'completed', 'h3')])
    const stats = dayStats(habits, index, today)
    expect(stats).toMatchObject({ due: 3, completed: 2, skipped: 1, rate: 67 })
  })

  it('ignores days before a habit existed', () => {
    const fresh = habit({ createdAt: `${today}T08:00:00` })
    expect(dayStats([fresh], indexEntries([]), back(1)).rate).toBeNull()
  })

  it('measures this week so far', () => {
    // Monday start: Mon–Thu so far, 3 of 4 done.
    const index = indexEntries([entry('2026-11-09'), entry('2026-11-10'), entry('2026-11-11')])
    expect(weekConsistency([habit()], index, today, 1)).toBe(75)
    expect(weekConsistency([], index, today, 1)).toBeNull()
  })

  it('rates a habit over a range', () => {
    const index = indexEntries([entry(back(1)), entry(back(2))])
    expect(habitRate(habit(), index, back(3), today)).toBe(50)
  })

  it('builds week columns for the heatmap', () => {
    const weeks = heatmapWeeks([habit()], indexEntries([entry(today)]), today, 1)
    expect(weeks.length).toBe(53)
    expect(weeks.slice(0, -1).every((week) => week.length === 7)).toBe(true)
    expect(weeks.at(-1)?.at(-1)).toMatchObject({ date: today, rate: 100 })
    expect(heatmapIntensity(null)).toBe(0)
    expect(heatmapIntensity(50)).toBe(2)
    expect(heatmapIntensity(100)).toBe(4)
  })
})

describe('focus, reading and goals', () => {
  it('sums focus sessions in range', () => {
    const sessions: FocusSession[] = [
      { id: '1', date: today, durationMinutes: 50, distractions: 2, tasksCompleted: 1, concentration: 4, note: null, createdAt: '' },
      { id: '2', date: back(1), durationMinutes: 40, distractions: 0, tasksCompleted: 2, concentration: 5, note: null, createdAt: '' },
      { id: '3', date: back(30), durationMinutes: 90, distractions: 0, tasksCompleted: 0, concentration: 1, note: null, createdAt: '' },
    ]
    expect(focusSummary(sessions, back(6), today)).toEqual({ sessions: 2, minutes: 90, hours: 1.5, distractions: 2, avgConcentration: 4.5 })
  })

  it('computes reading progress and pace', () => {
    const sessions: ReadingSession[] = [
      { id: '1', bookId: 'b', date: today, pages: 20, minutes: 30, chapter: null, takeaway: null, createdAt: '' },
      { id: '2', bookId: 'b', date: back(2), pages: 15, minutes: null, chapter: null, takeaway: null, createdAt: '' },
    ]
    expect(bookProgress({ status: 'reading', totalPages: 100 }, 35)).toBe(35)
    expect(bookProgress({ status: 'reading', totalPages: null }, 35)).toBeNull()
    expect(bookProgress({ status: 'completed', totalPages: 100 }, 10)).toBe(100)
    expect(readingPace(sessions, today, 7)).toBe(5)
    expect(pagesByDay(sessions, back(2), today).map((day) => day.pages)).toEqual([15, 0, 20])
  })

  it('derives goal progress from milestones', () => {
    expect(goalProgress({ status: 'active', milestones: [{ completedAt: 'x' }, { completedAt: null }] })).toEqual({ done: 1, total: 2, percent: 50 })
    expect(goalProgress({ status: 'active', milestones: [] }).percent).toBeNull()
    expect(goalProgress({ status: 'completed', milestones: [] }).percent).toBe(100)
  })

  it('moves learning topics along the pipeline', () => {
    expect(nextStage('not_started')).toBe('learning')
    expect(nextStage('mastered')).toBeNull()
  })

  it('validates inputs', () => {
    expect(isHttpsUrl('https://covers.example/x.jpg')).toBe(true)
    expect(isHttpsUrl('http://covers.example/x.jpg')).toBe(false)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull('12')).toBe(12)
    expect(numberOrNull('-1')).toBeNull()
  })
})
