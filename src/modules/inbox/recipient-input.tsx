'use client'

import { useId, useMemo, useRef, useState } from 'react'
import type { MailContact } from '@/lib/mail/types'
import { useMembers } from '@/core/workspaces'
import { cn } from '@/ui/cn'
import { inputClass } from '@/ui/field'
import { useContacts } from './api'

const MIN_CHARS = 2
const MAX_SUGGESTIONS = 6

/** The address being typed: whatever follows the last comma. */
const currentToken = (value: string) => value.slice(value.lastIndexOf(',') + 1).trim().toLowerCase()

/**
 * Address field (ARIA combobox) suggesting people you have mailed with in this workspace's
 * mailbox and the workspace's members. Picking one completes the current address.
 */
export function RecipientInput({
  workspaceId,
  id,
  value,
  onChange,
  label,
  required,
  describedBy,
}: {
  workspaceId: string
  id: string
  value: string
  onChange: (value: string) => void
  label: string
  required?: boolean
  describedBy?: string
}) {
  const [focused, setFocused] = useState(false)
  const contacts = useContacts(workspaceId, focused)
  const { data: members = [] } = useMembers(workspaceId)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const query = currentToken(value)

  const suggestions = useMemo(() => {
    if (query.length < MIN_CHARS) return []
    const chosen = new Set(value.split(',').map((part) => part.trim().toLowerCase()))
    const people: MailContact[] = [
      ...(contacts.data ?? []),
      ...members.filter((member) => member.email).map((member) => ({ name: member.fullName ?? '', address: member.email! })),
    ]
    const seen = new Set<string>()
    return people
      .filter((person) => {
        const address = person.address.toLowerCase()
        if (seen.has(address) || (chosen.has(address) && address !== query)) return false
        seen.add(address)
        return address.includes(query) || person.name.toLowerCase().includes(query)
      })
      .slice(0, MAX_SUGGESTIONS)
  }, [contacts.data, members, query, value])
  const showList = open && suggestions.length > 0

  const pick = (contact: MailContact) => {
    const before = value.slice(0, value.lastIndexOf(',') + 1)
    onChange(`${before}${before ? ' ' : ''}${contact.address}, `)
    setOpen(false)
    setActive(0)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => {
          setFocused(true)
          setOpen(true)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!showList) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((index) => (index + step + suggestions.length) % suggestions.length)
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            pick(suggestions[active])
          } else if (event.key === 'Escape') {
            // Close the list without closing the dialog.
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
        className={inputClass}
        placeholder="name@example.com, …"
        aria-label={label}
        aria-describedby={describedBy}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        autoComplete="off"
        inputMode="email"
        required={required}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="neo-popover animate-pop absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg py-1">
          {suggestions.map((contact, index) => (
            <li
              key={contact.address}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(contact)}
              onMouseEnter={() => setActive(index)}
              className={cn('cursor-pointer px-3 py-2', index === active && 'bg-primary-light')}
            >
              <span className="block truncate text-ui font-medium text-ink">{contact.name || contact.address}</span>
              {contact.name && <span className="block truncate text-2xs text-ink-2">{contact.address}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
