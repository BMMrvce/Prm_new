'use client'

import { MailCheck, MailX } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useUser } from '@/core/session'
import { useAcceptInvitation, useMyInvitations } from '@/core/workspaces'
import { Button } from '@/ui/button'
import { Card, EmptyState, PageHeader } from '@/ui/misc'
import { toast } from '@/ui/toast'

function Invitations() {
  const router = useRouter()
  const params = useSearchParams()
  const user = useUser()
  const token = params.get('token')
  const { data: invitations = [], isPending } = useMyInvitations()
  const accept = useAcceptInvitation()
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)

  // Opened from an invite link: accept it straight away (the database checks the email).
  useEffect(() => {
    if (!token || tried.current) return
    tried.current = true
    accept.mutate(
      { token },
      {
        onSuccess: () => {
          toast.success('Welcome! You joined the workspace.')
          router.replace('/')
        },
        onError: (caught) => setError(caught.message),
      },
    )
  }, [token, accept, router])

  return (
    <div className="max-w-2xl">
      <PageHeader title="Invitations" description={`Invitations sent to ${user.email}`} />
      {error && (
        <Card className="mb-5">
          <EmptyState icon={MailX} title="This invitation could not be used" hint={`${error} Make sure you are signed in with the address it was sent to, and that you confirmed that address.`} />
        </Card>
      )}
      {isPending ? null : invitations.length ? (
        <ul className="space-y-3">
          {invitations.map((invite) => (
            <li key={invite.id} className="neo-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4">
              <span>
                <strong className="font-semibold">{invite.workspace_name}</strong>
                <span className="block text-xs text-ink-2">
                  As {invite.role}
                  {invite.invited_by_name ? `, invited by ${invite.invited_by_name}` : ''} · expires {new Date(invite.expires_at).toLocaleDateString()}
                </span>
              </span>
              <Button
                variant="primary"
                size="sm"
                loading={accept.isPending && accept.variables?.id === invite.id}
                onClick={() => accept.mutate({ id: invite.id }, { onSuccess: () => (toast.success(`You joined ${invite.workspace_name}`), router.replace('/')) })}
              >
                Join
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        !error && <Card><EmptyState icon={MailCheck} title="No pending invitations" /></Card>
      )}
    </div>
  )
}

export default function InvitationsPage() {
  return (
    <Suspense>
      <Invitations />
    </Suspense>
  )
}
