import { describe, expect, it } from 'vitest'
import { compareTasks, dueBucket, groupByDue, parseDuration, positionBetween, taskCode } from './logic'

const now = new Date('2026-11-12T10:00:00')
const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

describe('due buckets', () => {
  it('sorts tasks into overdue, today, next 7 days, later and undated', () => {
    expect(dueBucket(at(-2), now)).toBe('overdue')
    expect(dueBucket(at(0), now)).toBe('today')
    expect(dueBucket(at(3), now)).toBe('upcoming')
    expect(dueBucket(at(20), now)).toBe('later')
    expect(dueBucket(null, now)).toBe('anytime')
  })

  it('groups in bucket order and drops empty buckets', () => {
    const groups = groupByDue(
      [
        { title: 'b', dueAt: null, priority: 'none' as const },
        { title: 'a', dueAt: at(-1), priority: 'low' as const },
      ],
      now,
    )
    expect(groups.map((group) => group.key)).toEqual(['overdue', 'anytime'])
  })

  it('orders by due date, then priority', () => {
    const tasks = [
      { title: 'later', dueAt: at(5), priority: 'urgent' as const },
      { title: 'same-low', dueAt: at(1), priority: 'low' as const },
      { title: 'same-high', dueAt: at(1), priority: 'high' as const },
      { title: 'undated', dueAt: null, priority: 'urgent' as const },
    ]
    expect([...tasks].sort(compareTasks).map((task) => task.title)).toEqual(['same-high', 'same-low', 'later', 'undated'])
  })
})

describe('helpers', () => {
  it('places a card between its neighbours', () => {
    expect(positionBetween(10, 20)).toBe(15)
    expect(positionBetween(undefined, 20)).toBeLessThan(20)
    expect(positionBetween(10, undefined)).toBeGreaterThan(10)
  })

  it('parses durations', () => {
    expect(parseDuration('2h 30m')).toBe(150)
    expect(parseDuration('1.5h')).toBe(90)
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('45m')).toBe(45)
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })

  it('builds task codes', () => {
    expect(taskCode('ACME', 12)).toBe('ACME-12')
  })
})
