import type { Metadata } from 'next'
import { BoardPage } from '@/modules/tasks/pages'

export const metadata: Metadata = { title: 'Board' }

export default function Page() {
  return <BoardPage />
}
