'use client'

import { Archive, LockKeyhole, LogOut, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVault } from '@/components/security/vault'
import { keys } from '@/core/query'
import type { Workspace } from '@/core/types'
import { canAdmin, useDeleteWorkspace, useLeaveWorkspace, useUpdateWorkspace } from '@/core/workspaces'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Switch } from '@/ui/field'
import { Card } from '@/ui/misc'
import { toast } from '@/ui/toast'

export async function setProtection(kind: 'workspace' | 'note', id: string, value: boolean) {
  const response = await fetch('/api/security/protect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id, protected: value }),
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, locked: Boolean(data.locked), error: data.error as string | undefined }
}

export function PrivacySettings({ workspace }: { workspace: Workspace }) {
  const vault = useVault()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const admin = canAdmin(workspace)

  const toggle = async (value: boolean) => {
    if (!(await vault.requestUnlock())) return
    setBusy(true)
    const result = await setProtection('workspace', workspace.id, value)
    setBusy(false)
    if (!result.ok) return toast.error(result.error ?? 'Could not change protection.')
    await queryClient.invalidateQueries({ queryKey: keys.workspaces })
    toast.success(value ? `${workspace.name} is now protected` : 'Protection removed')
  }

  return (
    <Card title="Privacy" description="Protected workspaces stay hidden, even from a signed-in browser, until you enter your PIN. Everything inside is filtered out by the database while locked.">
      {!vault.status?.hasPin ? (
        <p className="text-ui text-ink-2">
          First set up a PIN in{' '}
          <Link href="/account/security" className="font-medium text-primary-ink underline-offset-2 hover:underline">
            Account → Security
          </Link>
          .
        </p>
      ) : (
        <Switch
          checked={workspace.protected}
          disabled={!admin || busy}
          onChange={toggle}
          label={
            <span className="flex items-center gap-1.5">
              <LockKeyhole size={14} aria-hidden /> Protect this workspace
            </span>
          }
          description={
            admin
              ? 'Every member needs their own PIN to open it. It locks again after inactivity (set in Account → Security).'
              : 'Only owners and admins can change this.'
          }
        />
      )}
    </Card>
  )
}

export function DangerZone({ workspace }: { workspace: Workspace }) {
  const router = useRouter()
  const update = useUpdateWorkspace(workspace.id)
  const remove = useDeleteWorkspace()
  const leave = useLeaveWorkspace()
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null)
  const [typed, setTyped] = useState('')
  const isOwner = workspace.role === 'owner'

  return (
    <Card title="Danger zone">
      <div className="space-y-4">
        {canAdmin(workspace) && (
          <Row
            title={workspace.archivedAt ? 'Restore workspace' : 'Archive workspace'}
            text={workspace.archivedAt ? 'Make it editable again and show it in the switcher.' : 'Hide it from the switcher and make it read-only. Nothing is deleted.'}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Archive size={14} aria-hidden />}
                loading={update.isPending}
                onClick={async () => {
                  await update.mutateAsync({ archived: !workspace.archivedAt })
                  toast.success(workspace.archivedAt ? 'Workspace restored' : 'Workspace archived')
                }}
              >
                {workspace.archivedAt ? 'Restore' : 'Archive'}
              </Button>
            }
          />
        )}
        <Row
          title="Leave workspace"
          text={isOwner ? 'Make someone else an owner first.' : 'You lose access until someone invites you again.'}
          action={
            <Button variant="secondary" size="sm" icon={<LogOut size={14} aria-hidden />} onClick={() => setConfirming('leave')}>
              Leave
            </Button>
          }
        />
        {isOwner && (
          <Row
            title="Delete workspace"
            text="Permanently deletes every project, task, note, board and record in it, for everyone."
            action={
              <Button variant="danger" size="sm" icon={<Trash2 size={14} aria-hidden />} onClick={() => setConfirming('delete')}>
                Delete
              </Button>
            }
          />
        )}
      </div>
      {confirming && (
        <Dialog
          title={confirming === 'delete' ? `Delete ${workspace.name}?` : `Leave ${workspace.name}?`}
          size="sm"
          onClose={() => {
            setConfirming(null)
            setTyped('')
          }}
          footer={
            <Button
              variant="danger"
              loading={remove.isPending || leave.isPending}
              disabled={confirming === 'delete' && typed !== workspace.name}
              onClick={async () => {
                if (confirming === 'delete') await remove.mutateAsync(workspace.id)
                else await leave.mutateAsync(workspace.id)
                toast.success(confirming === 'delete' ? 'Workspace deleted' : 'You left the workspace')
                router.replace('/')
              }}
            >
              {confirming === 'delete' ? 'Delete forever' : 'Leave'}
            </Button>
          }
        >
          {confirming === 'delete' ? (
            <Field label={`Type ${workspace.name} to confirm`}>
              {(props) => <Input {...props} value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus autoComplete="off" />}
            </Field>
          ) : (
            <p className="text-ui text-ink-2">You will lose access to its projects, tasks and notes.</p>
          )}
        </Dialog>
      )}
    </Card>
  )
}

function Row({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ui font-medium">{title}</p>
        <p className="text-xs text-ink-2">{text}</p>
      </div>
      {action}
    </div>
  )
}
