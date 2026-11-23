'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export type MenuItem =
  | {
      label: ReactNode
      icon?: ReactNode
      onSelect: () => void
      danger?: boolean
      disabled?: boolean
      hint?: ReactNode
    }
  | 'separator'
  | { heading: ReactNode }

/**
 * Dropdown menu with full keyboard support: arrow keys, Home/End, Enter/Space to pick,
 * Escape or Tab to close (focus returns to the trigger), and type-ahead by first letter.
 */
export function Menu({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  className,
  label,
}: {
  trigger: (props: {
    ref: (element: HTMLButtonElement | null) => void
    onClick: () => void
    onKeyDown: (event: KeyboardEvent) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string
  }) => ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  /** Open below (default) or above the trigger, e.g. at the bottom of the sidebar. */
  side?: 'top' | 'bottom'
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  // Menus that open upwards float in a layer above the page, so a scrolling or narrow
  // parent (the sidebar) can never clip them.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const buttons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])

  const close = useCallback((focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    buttons()[0]?.focus()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, close])

  const onListKey = (event: KeyboardEvent) => {
    const all = buttons()
    const index = all.indexOf(document.activeElement as HTMLButtonElement)
    const move = (next: number) => all[(next + all.length) % all.length]?.focus()
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(all.length - 1)
    else if (event.key === 'Escape') close()
    else if (event.key === 'Tab') close(false)
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase()
      const after = [...all.slice(index + 1), ...all.slice(0, index + 1)]
      after.find((button) => button.textContent?.trim().toLowerCase().startsWith(letter))?.focus()
    } else return
    event.preventDefault()
  }

  const wrap = (node: ReactNode) => (side === 'top' ? createPortal(node, document.body) : node)

  return (
    <div className="relative">
      {trigger({
        ref: (element) => {
          triggerRef.current = element
        },
        onClick: () => {
          if (side === 'top' && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 6 })
          }
          setOpen((value) => !value)
        },
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
      })}
      {open && wrap(
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onListKey}
          style={side === 'top' && anchor ? { left: anchor.left, bottom: anchor.bottom } : undefined}
          className={cn(
            'neo-popover animate-pop min-w-48 rounded-lg p-1',
            side === 'top' ? 'fixed z-[100]' : cn('absolute z-50 mt-1.5', align === 'end' ? 'right-0' : 'left-0'),
            className,
          )}
        >
          {items.map((item, index) => {
            if (item === 'separator') return <div key={index} role="separator" className="my-1 h-px bg-line-soft" />
            if ('heading' in item)
              return (
                <p key={index} className="px-2.5 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-ink-3 uppercase">
                  {item.heading}
                </p>
              )
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  close()
                  item.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-ui outline-none focus:bg-surface-2 disabled:opacity-50',
                  item.danger ? 'text-error-ink' : 'text-ink',
                )}
              >
                {item.icon && <span className="shrink-0 text-ink-2">{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="text-2xs text-ink-3">{item.hint}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
