'use client'

import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import { useMembers } from '@/core/workspaces'
import { useUser } from '@/core/session'
import { isModuleEnabled } from '@/core/modules'
import type { Priority } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { PeoplePicker } from '@/ui/people-picker'
import { toast } from '@/ui/toast'
import { parseDuration, PRIORITIES } from './logic'
import { useCreateTask, useStatuses } from './queries'

/** Quick task creation (N key, sidebar button, command palette, board columns). */
export function NewTaskDialog({
  workspace,
  onClose,
  defaults,
}: {
  workspace: Workspace
  onClose: () => void
  defaults?: { projectId?: string | null; statusId?: string | null; parentId?: string | null; dueAt?: string | null }
}) {
  const user = useUser()
  const create = useCreateTask()
  const { data: statuses = [] } = useStatuses(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const projectsEnabled = isModuleEnabled(workspace, 'projects')
  const { data: projects = [] } = useProjects(projectsEnabled ? workspace.id : undefined)

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(defaults?.projectId ?? '')
  const [statusId, setStatusId] = useState(defaults?.statusId ?? '')
  const [priority, setPriority] = useState<Priority>('none')
  const [due, setDue] = useState(defaults?.dueAt ? defaults.dueAt.slice(0, 10) : '')
  const [estimate, setEstimate] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [another, setAnother] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    const minutes = estimate ? parseDuration(estimate) : null
    if (estimate && minutes === null) return toast.error('Write the estimate like “2h 30m” or “45m”.')
    await create.mutateAsync({
      workspaceId: workspace.id,
      title,
      projectId: projectId || null,
      statusId: statusId || null,
      parentId: defaults?.parentId ?? null,
      priority,
      // Due dates are stored as the end of the chosen local day.
      dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null,
      estimateMinutes: minutes,
      assigneeIds: assignees,
    })
    toast.success('Task added')
    if (another) {
      setTitle('')
      return
    }
    onClose()
  }

  return (
    <Dialog title={defaults?.parentId ? 'New subtask' : 'New task'} description={workspace.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          {(props) => <Input {...props} autoFocus value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" required />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {projectsEnabled && (
            <Field label="Project" optional>
              {(props) => (
                <Select {...props} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">No project</option>
                  {projects
                    .filter((project) => project.status !== 'archived')
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Status">
            {(props) => (
              <Select {...props} value={statusId} onChange={(event) => setStatusId(event.target.value)}>
                <option value="">Default (first “To do”)</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(props) => (
              <Select {...props} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                {PRIORITIES.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date" optional>
            {(props) => <Input {...props} type="date" value={due} onChange={(event) => setDue(event.target.value)} />}
          </Field>
          <Field label="Estimate" optional hint="e.g. 2h 30m">
            {(props) => <Input {...props} value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="1h" />}
          </Field>
        </div>
        {members.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-2">Assignees</p>
            <PeoplePicker members={members} value={assignees} onChange={setAssignees} />
            {!assignees.includes(user.id) && (
              <button type="button" className="text-2xs font-medium text-primary-ink" onClick={() => setAssignees([...assignees, user.id])}>
                Assign to me
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={another} onChange={(event) => setAnother(event.target.checked)} className="accent-[var(--brand-primary)]" />
            Add another after this
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!title.trim()}>
              Add task
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
