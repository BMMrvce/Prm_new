import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NotesPage } from '@/modules/notes/notes-page'

export const metadata: Metadata = { title: 'Notes' }

export default function Page() {
  return (
    <Suspense>
      <NotesPage />
    </Suspense>
  )
}
