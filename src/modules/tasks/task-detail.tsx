'use client'

import { Copy, GitBranch, Link2, MessageSquare, Plus, Repeat, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { color, COLOR_KEYS } from '@/core/colors'
import { useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import { canAdmin, canWrite } from '@/core/workspaces'
import { duration, mailDate, type Priority } from '@/lib/format'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Input, Select, Textarea } from '@/ui/field'
import { Avatar } from '@/ui/misc'
import { PeoplePicker } from '@/ui/people-picker'
import { RichEditor } from '@/ui/rich-editor'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { parseDuration, PRIORITIES, taskCode } from './logic'
import {
  isOpen,
  useAddComment,
  useCreateLabel,
  useCreateTask,
  useDeleteComment,
  useDeleteTask,
  useSetDependencies,
  useSetTaskLinks,
  useTask,
  useTasks,
  useTaskTimeline,
  useUpdateTask,
  type Recurrence,
  type TaskChanges,
  type TaskDetail as Detail,
} from './queries'
import { CompleteToggle, StatusDot } from './task-bits'
import { isModuleEnabled } from '@/core/modules'
import { TaskTimeSection } from '@/modules/time/task-time-section'
import { useTaskContext } from './use-task-context'
import { useToggleTask } from './use-toggle-task'

const RECURRENCE: { value: string; label: string; rule: Recurrence }[] = [
  { value: '', label: 'Does not repeat', rule: null },
  { value: 'daily', label: 'Every day', rule: { freq: 'daily', interval: 1 } },
  { value: 'weekly', label: 'Every week', rule: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Every 2 weeks', rule: { freq: 'weekly', interval: 2 } },
  { value: 'monthly', label: 'Every month', rule: { freq: 'monthly', interval: 1 } },
  { value: 'yearly', label: 'Every year', rule: { freq: 'yearly', interval: 1 } },
]

const recurrenceValue = (rule: Recurrence) =>
  !rule ? '' : rule.freq === 'weekly' && rule.interval === 2 ? 'biweekly' : rule.interval === 1 ? rule.freq : ''

/** The task panel opened by `?task=<id>`: every field, subtasks, links and the timeline. */
export function TaskDetailDialog({ taskId, onClose, onOpenTask }: { taskId: string; onClose: () => void; onOpenTask: (id: string) => void }) {
  const { data: task, isPending } = useTask(taskId)

  if (isPending) {
    return (
      <Dialog title="Loading task…" size="xl" onClose={onClose}>
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      </Dialog>
    )
  }
  if (!task) {
    return (
      <Dialog title="Task not found" size="sm" onClose={onClose}>
        <p className="text-ui text-ink-2">It may have been deleted, or you no longer have access to it.</p>
      </Dialog>
    )
  }
  return <TaskEditor key={task.id} task={task} onClose={onClose} onOpenTask={onOpenTask} />
}

function TaskEditor({ task, onClose, onOpenTask }: { task: Detail; onClose: () => void; onOpenTask: (id: string) => void }) {
  const user = useUser()
  const context = useTaskContext(task.workspaceId)
  const workspace = context.workspaces.get(task.workspaceId)
  const { data: siblings = [] } = useTasks(task.workspaceId)
  const update = useUpdateTask()
  const links = useSetTaskLinks()
  const deps = useSetDependencies()
  const createTask = useCreateTask()
  const remove = useDeleteTask()
  const toggle = useToggleTask(context)
  const [title, setTitle] = useState(task.title)
  const [estimate, setEstimate] = useState(task.estimateMinutes ? duration(task.estimateMinutes) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [subtask, setSubtask] = useState('')

  useEffect(() => setTitle(task.title), [task.title])

  const editable = workspace ? canWrite(workspace) || task.assigneeIds.includes(user.id) : false
  const members = context.membersByWorkspace.get(task.workspaceId) ?? []
  const statuses = context.statuses.list.filter((status) => status.workspaceId === task.workspaceId)
  const projects = [...context.projects.values()].filter((project) => project.workspaceId === task.workspaceId && project.status !== 'archived')
  const subtasks = siblings.filter((entry) => entry.parentId === task.id)
  const parent = task.parentId ? siblings.find((entry) => entry.id === task.parentId) : undefined
  const blockers = siblings.filter((entry) => task.dependsOn.includes(entry.id))
  const openBlockers = blockers.filter(isOpen)

  const save = (changes: TaskChanges) => update.mutate({ id: task.id, changes })

  const saveTitle = () => {
    const next = title.trim()
    if (next && next !== task.title) save({ title: next })
    else setTitle(task.title)
  }

  const addSubtask = async (event: FormEvent) => {
    event.preventDefault()
    if (!subtask.trim()) return
    await createTask.mutateAsync({ workspaceId: task.workspaceId, title: subtask, parentId: task.id, projectId: task.projectId })
    setSubtask('')
  }

  const code = taskCode(workspace?.taskPrefix, task.number)

  return (
    <Dialog
      size="xl"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
          {workspace?.name} <span className="text-ink-3">/</span> <span className="tabular-nums">{code}</span>
          {parent && (
            <>
              <span className="text-ink-3">/ subtask of</span>
              <button type="button" onClick={() => onOpenTask(parent.id)} className="max-w-48 truncate text-primary-ink hover:underline">
                {parent.title}
              </button>
            </>
          )}
        </span>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-6">
          <div className="flex items-start gap-3">
            <div className="pt-2">
              <CompleteToggle done={task.statusCategory === 'done'} onChange={(done) => toggle(task, done)} label="Complete task" />
            </div>
            <Textarea
              value={title}
              onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
              onBlur={saveTitle}
              onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), event.currentTarget.blur())}
              readOnly={!editable}
              aria-label="Title"
              maxLength={300}
              rows={1}
              className="min-h-0 resize-none border-transparent bg-transparent px-1 text-lg font-semibold [field-sizing:content] hover:border-line focus:border-primary"
            />
          </div>

          {openBlockers.length > 0 && (
            <p className="rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-ink" role="status">
              Blocked by {openBlockers.length === 1 ? `“${openBlockers[0].title}”` : `${openBlockers.length} open tasks`}.
            </p>
          )}

          <section aria-label="Description">
            <RichEditor
              key={task.id}
              initialHtml={task.description}
              placeholder="Add details, links or a checklist…"
              minHeight={120}
              label="Description"
              onBlur={(html) => html !== task.description && save({ description: html })}
            />
          </section>

          <section aria-labelledby="subtasks-heading">
            <h3 id="subtasks-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <GitBranch size={13} aria-hidden /> Subtasks
              {subtasks.length > 0 && <span className="font-normal text-ink-3">{subtasks.filter((entry) => !isOpen(entry)).length}/{subtasks.length}</span>}
            </h3>
            <ul className="space-y-0.5">
              {subtasks.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <CompleteToggle done={entry.statusCategory === 'done'} onChange={(done) => toggle(entry, done)} label={`Complete ${entry.title}`} />
                  <button type="button" onClick={() => onOpenTask(entry.id)} className={cn('min-w-0 flex-1 truncate text-left text-ui', !isOpen(entry) && 'text-ink-3 line-through')}>
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>
            {editable && (
              <form onSubmit={addSubtask} className="mt-1 flex items-center gap-2">
                <Input value={subtask} onChange={(event) => setSubtask(event.target.value)} placeholder="Add a subtask…" aria-label="New subtask" className="h-8" />
                <Button type="submit" size="sm" variant="secondary" loading={createTask.isPending} disabled={!subtask.trim()} icon={<Plus size={14} aria-hidden />}>
                  Add
                </Button>
              </form>
            )}
          </section>

          <Timeline taskId={task.id} people={context.people} canModerate={workspace ? canAdmin(workspace) : false} />
        </div>

        <aside className="space-y-4 rounded-xl bg-surface-2/60 p-4 text-ui" aria-label="Task properties">
          <Property label="Status">
            <Select
              aria-label="Status"
              disabled={!editable}
              value={task.statusId ?? ''}
              onChange={(event) => {
                const status = statuses.find((entry) => entry.id === event.target.value)
                if (status) save({ statusId: status.id, statusCategory: status.category })
              }}
              className="h-8 text-xs"
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
            <span className="sr-only">
              <StatusDot status={context.statuses.byId.get(task.statusId ?? '')} />
            </span>
          </Property>
          <Property label="Priority">
            <Select aria-label="Priority" disabled={!editable} value={task.priority} onChange={(event) => save({ priority: event.target.value as Priority })} className="h-8 text-xs">
              {PRIORITIES.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Property>
          {projects.length > 0 && (
            <Property label="Project">
              <Select aria-label="Project" disabled={!editable} value={task.projectId ?? ''} onChange={(event) => save({ projectId: event.target.value || null })} className="h-8 text-xs">
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Property>
          )}
          <Property label="Due date">
            <Input
              type="date"
              aria-label="Due date"
              disabled={!editable}
              value={task.dueAt ? task.dueAt.slice(0, 10) : ''}
              onChange={(event) => save({ dueAt: event.target.value ? new Date(`${event.target.value}T23:59:00`).toISOString() : null })}
              className="h-8 text-xs"
            />
          </Property>
          <Property label="Repeats">
            <Select
              aria-label="Repeats"
              disabled={!editable}
              value={recurrenceValue(task.recurrence)}
              onChange={(event) => save({ recurrence: RECURRENCE.find((entry) => entry.value === event.target.value)?.rule ?? null })}
              className="h-8 text-xs"
            >
              {RECURRENCE.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
            {task.recurrence && (
              <p className="mt-1 flex items-center gap-1 text-2xs text-ink-3">
                <Repeat size={11} aria-hidden /> Completing it schedules the next one.
              </p>
            )}
          </Property>
          <Property label="Estimate">
            <Input
              aria-label="Estimate"
              disabled={!editable}
              value={estimate}
              placeholder="e.g. 2h 30m"
              onChange={(event) => setEstimate(event.target.value)}
              onBlur={() => {
                const minutes = estimate ? parseDuration(estimate) : null
                if (estimate && minutes === null) return toast.error('Write the estimate like “2h 30m”.')
                if (minutes !== task.estimateMinutes) save({ estimateMinutes: minutes })
              }}
              className="h-8 text-xs"
            />
          </Property>
          {workspace && isModuleEnabled(workspace, 'time') && <TaskTimeSection task={task} />}
          {members.length > 1 && (
            <Property label="Assignees">
              <PeoplePicker members={members} value={task.assigneeIds} onChange={(ids) => links.mutate({ id: task.id, kind: 'assignees', ids, previous: task.assigneeIds })} />
            </Property>
          )}
          <Property label="Labels">
            <LabelPicker
              workspaceId={task.workspaceId}
              labels={context.labelsFor(task.workspaceId)}
              value={task.labelIds}
              disabled={!editable}
              onChange={(ids) => links.mutate({ id: task.id, kind: 'labels', ids, previous: task.labelIds })}
            />
          </Property>
          <Property label="Blocked by">
            <Select
              aria-label="Add a blocking task"
              disabled={!editable}
              value=""
              onChange={(event) => event.target.value && deps.mutate({ id: task.id, ids: [...task.dependsOn, event.target.value], previous: task.dependsOn })}
              className="h-8 text-xs"
            >
              <option value="">Add a task…</option>
              {siblings
                .filter((entry) => entry.id !== task.id && !task.dependsOn.includes(entry.id) && entry.parentId !== task.id && isOpen(entry))
                .slice(0, 200)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {taskCode(workspace?.taskPrefix, entry.number)} {entry.title}
                  </option>
                ))}
            </Select>
            <ul className="mt-1.5 space-y-1">
              {blockers.map((entry) => (
                <li key={entry.id} className="flex items-center gap-1.5 text-xs">
                  <Link2 size={12} className="text-ink-3" aria-hidden />
                  <button type="button" onClick={() => onOpenTask(entry.id)} className={cn('min-w-0 flex-1 truncate text-left hover:underline', !isOpen(entry) && 'text-ink-3 line-through')}>
                    {entry.title}
                  </button>
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Remove ${entry.title}`}
                      onClick={() => deps.mutate({ id: task.id, ids: task.dependsOn.filter((id) => id !== entry.id), previous: task.dependsOn })}
                      className="text-ink-3 hover:text-ink"
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Property>
          <div className="space-y-1 border-t border-line pt-3 text-2xs text-ink-3">
            <p>Created {mailDate(task.createdAt)} by {context.people.get(task.creatorId)?.fullName ?? 'someone'}</p>
            {task.completedAt && <p>Completed {mailDate(task.completedAt)}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy size={13} aria-hidden />}
              onClick={() => navigator.clipboard.writeText(window.location.href).then(() => toast.success('Link copied'))}
            >
              Copy link
            </Button>
            {workspace && (canAdmin(workspace) || task.creatorId === user.id) && (
              <IconButton label="Delete task" size="md" variant="secondary" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} className="text-error-ink" />
              </IconButton>
            )}
          </div>
        </aside>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this task?"
          message={subtasks.length ? `Its ${subtasks.length} subtasks, comments and time entries go with it.` : 'Its comments and history go with it. This cannot be undone.'}
          busy={remove.isPending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await remove.mutateAsync(task.id)
            toast.success('Task deleted')
            onClose()
          }}
        />
      )}
    </Dialog>
  )
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
      {children}
    </div>
  )
}

function LabelPicker({
  workspaceId,
  labels,
  value,
  onChange,
  disabled,
}: {
  workspaceId: string
  labels: { id: string; name: string; color: ColorKey }[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const create = useCreateLabel(workspaceId)
  const [name, setName] = useState('')
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id])
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => {
          const on = value.includes(label.id)
          const tone = color(label.color)
          return (
            <button
              key={label.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggle(label.id)}
              className={cn('h-6 rounded-md px-2 text-2xs font-medium transition-colors', on ? `${tone.soft} ${tone.ink}` : 'border border-dashed border-line text-ink-3 hover:text-ink')}
            >
              {label.name}
            </button>
          )
        })}
      </div>
      {!disabled && (
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!name.trim()) return
            const id = await create.mutateAsync({ name, color: COLOR_KEYS[(labels.length + 1) % COLOR_KEYS.length] })
            onChange([...value, id])
            setName('')
          }}
        >
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New label" aria-label="New label" maxLength={40} className="h-7 text-xs" />
          <IconButton type="submit" label="Create label" size="sm" variant="secondary" disabled={!name.trim()}>
            <Tag size={13} />
          </IconButton>
        </form>
      )}
    </div>
  )
}

const ACTIVITY_TEXT: Record<string, (data: Record<string, unknown>) => string> = {
  'task.created': () => 'created the task',
  'task.status': (data) => `moved it from ${data.from ?? '—'} to ${data.to ?? '—'}`,
  'task.due': (data) => (data.to ? `set the due date to ${new Date(String(data.to)).toLocaleDateString()}` : 'removed the due date'),
  'task.priority': (data) => `set priority to ${data.to}`,
  'task.renamed': (data) => `renamed it to “${data.to}”`,
  'comment.created': () => 'commented',
}

function Timeline({ taskId, people, canModerate }: { taskId: string; people: Map<string, { fullName: string | null; email?: string; avatarUrl: string | null }>; canModerate: boolean }) {
  const user = useUser()
  const { data } = useTaskTimeline(taskId)
  const add = useAddComment(taskId)
  const remove = useDeleteComment(taskId)
  const [body, setBody] = useState('')

  const items = useMemo(() => {
    const comments = (data?.comments ?? []).map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment }))
    const activity = (data?.activity ?? []).filter((event) => event.action !== 'comment.created').map((event) => ({ kind: 'event' as const, at: event.createdAt, event }))
    return [...comments, ...activity].sort((a, b) => a.at.localeCompare(b.at))
  }, [data])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    await add.mutateAsync(body)
    setBody('')
  }

  return (
    <section aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        <MessageSquare size={13} aria-hidden /> Activity
      </h3>
      <ol className="space-y-3">
        {items.map((item) => {
          if (item.kind === 'event') {
            const person = item.event.actorId ? people.get(item.event.actorId) : undefined
            return (
              <li key={`e${item.event.id}`} className="flex items-center gap-2 pl-1 text-xs text-ink-2">
                <span className="size-1.5 rounded-full bg-line-strong" aria-hidden />
                <span>
                  <strong className="font-medium text-ink">{person?.fullName ?? 'Someone'}</strong> {(ACTIVITY_TEXT[item.event.action] ?? (() => item.event.action))(item.event.data)}
                </span>
                <span className="text-ink-3">· {mailDate(item.at)}</span>
              </li>
            )
          }
          const person = people.get(item.comment.authorId)
          return (
            <li key={item.comment.id} className="group flex gap-2.5">
              <Avatar name={person?.fullName ?? person?.email} src={person?.avatarUrl} size={26} />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2">
                <p className="text-xs">
                  <strong className="font-medium">{person?.fullName ?? 'Someone'}</strong> <span className="text-ink-3">· {mailDate(item.at)}</span>
                </p>
                <p className="mt-0.5 text-ui whitespace-pre-wrap text-ink">{item.comment.body}</p>
              </div>
              {(item.comment.authorId === user.id || canModerate) && (
                <IconButton label="Delete comment" size="sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => remove.mutate(item.comment.id)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </li>
          )
        })}
      </ol>
      <form onSubmit={submit} className="mt-4 space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
          }}
          placeholder="Write a comment… (⌘/Ctrl + Enter to send)"
          aria-label="Comment"
          maxLength={10000}
          className="min-h-16"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </section>
  )
}
