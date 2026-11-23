'use client'

import { useQuery } from '@tanstack/react-query'
import { CircleHelp, CornerDownLeft, FileText, FolderKanban, Layers, Moon, PenTool, Plus, Search, Settings, SquareCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { visibleModules } from '@/core/modules'
import { ALL_HREF, boardHref, HELP_HREF, noteHref, projectHref, taskHref, WELCOME_HREF, workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { useWorkspaces } from '@/core/workspaces'
import { useTheme } from '@/lib/theme'
import { must, supabase } from '@/lib/supabase/client'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icon'
import { IconTile } from '@/ui/misc'
import { Spinner } from '@/ui/spinner'

type Item = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

type SearchRow = { kind: 'task' | 'note' | 'project' | 'whiteboard'; id: string; workspace_id: string; title: string; subtitle: string | null; ref: string | null }

const KIND_ICON = {
  task: <SquareCheck size={15} />,
  note: <FileText size={15} />,
  project: <FolderKanban size={15} />,
  whiteboard: <PenTool size={15} />,
}

/**
 * ⌘K / Ctrl+K: jump anywhere and search everything. Commands are filtered in the
 * browser; content is searched in Postgres (full-text, prefix-matched, RLS-filtered),
 * in this workspace or across all of them.
 */
export function CommandPalette({ workspace, onClose, onQuickAdd }: { workspace: Workspace | null; onClose: () => void; onQuickAdd?: () => void }) {
  const router = useRouter()
  const theme = useTheme()
  const { data: workspaces = [] } = useWorkspaces()
  const [query, setQuery] = useState('')
  const [everywhere, setEverywhere] = useState(!workspace)
  const [active, setActive] = useState(0)
  const deferred = useDeferredValue(query.trim())
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listId = useId()

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const search = useQuery({
    queryKey: ['search', deferred, everywhere ? 'all' : workspace?.id],
    enabled: deferred.length >= 2,
    staleTime: 10_000,
    queryFn: async () =>
      (must(await supabase().rpc('search_all', { term: deferred, target_workspace: everywhere ? null : (workspace?.id ?? null), max_results: 8 })) as SearchRow[]),
  })

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    const matches = (text: string) => !term || text.toLowerCase().includes(term)
    const list: Item[] = []
    const byId = new Map(workspaces.map((ws) => [ws.id, ws]))

    if (onQuickAdd) list.push({ id: 'new-task', group: 'Actions', label: 'New task', hint: 'N', icon: <Plus size={15} />, run: () => (onClose(), onQuickAdd()) })
    list.push(
      { id: 'new-ws', group: 'Actions', label: 'New workspace', icon: <Plus size={15} />, run: () => go(`${WELCOME_HREF}?new=1`) },
      { id: 'theme', group: 'Actions', label: `Switch to ${theme.resolved === 'dark' ? 'light' : 'dark'} mode`, icon: <Moon size={15} />, run: () => (theme.toggle(), onClose()) },
    )
    if (workspace) {
      list.push({ id: 'home', group: 'Go to', label: 'Home', icon: <Icon name="home" size={15} />, run: () => go(workspaceHref(workspace.slug)) })
      for (const manifest of visibleModules(workspace)) {
        list.push({ id: `m-${manifest.id}`, group: 'Go to', label: manifest.label, icon: <Icon name={manifest.icon} size={15} />, run: () => go(workspaceHref(workspace.slug, manifest.segment)) })
      }
      list.push({ id: 'settings', group: 'Go to', label: 'Workspace settings', icon: <Settings size={15} />, run: () => go(workspaceHref(workspace.slug, 'settings')) })
    }
    list.push(
      { id: 'all', group: 'Go to', label: 'All workspaces', icon: <Layers size={15} />, run: () => go(ALL_HREF) },
      { id: 'help', group: 'Go to', label: 'Help centre', icon: <CircleHelp size={15} />, run: () => go(HELP_HREF) },
    )
    for (const ws of workspaces) {
      if (ws.id !== workspace?.id && !ws.archivedAt)
        list.push({ id: `ws-${ws.id}`, group: 'Workspaces', label: ws.name, icon: <IconTile icon={ws.icon} colorKey={ws.color} size={20} />, run: () => go(workspaceHref(ws.slug)) })
    }
    const filtered = list.filter((item) => matches(item.label))

    for (const row of search.data ?? []) {
      const ws = byId.get(row.workspace_id)
      if (!ws) continue
      const href =
        row.kind === 'task'
          ? taskHref(ws.slug, row.id)
          : row.kind === 'note'
            ? noteHref(ws.slug, row.id)
            : row.kind === 'project'
              ? projectHref(ws.slug, row.ref ?? row.id)
              : boardHref(ws.slug, row.id)
      filtered.push({
        id: `${row.kind}-${row.id}`,
        group: 'Results',
        label: row.title,
        hint: [row.kind === 'task' ? row.subtitle : null, everywhere ? ws.name : null].filter(Boolean).join(' · '),
        icon: KIND_ICON[row.kind],
        run: () => go(href),
      })
    }
    return filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, search.data, workspaces, workspace, everywhere, theme.resolved])

  useEffect(() => setActive(0), [query])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, items.length - 1))
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0))
    else if (event.key === 'Enter') items[active]?.run()
    else return
    event.preventDefault()
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  let lastGroup = ''
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      aria-label="Search and commands"
      className="modal-dialog mx-auto mt-[12vh] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--popover-shadow)] backdrop:bg-scrim"
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-4">
        <Search size={17} className="shrink-0 text-ink-3" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={everywhere ? 'Search every workspace…' : `Search ${workspace?.name ?? ''}…`}
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
        />
        {search.isFetching && <Spinner size={15} className="text-ink-3" />}
        {workspace && (
          <button
            type="button"
            onClick={() => setEverywhere((value) => !value)}
            aria-pressed={everywhere}
            className={cn('rounded-md px-2 py-1 text-2xs font-medium whitespace-nowrap', everywhere ? 'bg-primary-light text-primary-ink' : 'bg-surface-2 text-ink-2')}
          >
            {everywhere ? 'All workspaces' : 'This workspace'}
          </button>
        )}
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(440px,60vh)] overflow-y-auto p-2">
        {items.map((item, index) => {
          const header = item.group !== lastGroup ? item.group : null
          lastGroup = item.group
          return (
            <li key={item.id} role="presentation">
              {header && <p className="px-2.5 pt-2 pb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{header}</p>}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => setActive(index)}
                onClick={item.run}
                className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-ui', index === active ? 'bg-surface-2' : '')}
              >
                <span className="shrink-0 text-ink-2">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="truncate text-2xs text-ink-3">{item.hint}</span>}
                {index === active && <CornerDownLeft size={13} className="shrink-0 text-ink-3" aria-hidden />}
              </div>
            </li>
          )
        })}
        {!items.length && (
          <li className="px-3 py-8 text-center text-ui text-ink-2">
            {deferred.length >= 2 && search.isFetching ? 'Searching…' : `Nothing matches “${query}”`}
          </li>
        )}
      </ul>
      <div className="flex items-center gap-4 border-t border-line-soft px-4 py-2 text-2xs text-ink-3">
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  )
}
