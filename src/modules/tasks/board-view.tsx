'use client'

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, Kanban, Plus } from 'lucide-react'
import { memo, useDeferredValue, useMemo, useState } from 'react'
import { color } from '@/core/colors'
import { useUser } from '@/core/session'
import { cn } from '@/ui/cn'
import { EmptyState, ErrorNotice, IconTile } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { compareTasks, positionBetween, taskCode } from './logic'
import { CATEGORIES, useTasks, useUpdateTask, type StatusCategory, type Task } from './queries'
import type { Priority } from '@/lib/format'
import { AssigneeStack, DueChip, LabelChips, useTaskPanel } from './task-bits'
import { applyFilter, EMPTY_FILTER, TaskFilters, type TaskFilter } from './task-filters'
import { useTaskContext, type TaskContext } from './use-task-context'

/** Priority color code, used for the card's edge strip and the legend. */
const PRIORITY_TONE: Record<Priority, { label: string; bar: string; chip: string } | null> = {
  urgent: { label: 'Urgent', bar: 'bg-cat-red', chip: 'bg-cat-red-light text-cat-red-ink' },
  high: { label: 'High', bar: 'bg-cat-orange', chip: 'bg-cat-orange-light text-cat-orange-ink' },
  medium: { label: 'Medium', bar: 'bg-cat-blue', chip: 'bg-cat-blue-light text-cat-blue-ink' },
  low: { label: 'Low', bar: 'bg-cat-slate', chip: 'bg-cat-slate-light text-cat-slate-ink' },
  none: null,
}

type Column = { id: string; name: string; colorKey: string; category: StatusCategory; statusId?: string }

/**
 * Kanban board. In a workspace the columns are its own statuses (Settings → Board);
 * across all workspaces they are the shared categories (Backlog, To do, In progress,
 * Done), and a move picks the matching status in the card's own workspace.
 * Works with mouse, touch and keyboard (Space to pick up, arrows to move, Space to drop).
 */
