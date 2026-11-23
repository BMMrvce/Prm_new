'use client'

import { Inbox } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { workspaceHref } from '@/core/routes'
import type { Workspace } from '@/core/types'
import { CUSTOM_PRESET, IMAP_PORTS, MAIL_PRESETS, mailPreset, SMTP_PORTS } from '@/lib/mail/presets'
import { useOAuthResult } from '@/modules/integrations/use-oauth-result'
import { Button, ButtonLink, buttonClass } from '@/ui/button'
import { ConfirmDialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { Badge, Card, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { errorMessage, toast } from '@/ui/toast'
import { gmailConnectUrl, useConnectImap, useDisconnectMail, useMailStatus } from './api'

/** Your own mailbox for one workspace: connect Gmail or IMAP (presets or custom servers), or disconnect. */
export function MailConnectionCard({ workspace }: { workspace: Pick<Workspace, 'id' | 'slug' | 'name'> }) {
  const status = useMailStatus(workspace.id)
  const disconnect = useDisconnectMail(workspace.id)
  const [imapOpen, setImapOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const back = `${workspaceHref(workspace.slug, 'settings')}?tab=mail`
  useOAuthResult('mail', 'Gmail connected.', () => status.refetch())

  const data = status.data
  return (
    <Card
      title="Mailbox"
      description={`Your own mailbox in ${workspace.name}. Only you can see it; the password or sign-in is stored encrypted.`}
      actions={data && <Badge colorKey={data.state === 'connected' ? 'green' : undefined}>{data.state === 'connected' ? 'Connected' : 'Not connected'}</Badge>}
    >
      {status.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : status.error ? (
        <ErrorNotice message={status.error.message} onRetry={() => status.refetch()} />
      ) : data?.state === 'connected' ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-light text-primary-ink" aria-hidden>
            <Inbox size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ui font-medium text-ink">{data.label}</p>
            <p className="truncate text-xs text-ink-2">{data.account}</p>
          </div>
          <ButtonLink href={workspaceHref(workspace.slug, 'inbox')} size="sm">
            Open inbox
          </ButtonLink>
          <Button size="sm" variant="ghost" className="text-error-ink" onClick={() => setConfirming(true)}>
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.note && <p className="text-xs text-warning-ink">{data.note}</p>}
          <div className="flex flex-wrap gap-2">
            {data?.gmailAvailable ? (
              <a href={gmailConnectUrl(workspace.id, back)} className={buttonClass('primary', 'md')}>
                Connect Gmail
              </a>
            ) : (
              <p className="self-center text-xs text-ink-3">Gmail needs Google sign-in set up on the server.</p>
            )}
            <Button aria-expanded={imapOpen} onClick={() => setImapOpen((open) => !open)}>
              Connect other mail (IMAP)
            </Button>
          </div>
          {imapOpen && <ImapForm workspaceId={workspace.id} onDone={() => setImapOpen(false)} />}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Disconnect this mailbox?"
          message="The app forgets the sign-in for this workspace. Your mail stays on the mail server."
          confirmLabel="Disconnect"
          busy={disconnect.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await disconnect.mutateAsync()
            setConfirming(false)
            toast.success('Mailbox disconnected.')
          }}
        />
      )}
    </Card>
  )
}

function ImapForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const connect = useConnectImap(workspaceId)
  const [preset, setPreset] = useState(MAIL_PRESETS[0].id)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState<number>(IMAP_PORTS[0])
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState<number>(SMTP_PORTS[0])
  const [error, setError] = useState<string | null>(null)
  const custom = preset === CUSTOM_PRESET
  const chosen = mailPreset(preset)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await connect.mutateAsync({ preset, email, password, ...(username ? { username } : {}), ...(custom ? { imapHost, imapPort, smtpHost, smtpPort } : {}) })
      setPassword('')
      toast.success('Mailbox connected.')
      onDone()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not connect the mailbox.'))
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-lg gap-3 rounded-lg border border-line-soft p-4">
      <Field label="Provider">
        {(props) => (
          <Select {...props} value={preset} onChange={(event) => setPreset(event.target.value)}>
            {MAIL_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
            <option value={CUSTOM_PRESET}>Other (enter servers)</option>
          </Select>
        )}
      </Field>
      <Field label="Email address">{(props) => <Input {...props} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />}</Field>
      <Field label="Password" hint={chosen?.hint ?? 'Use an app password if your provider offers one.'}>
        {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={512} />}
      </Field>
      {custom && (
        <>
          <Field label="Login name" optional hint="Only if it differs from the email address.">
            {(props) => <Input {...props} value={username} onChange={(event) => setUsername(event.target.value)} maxLength={254} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="IMAP server">{(props) => <Input {...props} placeholder="imap.example.com" value={imapHost} onChange={(event) => setImapHost(event.target.value)} required />}</Field>
            <Field label="IMAP port">
              {(props) => (
                <Select {...props} value={imapPort} onChange={(event) => setImapPort(Number(event.target.value))}>
                  {IMAP_PORTS.map((port) => (
                    <option key={port} value={port}>{`${port} (${port === 993 ? 'TLS' : 'STARTTLS'})`}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="SMTP server">{(props) => <Input {...props} placeholder="smtp.example.com" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} required />}</Field>
            <Field label="SMTP port">
              {(props) => (
                <Select {...props} value={smtpPort} onChange={(event) => setSmtpPort(Number(event.target.value))}>
                  {SMTP_PORTS.map((port) => (
                    <option key={port} value={port}>{`${port} (${port === 465 ? 'TLS' : 'STARTTLS'})`}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </>
      )}
      {error && <ErrorNotice title="Could not connect" message={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={connect.isPending}>
          Check and connect
        </Button>
      </div>
    </form>
  )
}
