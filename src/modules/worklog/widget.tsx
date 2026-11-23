'use client'

import { ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { workspaceHref } from '@/core/routes'
import { duration, localDate } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { Skeleton } from '@/ui/spinner'
import { EntryForm } from './entry-form'
import { isMissingTable, useWorkLog } from './queries'

/** Today's work log with a quick add box. */
export function WorkLogWidget({ workspace }: WidgetProps) {
  const [today] = useState(() => localDate())
  const log = useWorkLog(workspace?.id ?? '', today, today)
  if (!workspace) return null
  const entries = log.data ?? []
  const total = entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)
  return (
    <WidgetFrame
      title="Work log · today"
      icon={<ClipboardList size={15} />}
      action={
        <Link
          href={workspaceHref(workspace.slug, 'work-log')}
          className="text-2xs font-medium text-primary-ink hover:underline"
        >
          {total ? `${duration(total)} · ` : ''}Open log
        </Link>
      }
    >
      {isMissingTable(log.error) ? (
        <p className="text-xs text-ink-2">Set up needed: run <code className="font-mono">20261113000007_work_log.sql</code> in Supabase’s SQL Editor.</p>
      ) : log.isPending ? (
        <Skeleton className="h-16" />
      ) : entries.length ? (
        <ul className="mb-3 space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-2 text-ui">
              <span
                className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-ink">{entry.body}</span>
              {entry.minutes ? (
                <span className="text-2xs text-ink-3 tabular-nums">{duration(entry.minutes)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-ink-3">Nothing logged yet today.</p>
      )}
      {!isMissingTable(log.error) && <EntryForm workspaceId={workspace.id} date={today} compact />}
    </WidgetFrame>
  )
}