export function BoardView({ scope, onNew, projectId }: { scope: string | 'all'; onNew?: (statusId?: string) => void; projectId?: string }) {
  const user = useUser()
  const { data: tasks, isPending, error, refetch } = useTasks(scope)
  const context = useTaskContext(scope)
  const panel = useTaskPanel()
  const update = useUpdateTask()
  const [filter, setFilter] = useState<TaskFilter>({ ...EMPTY_FILTER, projectId: projectId ?? '' })
  const deferredFilter = useDeferredValue(filter)
  const [showCancelled, setShowCancelled] = useState(false)
  const [dragging, setDragging] = useState<Record<string, string[]> | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const columns = useMemo<Column[]>(() => {
    if (scope === 'all') {
      return CATEGORIES.filter((category) => showCancelled || category.key !== 'cancelled').map((category) => ({
        id: category.key,
        name: category.label,
        colorKey: category.key === 'done' ? 'green' : category.key === 'in_progress' ? 'amber' : category.key === 'todo' ? 'blue' : 'slate',
        category: category.key,
      }))
    }
    return context.statuses.list
      .filter((status) => showCancelled || status.category !== 'cancelled')
      .map((status) => ({ id: status.id, name: status.name, colorKey: status.color, category: status.category, statusId: status.id }))
  }, [scope, context.statuses.list, showCancelled])

  const byId = useMemo(() => new Map((tasks ?? []).map((task) => [task.id, task])), [tasks])

  const derived = useMemo(() => {
    const visible = applyFilter(
      (tasks ?? []).filter((task) => !task.parentId),
      deferredFilter,
      user.id,
      context,
    )
    const result: Record<string, string[]> = Object.fromEntries(columns.map((column) => [column.id, []]))
    for (const task of visible) {
      const key = scope === 'all' ? task.statusCategory : (task.statusId ?? '')
      result[key]?.push(task.id)
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => {
        const ta = byId.get(a)!
        const tb = byId.get(b)!
        return ta.position - tb.position || compareTasks(ta, tb)
      })
    }
    return result
  }, [tasks, deferredFilter, user.id, context, columns, scope, byId])

  const lists = dragging ?? derived

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = (id: string, source: Record<string, string[]>) => (id in source ? id : Object.keys(source).find((key) => source[key].includes(id)))

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    setDragging(structuredClone(derived))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragging) return
    const from = containerOf(String(active.id), dragging)
    const to = containerOf(String(over.id), dragging)
    if (!from || !to || from === to) return
    setDragging((current) => {
      if (!current) return current
      const source = current[from].filter((id) => id !== active.id)
      const target = [...current[to]]
      const overIndex = target.indexOf(String(over.id))
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id))
      return { ...current, [from]: source, [to]: target }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const state = dragging
    setActiveId(null)
    setDragging(null)
    if (!over || !state) return
    const taskId = String(active.id)
    const column = containerOf(taskId, state)
    if (!column) return
    let list = state[column]
    const overIndex = list.indexOf(String(over.id))
    const fromIndex = list.indexOf(taskId)
    if (overIndex >= 0 && overIndex !== fromIndex) list = arrayMove(list, fromIndex, overIndex)
    const index = list.indexOf(taskId)
    const task = byId.get(taskId)
    if (!task) return
    const before = index > 0 ? byId.get(list[index - 1])?.position : undefined
    const after = index < list.length - 1 ? byId.get(list[index + 1])?.position : undefined
    const position = positionBetween(before, after)

    const target = columns.find((entry) => entry.id === column)!
    const status = scope === 'all' ? context.statuses.first(task.workspaceId, target.category) : context.statuses.byId.get(target.statusId!)
    if (!status) return
    if (status.id === task.statusId && position === task.position) return
    update.mutate({ id: task.id, changes: { statusId: status.id, statusCategory: status.category, position } })
  }

  if (error) return <ErrorNotice message={error.message} onRetry={() => refetch()} />

  const activeTask = activeId ? byId.get(activeId) : undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskFilters filter={filter} onChange={setFilter} context={context} scope={scope} />
        <div className="flex flex-wrap items-center gap-4">
          <ul className="hidden items-center gap-3 text-2xs text-ink-2 md:flex" aria-label="Priority colors">
            {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className={cn('h-3 w-1 rounded-full', PRIORITY_TONE[key]!.bar)} aria-hidden />
                {PRIORITY_TONE[key]!.label}
              </li>
            ))}
          </ul>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} className="accent-[var(--brand-primary)]" />
          Show cancelled
        </label>
        </div>
      </div>

      {isPending || !context.statuses.ready ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-80 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : !columns.length ? (
        <EmptyState icon={Kanban} title="No columns yet" hint="Add columns in Settings → Board." />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null)
            setDragging(null)
          }}
          accessibility={{
            screenReaderInstructions: { draggable: 'To move a task, press Space, use the arrow keys to choose a column and position, then press Space again. Press Escape to cancel.' },
          }}
        >
          <div className="-mx-4 flex snap-x items-start gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0" role="list" aria-label="Board columns">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                ids={lists[column.id] ?? []}
                byId={byId}
                context={context}
                now={now}
                showWorkspace={scope === 'all'}
                onOpen={panel.open}
                onAdd={scope !== 'all' && onNew ? () => onNew(column.statusId) : undefined}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
            {activeTask ? <CardBody task={activeTask} context={context} now={now} showWorkspace={scope === 'all'} lifted /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function BoardColumn({
  column,
  ids,
  byId,
  context,
  now,
  showWorkspace,
  onOpen,
  onAdd,
}: {
  column: Column
  ids: string[]
  byId: Map<string, Task>
  context: TaskContext
  now: Date
  showWorkspace: boolean
  onOpen: (id: string) => void
  onAdd?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const tone = color(column.colorKey)
  return (
    <section
      role="listitem"
      aria-label={`${column.name}, ${ids.length} tasks`}
      className={cn(
        'relative flex max-h-[calc(100dvh-210px)] min-w-[270px] flex-1 basis-0 snap-start flex-col overflow-hidden rounded-xl border border-line bg-surface-2 transition-[box-shadow,background-color]',
        isOver && cn('ring-2', tone.ring),
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-1', tone.dot)} aria-hidden />
      <header className="flex items-center gap-2 px-3 pt-4 pb-2.5">
        <span className={cn('size-2 rounded-full', tone.dot)} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-ui font-semibold">{column.name}</h2>
        <span className={cn('min-w-6 rounded-full px-2 text-center text-2xs font-semibold tabular-nums', tone.soft, tone.ink)}>{ids.length}</span>
        {onAdd && (
          <button type="button" onClick={onAdd} aria-label={`Add task to ${column.name}`} className="grid size-6 place-items-center rounded-md text-ink-2 hover:bg-surface-3 hover:text-ink">
            <Plus size={14} />
          </button>
        )}
      </header>
      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {ids.map((id) => {
            const task = byId.get(id)
            return task ? <SortableCard key={id} task={task} context={context} now={now} showWorkspace={showWorkspace} onOpen={onOpen} /> : null
          })}
          {!ids.length && <li className={cn('grid flex-1 place-items-center rounded-lg border border-dashed py-8 text-2xs text-ink-3', isOver ? 'border-transparent' : 'border-line-strong')}>Drop tasks here</li>}
        </ul>
      </SortableContext>
      {onAdd && (
        <button type="button" onClick={onAdd} className="mx-2 mb-2 flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-ink-2 hover:bg-surface-3 hover:text-ink">
          <Plus size={13} aria-hidden /> Add task
        </button>
      )}
    </section>
  )
}

const SortableCard = memo(function SortableCard({
  task,
  context,
  now,
  showWorkspace,
  onOpen,
}: {
  task: Task
  context: TaskContext
  now: Date
  showWorkspace: boolean
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable task"
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event)
        if (event.key === 'Enter' && !event.defaultPrevented) onOpen(task.id)
      }}
    >
      <CardBody task={task} context={context} now={now} showWorkspace={showWorkspace} />
    </li>
  )
})

function CardBody({ task, context, now, showWorkspace, lifted }: { task: Task; context: TaskContext; now: Date; showWorkspace: boolean; lifted?: boolean }) {
  const workspace = context.workspaces.get(task.workspaceId)
  const project = task.projectId ? context.projects.get(task.projectId) : undefined
  const done = task.statusCategory === 'done' || task.statusCategory === 'cancelled'
  const tone = PRIORITY_TONE[task.priority]
  return (
    <div
      className={cn(
        'neo-card group relative cursor-grab overflow-hidden rounded-lg py-2.5 pr-3 pl-3.5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[var(--popover-shadow)] active:cursor-grabbing',
        done && 'opacity-70',
        lifted && 'rotate-[1.5deg] shadow-[var(--popover-shadow)] ring-1 ring-primary/30',
      )}
    >
      {tone && <span className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} aria-hidden />}
      <div className="flex items-start gap-2">
        {done && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success-ink" aria-hidden />}
        <p className={cn('min-w-0 flex-1 text-ui leading-5 font-medium text-ink', done && 'text-ink-3 line-through')}>{task.title}</p>
      </div>
      {(project || task.labelIds.length > 0 || (tone && (task.priority === 'urgent' || task.priority === 'high'))) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {tone && (task.priority === 'urgent' || task.priority === 'high') && (
            <span className={cn('rounded px-1.5 text-[10px] leading-4 font-semibold tracking-wide uppercase', tone.chip)}>{tone.label}</span>
          )}
          {project && (
            <span className={cn('flex max-w-40 items-center gap-1 rounded px-1.5 text-2xs leading-4', color(project.color).soft, color(project.color).ink)} title={project.name}>
              <span className={cn('size-1.5 shrink-0 rounded-full', color(project.color).dot)} aria-hidden />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          <LabelChips ids={task.labelIds} labels={context.labels} />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-2xs text-ink-3">
        {showWorkspace && workspace ? <IconTile icon={workspace.icon} colorKey={workspace.color} size={16} /> : null}
        <span className="font-mono tabular-nums">{taskCode(workspace?.taskPrefix, task.number)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <DueChip dueAt={task.dueAt} done={done} now={now} />
          <AssigneeStack ids={task.assigneeIds} people={context.people} max={2} />
        </span>
      </div>
    </div>
  )
}
