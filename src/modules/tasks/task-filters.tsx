'use client'

import { Search, X } from 'lucide-react'
import { useMemo } from 'react'
import type { Priority } from '@/lib/format'
import { Select } from '@/ui/field'
import { PRIORITIES } from './logic'
import type { Task } from './queries'
import type { TaskContext } from './use-task-context'

export type TaskFilter = {
  text: string
  assignee: '' | 'me' | 'unassigned' | string
  projectId: string
  labelId: string
  priority: '' | Priority
  workspaceId: string
}

export const EMPTY_FILTER: TaskFilter = { text: '', assignee: '', projectId: '', labelId: '', priority: '', workspaceId: '' }

export function applyFilter(tasks: Task[], filter: TaskFilter, me: string, context: TaskContext) {
  const text = filter.text.trim().toLowerCase()
  return tasks.filter((task) => {
    if (filter.workspaceId && task.workspaceId !== filter.workspaceId) return false
    if (filter.projectId && task.projectId !== filter.projectId) return false
    if (filter.labelId && !task.labelIds.includes(filter.labelId)) return false
    if (filter.priority && task.priority !== filter.priority) return false
    if (filter.assignee === 'me' && !task.assigneeIds.includes(me)) return false
    if (filter.assignee === 'unassigned' && task.assigneeIds.length) return false
    if (filter.assignee && !['me', 'unassigned'].includes(filter.assignee) && !task.assigneeIds.includes(filter.assignee)) return false
    if (text) {
      const prefix = context.workspaces.get(task.workspaceId)?.taskPrefix ?? ''
      const haystack = `${task.title} ${prefix}-${task.number}`.toLowerCase()
      if (!haystack.includes(text)) return false
    }
    return true
  })
}

/** Search box and filter selects shared by the list and the board. */
export function TaskFilters({ filter, onChange, context, scope }: { filter: TaskFilter; onChange: (filter: TaskFilter) => void; context: TaskContext; scope: string | 'all' }) {
  const projects = useMemo(
    () => [...context.projects.values()].filter((project) => project.status !== 'archived' && (!filter.workspaceId || project.workspaceId === filter.workspaceId)),
    [context.projects, filter.workspaceId],
  )
  const labels = useMemo(() => [...context.labels.values()].filter((label) => !filter.workspaceId || label.workspaceId === filter.workspaceId), [context.labels, filter.workspaceId])
  const people = [...context.people.values()]
  const active = Object.entries(filter).some(([key, value]) => key !== 'text' && value)
  const select = 'h-8 w-auto max-w-44 text-xs'

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <label className="neo-control flex h-8 min-w-48 flex-1 items-center gap-2 rounded-lg px-2.5 sm:max-w-64 sm:flex-none">
        <Search size={14} className="text-ink-3" aria-hidden />
        <input
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder="Filter tasks…"
          aria-label="Filter tasks"
          className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3"
        />
      </label>
      {scope === 'all' && (
        <Select aria-label="Workspace" className={select} value={filter.workspaceId} onChange={(event) => onChange({ ...filter, workspaceId: event.target.value, projectId: '', labelId: '' })}>
          <option value="">All workspaces</option>
          {[...context.workspaces.values()]
            .filter((ws) => !ws.archivedAt)
            .map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
        </Select>
      )}
      <Select aria-label="Assignee" className={select} value={filter.assignee} onChange={(event) => onChange({ ...filter, assignee: event.target.value })}>
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="unassigned">Unassigned</option>
        {people.length > 1 &&
          people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName ?? person.email}
            </option>
          ))}
      </Select>
      {projects.length > 0 && (
        <Select aria-label="Project" className={select} value={filter.projectId} onChange={(event) => onChange({ ...filter, projectId: event.target.value })}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      )}
      {labels.length > 0 && (
        <Select aria-label="Label" className={select} value={filter.labelId} onChange={(event) => onChange({ ...filter, labelId: event.target.value })}>
          <option value="">Any label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Priority" className={select} value={filter.priority} onChange={(event) => onChange({ ...filter, priority: event.target.value as TaskFilter['priority'] })}>
        <option value="">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority.key} value={priority.key}>
            {priority.label}
          </option>
        ))}
      </Select>
      {active && (
        <button type="button" onClick={() => onChange({ ...EMPTY_FILTER, text: filter.text })} className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-2 hover:bg-surface-2">
          <X size={13} aria-hidden /> Clear
        </button>
      )}
    </div>
  )
}
