import { describe, expect, it } from 'vitest'
import {
  advanceDueDate,
  nextMonthDay,
  nextWeekday,
  ordinal,
  budgetUsage,
  daysLeftInMonth,
  dueState,
  lastMonths,
  monthKey,
  monthRange,
  monthlyCommitments,
  monthsWindow,
  parseAmount,
  receiptPath,
  safeFileName,
  savingsProgress,
  shiftMonth,
  summarizeMonth,
  usageTone,
} from './logic'

describe('month ranges', () => {
  it('builds half-open month windows, across year ends', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-12-01' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' })
    expect(monthsWindow('2026-02', 3)).toEqual({ from: '2025-12-01', to: '2026-03-01' })
  })

  it('shifts and lists months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 14)).toBe('2028-01')
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(monthKey('2026-11-12')).toBe('2026-11')
    expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01')
  })

  it('counts the days left, including today', () => {
    const today = new Date(2026, 10, 12)
    expect(daysLeftInMonth('2026-11', today)).toBe(19)
    expect(daysLeftInMonth('2026-10', today)).toBe(31)
    expect(daysLeftInMonth('2026-11', new Date(2026, 10, 30))).toBe(1)
  })
})

describe('month summary', () => {
  const entry = (kind: 'expense' | 'income' | 'transfer' | 'reimbursement', amount: number, occurredOn = '2026-11-05', categoryId: string | null = 'food', currency = 'USD') => ({
    kind,
    amount,
    occurredOn,
    categoryId,
    currency,
  })

  it('totals income and expenses, ignoring transfers, claims, other months and currencies', () => {
    const summary = summarizeMonth(
      [
        entry('expense', 10.1),
        entry('expense', 20.2),
        entry('expense', 5, '2026-11-20', null),
        entry('income', 100),
        entry('transfer', 999),
        entry('reimbursement', 50),
        entry('expense', 70, '2026-10-31'),
        entry('expense', 8, '2026-11-02', 'food', 'EUR'),
      ],
      '2026-11',
      'USD',
    )
    expect(summary).toEqual({ income: 100, expenses: 35.3, net: 64.7, byCategory: { food: 30.3, '': 5 }, otherCurrency: 1 })
  })
})

describe('budget usage', () => {
  const today = new Date(2026, 10, 12)

  it('computes overall and per-category use with a daily allowance', () => {
    const usage = budgetUsage({ monthlyLimit: 1000, categoryLimits: { food: 200, rent: 500, gone: 0 } }, { food: 250, rent: 300, misc: 70 }, '2026-11', today)
    expect(usage.spent).toBe(620)
    expect(usage.remaining).toBe(380)
    expect(usage.percent).toBe(62)
    expect(usage.perDay).toBe(20)
    expect(usage.categories.map((item) => [item.categoryId, item.percent, item.tone])).toEqual([
      ['food', 125, 'over'],
      ['rent', 60, 'ok'],
    ])
  })

  it('handles no budget and overspending', () => {
    expect(budgetUsage(null, { food: 10 }, '2026-11', today)).toMatchObject({ limit: null, remaining: null, percent: null, perDay: null, categories: [] })
    expect(budgetUsage({ monthlyLimit: 100, categoryLimits: {} }, { food: 150 }, '2026-11', today)).toMatchObject({ remaining: -50, percent: 150, perDay: 0 })
  })

  it('maps percentages to tones', () => {
    expect(usageTone(null)).toBe('ok')
    expect(usageTone(79)).toBe('ok')
    expect(usageTone(80)).toBe('warn')
    expect(usageTone(100)).toBe('warn')
    expect(usageTone(101)).toBe('over')
  })
})

describe('savings progress', () => {
  it('nets contributions and withdrawals and caps the percentage', () => {
    expect(
      savingsProgress(1000, [
        { amount: 300, direction: 'contribution' },
        { amount: 50, direction: 'withdrawal' },
      ]),
    ).toEqual({ saved: 250, percent: 25, remaining: 750, reached: false })
    expect(savingsProgress(100, [{ amount: 150, direction: 'contribution' }])).toEqual({ saved: 150, percent: 100, remaining: 0, reached: true })
    expect(savingsProgress(100, [{ amount: 20, direction: 'withdrawal' }]).saved).toBe(0)
  })
})

describe('recurring due dates', () => {
  it('advances weekly, monthly, quarterly and yearly', () => {
    expect(advanceDueDate('2026-12-29', 'weekly')).toBe('2027-01-05')
    expect(advanceDueDate('2026-11-12', 'monthly')).toBe('2026-12-12')
    expect(advanceDueDate('2026-12-15', 'monthly')).toBe('2027-01-15')
    expect(advanceDueDate('2026-11-30', 'quarterly')).toBe('2027-02-28')
    expect(advanceDueDate('2026-03-10', 'yearly')).toBe('2027-03-10')
  })

  it('clamps to the end of shorter months', () => {
    expect(advanceDueDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceDueDate('2028-01-31', 'monthly')).toBe('2028-02-29')
    expect(advanceDueDate('2026-03-31', 'monthly')).toBe('2026-04-30')
    expect(advanceDueDate('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  it('returns to the anchor day after a short month', () => {
    expect(advanceDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(advanceDueDate('2026-02-28', 'monthly')).toBe('2026-03-28')
  })

  it('normalises commitments to a month and skips paused items', () => {
    expect(
      monthlyCommitments([
        { kind: 'expense', amount: 12, frequency: 'monthly', active: true },
        { kind: 'expense', amount: 120, frequency: 'yearly', active: true },
        { kind: 'expense', amount: 30, frequency: 'quarterly', active: true },
        { kind: 'expense', amount: 999, frequency: 'monthly', active: false },
        { kind: 'income', amount: 100, frequency: 'weekly', active: true },
      ]),
    ).toEqual({ out: 32, incoming: 433.33 })
  })

  it('labels how soon something is due', () => {
    expect(dueState('2026-11-11', '2026-11-12')).toBe('overdue')
    expect(dueState('2026-11-12', '2026-11-12')).toBe('today')
    expect(dueState('2026-11-19', '2026-11-12')).toBe('soon')
    expect(dueState('2026-11-20', '2026-11-12')).toBe('later')
  })
})

describe('receipts and input', () => {
  it('builds safe storage paths', () => {
    expect(safeFileName('Café receipt (1).PDF')).toBe('Cafe-receipt-1-.PDF')
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd')
    expect(safeFileName('???')).toBe('receipt')
    expect(receiptPath('ws', 'abc', 'a b.png')).toBe('ws/receipts/abc-a-b.png')
  })

  it('parses amounts', () => {
    expect(parseAmount('12.345')).toBe(12.35)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('-3')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('day-of-month schedules', () => {
  it('finds the next date on a day of the month', () => {
    expect(nextMonthDay(5, '2026-11-13')).toBe('2026-12-05')
    expect(nextMonthDay(20, '2026-11-13')).toBe('2026-11-20')
    expect(nextMonthDay(13, '2026-11-13')).toBe('2026-11-13')
    expect(nextMonthDay(31, '2026-11-13')).toBe('2026-11-30')
    expect(nextMonthDay(31, '2027-01-31')).toBe('2027-01-31')
    expect(nextMonthDay(30, '2027-02-01')).toBe('2027-02-28')
  })
  it('finds the next weekday and writes ordinals', () => {
    expect(nextWeekday(1, '2026-11-13')).toBe('2026-11-16')
    expect(nextWeekday(5, '2026-11-13')).toBe('2026-11-13')
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
  })
})
