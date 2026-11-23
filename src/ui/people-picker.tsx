'use client'

import { Check, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Member } from '@/core/types'
import { cn } from './cn'
import { Avatar } from './misc'

/**
 * Pick people from a workspace's members (multi-select, searchable, keyboard-driven).
 * Only members can be chosen: the database refuses anyone else.
 */
export function PeoplePicker({
  members,
  value,
  onChange,
  label = 'Assignees',
  placeholder = 'Assign people',
}: {
  members: Member[]
  value: string[]
  onChange: (ids: string[]) => void
  label?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = members.filter((member) => value.includes(member.id))
  const options = useMemo(() => {
    const term = query.trim().toLowerCase()
    return members.filter((member) => !term || `${member.fullName ?? ''} ${member.email ?? ''}`.toLowerCase().includes(term))
  }, [members, query])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => !rootRef.current?.contains(event.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, options.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter' && options[active]) toggle(options[active].id)
    else if (event.key === 'Escape') setOpen(false)
    else return
    event.preventDefault()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`${label}: ${selected.map((member) => member.fullName ?? member.email).join(', ') || 'none'}`}
        aria-expanded={open}
        className="neo-control flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 text-left text-ui hover:bg-surface-2"
      >
        {selected.length ? (
          selected.map((member) => (
            <span key={member.id} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2 pl-0.5 text-xs">
              <Avatar name={member.fullName ?? member.email} src={member.avatarUrl} size={20} />
              {member.fullName ?? member.email}
            </span>
          ))
        ) : (
          <span className="flex items-center gap-2 px-1 text-ink-3">
            <UserPlus size={15} aria-hidden /> {placeholder}
          </span>
        )}
      </button>
      {open && (
        <div className="neo-popover animate-pop absolute z-50 mt-1 w-full min-w-60 rounded-lg p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search people…"
            aria-label="Search people"
            className="h-8 w-full rounded-md bg-surface-2 px-2.5 text-ui outline-none placeholder:text-ink-3"
          />
          <ul role="listbox" aria-multiselectable="true" aria-label={label} className="mt-1 max-h-56 overflow-y-auto">
            {options.map((member, index) => {
              const on = value.includes(member.id)
              return (
                <li
                  key={member.id}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => toggle(member.id)}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5', index === active && 'bg-surface-2')}
                >
                  <Avatar name={member.fullName ?? member.email} src={member.avatarUrl} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui">{member.fullName ?? member.email}</span>
                    {member.fullName && <span className="block truncate text-2xs text-ink-3">{member.email}</span>}
                  </span>
                  {on && <Check size={15} className="text-primary-ink" aria-hidden />}
                </li>
              )
            })}
            {!options.length && <li className="px-2 py-3 text-center text-xs text-ink-3">No members match</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
