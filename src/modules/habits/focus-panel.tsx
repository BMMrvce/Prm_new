'use client'

import { Brain, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import { formatDay, formatMinutes, focusSummary, numberOrNull, startOfWeek } from '@/modules/growth/logic'
import type { FocusSession } from '@/modules/growth/types'
import { ScalePicker, StatTile } from '@/modules/growth/ui'
import { Button, IconButton } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Textarea } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { Card, EmptyState } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { FocusTimer } from './focus-timer'
import { useDeleteFocusSession, useSaveFocusSession } from './queries'

type Draft = { session?: FocusSession; minutes?: number; note?: string }

/** Deep-work sessions: a timer, this week's numbers and the recent log. */
export function FocusPanel({ workspace, sessions, loading, today }: { workspace: Workspace; sessions: FocusSession[]; loading: boolean; today: string }) {
  const writable = canWrite(workspace)
  const remove = useDeleteFocusSession(workspace.id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const week = focusSummary(sessions, startOfWeek(today, workspace.settings.weekStart ?? 1), today)
  const recent = sessions.slice(0, 30)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="This week" value={formatMinutes(week.minutes)} note="deep work" />
        <StatTile label="Sessions" value={week.sessions} note="this week" />
        <StatTile label="Concentration" value={week.avgConcentration ?? '—'} note="average, out of 5" />
        <StatTile label="Distractions" value={week.distractions} note="this week" />
      </div>
      <Card title="Focus timer" description="Pick a length and start. The timer keeps running if you leave this page.">
        <FocusTimer workspaceId={workspace.id} disabled={!writable} onLog={(minutes, early) => setDraft({ minutes, note: early ? 'Stopped early.' : '' })} />
      </Card>
      <Card
        title="Recent sessions"
        actions={
          writable && (
            <Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setDraft({})}>
              Log a session
            </Button>
          )
        }
      >
        {loading ? (
          <Skeleton className="h-24" />
        ) : !recent.length ? (
          <EmptyState icon={Brain} title="No focus sessions yet" hint="Run the timer or log a session you did away from the app." className="py-6" />
        ) : (
          <ul className="-mx-2 divide-y divide-line-soft">
            {recent.map((session) => (
              <li key={session.id} className="animate-row flex items-start gap-3 px-2 py-2.5">
                <div className="w-20 shrink-0 text-xs text-ink-2">{formatDay(session.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-ui text-ink">
                    {formatMinutes(session.durationMinutes)}
                    <span className="text-ink-3"> · concentration {session.concentration}/5</span>
                  </p>
                  <p className="text-2xs text-ink-3">
                    {session.distractions} distraction{session.distractions === 1 ? '' : 's'} · {session.tasksCompleted} task{session.tasksCompleted === 1 ? '' : 's'} done
                  </p>
                  {session.note && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{session.note}</p>}
                </div>
                {writable && (
                  <Menu
                    label="Session actions"
                    trigger={(props) => (
                      <IconButton {...props} size="sm" label={`More for the session on ${formatDay(session.date)}`}>
                        <MoreHorizontal size={15} />
                      </IconButton>
                    )}
                    items={[
                      { label: 'Edit', icon: <Pencil size={14} />, onSelect: () => setDraft({ session }) },
                      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => remove.mutate(session.id, { onSuccess: () => toast.success('Session deleted') }) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {draft && <FocusDialog workspace={workspace} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function FocusDialog({ workspace, draft, onClose }: { workspace: Workspace; draft: Draft; onClose: () => void }) {
  const save = useSaveFocusSession(workspace.id)
  const session = draft.session
  const [date, setDate] = useState(session?.date ?? localDate())
  const [minutes, setMinutes] = useState(String(session?.durationMinutes ?? draft.minutes ?? 45))
  const [distractions, setDistractions] = useState(String(session?.distractions ?? 0))
  const [tasks, setTasks] = useState(String(session?.tasksCompleted ?? 0))
  const [concentration, setConcentration] = useState<number | null>(session?.concentration ?? 3)
  const [note, setNote] = useState(session?.note ?? draft.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const duration = numberOrNull(minutes, 1)
    if (!duration || duration > 1440) return setError('Duration must be between 1 and 1440 minutes.')
    if (!concentration) return setError('Rate your concentration from 1 to 5.')
    setError(null)
    await save.mutateAsync({
      id: session?.id,
      input: { date, durationMinutes: duration, distractions: numberOrNull(distractions) ?? 0, tasksCompleted: numberOrNull(tasks) ?? 0, concentration, note },
    })
    toast.success(session ? 'Session saved' : 'Session logged')
    onClose()
  }

  return (
    <Dialog title={session ? 'Edit focus session' : 'Log a focus session'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">{(props) => <Input {...props} type="date" required max={localDate()} value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
          <Field label="Minutes">
            {(props) => <Input {...props} type="number" min={1} max={1440} required autoFocus value={minutes} onChange={(event) => setMinutes(event.target.value)} />}
          </Field>
          <Field label="Distractions">{(props) => <Input {...props} type="number" min={0} value={distractions} onChange={(event) => setDistractions(event.target.value)} />}</Field>
          <Field label="Tasks completed">{(props) => <Input {...props} type="number" min={0} value={tasks} onChange={(event) => setTasks(event.target.value)} />}</Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-2">Concentration</p>
          <ScalePicker label="Concentration, 1 to 5" value={concentration} onChange={setConcentration} />
          <p className="text-2xs text-ink-3">1 = scattered, 5 = fully absorbed. A self-rating, nothing more.</p>
        </div>
        <Field label="Note" optional>
          {(props) => <Textarea {...props} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What helped or got in the way?" />}
        </Field>
        {error && (
          <p role="alert" className="text-xs text-error-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save session
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
