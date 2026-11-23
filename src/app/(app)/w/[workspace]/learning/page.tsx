import type { Metadata } from 'next'
import { LearningPage } from '@/modules/learning/pages'

export const metadata: Metadata = { title: 'Learning' }

export default function Page() {
  return <LearningPage />
}
