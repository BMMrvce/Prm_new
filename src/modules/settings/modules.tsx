'use client'

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, EyeOff, GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MODULE_GROUPS, MODULES, type ModuleManifest } from '@/core/modules'
import type { Workspace, WorkspaceModule } from '@/core/types'
import { canAdmin, useSaveModules, useSavePrefs } from '@/core/workspaces'
import { cn } from '@/ui/cn'
import { Switch } from '@/ui/field'
import { Icon } from '@/ui/icon'
import { Card } from '@/ui/misc'
import { errorMessage, toast } from '@/ui/toast'

/**
 * Admins switch modules on or off for everyone and drag them into sidebar order; anyone
 * can hide a module from their own sidebar. Every change saves straight away.
 */
export function ModuleSettings({ workspace }: { workspace: Workspace }) {
  // Re-start from the saved state whenever the workspace's modules change.
  return <ModuleList key={JSON.stringify(workspace.modules)} workspace={workspace} />
}

function ModuleList({ workspace }: { workspace: Workspace }) {
  const admin = canAdmin(workspace)
  const save = useSaveModules(workspace.id)
  const savePrefs = useSavePrefs()
  const hidden = new Set(workspace.prefs.hiddenModules)

  const initial = useMemo(() => {
    const stored = [...workspace.modules].sort((a, b) => a.position - b.position).filter((entry) => MODULES.some((manifest) => manifest.id === entry.moduleId))
    const missing = MODULES.filter((manifest) => !stored.some((entry) => entry.moduleId === manifest.id)).map(
      (manifest): WorkspaceModule => ({ moduleId: manifest.id, enabled: false, position: 999, config: {} }),
    )
    return [...stored, ...missing]
  }, [workspace.modules])
  const [list, setList] = useState(initial)

  const enabled = list.filter((entry) => entry.enabled)
  const available = list.filter((entry) => !entry.enabled)

  const commit = (next: WorkspaceModule[], message: string) => {
    if (!next.some((entry) => entry.enabled)) return toast.error('Keep at least one module switched on.')
    const ordered = [...next.filter((entry) => entry.enabled), ...next.filter((entry) => !entry.enabled)].map((entry, position) => ({ ...entry, position }))
    const previous = list
    setList(ordered)
    save.mutate(ordered, {
      onSuccess: () => toast.success(message),
      onError: (error) => {
        setList(previous)
        toast.error(errorMessage(error))
      },
    })
  }

  const patch = (moduleId: string, change: Partial<WorkspaceModule>, message: string) =>
    commit(
      list.map((entry) => (entry.moduleId === moduleId ? { ...entry, ...change } : entry)),
      message,
    )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = enabled.map((entry) => entry.moduleId)
    const moved = arrayMove(enabled, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    commit([...moved, ...available], 'Sidebar order saved')
  }

  const row = (entry: WorkspaceModule, sortable: boolean) => (
    <ModuleRow
      key={entry.moduleId}
      entry={entry}
      manifest={MODULES.find((item) => item.id === entry.moduleId)!}
      admin={admin}
      sortable={sortable}
      hiddenForMe={hidden.has(entry.moduleId)}
      onToggle={(on) => patch(entry.moduleId, { enabled: on }, on ? 'Module switched on' : 'Module switched off')}
      onConfig={(config) => patch(entry.moduleId, { config }, 'Saved')}
      onHide={(hide) =>
        savePrefs.mutate({ workspaceId: workspace.id, hiddenModules: hide ? [...hidden, entry.moduleId] : [...hidden].filter((id) => id !== entry.moduleId) })
      }
    />
  )

  return (
    <div className="space-y-5">
      <Card
        title="In your sidebar"
        description={admin ? 'Drag the handle to change the order. Changes save automatically and apply to everyone in this workspace.' : 'The modules this workspace uses. You can hide any of them from your own sidebar.'}
        actions={<span className="text-2xs text-ink-3 tabular-nums">{enabled.length} on</span>}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={enabled.map((entry) => entry.moduleId)} strategy={verticalListSortingStrategy}>
            <ul className="-my-1 space-y-1.5" aria-label="Modules in the sidebar">
              {enabled.map((entry) => row(entry, admin))}
            </ul>
          </SortableContext>
        </DndContext>
      </Card>
      {available.length > 0 && (
        <Card title="Available" description={admin ? 'Switch a module on to add it to the end of the sidebar. Turning one off hides it; nothing is deleted.' : 'Modules this workspace does not use.'}>
          <ul className="-my-1 space-y-1.5" aria-label="Available modules">
            {available.map((entry) => row(entry, false))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function ModuleRow({
  entry,
  manifest,
  admin,
  sortable,
  hiddenForMe,
  onToggle,
  onConfig,
  onHide,
}: {
  entry: WorkspaceModule
  manifest: ModuleManifest
  admin: boolean
  sortable: boolean
  hiddenForMe: boolean
  onToggle: (on: boolean) => void
  onConfig: (config: Record<string, unknown>) => void
  onHide: (hide: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.moduleId, disabled: !sortable })
  const option = manifest.options?.[0]
  const features = (entry.config[option?.key ?? ''] as string[] | undefined) ?? (option?.default as string[] | undefined) ?? []

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative rounded-lg border bg-surface px-3 py-2.5 transition-[border-color,box-shadow]',
        isDragging ? 'z-10 border-primary shadow-[var(--popover-shadow)]' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-3">
        {sortable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${manifest.label}`}
            className="-ml-1 grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical size={15} />
          </button>
        ) : null}
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', entry.enabled ? 'bg-primary-light text-primary-ink' : 'bg-surface-2 text-ink-3')}>
          <Icon name={manifest.icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <Switch
            checked={entry.enabled}
            disabled={!admin}
            onChange={onToggle}
            label={
              <span className="flex items-center gap-2">
                {manifest.label}
                <span className="rounded border border-line px-1 font-mono text-[10px] font-normal tracking-wide text-ink-3 uppercase">{MODULE_GROUPS[manifest.group]}</span>
                {hiddenForMe && <span className="text-2xs font-normal text-ink-3">· hidden for you</span>}
              </span>
            }
            description={manifest.description}
          />
          {entry.enabled && option?.choices && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${manifest.label}: ${option.label}`}>
              {option.choices.map((choice) => {
                const on = features.includes(choice.value)
                return (
                  <button
                    key={choice.value}
                    type="button"
                    disabled={!admin}
                    aria-pressed={on}
                    onClick={() => onConfig({ ...entry.config, [option.key]: on ? features.filter((value) => value !== choice.value) : [...features, choice.value] })}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-full border px-2.5 text-2xs font-medium transition-colors',
                      on ? 'border-primary bg-primary-light text-primary-ink' : 'border-line text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {on && <Check size={11} aria-hidden />} {choice.label}
                  </button>
                )
              })}
            </div>
          )}
          {entry.enabled && (
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-2xs text-ink-3 hover:text-ink-2">
              <input type="checkbox" className="accent-[var(--brand-primary)]" checked={hiddenForMe} onChange={(event) => onHide(event.target.checked)} />
              <EyeOff size={11} aria-hidden /> Hide from my sidebar only
            </label>
          )}
        </div>
      </div>
    </li>
  )
}
