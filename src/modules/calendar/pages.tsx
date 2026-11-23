'use client'

import { Suspense } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { useCurrentWorkspace } from '@/core/workspaces'
import { PageHeader } from '@/ui/misc'
import { CalendarSkeleton, CalendarView } from './calendar-view'

export function CalendarPage() {
  const workspace = useCurrentWorkspace()
  return (
    <ModuleGate id="calendar">
      <PageHeader title="Calendar" description="Meetings and due dates by day, week or month." />
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarView scope={workspace.id} />
      </Suspense>
    </ModuleGate>
  )
}

export function AllCalendarPage() {
  return (
    <>
      <PageHeader title="All calendars" description="Meetings and due dates from every workspace, each marked with where it belongs." />
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarView scope="all" />
      </Suspense>
    </>
  )
}
