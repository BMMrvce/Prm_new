'use client'

import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Category } from '@/modules/categories/queries'
import { daysUntil, formatDay, goalProgress } from '@/modules/growth/logic'
import type { Goal, GoalStatus } from '@/modules/growth/types'
import { CategoryChip, ProgressBar } from '@/modules/growth/ui'
import { CompleteToggle } from '@/modules/tasks/task-bits'
import { IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Input, Select } from '@/ui/field'
import { useAddMilestone, useDeleteMilestone, useSetGoalStatus, useToggleMilestone } from './queries'

export function targetText(goal: Pick<Goal, 'targetDate' | 'status'>, today: string) {
  if (!goal.targetDate) return null
  const days = daysUntil(goal.targetDate, today)
  const date = formatDay(goal.targetDate, { day: 'numeric', month: 'short', year: 'numeric' })
  if (goal.status !== 'active') return { text: `Target ${date}`, late: false }
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} past ${date}`, late: true }
  return { text: days === 0 ? 'Due today' : `${date} · ${days} day${days === 1 ? '' : 's'} left`, late: false }
}

/** One goal: progress from milestones, status, and the milestone checklist. */
export function GoalRow({ workspaceId, goal, category, today, writable, onEdit }: { workspaceId: string; goal: Goal; category: Category | undefined; today: string; writable: boolean; onEdit: () => void }) {
  const setStatus = useSetGoalStatus(workspaceId)
  const add = useAddMilestone(workspaceId)
  const toggle = useToggleMilestone(workspaceId)
  const remove = useDeleteMilestone(workspaceId)
  const [open, setOpen] = useState(goal.status === 'active' && goal.milestones.length > 0 && goal.milestones.length <= 6)
  const [draft, setDraft] = useState('')
  const progress = goalProgress(goal)
  const target = targetText(goal, today)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    add.mutate({ goal, title: draft })
    setDraft('')
  }

  return (
    <li className="animate-row py-3">
      <div className="flex items-start gap-2">
        <IconButton size="sm" label={open ? `Hide milestones of ${goal.title}` : `Show milestones of ${goal.title}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <ChevronDown size={15} className={cn('transition-transform', !open && '-rotate-90')} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className={cn('text-ui font-medium', goal.status === 'active' ? 'text-ink' : 'text-ink-3', goal.status === 'abandoned' && 'line-through')}>{goal.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
            <CategoryChip category={category} />
            {target && <span className={target.late ? 'text-error-ink' : ''}>{target.text}</span>}
            <span>{progress.total ? `${progress.done}/${progress.total} milestones` : 'No milestones yet'}</span>
          </p>
          {progress.percent !== null && (
            <div className="mt-1.5 flex max-w-80 items-center gap-2">
              <ProgressBar value={progress.percent} label={`${goal.title} progress`} className="flex-1" tone={goal.status === 'completed' ? 'bg-success' : 'bg-primary'} />
              <span className="text-2xs text-ink-2 tabular-nums">{progress.percent}%</span>
            </div>
          )}
        </div>
        {writable && (
          <>
            <Select aria-label={`Status of ${goal.title}`} value={goal.status} onChange={(event) => setStatus.mutate({ goal, status: event.target.value as GoalStatus })} className="h-8 w-auto text-xs">
              <option value="active">Active</option>
              <option value="completed">Achieved</option>
              <option value="abandoned">Dropped</option>
            </Select>
            <IconButton size="sm" label={`Edit ${goal.title}`} onClick={onEdit}>
              <Pencil size={14} />
            </IconButton>
          </>
        )}
      </div>
      {open && (
        <div className="animate-reveal mt-2 space-y-1 pl-9">
          <ul className="space-y-1">
            {goal.milestones.map((milestone) => (
              <li key={milestone.id} className="group flex items-center gap-2.5">
                {writable ? (
                  <CompleteToggle done={Boolean(milestone.completedAt)} onChange={(done) => toggle.mutate({ milestone, done })} label={`Done: ${milestone.title}`} />
                ) : (
                  <span className={cn('size-2 rounded-full', milestone.completedAt ? 'bg-success' : 'bg-line-strong')} aria-hidden />
                )}
                <span className={cn('min-w-0 flex-1 text-ui', milestone.completedAt ? 'text-ink-3 line-through' : 'text-ink')}>{milestone.title}</span>
                {writable && (
                  <IconButton size="sm" label={`Delete milestone ${milestone.title}`} onClick={() => remove.mutate(milestone)} className="opacity-60 hover:opacity-100">
                    <Trash2 size={12} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
          {writable && (
            <form onSubmit={submit} className="flex gap-2 pt-1">
              <Input value={draft} maxLength={200} onChange={(event) => setDraft(event.target.value)} placeholder="Add a milestone" aria-label={`New milestone for ${goal.title}`} className="h-8 text-xs" />
              <IconButton type="submit" variant="secondary" size="sm" label="Add milestone" disabled={!draft.trim()}>
                <Plus size={14} />
              </IconButton>
            </form>
          )}
          {goal.notes && <p className="pt-1 text-xs whitespace-pre-line text-ink-2">{goal.notes}</p>}
        </div>
      )}
    </li>
  )
}
