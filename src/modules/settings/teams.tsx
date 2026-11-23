'use client'

import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { color } from '@/core/colors'
import type { ColorKey, Team, Workspace } from '@/core/types'
import { canAdmin, useDeleteTeam, useMembers, useSaveTeam, useTeams } from '@/core/workspaces'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Field, Input, Textarea } from '@/ui/field'
import { Avatar, Card, EmptyState } from '@/ui/misc'
import { PeoplePicker } from '@/ui/people-picker'
import { ColorPicker } from '@/ui/pickers'
import { toast } from '@/ui/toast'

export function TeamSettings({ workspace }: { workspace: Workspace }) {
  const admin = canAdmin(workspace)
  const { data: teams = [] } = useTeams(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const remove = useDeleteTeam(workspace.id)
  const [editing, setEditing] = useState<Team | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Team | null>(null)
  const byId = new Map(members.map((member) => [member.id, member]))

  return (
    <Card
      title="Teams"
      description="Group people (for example Design, Finance). A project can be visible to one team only."
      actions={
        admin && (
          <Button size="sm" variant="primary" icon={<Plus size={14} aria-hidden />} onClick={() => setEditing('new')}>
            New team
          </Button>
        )
      }
    >
      {teams.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-full', color(team.color).dot)} aria-hidden />
                <h3 className="min-w-0 flex-1 truncate text-ui font-semibold">{team.name}</h3>
                {admin && (
                  <>
                    <IconButton label={`Edit ${team.name}`} size="sm" onClick={() => setEditing(team)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton label={`Delete ${team.name}`} size="sm" onClick={() => setDeleting(team)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </>
                )}
              </div>
              {team.description && <p className="mt-1 text-xs text-ink-2">{team.description}</p>}
              <div className="mt-3 flex -space-x-1.5">
                {team.memberIds.slice(0, 8).map((id) => (
                  <Avatar key={id} name={byId.get(id)?.fullName ?? byId.get(id)?.email} src={byId.get(id)?.avatarUrl} size={24} className="ring-2 ring-surface" />
                ))}
                {!team.memberIds.length && <span className="text-2xs text-ink-3">No members yet</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Users} title="No teams yet" hint="Teams are optional. Create them when several people share a workspace." />
      )}
      {editing && <TeamDialog workspace={workspace} team={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Projects visible to this team become visible to the whole workspace's members. Nobody is removed from the workspace."
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </Card>
  )
}

function TeamDialog({ workspace, team, onClose }: { workspace: Workspace; team?: Team; onClose: () => void }) {
  const save = useSaveTeam(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [colorKey, setColorKey] = useState<ColorKey>(team?.color ?? 'teal')
  const [memberIds, setMemberIds] = useState(team?.memberIds ?? [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await save.mutateAsync({ id: team?.id, name, description, color: colorKey, memberIds })
    toast.success(team ? 'Team saved' : 'Team created')
    onClose()
  }

  return (
    <Dialog title={team ? 'Edit team' : 'New team'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">{(props) => <Input {...props} autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />}</Field>
        <Field label="Description" optional>
          {(props) => <Textarea {...props} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />}
        </Field>
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-2">Color</p>
          <ColorPicker value={colorKey} onChange={setColorKey} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-2">Members</p>
          <PeoplePicker members={members} value={memberIds} onChange={setMemberIds} label="Team members" placeholder="Add people" />
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
