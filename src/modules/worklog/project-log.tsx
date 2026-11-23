'use client'

import { ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { workspaceHref } from '@/core/routes'
import { duration, localDate } from '@/lib/format'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { EntryForm } from './entry-form'
import { isMissingTable, useProjectWorkLog, type WorkLogEntry } from './queries'

/** The work log filtered to one project: add today's entry, see past days grouped. */
export function ProjectWorkLog({ workspaceId, slug, projectId }: { workspaceId: string; slug: string; projectId: string }) {
  const [today] = useState(() => localDate())
  const log = useProjectWorkLog(workspaceId, projectId)
  const days = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>()
    for (const entry of log.data ?? []) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return [...map.entries()]
  }, [log.data])
  const total = (log.data ?? []).reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)

  if (isMissingTable(log.error))
    return <p className="rounded-xl border border-warning/40 bg-warning-light px-4 py-3 text-ui text-warning-ink">Run supabase/migrations/20261113000007_work_log.sql in Supabase’s SQL Editor to use the work log.</p>

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <section className="neo-card rounded-xl p-5">
          <h2 className="mb-3 text-card font-semibold">Log work on this project · today</h2>
          <EntryForm workspaceId={workspaceId} date={today} projectId={projectId} />
        </section>
        {log.error ? (
          <ErrorNotice message={log.error.message} onRetry={() => log.refetch()} />
        ) : log.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : days.length ? (
          <section className="neo-card divide-y divide-line-soft rounded-xl">
            {days.map(([day, entries]) => (
              <div key={day} className="px-5 py-4">
                <h3 className="mb-2 flex items-baseline justify-between text-xs font-semibold text-ink-2">
                  {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  <span className="font-normal text-ink-3 tabular-nums">{(() => {
                    const minutes = entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)
                    return minutes ? duration(minutes) : ''
                  })()}</span>
                </h3>
                <ul className="space-y-1.5">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-2 text-ui">
                      <span className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-primary" aria-hidden />
                      <span className="min-w-0 flex-1 whitespace-pre-wrap text-ink">{entry.body}</span>
                      {entry.minutes ? <span className="text-2xs text-ink-3 tabular-nums">{duration(entry.minutes)}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          <EmptyState icon={ClipboardList} title="Nothing logged for this project yet" hint="Entries you add here, or tag with this project in the Work log, appear below." />
        )}
      </div>
      <aside className="neo-card rounded-xl p-5">
        <p className="text-2xs text-ink-3">Your time on this project</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{total ? duration(total) : '—'}</p>
        <p className="mt-1 text-xs text-ink-2">
          {days.length} day{days.length === 1 ? '' : 's'} logged
        </p>
        <Link href={workspaceHref(slug, 'work-log')} className="mt-4 inline-block text-xs font-medium text-primary-ink hover:underline">
          Open the full work log →
        </Link>
        <p className="mt-3 text-2xs text-ink-3">Only you can see your log.</p>
      </aside>
    </div>
  )
}
