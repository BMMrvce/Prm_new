import type { Metadata } from 'next'
import { AllCalendarPage } from '@/modules/calendar/pages'

export const metadata: Metadata = { title: 'All calendars' }

export default function Page() {
  return <AllCalendarPage />
}
