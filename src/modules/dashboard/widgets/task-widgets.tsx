'use client'

import { AlertCircle, BarChart3, FolderKanban, ListTodo } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { color } from '@/core/colors'
import { projectHref, workspaceHref } from '@/core/routes'
import { useUser } from '@/core/session'
import { useProjects } from '@/modules/projects/queries'
import { compareTasks, dueBucket } from '@/modules/tasks/logic'
import { CATEGORIES, isOpen, useTasks, type Task } from '@/modules/tasks/queries'
import { CompleteToggle, DueChip, PriorityIcon, useTaskPanel } from '@/modules/tasks/task-bits'
import { useTaskContext } from '@/modules/tasks/use-task-context'
import { useToggleTask } from '@/modules/tasks/use-toggle-task'
import { cn } from '@/ui/cn'
import { EmptyState, IconTile } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { WidgetAdd, WidgetFrame } from '../widget-frame'
import { canWrite } from '@/core/workspaces'
import { NewTaskDialog } from '@/modules/tasks/new-task-dialog'
import type { WidgetProps } from '../registry'

function TaskLines({ tasks, scope, empty }: { tasks: Task[]; scope: string | 'all'; empty: string }) {
  const context = useTaskContext(scope)
  const toggle = useToggleTask(context)
  const panel = useTaskPanel()
  const [now] = useState(() => new Date())
  if (!tasks.length) return <p className="py-6 text-center text-xs text-ink-3">{empty}</p>
  return (
    <ul className="-mx-2">
      {tasks.map((task) => {
        const workspace = context.workspaces.get(task.workspaceId)
        return (
          <li key={task.id} className="animate-row">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <CompleteToggle done={task.statusCategory === 'done'} onChange={(done) => toggle(task, done)} label={`Complete ${task.title}`} />
              <button type="button" onClick={() => panel.open(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {(task.priority === 'urgent' || task.priority === 'high') && <PriorityIcon priority={task.priority} size={13} />}
                <span className="min-w-0 flex-1 truncate text-ui">{task.title}</span>
              </button>
              {scope === 'all' && workspace && <IconTile icon={workspace.icon} colorKey={workspace.color} size={18} />}
              <DueChip dueAt={task.dueAt} now={now} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function MyTasksWidget({ scope, workspace }: WidgetProps) {
  const user = useUser()
  const [adding, setAdding] = useState(false)
  const { data, isPending } = useTasks(scope)
  const tasks = useMemo(
    () =>
      (data ?? [])
        .filter((task) => isOpen(task) && !task.parentId && (task.assigneeIds.includes(user.id) || (!task.assigneeIds.length && task.creatorId === user.id)))
        .sort(compareTasks)
        .slice(0, 12),
    [data, user.id],
  )
  return (
    <WidgetFrame title="My tasks" icon={<ListTodo size={15} />} action={workspace && canWrite(workspace) ? <WidgetAdd label="New task" onClick={() => setAdding(true)} /> : undefined}>
      {isPending ? <Skeleton className="h-24" /> : <TaskLines tasks={tasks} scope={scope} empty="Nothing assigned to you. Enjoy the calm." />}
      {adding && workspace && <NewTaskDialog workspace={workspace} onClose={() => setAdding(false)} />}
    </WidgetFrame>
  )
}

export function OverdueWidget({ scope }: WidgetProps) {
  const { data, isPending } = useTasks(scope)
  const [now] = useState(() => new Date())
  const tasks = useMemo(
    () => (data ?? []).filter((task) => isOpen(task) && !task.parentId && ['overdue', 'today'].includes(dueBucket(task.dueAt, now))).sort(compareTasks).slice(0, 12),
    [data, now],
  )
  return (
    <WidgetFrame title="Due today & overdue" icon={<AlertCircle size={15} />}>
      {isPending ? <Skeleton className="h-24" /> : <TaskLines tasks={tasks} scope={scope} empty="Nothing due today. 🎉" />}
    </WidgetFrame>
  )
}

export function TaskStatsWidget({ scope }: WidgetProps) {
  const { data = [] } = useTasks(scope)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const task of data) if (!task.parentId) map.set(task.statusCategory, (map.get(task.statusCategory) ?? 0) + 1)
    return map
  }, [data])
  const max = Math.max(1, ...counts.values())
  const tone: Record<string, string> = { backlog: 'bg-cat-slate', todo: 'bg-cat-blue', in_progress: 'bg-cat-amber', done: 'bg-cat-green', cancelled: 'bg-line-strong' }
  return (
    <WidgetFrame title="Work by stage" icon={<BarChart3 size={15} />}>
      <ul className="space-y-2.5 pt-1">
        {CATEGORIES.filter((category) => category.key !== 'cancelled').map((category) => {
          const value = counts.get(category.key) ?? 0
          return (
            <li key={category.key} className="text-xs">
              <div className="mb-1 flex justify-between">
                <span className="text-ink-2">{category.label}</span>
                <span className="font-medium tabular-nums">{value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className={cn('h-full rounded-full transition-[width] duration-500', tone[category.key])} style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-2xs text-ink-3">Done counts the last 30 days.</p>
    </WidgetFrame>
  )
}

export function ProjectsWidget({ workspace }: WidgetProps) {
  const { data: projects = [] } = useProjects(workspace?.id)
  const { data: tasks = [] } = useTasks(workspace?.id)
  const progress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    for (const task of tasks) {
      if (!task.projectId || task.parentId) continue
      const entry = map.get(task.projectId) ?? { done: 0, total: 0 }
      entry.total += 1
      if (!isOpen(task)) entry.done += 1
      map.set(task.projectId, entry)
    }
    return map
  }, [tasks])
  if (!workspace) return null
  const active = projects.filter((project) => project.status === 'active' || project.status === 'planned').slice(0, 8)
  return (
    <WidgetFrame
      title="Projects"
      icon={<FolderKanban size={15} />}
      action={
        <Link href={workspaceHref(workspace.slug, 'projects')} className="text-2xs font-medium text-primary-ink">
          All
        </Link>
      }
    >
      {active.length ? (
        <ul className="space-y-3 pt-1">
          {active.map((project) => {
            const entry = progress.get(project.id)
            const percent = entry?.total ? Math.round((entry.done / entry.total) * 100) : 0
            return (
              <li key={project.id}>
                <Link href={projectHref(workspace.slug, project.slug)} className="group block">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-medium group-hover:text-primary-ink">
                      <span className={cn('size-2 shrink-0 rounded-sm', color(project.color).dot)} aria-hidden />
                      <span className="truncate">{project.name}</span>
                    </span>
                    <span className="text-ink-3 tabular-nums">{percent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className={cn('h-full rounded-full', color(project.color).dot)} style={{ width: `${percent}%` }} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState icon={FolderKanban} title="No active projects" className="py-4" />
      )}
    </WidgetFrame>
  )
}
