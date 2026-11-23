'use client'

import { useCallback } from 'react'
import { toast } from '@/ui/toast'
import { useUpdateTask, type Task } from './queries'
import type { TaskContext } from './use-task-context'

/** Completes or reopens a task by moving it to its workspace's first Done / To do status. */
export function useToggleTask(context: TaskContext) {
  // `mutate` is stable across renders, which keeps memoised rows from re-rendering.
  const { mutate } = useUpdateTask()
  return useCallback(
    (task: Task, done: boolean) => {
      const target = context.statuses.first(task.workspaceId, done ? 'done' : 'todo')
      if (!target) return toast.error(`Add a “${done ? 'Done' : 'To do'}” column in Settings → Board first.`)
      const previous = { statusId: task.statusId, statusCategory: task.statusCategory }
      mutate(
        { id: task.id, changes: { statusId: target.id, statusCategory: target.category } },
        {
          onSuccess: () => {
            if (done)
              toast.success(task.recurrence ? 'Done. The next one is scheduled.' : 'Task completed', {
                label: 'Undo',
                onClick: () => mutate({ id: task.id, changes: previous }),
              })
          },
        },
      )
    },
    [context.statuses, mutate],
  )
}
