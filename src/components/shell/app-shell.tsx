'use client'

import { CircleHelp, LockKeyhole, Menu as MenuIcon, Search } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState, ViewTransition, type ReactNode } from 'react'
import { useVault } from '@/components/security/vault'
import { moduleBySegment } from '@/core/modules'
import { HELP_HREF } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { RunningTimerPill } from '@/modules/time/running-timer'
import { TaskDetailHost } from '@/modules/tasks/task-detail-host'
import { cn } from '@/ui/cn'
import { ThemeToggle } from '@/ui/theme-controls'
import { CommandPalette } from './command-palette'
import { NotificationCenter } from './notifications'
import { QuickAddHost, useQuickAdd } from './quick-add'
import { Sidebar, type SidebarMode } from './sidebar'
import { TourHost, useTour } from './tour'
import { UserMenu } from './user-menu'

const SIDEBAR_KEY = 'kala-sidebar-mode'
const SIDEBAR_MODES: SidebarMode[] = ['expanded', 'collapsed', 'hover']

const GLOBAL_PAGES: Record<string, string> = { all: 'All workspaces', help: 'Help centre', account: 'Your account', invitations: 'Invitations', welcome: 'Welcome' }

/** The page name for the breadcrumb, from the URL and the module registry. */
function pageLabel(pathname: string, workspace: Workspace | null) {
  const parts = pathname.split('/').filter(Boolean)
  if (workspace && parts[0] === 'w') {
    const segment = parts[2]
    if (!segment) return 'Home'
    if (segment === 'settings') return 'Settings'
    return moduleBySegment(segment)?.label ?? null
  }
  return GLOBAL_PAGES[parts[0] ?? ''] ?? null
}

/**
 * The frame around every signed-in page: sidebar, header (search, notifications,
 * lock, theme, account) and the page with a crossfade between routes.
 * `workspace` is null on cross-workspace pages (All workspaces, Account, Help).
 */
export function AppShell({ workspace, children }: { workspace: Workspace | null; children: ReactNode }) {
  const pathname = usePathname()
  const vault = useVault()
  const tour = useTour()
  const quickAdd = useQuickAdd(workspace)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('expanded')
  const [searching, setSearching] = useState(false)
  const [mac, setMac] = useState(false)

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform))
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY) as SidebarMode | null
      if (saved && SIDEBAR_MODES.includes(saved)) setSidebarMode(saved)
    } catch {
      // Storage blocked: start expanded.
    }
  }, [])

  const changeSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarMode(mode)
    try {
      localStorage.setItem(SIDEBAR_KEY, mode)
    } catch {
      // Not remembered; fine.
    }
  }, [])

  const page = pageLabel(pathname, workspace)

  // ⌘K / Ctrl+K or "/" opens search; "N" adds a task — unless typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
        return
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return
      if (event.key === '/') {
        event.preventDefault()
        setSearching(true)
      } else if (event.key.toLowerCase() === 'n' && quickAdd.available) {
        event.preventDefault()
        quickAdd.open()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickAdd])

  return (
    <div className="workbench-scale flex min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only z-[200] rounded-lg bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar
        workspace={workspace}
        open={sidebarOpen}
        mode={sidebarMode}
        onClose={() => setSidebarOpen(false)}
        onModeChange={changeSidebarMode}
        onQuickAdd={quickAdd.available ? quickAdd.open : undefined}
      />
      {/* Holds the rail's place while the hover sidebar floats over the page. */}
      {sidebarMode === 'hover' && <div className="hidden w-[64px] shrink-0 lg:block" aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-line bg-surface/85 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            className="neo-control grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon size={18} />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-ui">
            <span className="truncate font-medium text-ink">{workspace?.name ?? 'ಸKala²'}</span>
            {workspace && <span className="rounded border border-line px-1.5 font-mono text-[10px] tracking-wide text-ink-3 uppercase">{workspace.role}</span>}
            {page && (
              <>
                <span className="text-ink-3" aria-hidden>
                  /
                </span>
                <span className="truncate text-ink-2" aria-current="page">
                  {page}
                </span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearching(true)}
              data-tour="search"
              className="neo-control flex h-8 items-center gap-2 rounded-full px-3 text-ui text-ink-3 hover:text-ink-2 sm:w-56"
              aria-label="Search"
            >
              <Search size={15} aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Search…</span>
              <kbd className="hidden font-sans text-2xs text-ink-3 sm:inline">{mac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <RunningTimerPill />
            {vault.status?.hasPin && (
              <button
                type="button"
                onClick={() => (vault.unlocked ? vault.lock() : vault.requestUnlock())}
                aria-label={vault.unlocked ? 'Lock protected items now' : 'Unlock protected items'}
                title={vault.unlocked ? 'Unlocked: click to lock now' : 'Locked: click to unlock'}
                className={cn(
                  'neo-control grid size-9 place-items-center rounded-lg',
                  vault.unlocked ? 'text-success-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                <LockKeyhole size={16} className={vault.unlocked ? 'opacity-60' : ''} />
              </button>
            )}
            <Link href={HELP_HREF} className="neo-control grid size-9 place-items-center rounded-full text-ink-2 hover:text-ink" aria-label="Help centre" title="Help centre">
              <CircleHelp size={17} />
            </Link>
            <ThemeToggle />
            <NotificationCenter />
            <UserMenu onStartTour={workspace ? tour.start : undefined} />
          </div>
        </header>
        <main id="main" className="app-canvas min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1480px] px-4 pt-5 pb-12 md:px-8 md:pt-6 2xl:px-10">
            <ViewTransition key={`${workspace?.id ?? 'global'}:${pathname}`} enter="page-enter" exit="page-exit" default="none">
              <div className="animate-page">{children}</div>
            </ViewTransition>
          </div>
        </main>
      </div>
      {searching && <CommandPalette workspace={workspace} onClose={() => setSearching(false)} onQuickAdd={quickAdd.available ? quickAdd.open : undefined} />}
      <QuickAddHost controller={quickAdd} />
      <Suspense>
        <TaskDetailHost />
        <TourHost controller={tour} workspace={workspace} />
      </Suspense>
    </div>
  )
}
