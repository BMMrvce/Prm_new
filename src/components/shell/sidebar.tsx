'use client'

import { Circle, CircleDot, Home, Layers, PanelLeft, Plus, Settings, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Logo } from '@/components/brand/logo'
import { color } from '@/core/colors'
import { MODULE_GROUPS, visibleModules, type ModuleGroup } from '@/core/modules'
import { ALL_HREF, projectHref, workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { useProjects } from '@/modules/projects/queries'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icon'
import { LinkPending } from '@/ui/link-pending'
import { Menu } from '@/ui/menu'
import { WorkspaceSwitcher } from './workspace-switcher'

export type SidebarMode = 'expanded' | 'collapsed' | 'hover'

const SIDEBAR_MODES: [SidebarMode, string][] = [
  ['expanded', 'Expanded'],
  ['collapsed', 'Collapsed'],
  ['hover', 'Expand on hover'],
]

/**
 * Navigation built from the current workspace's enabled modules (core/modules.ts), so
 * switching a module on or off in Settings changes the sidebar with no code changes.
 * On phones it is a drawer; on desktop it is expanded, an icon rail, or a rail that
 * expands on hover (Sidebar control at the bottom).
 */
export function Sidebar({
  workspace,
  open,
  mode,
  onClose,
  onModeChange,
  onQuickAdd,
}: {
  workspace: Workspace | null
  open: boolean
  mode: SidebarMode
  onClose: () => void
  onModeChange: (mode: SidebarMode) => void
  onQuickAdd?: () => void
}) {
  const pathname = usePathname()
  const [hovering, setHovering] = useState(false)
  // "Expand on hover" shows the icon rail and floats the full sidebar over the page on hover.
  const collapsed = mode === 'collapsed' || (mode === 'hover' && !hovering)
  const rail = collapsed ? 'lg:hidden' : ''
  const modules = workspace ? visibleModules(workspace) : []
  const showProjects = modules.some((manifest) => manifest.id === 'projects')
  const { data: projects = [] } = useProjects(showProjects ? workspace?.id : undefined)
  const activeProjects = projects.filter((project) => project.status !== 'archived' && project.status !== 'completed')

  const navLink = (href: string, label: string, icon: ReactNode, exact = false) => {
    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        title={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-ui',
          collapsed && 'lg:justify-center lg:px-0',
          active ? 'bg-nav-active font-medium text-nav-active-text' : 'text-sidebar-ink hover:bg-nav-hover hover:text-ink',
        )}
      >
        {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-nav-active-bar" aria-hidden />}
        <span className={cn('shrink-0', active && 'text-nav-active-icon')}>{icon}</span>
        <span className={cn('min-w-0 flex-1 truncate', rail)}>{label}</span>
        <LinkPending className={rail} />
      </Link>
    )
  }

  const sectionLabel = (label: string) => (
    <p className={cn('mt-5 mb-1 px-2.5 font-mono text-2xs tracking-[0.08em] text-sidebar-muted uppercase', collapsed && 'lg:sr-only')}>{label}</p>
  )

  const groups = [...new Set(modules.map((manifest) => manifest.group))] as ModuleGroup[]

  return (
    <>
      {open && <button className="fixed inset-0 z-40 animate-[fade-in_200ms_ease-out] bg-scrim lg:hidden" onClick={onClose} aria-label="Close menu" />}
      <aside
        onMouseEnter={mode === 'hover' ? () => setHovering(true) : undefined}
        onMouseLeave={mode === 'hover' ? () => setHovering(false) : undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-sidebar px-3 pt-4 pb-3 transition-[transform,width] duration-[320ms] ease-[var(--ease-out)] lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 [&>*]:shrink-0',
          mode === 'hover' ? 'lg:fixed' : 'lg:sticky',
          collapsed && 'lg:w-[64px] lg:px-2.5',
          mode === 'hover' && hovering && 'lg:shadow-[var(--popover-shadow)]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className={cn('mb-5 flex h-8 items-center justify-between px-1.5', collapsed && 'lg:justify-center lg:px-0')}>
          <Link href="/" className={rail} onClick={onClose}>
            <Logo className="h-[30px]" />
          </Link>
          {collapsed && <img src="/brand/icon-48.png" alt="ಸKala²" className="hidden size-8 rounded-lg lg:block" />}
          <button className="grid size-8 place-items-center rounded-lg text-sidebar-ink hover:bg-nav-hover lg:hidden" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <WorkspaceSwitcher current={workspace} collapsed={collapsed} onNavigate={onClose} />

        {workspace && onQuickAdd && canWrite(workspace) && (
          <button
            type="button"
            onClick={() => {
              onClose()
              onQuickAdd()
            }}
            title={collapsed ? 'New task (N)' : undefined}
            data-tour="quick-add"
            className={cn(
              'mt-3 flex h-9 w-full items-center gap-2 rounded-lg bg-primary px-3 text-ui font-medium text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-active',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            <Plus size={17} strokeWidth={2.4} className="shrink-0" aria-hidden />
            <span className={cn('flex-1 text-left', rail)}>New task</span>
            {!collapsed && <kbd className="hidden rounded border border-on-primary/30 px-1.5 font-sans text-2xs font-medium text-on-primary-muted lg:inline">N</kbd>}
          </button>
        )}

        {/* Only the navigation scrolls; the bottom controls stay outside so their menus are never clipped. */}
        <div className="min-h-0 shrink! grow overflow-x-hidden overflow-y-auto overscroll-contain">
        {workspace ? (
          <>
            <nav className="mt-4 space-y-0.5" aria-label="Workspace" data-tour="modules">
              {navLink(workspaceHref(workspace.slug), 'Home', <Home size={17} />, true)}
            </nav>
            {groups.map((group) => (
              <div key={group}>
                {sectionLabel(MODULE_GROUPS[group])}
                <nav className="space-y-0.5" aria-label={MODULE_GROUPS[group]}>
                  {modules
                    .filter((manifest) => manifest.group === group)
                    .map((manifest) => navLink(workspaceHref(workspace.slug, manifest.segment), manifest.label, <Icon name={manifest.icon} size={17} />))}
                </nav>
              </div>
            ))}
            {showProjects && activeProjects.length > 0 && (
              <div>
                {sectionLabel('Projects')}
                <nav className="space-y-0.5" aria-label="Projects">
                  {activeProjects.slice(0, 12).map((project) =>
                    navLink(
                      projectHref(workspace.slug, project.slug),
                      project.name,
                      <span className={cn('grid size-[17px] place-items-center')}>
                        <span className={cn('size-2.5 rounded-[3px]', color(project.color).dot)} />
                      </span>,
                    ),
                  )}
                </nav>
              </div>
            )}
          </>
        ) : (
          <nav className="mt-4 space-y-0.5" aria-label="All workspaces">
            {navLink(ALL_HREF, 'Overview', <Layers size={17} />, true)}
            {navLink(`${ALL_HREF}/tasks`, 'All tasks', <Icon name="check-square" size={17} />)}
            {navLink(`${ALL_HREF}/board`, 'All boards', <Icon name="kanban" size={17} />)}
            {navLink(`${ALL_HREF}/calendar`, 'All calendars', <Icon name="calendar" size={17} />)}
          </nav>
        )}
        </div>

        <div className="space-y-0.5 pt-4">
          {workspace && navLink(`${ALL_HREF}`, 'All workspaces', <Layers size={17} />, true)}
          {workspace && navLink(workspaceHref(workspace.slug, 'settings'), 'Settings', <Settings size={17} />)}
          <div className="hidden border-t border-line pt-2 lg:block">
            <Menu
              label="Sidebar control"
              side="top"
              align="start"
              items={[
                { heading: 'Sidebar control' },
                ...SIDEBAR_MODES.map(([value, label]) => ({
                  label,
                  icon: mode === value ? <CircleDot size={14} /> : <Circle size={14} className="opacity-0" />,
                  onSelect: () => {
                    setHovering(false)
                    onModeChange(value)
                  },
                })),
              ]}
              trigger={(props) => (
                <button {...props} type="button" className="grid size-8 place-items-center rounded-lg text-sidebar-muted hover:bg-nav-hover hover:text-ink" aria-label="Sidebar control" title="Sidebar control">
                  <PanelLeft size={16} />
                </button>
              )}
            />
          </div>
        </div>
      </aside>
    </>
  )
}
