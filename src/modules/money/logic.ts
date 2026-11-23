/**
 * Pure money helpers: month windows, totals, budget usage, savings progress and
 * recurring due dates. No React and no Supabase, so everything here is unit-tested.
 * Dates are `YYYY-MM-DD` strings (Postgres `date` columns) and months `YYYY-MM`.
 */

export type TransactionKind = 'expense' | 'income' | 'transfer' | 'reimbursement'
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` for a local date. */
export function isoDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM` for a local date or a `YYYY-MM-DD` string. */
export function monthKey(date: Date | string = new Date()) {
  return (typeof date === 'string' ? date : isoDay(date)).slice(0, 7)
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** Moves a month key by `delta` months. */
export function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/** First day of the month and first day of the next one: `from <= day < to`. */
export function monthRange(key: string): { from: string; to: string } {
  return { from: `${key}-01`, to: `${shiftMonth(key, 1)}-01` }
}

/** The last `count` months ending with `key` (inclusive), as one window. */
export function monthsWindow(key: string, count: number): { from: string; to: string } {
  return { from: `${shiftMonth(key, -(count - 1))}-01`, to: monthRange(key).to }
}

/** Month keys oldest first, ending with `key`. */
export function lastMonths(key: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftMonth(key, index - (count - 1)))
}

export function monthLabel(key: string, style: 'long' | 'short' = 'long') {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString([], { month: style, year: style === 'long' ? 'numeric' : undefined })
}

/** Days left in the month including today; the whole month when `key` is not the current one. */
export function daysLeftInMonth(key: string, today = new Date()) {
  const [year, month] = key.split('-').map(Number)
  const total = daysInMonth(year, month)
  if (key !== monthKey(today)) return total
  return Math.max(1, total - today.getDate() + 1)
}

// ── Totals ────────────────────────────────────────────────────────────────────────

type Entry = { kind: TransactionKind; amount: number; occurredOn: string; categoryId: string | null; currency: string }

export type MonthSummary = {
  income: number
  expenses: number
  net: number
  /** Expense totals by category id ('' = uncategorised). */
  byCategory: Record<string, number>
  /** Entries left out because they are in another currency. */
  otherCurrency: number
}

/**
 * Income and spending for one month in one currency. Transfers move money between your
 * own accounts and claims are reimbursed by someone else, so neither counts.
 */
export function summarizeMonth(entries: Entry[], key: string, currency: string): MonthSummary {
  const byCategory: Record<string, number> = {}
  let income = 0
  let expenses = 0
  let otherCurrency = 0
  for (const entry of entries) {
    if (!entry.occurredOn.startsWith(key)) continue
    if (entry.kind !== 'income' && entry.kind !== 'expense') continue
    if (entry.currency !== currency) {
      otherCurrency += 1
      continue
    }
    if (entry.kind === 'income') income += entry.amount
    else {
      expenses += entry.amount
      const category = entry.categoryId ?? ''
      byCategory[category] = round((byCategory[category] ?? 0) + entry.amount)
    }
  }
  return { income: round(income), expenses: round(expenses), net: round(income - expenses), byCategory, otherCurrency }
}

/** Avoids float noise like 0.30000000000000004 in sums of money. */
export function round(value: number) {
  return Math.round(value * 100) / 100
}

// ── Budgets ───────────────────────────────────────────────────────────────────────

export type Tone = 'ok' | 'warn' | 'over'

/** Calm under 80 %, a warning from 80 %, over past 100 %. */
export function usageTone(percent: number | null): Tone {
  if (percent === null) return 'ok'
  if (percent > 100) return 'over'
  if (percent >= 80) return 'warn'
  return 'ok'
}

export type BudgetUsage = {
  limit: number | null
  spent: number
  remaining: number | null
  percent: number | null
  /** What can still be spent per day for the rest of the month (never negative). */
  perDay: number | null
  categories: { categoryId: string; limit: number; spent: number; percent: number | null; tone: Tone }[]
}

