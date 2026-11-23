'use client'

import { Pencil, Timer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useUser } from '@/core/session'
import type { Member, Workspace } from '@/core/types'
import { canAdmin } from '@/core/workspaces'
import { duration, shortDate, timeOfDay } from '@/lib/format'
import { useTaskPanel } from '@/modules/tasks/task-bits'
import { IconButton } from '@/ui/button'
import { ConfirmDialog } from '@/ui/dialog'
import { Avatar, Dot, EmptyState } from '@/ui/misc'
import { toast } from '@/ui/toast'
import { EntryDialog } from './entry-dialog'
import { secondsOf } from './logic'
import { useDeleteEntry, type TimeEntry } from './queries'

/** The entries in the range: date, who, what, length; edit or delete your own. */
export function EntriesTable({ workspace, entries, people, now, showPeople }: { workspace: Workspace; entries: TimeEntry[]; people: Map<string, Member>; now: number; showPeople: boolean }) {
  const user = useUser()
  const panel = useTaskPanel()
  const remove = useDeleteEntry()
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [deleting, setDeleting] = useState<TimeEntry | null>(null)
  const admin = canAdmin(workspace)

  if (!entries.length) return <EmptyState icon={Timer} title="No time in this range" hint="Start a timer on a task or log time by hand." />

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-ui">
          <caption className="sr-only">Time entries</caption>
          <thead>
            <tr className="border-b border-line text-left text-2xs font-medium tracking-wide text-ink-3 uppercase">
              <th scope="col" className="py-2 pr-3 font-medium">Date</th>
              {showPeople && <th scope="col" className="py-2 pr-3 font-medium">Person</th>}
              <th scope="col" className="py-2 pr-3 font-medium">Work</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Time</th>
              <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {entries.map((entry) => {
              const person = people.get(entry.userId)
              const mine = entry.userId === user.id
              const live = entry.state !== 'stopped'
              return (
                <tr key={entry.id} className="animate-row align-top">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-ink-2">
                    {shortDate(entry.startedAt)}
                    <span className="block text-2xs text-ink-3 tabular-nums">{timeOfDay(entry.startedAt)}</span>
                  </td>
                  {showPeople && (
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <Avatar name={person?.fullName ?? person?.email} src={person?.avatarUrl} size={20} />
                        <span className="truncate text-xs">{person?.fullName ?? person?.email ?? 'Former member'}</span>
                      </span>
                    </td>
                  )}
                  <td className="max-w-0 py-2.5 pr-3">
                    {entry.taskId ? (
                      <button type="button" onClick={() => panel.open(entry.taskId!)} className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                        {entry.task?.title ?? 'Hidden task'}
                      </button>
                    ) : (
                      <span className="block truncate font-medium text-ink">{entry.description ?? 'No task'}</span>
                    )}
                    <span className="flex min-w-0 items-center gap-1.5 text-2xs text-ink-2">
                      {entry.project && (
                        <>
                          <Dot colorKey={entry.project.color} /> <span className="truncate">{entry.project.name}</span>
                        </>
                      )}
                      {entry.taskId && entry.description && <span className="truncate">{entry.project ? '· ' : ''}{entry.description}</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold whitespace-nowrap tabular-nums">
                    {live && <span className="mr-1.5 text-2xs font-medium text-accent-ink">{entry.state === 'running' ? 'Running' : 'Paused'}</span>}
                    {duration(secondsOf(entry, now) / 60)}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {mine && (
                      <IconButton size="sm" label="Edit entry" onClick={() => setEditing(entry)}>
                        <Pencil size={13} />
                      </IconButton>
                    )}
                    {(mine || admin) && (
                      <IconButton size="sm" label="Delete entry" disabled={live} onClick={() => setDeleting(entry)} className="hover:text-error-ink">
                        <Trash2 size={13} />
                      </IconButton>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && <EntryDialog workspace={workspace} entry={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this time entry?"
          message={`${duration(secondsOf(deleting, now) / 60)} on ${shortDate(deleting.startedAt)} is removed from every report.`}
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast.success('Entry deleted')
                setDeleting(null)
              },
            })
          }
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
