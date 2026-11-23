import type { Metadata } from 'next'
import { TasksPage } from '@/modules/tasks/pages'

export const metadata: Metadata = { title: 'Tasks' }

export default function Page() {
  return <TasksPage />
}
