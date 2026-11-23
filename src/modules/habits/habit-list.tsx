'use client'

import { Archive, ArchiveRestore, ChevronDown, Flame, MoreHorizontal, Pencil, Repeat, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { color } from '@/core/colors'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { currentStreak, dayStats, entryOn, isDueOn, startOfWeek, targetLabel, weekCompletions, weekConsistency, type EntryIndex, type WeekStart } from '@/modules/growth/logic'
import type { Category } from '@/modules/categories/queries'
import type { Habit } from '@/modules/growth/types'
import { CategoryChip, GroupHeading, StatTile, useCategoryMap } from '@/modules/growth/ui'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { Menu } from '@/ui/menu'
import { EmptyState } from '@/ui/misc'
import { toast } from '@/ui/toast'
import { HabitCheck, useHabitLogger } from './habit-check'
import { useAddStarterHabits, useArchiveHabit, useDeleteHabit } from './queries'

type Props = { workspace: Workspace; habits: Habit[]; index: EntryIndex; today: string; onEdit: (habit: Habit | null) => void }

/** Today's habits with check-off, the headline numbers, and the archive. */
export function HabitList({ workspace, habits, index, today, onEdit }: Props) {
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const writable = canWrite(workspace)
  const starters = useAddStarterHabits(workspace.id)
  const categories = useCategoryMap(workspace.id, 'habit')
  const categoryOf = (habit: Habit) => (habit.categoryId ? categories.byId.get(habit.categoryId) : undefined)
  const [showArchived, setShowArchived] = useState(false)
  const active = useMemo(() => habits.filter((habit) => !habit.archivedAt), [habits])
  const archived = habits.filter((habit) => habit.archivedAt)

  const { scheduled, other } = useMemo(() => {
    const thisWeek = startOfWeek(today, weekStart)
    const isToday = (habit: Habit) =>
      habit.frequency === 'weekly' ? weekCompletions(habit.id, index, thisWeek) < (habit.targetPerWeek ?? 1) || Boolean(entryOn(index, habit.id, today)) : isDueOn(habit, today)
    return { scheduled: active.filter(isToday), other: active.filter((habit) => !isToday(habit)) }
  }, [active, index, today, weekStart])

  const todayStats = dayStats(active, index, today)
  const week = weekConsistency(active, index, today, weekStart)
  const best = active.reduce((max, habit) => Math.max(max, habit.frequency === 'weekly' ? 0 : currentStreak(habit, index, today, weekStart)), 0)

  if (!active.length && !archived.length)
    return (
      <div className="neo-card rounded-xl">
        <EmptyState
          icon={Repeat}
          title="No habits yet"
          hint="Add a routine you want to keep: daily, on chosen days, or a few times a week. Rest days never break a streak."
          action={
            writable && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => onEdit(null)}>
                  Add a habit
                </Button>
                <Button
                  icon={<Sparkles size={15} aria-hidden />}
                  loading={starters.isPending}
                  onClick={() => starters.mutate(undefined, { onSuccess: () => toast.success('Starter habits added. Edit or remove any of them.') })}
                >
                  Add a few starter habits
                </Button>
              </div>
            )
          }
        />
      </div>
    )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Today" value={`${todayStats.completed}/${todayStats.due}`} note={todayStats.rate === null ? 'nothing due' : `${todayStats.rate}% done`} />
        <StatTile label="This week" value={week === null ? '—' : `${week}%`} note="consistency so far" />
        <StatTile label="Best streak" value={best} note={best === 1 ? 'day running' : 'days running'} />
        <StatTile label="Active habits" value={active.length} note={archived.length ? `${archived.length} archived` : 'none archived'} />
      </div>

      <section className="neo-card rounded-xl p-2 sm:p-3" aria-label="Today's habits">
        {scheduled.length > 0 && <GroupHeading count={scheduled.length}>Today</GroupHeading>}
        <ul>
          {scheduled.map((habit) => (
            <HabitRow key={habit.id} {...{ workspace, habit, index, today, onEdit }} category={categoryOf(habit)} />
          ))}
        </ul>
        {other.length > 0 && (
          <>
            <GroupHeading count={other.length}>Not scheduled today</GroupHeading>
            <ul>
              {other.map((habit) => (
                <HabitRow key={habit.id} {...{ workspace, habit, index, today, onEdit }} category={categoryOf(habit)} muted />
              ))}
            </ul>
          </>
        )}
        {!active.length && <p className="px-2 py-6 text-center text-xs text-ink-3">All your habits are archived.</p>}
      </section>

      {archived.length > 0 && (
        <section>
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)} className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
            <ChevronDown size={14} aria-hidden className={cn('transition-transform', !showArchived && '-rotate-90')} />
            Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="neo-card animate-reveal mt-2 rounded-xl p-2">
              {archived.map((habit) => (
                <HabitRow key={habit.id} {...{ workspace, habit, index, today, onEdit }} category={categoryOf(habit)} muted />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function HabitRow({
  workspace,
  habit,
  category,
  index,
  today,
  onEdit,
  muted,
}: Omit<Props, 'habits'> & { habit: Habit; category: Category | undefined; muted?: boolean }) {
  const weekStart: WeekStart = workspace.settings.weekStart ?? 1
  const writable = canWrite(workspace)
  const logger = useHabitLogger(workspace.id, index, today)
  const archive = useArchiveHabit(workspace.id)
  const remove = useDeleteHabit(workspace.id)
  const [confirming, setConfirming] = useState(false)
  const entry = entryOn(index, habit.id, today)
  const streak = currentStreak(habit, index, today, weekStart)
  const weekly = habit.frequency === 'weekly'
  const doneThisWeek = weekly ? weekCompletions(habit.id, index, startOfWeek(today, weekStart)) : 0
  const isArchived = Boolean(habit.archivedAt)

  return (
    <li className="animate-row flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/60">
      <span className={cn('size-2.5 shrink-0 rounded-full', color(habit.color).dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-ui', entry?.status === 'completed' ? 'text-ink-3 line-through decoration-ink-3/50' : muted ? 'text-ink-2' : 'text-ink')}>{habit.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
          <CategoryChip category={category} />
          {targetLabel(habit) && <span>{targetLabel(habit)}</span>}
          {weekly && (
            <span className={doneThisWeek >= (habit.targetPerWeek ?? 1) ? 'text-success-ink' : ''}>
              {doneThisWeek}/{habit.targetPerWeek ?? 1} this week
            </span>
          )}
          {streak > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warning-ink" aria-label={`Streak: ${streak} ${weekly ? 'weeks' : 'days'}`}>
              <Flame size={11} aria-hidden /> {streak}
              {weekly ? 'w' : 'd'}
            </span>
          )}
          {entry?.status === 'skipped' && <span>Rest day</span>}
        </p>
      </div>
      {!isArchived && (
        <HabitCheck habit={habit} status={entry?.status} quantity={entry?.quantity ?? null} disabled={!writable} onLog={(status, quantity) => logger(habit, status, quantity)} />
      )}
      {writable && (
        <Menu
          label={`${habit.title} actions`}
          trigger={(props) => (
            <IconButton {...props} label={`More for ${habit.title}`} size="sm">
              <MoreHorizontal size={15} />
            </IconButton>
          )}
          items={[
            { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => onEdit(habit) },
            isArchived
              ? { label: 'Restore', icon: <ArchiveRestore size={14} />, onSelect: () => archive.mutate({ id: habit.id, archived: false }) }
              : {
                  label: 'Archive',
                  icon: <Archive size={14} />,
                  onSelect: () =>
                    archive.mutate(
                      { id: habit.id, archived: true },
                      { onSuccess: () => toast.success('Habit archived', { label: 'Undo', onClick: () => archive.mutate({ id: habit.id, archived: false }) }) },
                    ),
                },
            'separator',
            { label: 'Delete…', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirming(true) },
          ]}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this habit?"
          message={`“${habit.title}” and all of its history will be deleted. Archive it instead to keep the history.`}
          busy={remove.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate(habit.id, { onSuccess: () => setConfirming(false) })}
        />
      )}
    </li>
  )
}
