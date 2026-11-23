'use client'

import 'react-grid-layout/css/styles.css'
import { Check, LayoutGrid, Plus, RotateCcw, X } from 'lucide-react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMaybeWorkspace } from '@/core/workspaces'
import type { Workspace } from '@/core/types'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Skeleton } from '@/ui/spinner'
import { errorMessage, toast } from '@/ui/toast'
import { useDashboard, useResetDashboard, useSaveDashboard, type DashboardLayout, type WidgetInstance } from './queries'
import { availableWidgets, defaultLayout, pack, TEMPLATES, widgetDefinition } from './registry'

const ROW_HEIGHT = 40
const MOBILE = 760

/**
 * The home dashboard: a grid of widgets each person arranges for themselves, per
 * workspace (and one for All workspaces). Customize → drag, resize, add, remove,
 * apply a template or reset. On phones widgets simply stack.
 */
export function HomeDashboard() {
  const workspace = useMaybeWorkspace()
  return <Dashboard key={workspace?.id ?? 'all'} workspace={workspace} />
}

function Dashboard({ workspace }: { workspace: Workspace | null }) {
  const scope = workspace?.id ?? 'all'
  const { data: saved, isPending } = useDashboard(workspace?.id ?? null)
  const save = useSaveDashboard(workspace?.id ?? null, (error) => toast.error(`Your dashboard could not be saved. ${errorMessage(error)}`))
  const reset = useResetDashboard(workspace?.id ?? null)
  const [editing, setEditing] = useState(false)
  const [gallery, setGallery] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<DashboardLayout | null>(null)

  const fallback = useMemo(() => defaultLayout(workspace), [workspace])
  const allowed = useMemo(() => new Set(availableWidgets(workspace).map((widget) => widget.type)), [workspace])
  const layout: DashboardLayout = saved?.layout ?? fallback
  // Widgets whose module was switched off stay saved but hidden.
  const widgets = layout.widgets.filter((widget) => allowed.has(widget.type))

  // Writes the change waiting out the debounce, if any.
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    if (next) void save.save(next)
  }, [save])

  // The screen updates at once; drags are coalesced into one write 600 ms later.
  const persist = useCallback(
    (next: DashboardLayout, immediate = false) => {
      save.show(next)
      pending.current = next
      clearTimeout(timer.current)
      if (immediate) flush()
      else timer.current = setTimeout(flush, 600)
    },
    [save, flush],
  )

  // Never drop a change: save it when leaving the page, and while a save is still in
  // flight ask the browser to hold the reload until it lands.
  useEffect(() => {
    const onPageHide = () => flush()
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush()
      if (save.busy) event.preventDefault()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      flush()
    }
  }, [flush, save])

  const onLayoutChange = (next: Layout) => {
    if (!editing) return
    const byId = new Map(next.map((item) => [item.i, item]))
    const updated = layout.widgets.map((widget) => {
      const item = byId.get(widget.id)
      return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget
    })
    if (JSON.stringify(updated) !== JSON.stringify(layout.widgets)) persist({ version: 1, widgets: updated })
  }

  const add = (type: string) => {
    const definition = widgetDefinition(type)!
    const bottom = Math.max(0, ...layout.widgets.map((widget) => widget.y + widget.h))
    persist({ version: 1, widgets: [...layout.widgets, { id: `${type}-${Date.now()}`, type, x: 0, y: bottom, w: definition.size.w, h: definition.size.h }] }, true)
    setGallery(false)
    toast.success(`${definition.title} added`)
  }

  const remove = (id: string) => persist({ version: 1, widgets: layout.widgets.filter((widget) => widget.id !== id) }, true)

  const applyTemplate = (types: string[]) => {
    persist({ version: 1, widgets: pack(types.filter((type) => allowed.has(type))) }, true)
    setGallery(false)
  }

  const items: Layout = widgets.map((widget) => {
    const definition = widgetDefinition(widget.type)!
    return { i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h, minW: definition.size.minW, minH: definition.size.minH }
  })

  const mobile = mounted && width < MOBILE

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <p className="mr-auto text-xs text-ink-2">Drag widgets by their title, resize from the corner. Changes save automatically.</p>
            <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden />} onClick={() => setGallery(true)}>
              Add widget
            </Button>
            {saved?.id && (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} aria-hidden />} onClick={() => setConfirmReset(true)}>
                Reset
              </Button>
            )}
            <Button size="sm" variant="primary" icon={<Check size={14} aria-hidden />} onClick={() => (flush(), setEditing(false))}>
              Done
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<LayoutGrid size={14} aria-hidden />} onClick={() => setEditing(true)}>
            Customize
          </Button>
        )}
      </div>

      <div ref={containerRef} className={cn('-mx-2.5', editing && 'dashboard-editing')}>
        {isPending || !mounted ? (
          <div className="grid gap-4 px-2.5 md:grid-cols-2">
            <Skeleton className="h-28 rounded-xl md:col-span-2" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : mobile ? (
          <div className="space-y-4 px-2.5">
            {[...widgets]
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map((widget) => (
                <div key={widget.id} className="relative" style={{ height: Math.max(widget.h, 3) * ROW_HEIGHT + (widget.h - 1) * 16 }}>
                  <WidgetSlot widget={widget} workspace={workspace} scope={scope} editing={editing} onRemove={remove} />
                </div>
              ))}
          </div>
        ) : (
          <ReactGridLayout
            layout={items}
            width={width}
            gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: [16, 16], containerPadding: [10, 0] }}
            dragConfig={{ enabled: editing, handle: '.widget-drag' }}
            resizeConfig={{ enabled: editing, handles: ['se'] }}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((widget) => (
              <div key={widget.id}>
                <WidgetSlot widget={widget} workspace={workspace} scope={scope} editing={editing} onRemove={remove} />
              </div>
            ))}
          </ReactGridLayout>
        )}
        {!isPending && mounted && !widgets.length && (
          <div className="mx-2.5 rounded-xl border border-dashed border-line p-10 text-center">
            <p className="text-ui text-ink-2">This dashboard is empty.</p>
            <Button className="mt-3" size="sm" variant="primary" onClick={() => (setEditing(true), setGallery(true))}>
              Add widgets
            </Button>
          </div>
        )}
      </div>

      {gallery && (
        <Dialog title="Add to your dashboard" size="lg" onClose={() => setGallery(false)}>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">Templates</h3>
          <div className="mb-6 grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => applyTemplate(template.widgets)} className="rounded-xl border border-line p-3 text-left hover:border-primary/50 hover:bg-primary-subtle">
                <span className="block text-ui font-semibold">{template.label}</span>
                <span className="mt-0.5 block text-2xs text-ink-2">{template.description}</span>
              </button>
            ))}
          </div>
          <h3 className="mb-2 text-xs font-semibold text-ink-2">Widgets</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {availableWidgets(workspace).map((widget) => {
              const placed = layout.widgets.some((entry) => entry.type === widget.type)
              return (
                <li key={widget.type}>
                  <button type="button" onClick={() => add(widget.type)} className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:border-primary/50 hover:bg-primary-subtle">
                    <Plus size={16} className="mt-0.5 shrink-0 text-primary-ink" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-ui font-medium">
                        {widget.title} {placed && <span className="text-2xs font-normal text-ink-3">· already on the dashboard</span>}
                      </span>
                      <span className="block text-2xs text-ink-2">{widget.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Dialog>
      )}
      {confirmReset && saved?.id && (
        <ConfirmDialog
          title="Reset this dashboard?"
          message="It goes back to the default layout for this workspace."
          confirmLabel="Reset"
          tone="primary"
          busy={reset.isPending}
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            clearTimeout(timer.current)
            pending.current = null
            await reset.mutateAsync(saved.id)
            setConfirmReset(false)
          }}
        />
      )}
    </div>
  )
}

const WidgetSlot = memo(function WidgetSlot({
  widget,
  workspace,
  scope,
  editing,
  onRemove,
}: {
  widget: WidgetInstance
  workspace: Workspace | null
  scope: string
  editing: boolean
  onRemove: (id: string) => void
}) {
  const definition = widgetDefinition(widget.type)
  if (!definition) return null
  const Component = definition.component
  return (
    <div className={cn('relative h-full', editing && 'rounded-xl ring-2 ring-primary/25 ring-offset-2 ring-offset-canvas')}>
      {editing && (
        <div className="widget-drag absolute inset-x-0 top-0 z-10 flex h-10 cursor-grab items-center justify-end rounded-t-xl px-2 active:cursor-grabbing">
          <IconButton label={`Remove ${definition.title}`} size="sm" variant="secondary" onClick={() => onRemove(widget.id)} onMouseDown={(event) => event.stopPropagation()}>
            <X size={13} />
          </IconButton>
        </div>
      )}
      <div className={cn('h-full', editing && 'pointer-events-none select-none')}>
        <Component workspace={workspace} scope={scope} config={widget.config ?? {}} />
      </div>
    </div>
  )
})
