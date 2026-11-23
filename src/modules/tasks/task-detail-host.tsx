'use client'

import { TaskDetailDialog } from './task-detail'
import { useTaskPanel } from './task-bits'

/** Mounted once per page frame: shows the task named in `?task=` (links, notifications, search). */
export function TaskDetailHost() {
  const panel = useTaskPanel()
  if (!panel.current) return null
  return <TaskDetailDialog key={panel.current} taskId={panel.current} onClose={panel.close} onOpenTask={panel.open} />
}
