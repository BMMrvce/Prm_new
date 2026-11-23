'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { keys } from '@/core/query'
import { must, supabase } from '@/lib/supabase/client'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input } from '@/ui/field'
import { toast } from '@/ui/toast'

type Status = { hasPin: boolean; autoLockMinutes: number; unlockedUntil: string | null; lockedUntil: string | null }

type Vault = {
  status: Status | undefined
  unlocked: boolean
  /** Opens the PIN dialog; resolves true once unlocked (false if dismissed). */
  requestUnlock: () => Promise<boolean>
  lock: (everywhere?: boolean) => Promise<void>
  refresh: () => Promise<unknown>
}

const VaultContext = createContext<Vault | null>(null)

export function useVault() {
  const vault = use(VaultContext)
  if (!vault) throw new Error('useVault() must be used inside <VaultProvider>')
  return vault
}

async function post(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

const EXTEND_EVERY_MS = 60_000

/**
 * The privacy vault. Protected workspaces and notes are hidden by the database until
 * this browser session holds an unlock grant (made by /api/security/unlock after a PIN
 * check). Activity extends the grant; inactivity lets it expire, and when it does every
 * cached query is reset so protected data leaves memory.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState<((ok: boolean) => void) | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const lastExtend = useRef(0)

  const { data: status, refetch } = useQuery({
    queryKey: keys.security,
    queryFn: async (): Promise<Status> => {
      const [row] = (must(await supabase().rpc('my_security_status')) as 
          { has_pin: boolean; auto_lock_minutes: number; unlocked_until: string | null; locked_until: string | null }[]
        )
      return {
        hasPin: row?.has_pin ?? false,
        autoLockMinutes: row?.auto_lock_minutes ?? 15,
        unlockedUntil: row?.unlocked_until ?? null,
        lockedUntil: row?.locked_until ?? null,
      }
    },
    staleTime: 30_000,
  })

  const unlockedUntil = status?.unlockedUntil ? new Date(status.unlockedUntil).getTime() : 0
  const unlocked = unlockedUntil > now
  const wasUnlocked = useRef(unlocked)

  // Tick while unlocked so expiry is noticed on time.
  useEffect(() => {
    if (!unlocked) return
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [unlocked])

  // Locked (by timeout, button or another tab): drop every cached query so protected
  // rows are refetched without them, i.e. disappear.
  useEffect(() => {
    if (wasUnlocked.current && !unlocked) {
      queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== keys.security[0] })
      toast.info('Locked. Protected items are hidden until you unlock again.')
    }
    wasUnlocked.current = unlocked
  }, [unlocked, queryClient])

  // Activity keeps the grant alive (at most one request a minute).
  useEffect(() => {
    if (!unlocked) return
    const onActivity = () => {
      if (Date.now() - lastExtend.current < EXTEND_EVERY_MS) return
      lastExtend.current = Date.now()
      post('/api/security/extend').then(({ data }) => {
        queryClient.setQueryData<Status>(keys.security, (old) => (old ? { ...old, unlockedUntil: data.unlockedUntil ?? null } : old))
      })
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }))
    return () => events.forEach((event) => window.removeEventListener(event, onActivity))
  }, [unlocked, queryClient])

  const requestUnlock = useCallback(() => {
    if (unlocked) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => setPrompt(() => resolve))
  }, [unlocked])

  const lock = useCallback(
    async (everywhere = false) => {
      await post('/api/security/lock', { everywhere })
      queryClient.setQueryData<Status>(keys.security, (old) => (old ? { ...old, unlockedUntil: null } : old))
      setNow(Date.now())
    },
    [queryClient],
  )

  const value = useMemo<Vault>(() => ({ status, unlocked, requestUnlock, lock, refresh: refetch }), [status, unlocked, requestUnlock, lock, refetch])

  return (
    <VaultContext value={value}>
      {children}
      {prompt && (
        <UnlockDialog
          hasPin={status?.hasPin ?? false}
          onDone={(ok, until) => {
            if (ok && until) {
              queryClient.setQueryData<Status>(keys.security, (old) => (old ? { ...old, unlockedUntil: until } : old))
              setNow(Date.now())
              lastExtend.current = Date.now()
              // Refetch everything so protected rows appear.
              queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== keys.security[0] })
            }
            prompt(ok)
            setPrompt(null)
          }}
        />
      )}
    </VaultContext>
  )
}

function UnlockDialog({ hasPin, onDone }: { hasPin: boolean; onDone: (ok: boolean, until?: string) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { ok, data } = await post('/api/security/unlock', { pin })
    setBusy(false)
    if (ok) return onDone(true, data.unlockedUntil)
    setPin('')
    setError(
      data.lockedUntil
        ? `${data.error} Try again after ${new Date(data.lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
        : data.attemptsLeft !== undefined
          ? `${data.error} ${data.attemptsLeft} ${data.attemptsLeft === 1 ? 'attempt' : 'attempts'} left before a lockout.`
          : (data.error ?? 'Could not unlock.'),
    )
  }

  if (!hasPin) {
    return (
      <Dialog title="Set up a PIN first" size="sm" onClose={() => onDone(false)}>
        <p className="text-ui text-ink-2">
          Protected workspaces and notes are opened with a PIN that only you know. Set one up in your account&apos;s security settings.
        </p>
        <Link href="/account/security" onClick={() => onDone(false)} className="mt-4 inline-flex text-ui font-medium text-primary-ink">
          Go to security settings →
        </Link>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={
        <span className="flex items-center gap-2">
          <LockKeyhole size={16} className="text-primary-ink" aria-hidden /> Unlock protected items
        </span>
      }
      description="Only this browser is unlocked, and it locks again after a while without activity."
      size="sm"
      onClose={() => onDone(false)}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="PIN or passphrase" error={error}>
          {(props) => (
            <Input
              {...props}
              type="password"
              inputMode="text"
              autoComplete="off"
              autoFocus
              value={pin}
              maxLength={64}
              onChange={(event) => setPin(event.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!pin}>
          Unlock
        </Button>
      </form>
    </Dialog>
  )
}
