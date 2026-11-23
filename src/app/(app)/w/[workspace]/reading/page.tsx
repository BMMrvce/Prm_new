import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ReadingPage } from '@/modules/reading/pages'

export const metadata: Metadata = { title: 'Reading' }

export default function Page() {
  return (
    <Suspense>
      <ReadingPage />
    </Suspense>
  )
}
