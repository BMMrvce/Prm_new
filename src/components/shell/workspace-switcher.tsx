'use client'

import { Check, ChevronsUpDown, Layers, LockKeyhole, Pin, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ALL_HREF, WELCOME_HREF, workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { useSavePrefs, useWorkspaces } from '@/core/workspaces'
import { cn } from '@/ui/cn'
import { IconTile } from '@/ui/misc'

/**
 * Switcher at the top of the sidebar: every workspace you belong to, searchable and
 * keyboard-driven (↑ ↓ Enter, type to filter), plus "All workspaces" and "New".
 */
export function WorkspaceSwitcher({ current, collapsed, onNavigate }: { current: Workspace | null; collapsed?: boolean; onNavigate?: () => void }) {
  const router = useRouter()
  const { data: workspaces = [] } = useWorkspaces()
  const savePrefs = useSavePrefs()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return workspaces.filter((ws) => !ws.archivedAt && (!term || ws.name.toLowerCase().includes(term)))
  }, [workspaces, query])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const go = (ws: Workspace) => {
    setOpen(false)
    setQuery('')
    onNavigate?.()
    router.push(workspaceHref(ws.slug))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, visible.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter' && visible[active]) go(visible[active])
    else if (event.key === 'Escape') setOpen(false)
    else return
    event.preventDefault()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={collapsed ? (current?.name ?? 'All workspaces') : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border border-line bg-sidebar-card p-2 text-left hover:border-line-strong',
          collapsed && 'lg:justify-center lg:p-1.5',
        )}
      >
        {current ? (
          <IconTile icon={current.icon} colorKey={current.color} size={32} />
        ) : (
          <span className="grid size-8 place-items-center rounded-lg bg-primary-light text-primary-ink">
            <Layers size={17} aria-hidden />
          </span>
        )}
        <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <span className="flex items-center gap-1 truncate text-ui font-semibold text-ink">
            {current?.name ?? 'All workspaces'}
            {current?.protected && <LockKeyhole size={12} className="shrink-0 text-ink-3" aria-label="Protected" />}
          </span>
          <span className="block truncate text-2xs text-sidebar-muted">
            {current ? `${current.role[0].toUpperCase()}${current.role.slice(1)}` : `${workspaces.length} workspaces`}
          </span>
        </span>
        <ChevronsUpDown size={15} className={cn('shrink-0 text-sidebar-muted', collapsed && 'lg:hidden')} aria-hidden />
      </button>

      {open && (
        <div className="neo-popover animate-pop absolute top-full right-0 left-0 z-50 mt-1.5 min-w-64 rounded-xl p-1.5">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-2.5">
            <Search size={14} className="text-ink-3" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Find a workspace…"
              aria-label="Find a workspace"
              aria-controls={listId}
              aria-activedescendant={visible[active] ? `${listId}-${visible[active].id}` : undefined}
              className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3"
            />
          </label>
          <ul id={listId} role="listbox" aria-label="Workspaces" className="mt-1.5 max-h-72 overflow-y-auto">
            {visible.map((ws, index) => (
              <li
                key={ws.id}
                id={`${listId}-${ws.id}`}
                role="option"
                aria-selected={ws.id === current?.id}
                onMouseEnter={() => setActive(index)}
                className={cn('group flex items-center gap-2.5 rounded-lg px-2 py-1.5', index === active && 'bg-surface-2')}
              >
                <button type="button" onClick={() => go(ws)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <IconTile icon={ws.icon} colorKey={ws.color} size={26} />
                  <span className="min-w-0 flex-1 truncate text-ui text-ink">{ws.name}</span>
                  {ws.protected && <LockKeyhole size={12} className="text-ink-3" aria-label="Protected" />}
                  {ws.id === current?.id && <Check size={15} className="text-primary-ink" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => savePrefs.mutate({ workspaceId: ws.id, pinned: !ws.prefs.pinned })}
                  aria-label={ws.prefs.pinned ? `Unpin ${ws.name}` : `Pin ${ws.name}`}
                  title={ws.prefs.pinned ? 'Unpin' : 'Pin to top'}
                  className={cn(
                    'grid size-6 place-items-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink',
                    ws.prefs.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                >
                  <Pin size={12} className={ws.prefs.pinned ? 'fill-current' : ''} />
                </button>
              </li>
            ))}
            {!visible.length && <li className="px-2.5 py-3 text-center text-xs text-ink-3">No workspace matches “{query}”</li>}
          </ul>
          <div className="mt-1 border-t border-line-soft pt-1">
            <Link
              href={ALL_HREF}
              onClick={() => {
                setOpen(false)
                onNavigate?.()
              }}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-ui text-ink hover:bg-surface-2"
            >
              <Layers size={16} className="text-ink-2" aria-hidden /> All workspaces
            </Link>
            <Link
              href={`${WELCOME_HREF}?new=1`}
              onClick={() => {
                setOpen(false)
                onNavigate?.()
              }}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-ui text-ink hover:bg-surface-2"
            >
              <Plus size={16} className="text-ink-2" aria-hidden /> New workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
