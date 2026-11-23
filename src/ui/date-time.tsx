'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'

const pad = (value: number) => String(value).padStart(2, '0')
const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const fromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : null
}

/** "10:00" → "10:00 AM" in the browser's locale. */
export function formatClock(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Closes a popover on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    root.current?.addEventListener('keydown', onKey)
    const element = root.current
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      element?.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, root }
}

function Trigger({ icon, children, open, onClick, label, id, disabled }: { icon: ReactNode; children: ReactNode; open: boolean; onClick: () => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      id={id}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border bg-field px-3 text-left text-ui text-ink transition-colors disabled:opacity-60',
        open ? 'border-primary ring-2 ring-primary/20' : 'border-line-strong hover:border-ink-3',
      )}
    >
      <span className="shrink-0 text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

/** A date field that opens a month calendar. `value` and `min` are YYYY-MM-DD. */
export function DatePicker({
  value,
  onChange,
  label,
  min,
  weekStart = 1,
  id,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  min?: string
  weekStart?: 0 | 1
  id?: string
  disabled?: boolean
}) {
  const { open, setOpen, root } = usePopover()
  const selected = fromKey(value)
  const [cursor, setCursor] = useState(() => selected ?? new Date())
  const today = toKey(new Date())
  const gridId = useId()

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const leading = (new Date(year, month, 1).getDay() - weekStart + 7) % 7
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + ((index + weekStart) % 7)).toLocaleDateString(undefined, { weekday: 'narrow' }))

  const pick = (key: string) => {
    onChange(key)
    setOpen(false)
  }

  return (
    <div ref={root} className="relative min-w-0">
      <Trigger
        id={id}
        label={`${label}: ${selected ? selected.toDateString() : 'not set'}`}
        icon={<CalendarDays size={15} />}
        open={open}
        disabled={disabled}
        onClick={() => {
          setCursor(selected ?? new Date())
          setOpen(!open)
        }}
      >
        {selected ? selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}
      </Trigger>
      {open && (
        <div role="dialog" aria-label={label} className="neo-popover animate-pop absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl p-3">
          <div className="mb-2 flex items-center gap-1">
            <p className="flex-1 text-ui font-semibold">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
            <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2">
              <ChevronLeft size={15} />
            </button>
            <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))} className="grid size-7 place-items-center rounded-md text-ink-2 hover:bg-surface-2">
              <ChevronRight size={15} />
            </button>
          </div>
          <div id={gridId} className="grid grid-cols-7 gap-0.5 text-center">
            {weekdays.map((day, index) => (
              <span key={index} className="pb-1 text-2xs font-medium text-ink-3">
                {day}
              </span>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const key = toKey(new Date(year, month, index + 1))
              const isSelected = key === value
              const blocked = Boolean(min && key < min)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={blocked}
                  onClick={() => pick(key)}
                  aria-pressed={isSelected}
                  aria-label={new Date(year, month, index + 1).toDateString()}
                  className={cn(
                    'grid aspect-square place-items-center rounded-lg text-ui tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                    isSelected ? 'bg-primary font-semibold text-on-primary' : 'text-ink hover:bg-surface-2',
                    key === today && !isSelected && 'font-semibold text-primary-ink ring-1 ring-primary/40',
                  )}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-line-soft pt-2">
            {[
              ['Today', 0],
              ['Tomorrow', 1],
              ['Next week', 7],
            ].map(([text, offset]) => {
              const date = new Date()
              date.setDate(date.getDate() + Number(offset))
              const key = toKey(date)
              return (
                <button key={text} type="button" disabled={Boolean(min && key < min)} onClick={() => pick(key)} className="h-7 rounded-full border border-line px-2.5 text-2xs font-medium text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40">
                  {text}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** A time field with a list of 15-minute slots. `value` is HH:MM (24h). */
export function TimePicker({ value, onChange, label, id, disabled, after }: { value: string; onChange: (value: string) => void; label: string; id?: string; disabled?: boolean; after?: string }) {
  const { open, setOpen, root } = usePopover()
  const list = useRef<HTMLUListElement>(null)
  const slots = Array.from({ length: 96 }, (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`)
  const options = value && !slots.includes(value) ? [...slots, value].sort() : slots

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [open])

  /** How long after `after` a slot is, e.g. "1h 30m", shown next to end times. */
  const gap = (slot: string) => {
    if (!after) return null
    const [ah, am] = after.split(':').map(Number)
    const [sh, sm] = slot.split(':').map(Number)
    const minutes = sh * 60 + sm - (ah * 60 + am)
    if (minutes <= 0) return null
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`
  }

  return (
    <div ref={root} className="relative min-w-0">
      <Trigger id={id} label={`${label}: ${formatClock(value)}`} icon={<Clock size={15} />} open={open} disabled={disabled} onClick={() => setOpen(!open)}>
        {value ? formatClock(value) : 'Pick a time'}
      </Trigger>
      {open && (
        <ul ref={list} role="listbox" aria-label={label} className="neo-popover animate-pop absolute top-full left-0 z-50 mt-1.5 max-h-60 w-full min-w-40 overflow-y-auto overscroll-contain rounded-xl p-1">
          {options.map((slot) => {
            const selected = slot === value
            const length = gap(slot)
            return (
              <li key={slot}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(slot)
                    setOpen(false)
                  }}
                  className={cn('flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-ui tabular-nums', selected ? 'bg-primary-light font-medium text-primary-ink' : 'text-ink hover:bg-surface-2')}
                >
                  {formatClock(slot)}
                  {length && <span className="text-2xs text-ink-3">{length}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
