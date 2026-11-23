'use client'

import { ArrowRight, Lock, Mail, MailCheck, User } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { safeNext } from '@/core/routes'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'

type Mode = 'signin' | 'signup' | 'reset'

const MIN_PASSWORD = 10

/** Turns Supabase Auth errors into plain sentences. */
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you.'
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.'
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.'
  if (/weak|pwned|leaked/i.test(message)) return 'Choose a stronger password: this one is too common or has appeared in a data breach.'
  return message
}

export function AuthForm() {
  const params = useSearchParams()
  const next = safeNext(params.get('next'), '/')
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error'))
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null)

  const callback = (path: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const auth = supabase().auth
    try {
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        window.location.assign(next)
        return
      }
      if (mode === 'signup') {
        if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`)
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: callback(next) },
        })
        if (error) throw error
        // With email confirmation on (recommended) there is no session until the link is opened.
        if (data.session) window.location.assign(next)
        else setSent('confirm')
        return
      }
      const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: callback('/auth/reset') })
      if (error) throw error
      setSent('reset')
    } catch (caught) {
      setError(friendly((caught as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (value: Mode) => {
    setMode(value)
    setError(null)
    setSent(null)
  }

  if (sent) {
    return (
      <div className="animate-reveal text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-light text-primary-ink">
          <MailCheck size={26} aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold text-ink">Check your inbox</h2>
        <p className="mt-2 text-ui text-ink-2">
          {sent === 'confirm'
            ? `We sent a confirmation link to ${email}. Open it to finish creating your account.`
            : `If an account exists for ${email}, a link to choose a new password is on its way.`}
        </p>
        <Button variant="ghost" className="mt-6" onClick={() => switchMode('signin')}>
          Back to sign in
        </Button>
      </div>
    )
  }

  const titles: Record<Mode, [string, string]> = {
    signin: ['Welcome back', 'Sign in to your workspaces'],
    signup: ['Get started', 'Create your account'],
    reset: ['Forgot your password?', 'Reset your password'],
  }

  return (
    <div className="w-full max-w-md">
      <p className="text-sm font-medium text-primary-ink">{titles[mode][0]}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{titles[mode][1]}</h2>
      {mode !== 'reset' && (
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm font-medium" role="tablist" aria-label="Sign in or create account">
          {(['signin', 'signup'] as const).map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === value}
              key={value}
              onClick={() => switchMode(value)}
              className={cn('h-9 rounded-md', mode === value ? 'bg-segment text-ink shadow-sm' : 'text-ink-2')}
            >
              {value === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'signup' && (
          <AuthField label="Full name" icon={<User size={16} />}>
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" required maxLength={120} />
          </AuthField>
        )}
        <AuthField label="Email address" icon={<Mail size={16} />}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
            maxLength={254}
          />
        </AuthField>
        {mode !== 'reset' && (
          <AuthField
            label="Password"
            icon={<Lock size={16} />}
            extra={
              mode === 'signin' && (
                <button type="button" onClick={() => switchMode('reset')} className="text-xs font-medium text-primary-ink">
                  Forgot password?
                </button>
              )
            }
          >
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signin' ? 'Enter your password' : `At least ${MIN_PASSWORD} characters`}
              minLength={mode === 'signup' ? MIN_PASSWORD : undefined}
              required
            />
          </AuthField>
        )}
        {error && (
          <p className="rounded-lg bg-error-light px-3 py-2 text-sm text-error-ink" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          {!busy && <ArrowRight size={16} aria-hidden />}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-2">
        {mode === 'reset' ? (
          <button type="button" onClick={() => switchMode('signin')} className="font-medium text-primary-ink">
            Back to sign in
          </button>
        ) : (
          <>
            {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="font-medium text-primary-ink">
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

function AuthField({ label, icon, extra, children }: { label: string; icon: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-ink-2">
        {label}
        {extra}
      </span>
      <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-line-strong px-3 text-ink-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-sm [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-ink-3">
        {icon}
        {children}
      </span>
    </label>
  )
}
