'use client'

import { useState, type FormEvent } from 'react'
import { duration } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { inputBase } from '@/ui/field'
import { toast, errorMessage } from '@/ui/toast'
import { useSaveEntry, type WorkLogEntry } from './queries'

const QUICK_TIMES = ['15m', '30m', '1h', '2h']

/** Accepts "90", "1.5h", "1h 30m", "45m". Empty → null. */
export function parseDuration(text: string): number | null | undefined {
  const value = text.trim().toLowerCase()
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const match = value.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (!match || (!match[1] && !match[2])) return undefined
  return Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0))
}

/** Add or edit one entry: what you did, optional time and project. */
export function EntryForm({
  workspaceId,
  date,
  entry,
  compact,
  projectId: fixedProject,
  onDone,
}: {
  workspaceId: string
  date: string
  entry?: WorkLogEntry
  compact?: boolean
  /** Pre-select this project (the project page's work log). */
  projectId?: string
  onDone?: () => void
}) {
  const save = useSaveEntry(workspaceId)
  const projects = useProjects(compact ? undefined : workspaceId)
  const [body, setBody] = useState(entry?.body ?? '')
  const [time, setTime] = useState(entry?.minutes ? duration(entry.minutes) : '')
  const [projectId, setProjectId] = useState(entry?.projectId ?? fixedProject ?? '')
  const active = (projects.data ?? []).filter((project) => project.status !== 'archived')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    const minutes = parseDuration(time)
    if (minutes === undefined) return toast.error('Write time like 45m, 1h 30m or 90.')
    save.mutate(
      {
        id: entry?.id,
        date: entry?.date ?? date,
        body,
        minutes,
        projectId: projectId || null,
        taskId: entry?.taskId,
      },
      {
        onSuccess: () => {
          if (!entry) {
            setBody('')
            setTime('')
          }
          onDone?.()
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const minutes = parseDuration(time)
  return (
    <form
      onSubmit={submit}
      className={cn(
        'rounded-xl border border-line-strong bg-field transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
      )}
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
        }}
        placeholder={compact ? 'What did you work on?' : 'What did you work on? (Ctrl+Enter to add)'}
        aria-label="What did you work on?"
        maxLength={4000}
        rows={compact ? 2 : 3}
        autoFocus={Boolean(entry)}
        className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-ui leading-6 text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-1 pb-2.5">
        {!compact &&
          QUICK_TIMES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTime(time === value ? '' : value)}
              aria-pressed={time === value}
              className={cn(
                'h-7 rounded-full border px-2.5 text-2xs font-medium tabular-nums transition-colors',
                time === value ? 'border-primary bg-primary-light text-primary-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
              )}
            >
              {value}
            </button>
          ))}
        <input
          value={time}
          onChange={(event) => setTime(event.target.value)}
          placeholder={compact ? 'Time' : 'Other time'}
          aria-label="Time spent, for example 1h 30m"
          aria-invalid={minutes === undefined || undefined}
          className={cn(inputBase, 'h-7 w-24 rounded-full px-2.5 text-2xs')}
        />
        {!compact && (
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Project" className={cn(inputBase, 'h-7 w-auto max-w-48 cursor-pointer rounded-full px-2.5 pr-7 text-2xs')}>
            <option value="">No project</option>
            {active.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        {entry && onDone && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!body.trim()}>
          {entry ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