export function budgetUsage(
  budget: { monthlyLimit: number | null; categoryLimits: Record<string, number> } | null | undefined,
  byCategory: Record<string, number>,
  key: string,
  today = new Date(),
): BudgetUsage {
  const spent = round(Object.values(byCategory).reduce((sum, value) => sum + value, 0))
  const limit = budget?.monthlyLimit ?? null
  const remaining = limit === null ? null : round(limit - spent)
  const percent = limit ? Math.round((spent / limit) * 100) : limit === 0 ? (spent > 0 ? 100 : 0) : null
  const perDay = remaining === null ? null : round(Math.max(0, remaining) / daysLeftInMonth(key, today))
  const categories = Object.entries(budget?.categoryLimits ?? {})
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([categoryId, categoryLimit]) => {
      const categorySpent = round(byCategory[categoryId] ?? 0)
      const categoryPercent = Math.round((categorySpent / categoryLimit) * 100)
      return { categoryId, limit: categoryLimit, spent: categorySpent, percent: categoryPercent, tone: usageTone(categoryPercent) }
    })
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
  return { limit, spent, remaining, percent, perDay, categories }
}

// ── Savings ───────────────────────────────────────────────────────────────────────

export type ContributionLike = { amount: number; direction: 'contribution' | 'withdrawal' }

/** Saved so far (contributions minus withdrawals, never below zero) and the share of the target. */
export function savingsProgress(target: number, contributions: ContributionLike[]) {
  const net = contributions.reduce((sum, item) => sum + (item.direction === 'contribution' ? item.amount : -item.amount), 0)
  const saved = round(Math.max(0, net))
  const percent = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
  return { saved, percent, remaining: round(Math.max(0, target - saved)), reached: target > 0 && saved >= target }
}

// ── Recurring payments ────────────────────────────────────────────────────────────

const MONTHS_PER: Record<Exclude<Frequency, 'weekly'>, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/**
 * The next due date after `date`. Month-based schedules keep the day of the month and
 * clamp it to shorter months (31 Jan → 28/29 Feb). Pass `anchorDay` to return to the
 * original day afterwards (28 Feb → 31 Mar for an item due on the 31st).
 */
export function advanceDueDate(date: string, frequency: Frequency, anchorDay?: number) {
  const [year, month, day] = date.split('-').map(Number)
  if (frequency === 'weekly') return isoDay(new Date(year, month - 1, day + 7))
  const target = new Date(year, month - 1 + MONTHS_PER[frequency], 1)
  const wanted = anchorDay ?? day
  const clamped = Math.min(wanted, daysInMonth(target.getFullYear(), target.getMonth() + 1))
  return isoDay(new Date(target.getFullYear(), target.getMonth(), clamped))
}

/** "1st", "2nd", "23rd"… */
export function ordinal(n: number) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** The next date on `day` of the month (31 = the last day), on or after `from`. */
export function nextMonthDay(day: number, from = isoDay(new Date())) {
  const [year, month, today] = from.split('-').map(Number)
  const thisMonth = Math.min(day, daysInMonth(year, month))
  if (thisMonth >= today) return isoDay(new Date(year, month - 1, thisMonth))
  const next = new Date(year, month, 1)
  return isoDay(new Date(next.getFullYear(), next.getMonth(), Math.min(day, daysInMonth(next.getFullYear(), next.getMonth() + 1))))
}

/** The next date that falls on `weekday` (0 = Sunday), on or after `from`. */
export function nextWeekday(weekday: number, from = isoDay(new Date())) {
  const [year, month, day] = from.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(day + ((weekday - date.getDay() + 7) % 7))
  return isoDay(date)
}

const PER_MONTH: Record<Frequency, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }

/** Active recurring items as monthly amounts, split into money out and money in. */
export function monthlyCommitments(items: { kind: 'expense' | 'income'; amount: number; frequency: Frequency; active: boolean }[]) {
  let out = 0
  let incoming = 0
  for (const item of items) {
    if (!item.active) continue
    const monthly = item.amount * PER_MONTH[item.frequency]
    if (item.kind === 'expense') out += monthly
    else incoming += monthly
  }
  return { out: round(out), incoming: round(incoming) }
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later'

/** Overdue, due today, due within a week, or later. */
export function dueState(date: string, today = isoDay(new Date())): DueState {
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  const [year, month, day] = today.split('-').map(Number)
  return date <= isoDay(new Date(year, month - 1, day + 7)) ? 'soon' : 'later'
}

// ── Receipts ──────────────────────────────────────────────────────────────────────

/** A file name safe for a storage path: ASCII letters, digits, dot, dash, underscore. */
export function safeFileName(name: string) {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
  const trimmed = cleaned.slice(-80)
  return trimmed || 'receipt'
}

export function receiptPath(workspaceId: string, id: string, fileName: string) {
  return `${workspaceId}/receipts/${id}-${safeFileName(fileName)}`
}

/** Parses a number input's value ("1234.50", "12") into a positive amount, or null. */
export function parseAmount(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed > 0 ? round(parsed) : null
}
