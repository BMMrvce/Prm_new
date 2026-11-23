'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MailQuery } from '@/lib/mail/types'
import { fieldClass, inputClass } from '@/ui/field'
import { cn } from '@/ui/cn'

export type MailRange = 'any' | 'today' | '7d' | '30d' | 'custom'
export type MailFilterState = { search: string; range: MailRange; from: string; to: string }

export const EMPTY_FILTERS: MailFilterState = { search: '', range: 'any', from: '', to: '' }

const RANGES: [MailRange, string][] = [
  ['any', 'Any time'],
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['custom', 'Custom range'],
]

function startOfDay(days: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

/** The API query; dates become exact instants in the viewer's time zone. */
export function toMailQuery(filters: MailFilterState): MailQuery {
  const query: MailQuery = {}
  if (filters.search.trim()) query.search = filters.search.trim()
  if (filters.range === 'today') query.after = startOfDay(0)
  if (filters.range === '7d') query.after = startOfDay(-6)
  if (filters.range === '30d') query.after = startOfDay(-29)
  if (filters.range === 'custom') {
    if (filters.from) query.after = new Date(`${filters.from}T00:00`).toISOString()
    if (filters.to) {
      const end = new Date(`${filters.to}T00:00`)
      end.setDate(end.getDate() + 1)
      query.before = end.toISOString()
    }
  }
  return query
}

export const filtersActive = (filters: MailFilterState) => Boolean(filters.search.trim()) || filters.range !== 'any'

/** Search (debounced) plus a date range. */
export function MailFilters({ value, onChange }: { value: MailFilterState; onChange: (next: MailFilterState) => void }) {
  const [text, setText] = useState(value.search)
  useEffect(() => setText(value.search), [value.search])
  useEffect(() => {
    if (text === value.search) return
    const timer = window.setTimeout(() => onChange({ ...value, search: text }), 450)
    return () => window.clearTimeout(timer)
  }, [text, value, onChange])

  const small = 'h-8 text-xs'
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onChange({ ...value, search: text })}
            className={cn(inputClass, small, 'pr-7 pl-8')}
            placeholder="Search mail"
            aria-label="Search mail"
            maxLength={200}
          />
          {text && (
            <button
              type="button"
              onClick={() => onChange({ ...value, search: '' })}
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-ink-3 hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={value.range}
          onChange={(event) => onChange({ ...value, range: event.target.value as MailRange })}
          className={fieldClass(cn(small, 'w-auto shrink-0 pr-2'))}
          aria-label="Date range"
        >
          {RANGES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {value.range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <input type="date" value={value.from} max={value.to || undefined} onChange={(event) => onChange({ ...value, from: event.target.value })} className={cn(inputClass, small, 'w-auto')} aria-label="From date" />
          <span>to</span>
          <input type="date" value={value.to} min={value.from || undefined} onChange={(event) => onChange({ ...value, to: event.target.value })} className={cn(inputClass, small, 'w-auto')} aria-label="To date" />
        </div>
      )}
    </div>
  )
}
