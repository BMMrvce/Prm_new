import type { Metadata } from 'next'
import { WhiteboardsPage } from '@/modules/whiteboard/pages'

export const metadata: Metadata = { title: 'Whiteboard' }

export default function Page() {
  return <WhiteboardsPage />
}
