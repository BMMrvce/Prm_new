'use client'

import { CheckCheck, ListTodo, Plus } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useUser } from '@/core/session'
import { Button } from '@/ui/button'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { groupByDue } from './logic'
import { isOpen, useTasks, type Task } from './queries'
import { useTaskPanel } from './task-bits'
import { applyFilter, EMPTY_FILTER, TaskFilters, type TaskFilter } from './task-filters'
import { TaskRow } from './task-row'
import { useTaskContext } from './use-task-context'
import { useToggleTask } from './use-toggle-task'

type View = 'open' | 'done'

/**
 * Tasks grouped by when they are due, with filters. `scope` is a workspace id or 'all'
 * for every workspace at once. Subtasks appear under their parent's count, not as rows.
 */
export function TaskListView({ scope, onNew, projectId }: { scope: string | 'all'; onNew?: () => void; projectId?: string }) {
  const user = useUser()
  const { data: tasks, isPending, error, refetch } = useTasks(scope)
  const context = useTaskContext(scope)
  const panel = useTaskPanel()
  const toggle = useToggleTask(context)
  const [view, setView] = useState<View>('open')
  const [filter, setFilter] = useState<TaskFilter>({ ...EMPTY_FILTER, projectId: projectId ?? '' })
  const deferredFilter = useDeferredValue(filter)
  const [now] = useState(() => new Date())

  const { groups, done, counts, subtasks } = useMemo(() => {
    const all = tasks ?? []
    const subtasks = new Map<string, { done: number; total: number }>()
    for (const task of all) {
      if (!task.parentId) continue
      const entry = subtasks.get(task.parentId) ?? { done: 0, total: 0 }
      entry.total += 1
      if (!isOpen(task)) entry.done += 1
      subtasks.set(task.parentId, entry)
    }
    const visible = applyFilter(
      all.filter((task) => !task.parentId),
      deferredFilter,
      user.id,
      context,
    )
    const open = visible.filter(isOpen)
    const finished = visible
      .filter((task) => !isOpen(task))
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
    return { groups: groupByDue(open, now), done: finished, counts: { open: open.length, done: finished.length }, subtasks }
  }, [tasks, deferredFilter, user.id, context, now])

  const onOpen = panel.open

  if (error) return <ErrorNotice message={error.message} onRetry={() => refetch()} />

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      context={context}
      now={now}
      showWorkspace={scope === 'all'}
      subtaskCount={subtasks.get(task.id)}
      onOpen={onOpen}
      onToggle={toggle}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Show"
          value={view}
          onChange={setView}
          items={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'done', label: 'Done', count: counts.done },
          ]}
        />
        {onNew && (
          <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={onNew}>
            New task
          </Button>
        )}
      </div>
      <TaskFilters filter={filter} onChange={setFilter} context={context} scope={scope} />

      {isPending ? (
        <div className="neo-card space-y-2 rounded-xl p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11" />
          ))}
        </div>
      ) : view === 'open' ? (
        groups.length ? (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.key} className="neo-card rounded-xl p-1.5" aria-labelledby={`bucket-${group.key}`}>
                <h2 id={`bucket-${group.key}`} className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold text-ink-2">
                  <span className={`size-2 rounded-full ${group.tone}`} aria-hidden />
                  {group.label}
                  <span className="font-normal text-ink-3">{group.tasks.length}</span>
                </h2>
                <ul>{group.tasks.map(row)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="neo-card rounded-xl">
            <EmptyState
              icon={ListTodo}
              title={tasks?.length ? 'Nothing matches these filters' : 'No open tasks'}
              hint={tasks?.length ? 'Try clearing a filter.' : 'Add your first task with the button above or press N.'}
              action={!tasks?.length && onNew ? <Button variant="primary" size="sm" onClick={onNew}>New task</Button> : undefined}
            />
          </div>
        )
      ) : done.length ? (
        <section className="neo-card rounded-xl p-1.5">
          <ul>{done.map(row)}</ul>
          <p className="px-3 py-2 text-2xs text-ink-3">Showing tasks finished in the last 30 days.</p>
        </section>
      ) : (
        <div className="neo-card rounded-xl">
          <EmptyState icon={CheckCheck} title="Nothing finished in the last 30 days" />
        </div>
      )}
    </div>
  )
}
