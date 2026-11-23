'use client'

import { ArrowDown, ArrowUp, Plus, Tag, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { COLOR_KEYS, color } from '@/core/colors'
import type { ColorKey, Workspace } from '@/core/types'
import { canAdmin } from '@/core/workspaces'
import { CATEGORIES, useDeleteLabel, useLabels, useSaveStatuses, useStatuses, type Status, type StatusCategory } from '@/modules/tasks/queries'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Input, Select } from '@/ui/field'
import { Card, EmptyState } from '@/ui/misc'
import { toast } from '@/ui/toast'

type Draft = Omit<Status, 'workspaceId'>

/**
 * The workspace's Kanban columns. Each column belongs to a category (backlog, to do,
 * in progress, done, cancelled) so cross-workspace boards and completion still work
 * whatever the columns are called.
 */
export function BoardSettings({ workspace }: { workspace: Workspace }) {
  const admin = canAdmin(workspace)
  const { data: statuses } = useStatuses(workspace.id)
  const save = useSaveStatuses(workspace.id)
  const [list, setList] = useState<Draft[]>([])
  const [removed, setRemoved] = useState<{ id: string; moveTo: string }[]>([])

  useEffect(() => {
    if (statuses) {
      setList(statuses.map(({ workspaceId: _workspaceId, ...rest }) => rest))
      setRemoved([])
    }
  }, [statuses])

  const dirty = removed.length > 0 || JSON.stringify(list) !== JSON.stringify(statuses?.map(({ workspaceId: _w, ...rest }) => rest) ?? [])

  const patch = (id: string, change: Partial<Draft>) => setList(list.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  const move = (index: number, delta: number) => {
    const next = [...list]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setList(next)
  }
  const remove = (entry: Draft) => {
    const remaining = list.filter((item) => item.id !== entry.id)
    if (!remaining.length) return toast.error('A board needs at least one column.')
    if (!entry.id.startsWith('new-')) {
      // Tasks need a saved column to move to: same kind first, then any.
      const saved = remaining.filter((item) => !item.id.startsWith('new-'))
      const target = saved.find((item) => item.category === entry.category) ?? saved[0]
      if (!target) return toast.error('Save the new columns first, then delete this one.')
      setRemoved([...removed, { id: entry.id, moveTo: target.id }])
    }
    setList(remaining)
  }

  const submit = async () => {
    if (list.some((entry) => !entry.name.trim())) return toast.error('Every column needs a name.')
    for (const needed of ['todo', 'done'] as StatusCategory[]) {
      if (!list.some((entry) => entry.category === needed)) return toast.error(`Keep at least one “${CATEGORIES.find((c) => c.key === needed)?.label}” column.`)
    }
    await save.mutateAsync({ statuses: list, removed })
    toast.success('Board columns saved')
  }

  return (
    <div className="space-y-5">
      <Card title="Board columns" description="Rename, recolor and reorder columns. Tasks in a deleted column move to another column of the same kind.">
        <ul className="space-y-2">
          {list.map((entry, index) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
              <span className={cn('ml-1 size-3 shrink-0 rounded-full', color(entry.color).dot)} aria-hidden />
              <Input aria-label="Column name" value={entry.name} disabled={!admin} maxLength={40} onChange={(event) => patch(entry.id, { name: event.target.value })} className="h-8 min-w-36 flex-1" />
              <Select aria-label="Kind" value={entry.category} disabled={!admin} onChange={(event) => patch(entry.id, { category: event.target.value as StatusCategory })} className="h-8 w-36 text-xs">
                {CATEGORIES.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </Select>
              <Select aria-label="Color" value={entry.color} disabled={!admin} onChange={(event) => patch(entry.id, { color: event.target.value as ColorKey })} className="h-8 w-28 text-xs">
                {COLOR_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key[0].toUpperCase() + key.slice(1)}
                  </option>
                ))}
              </Select>
              {admin && (
                <span className="flex">
                  <IconButton label="Move up" size="sm" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton label="Move down" size="sm" disabled={index === list.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton label={`Delete ${entry.name}`} size="sm" onClick={() => remove(entry)}>
                    <Trash2 size={13} />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
        {admin && (
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => setList([...list, { id: `new-${crypto.randomUUID()}`, name: 'New column', category: 'in_progress', color: 'violet', position: list.length + 1 }])}
            >
              Add column
            </Button>
            <Button variant="primary" size="sm" disabled={!dirty} loading={save.isPending} onClick={submit}>
              Save columns
            </Button>
          </div>
        )}
      </Card>
      <LabelSettings workspace={workspace} />
    </div>
  )
}

function LabelSettings({ workspace }: { workspace: Workspace }) {
  const { data: labels = [] } = useLabels(workspace.id)
  const remove = useDeleteLabel(workspace.id)
  return (
    <Card title="Labels" description="Labels are created from any task. Delete the ones you no longer use here.">
      {labels.length ? (
        <ul className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={label.id} className={cn('flex h-7 items-center gap-1 rounded-md pr-1 pl-2.5 text-xs font-medium', color(label.color).soft, color(label.color).ink)}>
              {label.name}
              <button type="button" aria-label={`Delete label ${label.name}`} onClick={() => remove.mutate(label.id)} className="grid size-5 place-items-center rounded opacity-70 hover:opacity-100">
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Tag} title="No labels yet" hint="Open a task and add a label to create one." />
      )}
    </Card>
  )
}
