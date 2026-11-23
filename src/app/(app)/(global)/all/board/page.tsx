'use client'

import { BoardView } from '@/modules/tasks/board-view'
import { PageHeader } from '@/ui/misc'

export default function AllBoardPage() {
  return (
    <>
      <PageHeader title="All boards" description="Tasks from every workspace by stage. Dragging a card uses the matching column in its own workspace." />
      <BoardView scope="all" />
    </>
  )
}
