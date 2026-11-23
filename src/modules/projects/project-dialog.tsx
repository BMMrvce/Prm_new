'use client'

import { useState, type FormEvent } from 'react'
import type { ColorKey, Workspace } from '@/core/types'
import { useMembers, useTeams } from '@/core/workspaces'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { PeoplePicker } from '@/ui/people-picker'
import { ColorPicker } from '@/ui/pickers'
import { useSaveProject, type Project, type ProjectStatus, type ProjectVisibility } from './queries'

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

export function ProjectDialog({ workspace, project, onClose, onSaved }: { workspace: Workspace; project?: Project; onClose: () => void; onSaved?: (id: string) => void }) {
  const save = useSaveProject(workspace.id)
  const { data: teams = [] } = useTeams(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [colorKey, setColorKey] = useState<ColorKey>(project?.color ?? 'indigo')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [visibility, setVisibility] = useState<ProjectVisibility>(project?.visibility ?? 'workspace')
  const [teamId, setTeamId] = useState(project?.teamId ?? '')
  const [startDate, setStartDate] = useState(project?.startDate ?? '')
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(project?.memberIds ?? [])
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (visibility === 'team' && !teamId) return setError('Choose the team that can see this project.')
    if (startDate && targetDate && targetDate < startDate) return setError('The target date must be after the start date.')
    const id = await save.mutateAsync({
      id: project?.id,
      name,
      description,
      color: colorKey,
      status,
      visibility,
      teamId: teamId || null,
      startDate: startDate || null,
      targetDate: targetDate || null,
      memberIds,
    })
    onSaved?.(id)
    onClose()
  }

  return (
    <Dialog
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" variant="primary" loading={save.isPending} disabled={!name.trim()}>
            {project ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">{(props) => <Input {...props} autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required />}</Field>
        <Field label="Description" optional>
          {(props) => <Textarea {...props} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />}
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">Color</p>
          <ColorPicker value={colorKey} onChange={setColorKey} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            {(props) => (
              <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
                {PROJECT_STATUSES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Who can see it" hint={visibility === 'private' ? 'Only its members, plus workspace admins.' : visibility === 'team' ? 'Members of the team, its project members and admins.' : 'Everyone in the workspace except guests.'}>
            {(props) => (
              <Select {...props} value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectVisibility)}>
                <option value="workspace">Whole workspace</option>
                {teams.length > 0 && <option value="team">One team</option>}
                <option value="private">Only project members</option>
              </Select>
            )}
          </Field>
          {(visibility === 'team' || teams.length > 0) && (
            <Field label="Team" optional={visibility !== 'team'}>
              {(props) => (
                <Select {...props} value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Start" optional>
            {(props) => <Input {...props} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />}
          </Field>
          <Field label="Target date" optional>
            {(props) => <Input {...props} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />}
          </Field>
        </div>
        {members.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-2">Project members</p>
            <PeoplePicker members={members} value={memberIds} onChange={setMemberIds} label="Project members" placeholder="Add members" />
          </div>
        )}
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
