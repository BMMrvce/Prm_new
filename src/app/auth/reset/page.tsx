'use client'

import { KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Logo } from '@/components/brand/logo'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/ui/button'
import { Field, Input } from '@/ui/field'

/** Opened from the reset-password email (the callback has already signed the user in). */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 10) return setError('Use at least 10 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    setError(null)
    const { error } = await supabase().auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(/session/i.test(error.message) ? 'This link has expired. Request a new one from the sign-in page.' : error.message)
    window.location.assign('/')
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5">
      <form onSubmit={submit} className="neo-card w-full max-w-sm space-y-4 rounded-2xl p-6">
        <Logo className="h-8" />
        <div className="flex items-center gap-2 pt-2">
          <KeyRound size={18} className="text-primary-ink" aria-hidden />
          <h1 className="text-lg font-semibold">Choose a new password</h1>
        </div>
        <Field label="New password">
          {(props) => <Input {...props} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        <Field label="Repeat it" error={error}>
          {(props) => <Input {...props} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Save password
        </Button>
      </form>
    </main>
  )
}
