import type { Metadata } from 'next'
import { BoardPage } from '@/modules/whiteboard/pages'

export const metadata: Metadata = { title: 'Whiteboard' }

export default async function Page({ params }: PageProps<'/w/[workspace]/whiteboard/[board]'>) {
  const { board } = await params
  return <BoardPage id={board} />
}
