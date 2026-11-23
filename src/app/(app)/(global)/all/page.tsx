'use client'

import { ArrowRight, CalendarClock, LockKeyhole, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { WELCOME_HREF, workspaceHref } from '@/core/routes'
import { useProfile, useUser } from '@/core/session'
import { useWorkspaces } from '@/core/workspaces'
import { greetingName, greetingParts } from '@/lib/format'
import { dueBucket } from '@/modules/tasks/logic'
import { isOpen, useTasks } from '@/modules/tasks/queries'
import { ButtonLink } from '@/ui/button'
import { Badge, IconTile, PageHeader } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'

/** Every workspace at a glance, with what is due and overdue in each. */
export default function AllWorkspacesPage() {
  const user = useUser()
  const { data: profile } = useProfile()
  const { data: workspaces, isPending } = useWorkspaces()
  const { data: tasks = [] } = useTasks('all')
  const [now] = useState(() => new Date())

  const stats = useMemo(() => {
    const map = new Map<string, { open: number; mine: number; overdue: number; today: number }>()
    for (const task of tasks) {
      if (!isOpen(task) || task.parentId) continue
      const entry = map.get(task.workspaceId) ?? { open: 0, mine: 0, overdue: 0, today: 0 }
      entry.open += 1
      if (task.assigneeIds.includes(user.id)) entry.mine += 1
      const bucket = dueBucket(task.dueAt, now)
      if (bucket === 'overdue') entry.overdue += 1
      if (bucket === 'today') entry.today += 1
      map.set(task.workspaceId, entry)
    }
    return map
  }, [tasks, user.id, now])

  const active = (workspaces ?? []).filter((ws) => !ws.archivedAt)
  const archived = (workspaces ?? []).filter((ws) => ws.archivedAt)
  const { salutation, date } = greetingParts(now)
  const name = greetingName(profile?.fullName)

  return (
    <>
      <PageHeader
        title={`${salutation}${name ? `, ${name}` : ''}`}
        description={date}
        actions={
          <ButtonLink href={`${WELCOME_HREF}?new=1`} variant="primary" size="sm" icon={<Plus size={15} aria-hidden />}>
            New workspace
          </ButtonLink>
        }
      />
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((workspace) => {
            const entry = stats.get(workspace.id)
            return (
              <Link key={workspace.id} href={workspaceHref(workspace.slug)} className="neo-card group animate-row flex flex-col rounded-xl p-5 hover:border-line-strong">
                <div className="flex items-center gap-3">
                  <IconTile icon={workspace.icon} colorKey={workspace.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-1.5 truncate text-card font-semibold group-hover:text-primary-ink">
                      {workspace.name}
                      {workspace.protected && <LockKeyhole size={13} className="text-ink-3" aria-label="Protected" />}
                    </h2>
                    <p className="text-2xs text-ink-3 capitalize">{workspace.role}</p>
                  </div>
                  <ArrowRight size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
                {workspace.protected ? (
                  <p className="mt-5 text-xs text-ink-3">Protected: unlock to see its work.</p>
                ) : (
                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Open" value={entry?.open ?? 0} />
                    <Stat label="Mine" value={entry?.mine ?? 0} />
                    <Stat label="Overdue" value={entry?.overdue ?? 0} tone={entry?.overdue ? 'text-error-ink' : undefined} />
                  </dl>
                )}
                {entry?.today ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-accent-ink">
                    <CalendarClock size={13} aria-hidden /> {entry.today} due today
                  </p>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">Archived</h2>
          <ul className="flex flex-wrap gap-2">
            {archived.map((workspace) => (
              <li key={workspace.id}>
                <Link href={workspaceHref(workspace.slug, 'settings') + '?tab=privacy'} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-ui hover:bg-surface-2">
                  <IconTile icon={workspace.icon} colorKey={workspace.color} size={20} /> {workspace.name} <Badge>archived</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 py-2">
      <dd className={`text-lg font-semibold tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
      <dt className="text-2xs text-ink-3">{label}</dt>
    </div>
  )
}
