'use client'

import { useQuery } from '@tanstack/react-query'
import { KeyRound, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useVault } from '@/components/security/vault'
import { signOut, useUser } from '@/core/session'
import { mailDate } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select } from '@/ui/field'
import { Badge, Card } from '@/ui/misc'
import { toast } from '@/ui/toast'

const EVENT_TEXT: Record<string, string> = {
  'pin.set': 'PIN set or changed',
  'pin.removed': 'PIN removed',
  'pin.password_failed': 'Wrong password while changing the PIN',
  'vault.unlocked': 'Unlocked protected items',
  'vault.unlock_failed': 'Wrong PIN entered',
  'vault.locked_out': 'Locked out after too many wrong PINs',
  'vault.locked_everywhere': 'Locked on every device',
  'workspace.protected': 'Protected a workspace',
  'workspace.unprotected': 'Removed workspace protection',
  'note.protected': 'Protected a note',
  'note.unprotected': 'Removed note protection',
}

async function call(path: string, method: string, body: unknown) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong.')
  return data
}

export default function SecurityPage() {
  const vault = useVault()
  const [dialog, setDialog] = useState<'set' | 'remove' | 'password' | null>(null)
  const status = vault.status

  const events = useQuery({
    queryKey: ['security-events'],
    queryFn: async () => must(await supabase().from('security_events').select('id, kind, ip, created_at').order('created_at', { ascending: false }).limit(15)),
  })

  return (
    <div className="space-y-5">
      <Card
        title={
          <span className="flex items-center gap-2">
            <LockKeyhole size={16} className="text-primary-ink" aria-hidden /> Privacy vault
          </span>
        }
        description="A PIN or passphrase, separate from your password, that opens protected workspaces and notes on one device at a time. Your PIN is never stored, only a salted, slow hash."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge colorKey={status?.hasPin ? 'green' : 'slate'}>{status?.hasPin ? 'PIN is set' : 'No PIN yet'}</Badge>
          {status?.hasPin && <Badge colorKey={vault.unlocked ? 'amber' : 'slate'}>{vault.unlocked ? 'Unlocked on this device' : 'Locked'}</Badge>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={<KeyRound size={14} aria-hidden />} onClick={() => setDialog('set')}>
            {status?.hasPin ? 'Change PIN' : 'Set up a PIN'}
          </Button>
          {status?.hasPin && (
            <>
              <Button variant="secondary" size="sm" onClick={() => (vault.unlocked ? vault.lock() : vault.requestUnlock())}>
                {vault.unlocked ? 'Lock now' : 'Unlock'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => vault.lock(true).then(() => toast.success('Locked on every device'))}>
                Lock on all devices
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDialog('remove')}>
                Remove PIN
              </Button>
            </>
          )}
        </div>
        {status?.hasPin && <AutoLock minutes={status.autoLockMinutes} onSaved={() => vault.refresh()} />}
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary-ink" aria-hidden /> Sign-in
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDialog('password')}>
            Change password
          </Button>
          <Button variant="secondary" size="sm" icon={<LogOut size={14} aria-hidden />} onClick={() => signOut('global')}>
            Sign out on every device
          </Button>
        </div>
      </Card>

      <Card title="Recent security activity" description="Kept for 180 days.">
        {events.data?.length ? (
          <ul className="-my-1 divide-y divide-line-soft">
            {events.data.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-ui">
                <span>{EVENT_TEXT[event.kind] ?? event.kind}</span>
                <span className="text-2xs text-ink-3">
                  {mailDate(event.created_at)} · {event.ip}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">Nothing yet.</p>
        )}
      </Card>

      {dialog === 'set' && <PinDialog hasPin={Boolean(status?.hasPin)} onClose={() => setDialog(null)} onDone={() => (vault.refresh(), events.refetch())} />}
      {dialog === 'remove' && <RemovePinDialog onClose={() => setDialog(null)} onDone={() => (vault.refresh(), events.refetch())} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

function AutoLock({ minutes, onSaved }: { minutes: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(minutes))
  return (
    <div className="mt-5 max-w-xs">
      <Field label="Lock again after inactivity">
        {(props) => (
          <Select
            {...props}
            value={value}
            onChange={async (event) => {
              setValue(event.target.value)
              try {
                await call('/api/security/settings', 'PATCH', { autoLockMinutes: Number(event.target.value) })
                toast.success('Saved')
                onSaved()
              } catch (error) {
                toast.error((error as Error).message)
              }
            }}
          >
            {[1, 5, 10, 15, 30, 60, 120, 240].map((option) => (
              <option key={option} value={option}>
                {option < 60 ? `${option} minute${option === 1 ? '' : 's'}` : `${option / 60} hour${option === 60 ? '' : 's'}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  )
}

function PinDialog({ hasPin, onClose, onDone }: { hasPin: boolean; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pin !== confirm) return setError('The two entries do not match.')
    setBusy(true)
    setError(null)
    try {
      await call('/api/security/pin', 'POST', { password, pin })
      toast.success(hasPin ? 'PIN changed. Other devices were locked.' : 'PIN set. You can now protect workspaces and notes.')
      onDone()
      onClose()
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={hasPin ? 'Change your PIN' : 'Set up a PIN'} size="sm" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Account password" hint="To confirm it's really you.">
          {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />}
        </Field>
        <Field label="New PIN or passphrase" hint="6–12 digits, or a passphrase of 8+ characters. Not your password.">
          {(props) => <Input {...props} type="password" autoComplete="new-password" value={pin} maxLength={64} onChange={(event) => setPin(event.target.value)} required />}
        </Field>
        <Field label="Repeat it" error={error}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" value={confirm} maxLength={64} onChange={(event) => setConfirm(event.target.value)} required />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Save PIN
        </Button>
      </form>
    </Dialog>
  )
}

function RemovePinDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="Remove your PIN?" size="sm" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            await call('/api/security/pin', 'DELETE', { password })
            toast.success('PIN removed')
            onDone()
            onClose()
          } catch (caught) {
            setError((caught as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className="text-ui text-ink-2">Unprotect your protected workspaces and notes first, so nothing becomes unreachable.</p>
        <Field label="Account password" error={error}>
          {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />}
        </Field>
        <Button type="submit" variant="danger" className="w-full" loading={busy}>
          Remove PIN
        </Button>
      </form>
    </Dialog>
  )
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog title="Change password" size="sm" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          if (next.length < 10) return setError('Use at least 10 characters.')
          setBusy(true)
          setError(null)
          // Re-check the current password on the server (signing in again here would
          // replace this session and lock the vault).
          const check = await call('/api/security/verify-password', 'POST', { password: current }).catch(() => ({ ok: false }))
          if (!check.ok) {
            setBusy(false)
            return setError('Your current password is not correct.')
          }
          const { error } = await supabase().auth.updateUser({ password: next })
          setBusy(false)
          if (error) return setError(error.message)
          toast.success('Password changed')
          onClose()
        }}
      >
        <Field label="Current password">
          {(props) => <Input {...props} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required autoFocus />}
        </Field>
        <Field label="New password" error={error}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Change password
        </Button>
      </form>
    </Dialog>
  )
}
