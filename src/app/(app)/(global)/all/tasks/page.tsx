'use client'

import { TaskListView } from '@/modules/tasks/task-list-view'
import { PageHeader } from '@/ui/misc'

export default function AllTasksPage() {
  return (
    <>
      <PageHeader title="All tasks" description="Every task you can see, across all your workspaces." />
      <TaskListView scope="all" />
    </>
  )
}
