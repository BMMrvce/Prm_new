'use client'

import { Kanban, ListTodo } from 'lucide-react'
import { useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { workspaceHref } from '@/core/routes'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import { ButtonLink } from '@/ui/button'
import { PageHeader } from '@/ui/misc'
import { BoardView } from './board-view'
import { NewTaskDialog } from './new-task-dialog'
import { TaskListView } from './task-list-view'

export function TasksPage() {
  const workspace = useCurrentWorkspace()
  const [creating, setCreating] = useState(false)
  return (
    <ModuleGate id="tasks">
      <PageHeader
        title="Tasks"
        description="Everything on your plate, grouped by when it is due."
        actions={
          <ButtonLink href={workspaceHref(workspace.slug, 'board')} variant="secondary" size="sm" icon={<Kanban size={15} aria-hidden />}>
            Board view
          </ButtonLink>
        }
      />
      <TaskListView scope={workspace.id} onNew={canWrite(workspace) ? () => setCreating(true) : undefined} />
      {creating && <NewTaskDialog workspace={workspace} onClose={() => setCreating(false)} />}
    </ModuleGate>
  )
}

export function BoardPage() {
  const workspace = useCurrentWorkspace()
  const [creating, setCreating] = useState<{ statusId?: string } | null>(null)
  return (
    <ModuleGate id="board">
      <PageHeader
        title="Board"
        description="Drag tasks between columns. Change the columns in Settings → Board."
        actions={
          <ButtonLink href={workspaceHref(workspace.slug, 'tasks')} variant="secondary" size="sm" icon={<ListTodo size={15} aria-hidden />}>
            List view
          </ButtonLink>
        }
      />
      <BoardView scope={workspace.id} onNew={canWrite(workspace) ? (statusId) => setCreating({ statusId }) : undefined} />
      {creating && <NewTaskDialog workspace={workspace} defaults={{ statusId: creating.statusId }} onClose={() => setCreating(null)} />}
    </ModuleGate>
  )
}
