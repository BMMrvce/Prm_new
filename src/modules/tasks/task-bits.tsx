'use client'

import { AlertTriangle, Check, Minus, SignalHigh, SignalLow, SignalMedium } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { color } from '@/core/colors'
import type { Member } from '@/core/types'
import type { Priority } from '@/lib/format'
import { cn } from '@/ui/cn'
import { Avatar } from '@/ui/misc'
import { dueLabel, PRIORITIES } from './logic'
import { useAllStatuses, useStatuses, type Label, type Status, type StatusCategory } from './queries'

const PRIORITY_ICON: Record<Priority, { icon: typeof Minus; className: string }> = {
  urgent: { icon: AlertTriangle, className: 'text-error-ink' },
  high: { icon: SignalHigh, className: 'text-warning-ink' },
  medium: { icon: SignalMedium, className: 'text-info-ink' },
  low: { icon: SignalLow, className: 'text-ink-2' },
  none: { icon: Minus, className: 'text-ink-3' },
}

export function PriorityIcon({ priority, size = 15 }: { priority: Priority; size?: number }) {
  // Keeps rows aligned without drawing a marker for tasks that have no priority.
  if (priority === 'none') return <span className="shrink-0" style={{ width: size }} aria-hidden />
  const { icon: IconComponent, className } = PRIORITY_ICON[priority]
  const label = PRIORITIES.find((entry) => entry.key === priority)?.label
  return <IconComponent size={size} className={cn('shrink-0', className)} aria-label={`Priority: ${label}`} role="img" />
}


export function DueChip({ dueAt, done, now }: { dueAt: string | null; done?: boolean; now: Date }) {
  if (!dueAt) return null
  const { text, tone } = dueLabel(dueAt, now)
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-medium whitespace-nowrap',
        done ? 'bg-surface-2 text-ink-3' : tone === 'error' ? 'bg-error-light text-error-ink' : tone === 'accent' ? 'bg-accent-light text-accent-ink' : 'bg-surface-2 text-ink-2',
      )}
    >
      {text}
    </span>
  )
}

export function AssigneeStack({ ids, people, max = 3 }: { ids: string[]; people: Map<string, Member>; max?: number }) {
  if (!ids.length) return null
  const shown = ids.slice(0, max)
  return (
    <span className="flex -space-x-1.5" aria-label={`Assigned to ${ids.map((id) => people.get(id)?.fullName ?? 'someone').join(', ')}`}>
      {shown.map((id) => (
        <Avatar key={id} name={people.get(id)?.fullName ?? people.get(id)?.email} src={people.get(id)?.avatarUrl} size={22} className="ring-2 ring-surface" />
      ))}
      {ids.length > max && <span className="grid size-[22px] place-items-center rounded-full bg-surface-3 text-[10px] font-medium text-ink-2 ring-2 ring-surface">+{ids.length - max}</span>}
    </span>
  )
}

export function LabelChips({ ids, labels }: { ids: string[]; labels: Map<string, Label> }) {
  if (!ids.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const label = labels.get(id)
        if (!label) return null
        const tone = color(label.color)
        return (
          <span key={id} className={cn('inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs font-medium', tone.soft, tone.ink)}>
            {label.name}
          </span>
        )
      })}
    </span>
  )
}

/** Round completion checkbox: a real checkbox for keyboards and screen readers. */
export function CompleteToggle({ done, onChange, label }: { done: boolean; onChange: (done: boolean) => void; label: string }) {
  return (
    <label className="relative grid size-5 shrink-0 cursor-pointer place-items-center" onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" className="peer sr-only" checked={done} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span
        className={cn(
          'grid size-[18px] place-items-center rounded-full border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
          done ? 'border-success bg-success text-on-primary' : 'border-line-strong hover:border-primary',
        )}
        aria-hidden
      >
        {done && <Check size={11} strokeWidth={3.2} className="animate-check" />}
      </span>
    </label>
  )
}

export function StatusDot({ status }: { status: Pick<Status, 'color' | 'category'> | undefined }) {
  const tone = color(status?.color)
  const category = status?.category
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full border-2',
        category === 'done' ? `${tone.dot} border-transparent` : category === 'in_progress' ? `border-current ${tone.ink}` : 'border-line-strong',
      )}
    />
  )
}

/** Statuses for a workspace, or for every workspace on cross-workspace pages. */
export function useStatusesFor(scope: string | 'all' | undefined) {
  const one = useStatuses(scope === 'all' ? undefined : scope)
  const all = useAllStatuses()
  const statuses = scope === 'all' ? all.data : one.data
  return useMemo(() => {
    const list = statuses ?? []
    const byId = new Map(list.map((status) => [status.id, status]))
    const first = (workspaceId: string, category: StatusCategory) =>
      list.filter((status) => status.workspaceId === workspaceId && status.category === category).sort((a, b) => a.position - b.position)[0]
    return { list, byId, first, ready: Boolean(statuses) }
  }, [statuses])
}

/** Opens and closes the task detail panel through the `?task=` URL parameter. */
export function useTaskPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get('task')
  const set = useCallback(
    (taskId: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (taskId) next.set('task', taskId)
      else next.delete('task')
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname, params],
  )
  return { current, open: set, close: () => set(null) }
}
