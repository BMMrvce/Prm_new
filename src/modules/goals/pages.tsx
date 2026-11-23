'use client'

import { Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import { goalProgress } from '@/modules/growth/logic'
import type { Goal, GoalStatus } from '@/modules/growth/types'
import { StatTile, useCategoryMap } from '@/modules/growth/ui'
import { useTabParam } from '@/modules/growth/use-tab'
import { Button } from '@/ui/button'
import { EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { PageSkeleton } from '@/ui/spinner'
import { TabPanel, Tabs } from '@/ui/tabs'
import { errorMessage } from '@/ui/toast'
import { GoalDialog } from './goal-dialog'
import { GoalRow } from './goal-row'
import { useGoals } from './queries'

const STATUSES = ['active', 'completed', 'abandoned'] as const
const LABELS: Record<GoalStatus, string> = { active: 'Active', completed: 'Achieved', abandoned: 'Dropped' }

export function GoalsPage() {
  return (
    <ModuleGate id="goals">
      <Goals />
    </ModuleGate>
  )
}

function Goals() {
  const workspace = useCurrentWorkspace()
  const writable = canWrite(workspace)
  const [today] = useState(() => localDate())
  const [status, setStatus] = useTabParam(STATUSES, 'active')
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined)
  const goals = useGoals(workspace.id)
  const categories = useCategoryMap(workspace.id, 'goal')
  const list = goals.data ?? []
  const shown = list
    .filter((goal) => goal.status === status)
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.position - b.position)
  const active = list.filter((goal) => goal.status === 'active')
  const avg = active.length ? Math.round(active.reduce((sum, goal) => sum + (goalProgress(goal).percent ?? 0), 0) / active.length) : null
  const late = active.filter((goal) => goal.targetDate && goal.targetDate < today).length

  return (
    <>
      <PageHeader
        title="Goals"
        description="What you are working towards, broken into milestones."
        actions={
          writable && (
            <Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing(null)}>
              New goal
            </Button>
          )
        }
      />
      {goals.error ? (
        <ErrorNotice message={errorMessage(goals.error)} onRetry={() => goals.refetch()} />
      ) : goals.isPending ? (
        <PageSkeleton rows={4} />
      ) : !list.length ? (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={Target}
            title="No goals yet"
            hint="Write down a goal, give it a target date, and break it into milestones. Progress follows the milestones you tick off."
            action={
              writable && (
                <Button variant="primary" onClick={() => setEditing(null)}>
                  Set a goal
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Active" value={active.length} note="goals" />
            <StatTile label="Average progress" value={avg === null ? '—' : `${avg}%`} note="of active goals" />
            <StatTile label="Past target" value={late} note="active goals" />
            <StatTile label="Achieved" value={list.filter((goal) => goal.status === 'completed').length} note="all time" />
          </div>
          <div>
            <Tabs
              label="Goal status"
              idBase="goals"
              className="mb-3"
              value={status}
              onChange={setStatus}
              items={STATUSES.map((value) => ({ value, label: LABELS[value], count: list.filter((goal) => goal.status === value).length }))}
            />
            <TabPanel idBase="goals" value={status} className="neo-card rounded-xl px-3">
              {shown.length ? (
                <ul className="divide-y divide-line-soft">
                  {shown.map((goal) => (
                    <GoalRow
                      key={goal.id}
                      workspaceId={workspace.id}
                      goal={goal}
                      category={goal.categoryId ? categories.byId.get(goal.categoryId) : undefined}
                      today={today}
                      writable={writable}
                      onEdit={() => setEditing(goal)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-xs text-ink-3">No {LABELS[status].toLowerCase()} goals.</p>
              )}
            </TabPanel>
          </div>
        </div>
      )}
      {editing !== undefined && <GoalDialog key={editing?.id ?? 'new'} workspace={workspace} goal={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
