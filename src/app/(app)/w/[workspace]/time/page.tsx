import type { Metadata } from 'next'
import { TimePage } from '@/modules/time/time-page'

export const metadata: Metadata = { title: 'Time' }

export default function Page() {
  return <TimePage />
}
