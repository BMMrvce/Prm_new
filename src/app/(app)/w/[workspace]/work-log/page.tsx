import type { Metadata } from 'next'
import { Suspense } from 'react'
import { WorkLogPage } from '@/modules/worklog/page'

export const metadata: Metadata = { title: 'Work log' }

export default function Page() {
  return (
    <Suspense>
      <WorkLogPage />
    </Suspense>
  )
}
