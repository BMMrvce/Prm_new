import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MoneyPage } from '@/modules/money/page'

export const metadata: Metadata = { title: 'Money' }

export default function Page() {
  // MoneyPage reads ?tab= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <MoneyPage />
    </Suspense>
  )
}
