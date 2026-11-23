import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GoalsPage } from '@/modules/goals/pages'

export const metadata: Metadata = { title: 'Goals' }

export default function Page() {
  return (
    <Suspense>
      <GoalsPage />
    </Suspense>
  )
}
