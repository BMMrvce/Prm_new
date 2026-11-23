'use client'

import { GitBranch, Repeat } from 'lucide-react'
import { memo } from 'react'
import { color } from '@/core/colors'
import { cn } from '@/ui/cn'
import { IconTile } from '@/ui/misc'
import { taskCode } from './logic'
import { isOpen, type Task } from './queries'
import { AssigneeStack, CompleteToggle, DueChip, LabelChips, PriorityIcon, StatusDot } from './task-bits'
import type { TaskContext } from './use-task-context'

/** One task in a list. Memoised: a list of hundreds re-renders only the rows that change. */
export const TaskRow = memo(function TaskRow({
  task,
  context,
  now,
  showWorkspace,
  subtaskCount,
  onOpen,
  onToggle,
}: {
  task: Task
  context: TaskContext
  now: Date
  showWorkspace?: boolean
  subtaskCount?: { done: number; total: number }
  onOpen: (taskId: string) => void
  onToggle: (task: Task, done: boolean) => void
}) {
  const workspace = context.workspaces.get(task.workspaceId)
  const project = task.projectId ? context.projects.get(task.projectId) : undefined
  const status = task.statusId ? context.statuses.byId.get(task.statusId) : undefined
  const done = !isOpen(task)
  return (
    <li className="animate-row group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(task.id)
          }
        }}
        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        <CompleteToggle done={task.statusCategory === 'done'} onChange={(value) => onToggle(task, value)} label={`Complete ${task.title}`} />
        <PriorityIcon priority={task.priority} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-ui text-ink', done && 'text-ink-3 line-through decoration-ink-3/60')}>{task.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
            <span className="tabular-nums">{taskCode(workspace?.taskPrefix, task.number)}</span>
            {status && (
              <span className="flex items-center gap-1">
                <StatusDot status={status} />
                {status.name}
              </span>
            )}
            {project && (
              <span className={cn('flex items-center gap-1', color(project.color).ink)}>
                <span className={cn('size-1.5 rounded-full', color(project.color).dot)} aria-hidden />
                {project.name}
              </span>
            )}
            {subtaskCount && subtaskCount.total > 0 && (
              <span className="flex items-center gap-0.5" title="Subtasks">
                <GitBranch size={11} aria-hidden /> {subtaskCount.done}/{subtaskCount.total}
              </span>
            )}
            {task.recurrence && <Repeat size={11} aria-label="Repeats" />}
          </div>
        </div>
        <span className="hidden sm:block">
          <LabelChips ids={task.labelIds} labels={context.labels} />
        </span>
        {showWorkspace && workspace && (
          <span className="hidden items-center gap-1.5 text-2xs text-ink-2 md:flex" title={workspace.name}>
            <IconTile icon={workspace.icon} colorKey={workspace.color} size={18} />
            <span className="max-w-24 truncate">{workspace.name}</span>
          </span>
        )}
        <DueChip dueAt={task.dueAt} done={done} now={now} />
        <AssigneeStack ids={task.assigneeIds} people={context.people} />
      </div>
    </li>
  )
})
