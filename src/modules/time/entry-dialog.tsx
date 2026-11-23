'use client'

import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import { duration, localDate } from '@/lib/format'
import { parseDuration } from '@/modules/tasks/logic'
import { isOpen, useTasks } from '@/modules/tasks/queries'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { toast } from '@/ui/toast'
import { secondsOf } from './logic'
import { useLogTime, useUpdateEntry, type TimeEntry } from './queries'

/** Log time by hand, or edit one of your own entries. */
export function EntryDialog({ workspace, entry, onClose }: { workspace: Workspace; entry?: TimeEntry; onClose: () => void }) {
  const { data: tasks = [] } = useTasks(workspace.id)
  const live = entry ? entry.state !== 'stopped' : false
  const [taskId, setTaskId] = useState(entry?.taskId ?? '')
  const [date, setDate] = useState(() => localDate(entry ? new Date(entry.startedAt) : new Date()))
  const [amount, setAmount] = useState(entry ? duration(secondsOf(entry, Date.now()) / 60) : '')
  const [note, setNote] = useState(entry?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const log = useLogTime()
  const update = useUpdateEntry()
  const choices = tasks.filter((task) => isOpen(task) || task.id === entry?.taskId)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = live ? 0 : parseDuration(amount)
    if (!live && !minutes) return setError('Write the time like “1h 30m”, “90m” or “1.5h”.')
    if (entry) await update.mutateAsync({ entry, changes: { taskId: taskId || null, date, minutes: minutes ?? 0, description: note } })
    else await log.mutateAsync({ workspaceId: workspace.id, taskId: taskId || null, date, minutes: minutes!, description: note })
    toast.success(entry ? 'Entry updated' : `Logged ${duration(minutes!)}`)
    onClose()
  }

  return (
    <Dialog
      title={entry ? 'Edit time entry' : 'Log time'}
      description={workspace.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="entry-form" variant="primary" loading={log.isPending || update.isPending}>
            {entry ? 'Save' : 'Log time'}
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={submit} className="space-y-4">
        <Field label="Task" optional>
          {(props) => (
            <Select {...props} value={taskId} onChange={(event) => setTaskId(event.target.value)}>
              <option value="">No task</option>
              {choices.map((task) => (
                <option key={task.id} value={task.id}>
                  {workspace.taskPrefix}-{task.number} · {task.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" hint={live ? 'A running timer keeps its start.' : undefined}>
            {(props) => <Input {...props} type="date" value={date} required disabled={live} onChange={(event) => setDate(event.target.value)} />}
          </Field>
          <Field label="Time spent" error={error} hint={live ? 'Stop the timer to change its length.' : 'e.g. 1h 30m'}>
            {(props) => (
              <Input
                {...props}
                value={amount}
                required={!live}
                disabled={live}
                autoFocus={!entry}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setError(null)
                }}
              />
            )}
          </Field>
        </div>
        <Field label="Note" optional>
          {(props) => <Input {...props} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="What did you work on?" />}
        </Field>
      </form>
    </Dialog>
  )
}
