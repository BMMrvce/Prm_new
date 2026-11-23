'use client'

import { NotebookPen, Trash2, Video } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { isModuleEnabled } from '@/core/modules'
import { useUser } from '@/core/session'
import type { Workspace } from '@/core/types'
import { canAdmin, canWrite, useWorkspaces } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { Button } from '@/ui/button'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { cn } from '@/ui/cn'
import { DatePicker, TimePicker } from '@/ui/date-time'
import { Field, Input, Select, Switch, Textarea } from '@/ui/field'
import { toast } from '@/ui/toast'
import { addDays, clock, isSafeLink, meetingInputs, meetingTimes, normaliseUrl, parseDay, type MeetingTimesInput } from './logic'
import { useDeleteMeeting, useMeetingNote, useMeetingTypes, useOpenMeetingNote, useSaveMeeting, type Meeting } from './queries'

const DURATIONS: [string, number][] = [
  ['15m', 15],
  ['30m', 30],
  ['45m', 45],
  ['1h', 60],
  ['1½h', 90],
  ['2h', 120],
]

export type MeetingDraft = { day: Date; minutes: number | null }

/** Workspaces where a new meeting can go: writable, with the calendar switched on. */
export function useCalendarWorkspaces(scope: string | 'all') {
  const { data: workspaces = [] } = useWorkspaces()
  return useMemo(
    () => workspaces.filter((ws) => (scope === 'all' || ws.id === scope) && canWrite(ws) && isModuleEnabled(ws, 'calendar')),
    [workspaces, scope],
  )
}

function draftInputs(draft: MeetingDraft): MeetingTimesInput {
  const date = localDate(draft.day)
  if (draft.minutes === null) return { allDay: true, startDate: date, endDate: date, startTime: '09:00', endTime: '10:00' }
  const start = new Date(draft.day)
  start.setHours(0, draft.minutes, 0, 0)
  const end = new Date(start.getTime() + 60 * 60_000)
  return { allDay: false, startDate: date, startTime: clock(start), endDate: localDate(end), endTime: clock(end) }
}

/**
 * Create or edit a meeting: title, time (or all day), type, project, place, link and
 * notes, plus the person's own meeting note. Read-only for guests and archived workspaces.
 */
