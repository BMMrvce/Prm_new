'use client'

import { Target } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { localDate } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { goalProgress } from '@/modules/growth/logic'
import { ProgressBar } from '@/modules/growth/ui'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { errorMessage } from '@/ui/toast'
import { targetText } from './goal-row'
import { useGoals } from './queries'

/** Dashboard widget: progress of active goals, nearest target first. */
export function GoalsWidget({ workspace }: WidgetProps) {
  return (
    <WidgetFrame
      title="Goals"
      icon={<Target size={15} />}
      action={
        workspace && (
          <Link href={workspaceHref(workspace.slug, 'goals')} className="text-2xs font-medium text-primary-ink hover:underline">
            All goals
          </Link>
        )
      }
    >
      {workspace ? <ActiveGoals workspace={workspace} /> : <p className="py-6 text-center text-xs text-ink-3">Add this widget to a workspace dashboard.</p>}
    </WidgetFrame>
  )
}

function ActiveGoals({ workspace }: { workspace: Workspace }) {
  const [today] = useState(() => localDate())
  const goals = useGoals(workspace.id)
  if (goals.error) return <ErrorNotice message={errorMessage(goals.error)} onRetry={() => goals.refetch()} />
  if (goals.isPending) return <Skeleton className="h-24" />
  const active = goals.data
    .filter((goal) => goal.status === 'active')
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
    .slice(0, 8)
  if (!active.length)
    return (
      <p className="py-6 text-center text-xs text-ink-3">
        No active goals.{' '}
        <Link href={workspaceHref(workspace.slug, 'goals')} className="font-medium text-primary-ink hover:underline">
          Set one
        </Link>
      </p>
    )
  return (
    <ul className="space-y-3 pt-1">
      {active.map((goal) => {
        const progress = goalProgress(goal)
        const target = targetText(goal, today)
        return (
          <li key={goal.id} className="animate-row text-xs">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-ui text-ink">{goal.title}</span>
              <span className="shrink-0 text-ink-2 tabular-nums">{progress.percent === null ? '—' : `${progress.percent}%`}</span>
            </div>
            <ProgressBar value={progress.percent ?? 0} label={`${goal.title} progress`} />
            <p className="mt-1 text-2xs text-ink-3">
              {progress.total ? `${progress.done}/${progress.total} milestones` : 'No milestones'}
              {target && <span className={target.late ? 'text-error-ink' : ''}> · {target.text}</span>}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
