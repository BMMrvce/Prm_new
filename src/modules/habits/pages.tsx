'use client'

import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import { indexEntries } from '@/modules/growth/logic'
import type { Habit } from '@/modules/growth/types'
import { useTabParam } from '@/modules/growth/use-tab'
import { Button } from '@/ui/button'
import { ErrorNotice, PageHeader } from '@/ui/misc'
import { PageSkeleton } from '@/ui/spinner'
import { TabPanel, Tabs } from '@/ui/tabs'
import { errorMessage } from '@/ui/toast'
import { FocusPanel } from './focus-panel'
import { HabitDialog } from './habit-dialog'
import { HabitInsights } from './habit-insights'
import { HabitList } from './habit-list'
import { useFocusSessions, useHabitEntries, useHabits } from './queries'

const TABS = ['today', 'progress', 'focus'] as const

export function HabitsPage() {
  return (
    <ModuleGate id="habits">
      <Habits />
    </ModuleGate>
  )
}

function Habits() {
  const workspace = useCurrentWorkspace()
  const [today] = useState(() => localDate())
  const [tab, setTab] = useTabParam(TABS, 'today')
  const [editing, setEditing] = useState<Habit | null | undefined>(undefined)
  const habits = useHabits(workspace.id)
  const entries = useHabitEntries(workspace.id)
  const focus = useFocusSessions(workspace.id)
  const index = useMemo(() => indexEntries(entries.data ?? []), [entries.data])
  const failed = habits.error ?? entries.error

  return (
    <>
      <PageHeader
        title="Habits"
        description="Routines, streaks and deep work. Only you can see these."
        actions={
          canWrite(workspace) && (
            <Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing(null)}>
              New habit
            </Button>
          )
        }
      />
      <Tabs
        label="Habit views"
        idBase="habits"
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'today', label: 'Today' },
          { value: 'progress', label: 'Progress' },
          { value: 'focus', label: 'Focus' },
        ]}
      />
      <TabPanel idBase="habits" value={tab}>
        {tab === 'focus' ? (
          focus.error ? (
            <ErrorNotice message={errorMessage(focus.error)} onRetry={() => focus.refetch()} />
          ) : (
            <FocusPanel workspace={workspace} sessions={focus.data ?? []} loading={focus.isPending} today={today} />
          )
        ) : failed ? (
          <ErrorNotice
            message={errorMessage(failed)}
            onRetry={() => {
              habits.refetch()
              entries.refetch()
            }}
          />
        ) : habits.isPending || entries.isPending ? (
          <PageSkeleton rows={5} />
        ) : tab === 'today' ? (
          <HabitList workspace={workspace} habits={habits.data ?? []} index={index} today={today} onEdit={setEditing} />
        ) : (
          <HabitInsights workspace={workspace} habits={habits.data ?? []} index={index} focus={focus.data ?? []} today={today} />
        )}
      </TabPanel>
      {editing !== undefined && <HabitDialog key={editing?.id ?? 'new'} workspace={workspace} habit={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
