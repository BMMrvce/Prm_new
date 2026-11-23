'use client'

import { Copy, MailPlus, Trash2, UserMinus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useUser } from '@/core/session'
import type { Role, Workspace } from '@/core/types'
import { canAdmin, useInvite, useMembers, useRemoveMember, useRevokeInvitation, useSetMemberRole, useWorkspaceInvitations } from '@/core/workspaces'
import { Button, IconButton } from '@/ui/button'
import { ConfirmDialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { Avatar, Badge, Card } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { toast } from '@/ui/toast'

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'Everything, including deleting the workspace' },
  { value: 'admin', label: 'Admin', hint: 'Settings, members, all projects, claim reviews' },
  { value: 'member', label: 'Member', hint: 'Create and edit work; sees non-private projects' },
  { value: 'guest', label: 'Guest', hint: 'Only projects they are added to; can comment' },
]

export function MemberSettings({ workspace }: { workspace: Workspace }) {
  const me = useUser()
  const admin = canAdmin(workspace)
  const { data: members, isPending } = useMembers(workspace.id)
  const { data: invites = [] } = useWorkspaceInvitations(workspace.id, admin)
  const setRole = useSetMemberRole(workspace.id)
  const remove = useRemoveMember(workspace.id)
  const invite = useInvite(workspace.id)
  const revoke = useRevokeInvitation(workspace.id)
  const [email, setEmail] = useState('')
  const [role, setRoleDraft] = useState<Role>('member')
  const [link, setLink] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const isOwner = workspace.role === 'owner'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const url = await invite.mutateAsync({ email: email.trim(), role })
    setLink(url)
    setEmail('')
  }

  return (
    <div className="space-y-5">
      {admin && (
        <Card title="Invite someone" description="They join after signing in with this email address (confirmed). Share the link with them; it works for 14 days and only for that address.">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <Field label="Email">
              {(props) => <Input {...props} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required maxLength={254} />}
            </Field>
            <Field label="Role">
              {(props) => (
                <Select {...props} value={role} onChange={(event) => setRoleDraft(event.target.value as Role)}>
                  {ROLES.filter((entry) => entry.value !== 'owner').map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" variant="primary" loading={invite.isPending} icon={<MailPlus size={15} aria-hidden />}>
              Invite
            </Button>
          </form>
          {link && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary-subtle p-3" role="status">
              <p className="text-xs font-medium text-ink">Invitation created. Send this link to them:</p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={link} aria-label="Invitation link" onFocus={(event) => event.currentTarget.select()} className="h-8 text-xs" />
                <Button size="sm" variant="secondary" icon={<Copy size={13} aria-hidden />} onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}>
                  Copy
                </Button>
              </div>
              <p className="mt-2 text-2xs text-ink-3">The link is shown only once. If they already have an account they will also see the invitation in the app.</p>
            </div>
          )}
          <dl className="mt-4 grid gap-2 text-2xs text-ink-2 sm:grid-cols-2">
            {ROLES.map((entry) => (
              <div key={entry.value}>
                <dt className="inline font-semibold text-ink">{entry.label}: </dt>
                <dd className="inline">{entry.hint}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card title="Members" description={`${members?.length ?? '…'} people in ${workspace.name}`}>
        {isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="-my-2 divide-y divide-line-soft">
            {members?.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={member.fullName ?? member.email} src={member.avatarUrl} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium">
                    {member.fullName ?? member.email} {member.id === me.id && <span className="font-normal text-ink-3">(you)</span>}
                  </span>
                  <span className="block truncate text-2xs text-ink-3">{member.email}</span>
                </span>
                {admin && member.id !== me.id && (member.role !== 'owner' || isOwner) ? (
                  <Select
                    aria-label={`Role of ${member.fullName ?? member.email}`}
                    value={member.role}
                    onChange={(event) => setRole.mutate({ userId: member.id, role: event.target.value as Role }, { onSuccess: () => toast.success('Role updated') })}
                    className="h-8 w-28 text-xs"
                  >
                    {ROLES.filter((entry) => entry.value !== 'owner' || isOwner).map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge>{ROLES.find((entry) => entry.value === member.role)?.label}</Badge>
                )}
                {admin && member.id !== me.id && (member.role !== 'owner' || isOwner) && (
                  <IconButton label={`Remove ${member.fullName ?? member.email}`} size="sm" onClick={() => setRemoving({ id: member.id, name: member.fullName ?? member.email ?? 'this person' })}>
                    <UserMinus size={14} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {admin && invites.length > 0 && (
        <Card title="Pending invitations">
          <ul className="-my-2 divide-y divide-line-soft">
            {invites.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-ui">{entry.email}</span>
                <Badge>{entry.role}</Badge>
                <span className="text-2xs text-ink-3">expires {new Date(entry.expiresAt).toLocaleDateString()}</span>
                <IconButton label={`Cancel invitation for ${entry.email}`} size="sm" onClick={() => revoke.mutate(entry.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message="They lose access to this workspace immediately. Their tasks and comments stay."
          confirmLabel="Remove"
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await remove.mutateAsync(removing.id)
            toast.success('Member removed')
            setRemoving(null)
          }}
        />
      )}
    </div>
  )
}
