'use client'

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number }

/**
 * Segmented tabs following the ARIA tabs pattern: one tab stop, arrow keys / Home / End
 * move between tabs and select them. Pair with <TabPanel> for the content.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idBase,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  /** Shared with <TabPanel idBase> so tabs and panels reference each other. */
  idBase?: string
}) {
  const fallback = useId()
  const base = idBase ?? fallback
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent) => {
    const index = items.findIndex((item) => item.value === value)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    onChange(items[next].value)
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1', className)}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-3 text-ui whitespace-nowrap',
              selected ? 'bg-segment font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded px-1 text-2xs', selected ? 'bg-primary-light text-primary-ink' : 'bg-surface-3')}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idBase, value, children, className }: { idBase: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} className={className}>
      {children}
    </div>
  )
}
