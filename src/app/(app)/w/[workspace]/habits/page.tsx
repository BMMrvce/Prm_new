import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HabitsPage } from '@/modules/habits/pages'

export const metadata: Metadata = { title: 'Habits' }

export default function Page() {
  return (
    <Suspense>
      <HabitsPage />
    </Suspense>
  )
}