export function MeetingDialog({
  scope,
  meeting,
  draft,
  onClose,
}: {
  scope: string | 'all'
  meeting?: Meeting
  draft?: MeetingDraft
  onClose: () => void
}) {
  const user = useUser()
  const { data: workspaces = [] } = useWorkspaces()
  const targets = useCalendarWorkspaces(scope)
  const [picked, setWorkspaceId] = useState(meeting?.workspaceId ?? (scope !== 'all' ? scope : ''))
  // On cross-workspace pages the first writable workspace is preselected once loaded.
  const workspaceId = picked || targets[0]?.id || ''
  const workspace: Workspace | undefined = workspaces.find((ws) => ws.id === workspaceId)
  const editable = workspace ? canWrite(workspace) : false
  const projectsOn = workspace ? isModuleEnabled(workspace, 'projects') : false
  const notesOn = workspace ? isModuleEnabled(workspace, 'notes') : false
  const types = useMeetingTypes(scope).filter((type) => type.workspaceId === workspaceId && (!type.archivedAt || type.id === meeting?.categoryId))
  const { data: projects = [] } = useProjects(projectsOn ? workspaceId : undefined)

  const [title, setTitle] = useState(meeting?.title ?? '')
  const [times, setTimes] = useState<MeetingTimesInput>(() => (meeting ? meetingInputs(meeting) : draftInputs(draft ?? { day: new Date(), minutes: 9 * 60 })))
  const [categoryId, setCategoryId] = useState(meeting?.categoryId ?? '')
  const [projectId, setProjectId] = useState(meeting?.projectId ?? '')
  const [location, setLocation] = useState(meeting?.location ?? '')
  const [link, setLink] = useState(meeting?.meetingUrl ?? '')
  const [description, setDescription] = useState(meeting?.description ?? '')
  const [error, setError] = useState<{ field: 'time' | 'link'; message: string } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const save = useSaveMeeting()
  const remove = useDeleteMeeting()
  const openNote = useOpenMeetingNote()
  const { data: noteId } = useMeetingNote(notesOn ? meeting?.id : undefined)
  const canDelete = Boolean(meeting && workspace && editable && (meeting.createdBy === user.id || canAdmin(workspace)))

  /** Moving the start keeps the meeting's length. */
  const setStart = (changes: Partial<Pick<MeetingTimesInput, 'startDate' | 'startTime'>>) => {
    setTimes((current) => {
      const next = { ...current, ...changes }
      const before = meetingTimes(current)
      const day = parseDay(next.startDate)
      if ('error' in before || !day) return next
      const length = before.endsAt.getTime() - before.startsAt.getTime()
      if (current.allDay) return { ...next, endDate: localDate(addDays(day, Math.max(1, Math.round(length / 86_400_000)) - 1)) }
      if (!/^\d{2}:\d{2}$/.test(next.startTime)) return next
      const end = new Date(new Date(`${next.startDate}T${next.startTime}`).getTime() + length)
      return { ...next, endDate: localDate(end), endTime: clock(end) }
    })
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editable || !workspace || !title.trim()) return
    const when = meetingTimes(times)
    if ('error' in when) return setError({ field: 'time', message: when.error })
    const url = normaliseUrl(link)
    if (url && typeof url === 'object') return setError({ field: 'link', message: url.error })
    await save.mutateAsync({
      id: meeting?.id,
      input: {
        workspaceId: workspace.id,
        title,
        description,
        startsAt: when.startsAt.toISOString(),
        endsAt: when.endsAt.toISOString(),
        allDay: times.allDay,
        categoryId: categoryId || null,
        projectId: projectId || null,
        location,
        meetingUrl: url,
      },
    })
    toast.success(meeting ? 'Meeting updated' : 'Meeting added')
    onClose()
  }

  if (!meeting && !targets.length) {
    return (
      <Dialog title="New meeting" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Close</Button>}>
        <p className="text-ui text-ink-2">None of your workspaces can take meetings: turn on Calendar in a workspace you can edit.</p>
      </Dialog>
    )
  }

  const joinUrl = meeting?.meetingUrl && isSafeLink(meeting.meetingUrl) ? meeting.meetingUrl : null

  return (
    <>
      <Dialog
        title={meeting ? (editable ? 'Edit meeting' : meeting.title) : 'New meeting'}
        description={workspace && (scope === 'all' || !editable) ? `${workspace.name}${editable ? '' : ' · view only'}` : undefined}
        onClose={onClose}
        footer={
          <>
            {canDelete && (
              <Button variant="ghost" className="mr-auto text-error-ink hover:bg-error-light hover:text-error-ink" icon={<Trash2 size={14} aria-hidden />} onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {editable ? 'Cancel' : 'Close'}
            </Button>
            {editable && (
              <Button type="submit" form="meeting-form" variant="primary" loading={save.isPending}>
                {meeting ? 'Save' : 'Add meeting'}
              </Button>
            )}
          </>
        }
      >
        {meeting && (notesOn || joinUrl) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {notesOn && workspace && (
              <Button
                variant="subtle"
                icon={<NotebookPen size={15} aria-hidden />}
                loading={openNote.isPending}
                onClick={() => openNote.mutate({ meeting, workspaceSlug: workspace.slug }, { onSuccess: onClose })}
              >
                {noteId ? 'Open meeting note' : 'Take meeting notes'}
              </Button>
            )}
            {joinUrl && (
              <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="neo-control inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-ui font-medium text-ink hover:bg-surface-2">
                <Video size={15} aria-hidden /> Join
              </a>
            )}
          </div>
        )}
        <form id="meeting-form" onSubmit={submit} className="space-y-4">
          <fieldset disabled={!editable} className="space-y-4">
            {!meeting && scope === 'all' && (
              <Field label="Workspace">
                {(props) => (
                  <Select
                    {...props}
                    value={workspaceId}
                    onChange={(event) => {
                      setWorkspaceId(event.target.value)
                      setCategoryId('')
                      setProjectId('')
                    }}
                  >
                    {targets.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label="Title">
              {(props) => <Input {...props} autoFocus={!meeting} value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} placeholder="Weekly sync" />}
            </Field>
            <Switch
              checked={times.allDay}
              onChange={(allDay) => {
                setTimes((current) => ({ ...current, allDay }))
                setError(null)
              }}
              label="All day"
            />
            {times.allDay ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First day" error={error?.field === 'time' ? error.message : null}>
                  {(props) => <DatePicker id={props.id} label="First day" value={times.startDate} onChange={(startDate) => setStart({ startDate })} />}
                </Field>
                <Field label="Last day">
                  {(props) => (
                    <DatePicker
                      id={props.id}
                      label="Last day"
                      value={times.endDate}
                      min={times.startDate}
                      onChange={(endDate) => {
                        setTimes((current) => ({ ...current, endDate }))
                        setError(null)
                      }}
                    />
                  )}
                </Field>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
                  <Field label="Date" error={error?.field === 'time' ? error.message : null}>
                    {(props) => <DatePicker id={props.id} label="Date" value={times.startDate} onChange={(startDate) => setStart({ startDate })} />}
                  </Field>
                  <Field label="From">{(props) => <TimePicker id={props.id} label="Start time" value={times.startTime} onChange={(startTime) => setStart({ startTime })} />}</Field>
                  <span className="hidden pb-2.5 text-ink-3 sm:block" aria-hidden>
                    →
                  </span>
                  <Field label="To">
                    {(props) => (
                      <TimePicker
                        id={props.id}
                        label="End time"
                        value={times.endTime}
                        after={times.endDate === times.startDate ? times.startTime : undefined}
                        onChange={(endTime) => {
                          // An end before the start means the meeting runs past midnight.
                          setTimes((current) => ({ ...current, endTime, endDate: endTime <= current.startTime ? localDate(addDays(parseDay(current.startDate)!, 1)) : current.startDate }))
                          setError(null)
                        }}
                      />
                    )}
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-2xs text-ink-3">Length</span>
                  {DURATIONS.map(([text, minutes]) => {
                    const when = meetingTimes(times)
                    const current = 'error' in when ? null : Math.round((when.endsAt.getTime() - when.startsAt.getTime()) / 60_000)
                    return (
                      <button
                        key={text}
                        type="button"
                        aria-pressed={current === minutes}
                        onClick={() => {
                          const start = new Date(`${times.startDate}T${times.startTime}`)
                          if (Number.isNaN(start.getTime())) return
                          const end = new Date(start.getTime() + minutes * 60_000)
                          setTimes((value) => ({ ...value, endDate: localDate(end), endTime: clock(end) }))
                          setError(null)
                        }}
                        className={cn(
                          'h-7 rounded-full border px-2.5 text-2xs font-medium transition-colors',
                          current === minutes ? 'border-primary bg-primary-light text-primary-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                        )}
                      >
                        {text}
                      </button>
                    )
                  })}
                  {times.endDate !== times.startDate && <span className="ml-auto text-2xs text-ink-2">Ends {parseDay(times.endDate)?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" optional hint={types.length ? undefined : 'Add meeting types in Settings → Categories.'}>
                {(props) => (
                  <Select {...props} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="">No type</option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {projectsOn && (
                <Field label="Project" optional>
                  {(props) => (
                    <Select {...props} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                      <option value="">No project</option>
                      {projects
                        .filter((project) => project.status !== 'archived' || project.id === meeting?.projectId)
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location" optional>
                {(props) => <Input {...props} value={location} maxLength={300} onChange={(event) => setLocation(event.target.value)} placeholder="Room 4 or an address" />}
              </Field>
              <Field label="Meeting link" optional error={error?.field === 'link' ? error.message : null}>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="url"
                    value={link}
                    maxLength={1000}
                    onChange={(event) => {
                      setLink(event.target.value)
                      setError(null)
                    }}
                    placeholder="https://"
                  />
                )}
              </Field>
            </div>
            <Field label="Description" optional>
              {(props) => <Textarea {...props} value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} placeholder="Agenda, dial-in details…" />}
            </Field>
          </fieldset>
        </form>
      </Dialog>
      {confirming && meeting && (
        <ConfirmDialog
          title="Delete this meeting?"
          message={`“${meeting.title}” is removed from the calendar for everyone in ${workspace?.name ?? 'the workspace'}. Meeting notes are kept.`}
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(meeting.id, {
              onSuccess: () => {
                toast.success('Meeting deleted')
                setConfirming(false)
                onClose()
              },
            })
          }
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  )
}
