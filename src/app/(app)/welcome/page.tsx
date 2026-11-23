import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Onboarding } from '@/components/onboarding/onboarding'

export const metadata: Metadata = { title: 'Set up' }

export default function WelcomePage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  )
}
