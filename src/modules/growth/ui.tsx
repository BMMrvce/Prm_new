'use client'

import { Star } from 'lucide-react'
import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { color } from '@/core/colors'
import { workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { SCOPE_LABELS, useCategories, useSeedCategories, type Category, type CategoryScope } from '@/modules/categories/queries'
import { cn } from '@/ui/cn'
import { Field, Select } from '@/ui/field'

/** Shared building blocks for the habits, reading, learning and goals pages. */

export function categoriesHref(workspace: Pick<Workspace, 'slug'>) {
  return `${workspaceHref(workspace.slug, 'settings')}?tab=categories`
}

/** Categories of one scope plus a lookup by id. */
export function useCategoryMap(workspaceId: string, scope: CategoryScope) {
  const query = useCategories(workspaceId, scope)
  const byId = useMemo(() => new Map((query.data ?? []).map((category) => [category.id, category])), [query.data])
  return { ...query, list: query.data ?? [], byId }
}

/**
 * Category select for a growth item. The lists are the user's own (Settings →
 * Categories); when one is empty this offers to add the suggested ones in place.
 */
export function CategoryField({
  workspace,
  scope,
  value,
  onChange,
  label = 'Category',
}: {
  workspace: Workspace
  scope: CategoryScope
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  const { list, isPending } = useCategoryMap(workspace.id, scope)
  const seed = useSeedCategories(workspace.id, scope)
  const active = list.filter((category) => !category.archivedAt || category.id === value)
  return (
    <Field
      label={label}
      optional
      hint={
        !isPending && !list.length ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>No categories yet.</span>
            {canWrite(workspace) && (
              <button type="button" className="font-medium text-primary-ink underline-offset-2 hover:underline" onClick={() => seed.mutate()} disabled={seed.isPending}>
                Add {SCOPE_LABELS[scope].examples.join(', ')}
              </button>
            )}
            <Link href={categoriesHref(workspace)} className="font-medium text-primary-ink underline-offset-2 hover:underline">
              Manage in Settings
            </Link>
          </span>
        ) : undefined
      }
    >
      {(props) => (
        <Select {...props} value={value} onChange={(event) => onChange(event.target.value)} disabled={isPending}>
          <option value="">None</option>
          {active.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}

export function CategoryChip({ category }: { category: Category | undefined }) {
  if (!category) return null
  const tone = color(category.color)
  return <span className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-medium whitespace-nowrap', tone.soft, tone.ink)}>{category.name}</span>
}

/** A thin progress bar with an accessible value. */
export function ProgressBar({ value, label, className, tone = 'bg-primary' }: { value: number; label: string; className?: string; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className={cn('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', tone)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

/** A headline number with a label and a note. */
export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="neo-card rounded-xl px-4 py-3">
      <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink tabular-nums">{value}</p>
      {note && <p className="text-2xs text-ink-3">{note}</p>}
    </div>
  )
}

/** 1–5 choice as a radio group (concentration, ratings). `allowClear` lets the current value be unset. */
export function ScalePicker({
  value,
  onChange,
  label,
  stars,
  allowClear,
}: {
  value: number | null
  onChange: (value: number | null) => void
  label: string
  stars?: boolean
  allowClear?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((option) => {
        const selected = value === option
        const filled = stars && value !== null && option <= value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={stars ? `${option} star${option === 1 ? '' : 's'}` : String(option)}
            onClick={() => onChange(allowClear && selected ? null : option)}
            className={cn(
              'grid h-9 place-items-center rounded-lg border text-ui font-medium',
              stars ? 'w-9 border-transparent text-ink-3 hover:bg-surface-2' : 'flex-1',
              !stars && (selected ? 'border-primary bg-primary-light text-primary-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2'),
            )}
          >
            {stars ? <Star size={17} aria-hidden className={filled ? 'fill-warning text-warning' : ''} /> : option}
          </button>
        )
      })}
    </div>
  )
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} size={11} aria-hidden className={value <= rating ? 'fill-warning text-warning' : 'text-line-strong'} />
      ))}
    </span>
  )
}

/** Small group heading inside a list. */
export function GroupHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 px-1 pt-2 pb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
      {children}
      {count !== undefined && <span className="rounded bg-surface-2 px-1 font-medium text-ink-2 normal-case">{count}</span>}
    </h3>
  )
}
