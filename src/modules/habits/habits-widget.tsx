'use client'

import { Flame, Repeat } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { color } from '@/core/colors'
import { workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { currentStreak, dayStats, entryOn, indexEntries, isDueOn, startOfWeek, weekCompletions, type WeekStart } from '@/modules/growth/logic'
import { ProgressBar } from '@/modules/growth/ui'
import { cn } from '@/ui/cn'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { errorMessage } from '@/ui/toast'
import { HabitCheck, useHabitLogger } from './habit-check'
import { useHabitEntries, useHabits } from './queries'

/** Dashboard widget: today's habits with one-click check-off. */
export function HabitsWidget({ workspace }: WidgetProps) {
  return (
    <WidgetFrame
      title="Today's habits"
      icon={<Repeat size={15} />}
      action={
        workspace && (
          <Link href={workspaceHref(workspace.slug, 'habits')} className="text-2xs font-medium text-primary-ink hover:underline">
            All habits
          </Link>
        )
      }
    >
      {workspace ? <TodayHabits workspace={workspace} /> : <p className="py-6 text-center text-xs text-ink-3">Add this widget to a workspace dashboard.</p>}
    </WidgetFrame>
  )
}

function TodayHabits({ workspace }: { workspace: Workspace }) {
  const [today] = useState(() => localDate())
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const habits = useHabits(workspace.id)
  const entries = useHabitEntries(workspace.id)
  const index = useMemo(() => indexEntries(entries.data ?? []), [entries.data])
  const logger = useHabitLogger(workspace.id, index, today)

  const due = useMemo(() => {
    const thisWeek = startOfWeek(today, weekStart)
    return (habits.data ?? []).filter(
      (habit) =>
        !habit.archivedAt &&
        (habit.frequency === 'weekly'
          ? weekCompletions(habit.id, index, thisWeek) < (habit.targetPerWeek ?? 1) || Boolean(entryOn(index, habit.id, today))
          : isDueOn(habit, today)),
    )
  }, [habits.data, index, today, weekStart])

  if (habits.error || entries.error) return <ErrorNotice message={errorMessage(habits.error ?? entries.error)} onRetry={() => (habits.refetch(), entries.refetch())} />
  if (habits.isPending || entries.isPending) return <Skeleton className="h-24" />
  if (!due.length)
    return (
      <p className="py-6 text-center text-xs text-ink-3">
        {habits.data.some((habit) => !habit.archivedAt) ? 'Nothing scheduled today.' : 'No habits yet.'}{' '}
        <Link href={workspaceHref(workspace.slug, 'habits')} className="font-medium text-primary-ink hover:underline">
          {habits.data.length ? 'Open habits' : 'Add one'}
        </Link>
      </p>
    )

  const stats = dayStats(due, index, today)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <ProgressBar value={stats.rate ?? 0} label={`${stats.completed} of ${stats.due} habits done today`} className="flex-1" tone="bg-success" />
        <span className="text-2xs text-ink-2 tabular-nums">
          {stats.completed}/{stats.due}
        </span>
      </div>
      <ul className="-mx-2">
        {due.map((habit) => {
          const entry = entryOn(index, habit.id, today)
          const streak = currentStreak(habit, index, today, weekStart)
          return (
            <li key={habit.id} className="animate-row flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-surface-2">
              <span className={cn('size-2 shrink-0 rounded-full', color(habit.color).dot)} aria-hidden />
              <span className={cn('min-w-0 flex-1 truncate text-ui', entry?.status === 'completed' ? 'text-ink-3 line-through' : 'text-ink')}>{habit.title}</span>
              {streak > 1 && (
                <span className="inline-flex items-center gap-0.5 text-2xs text-warning-ink" aria-label={`Streak ${streak}`}>
                  <Flame size={11} aria-hidden />
                  {streak}
                </span>
              )}
              <HabitCheck
                compact
                habit={habit}
                status={entry?.status}
                quantity={entry?.quantity ?? null}
                disabled={!canWrite(workspace)}
                onLog={(status, quantity) => logger(habit, status, quantity)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
