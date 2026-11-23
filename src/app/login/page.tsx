import { CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthForm } from '@/components/auth/auth-form'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/ui/theme-controls'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="workbench-scale grid min-h-screen bg-surface lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden bg-primary-deep p-12 text-on-deep lg:flex lg:flex-col">
        <Logo onDark className="h-12" />
        <div className="my-auto max-w-lg">
          <p className="text-sm font-medium tracking-[0.08em] text-on-deep-accent">CLARITY · FOCUS · STRUCTURE · PROGRESS</p>
          <h1 className="mt-5 text-5xl leading-[1.08] font-semibold">Every company you work with, in one calm place.</h1>
          <p className="mt-6 text-lg leading-8 text-on-deep-muted">
            Workspaces for each company, client and your own life, with the tools you choose for each one.
          </p>
          <div className="mt-10 space-y-4">
            {[
              'Your own workspaces, teams and projects',
              'Boards, notes, whiteboards, time and money',
              'Private by design, with a lock for sensitive work',
            ].map((item) => (
              <div className="flex items-center gap-3 text-sm text-on-deep-muted" key={item}>
                <CheckCircle2 size={18} className="text-on-deep-accent" aria-hidden /> {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-on-deep-muted">Designed for people who value clarity over complexity.</p>
      </section>
      <section className="relative flex items-center justify-center px-5 py-12">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-12 lg:hidden">
            <Logo className="h-10" />
          </div>
          <Suspense>
            <AuthForm />
          </Suspense>
        </div>
      </section>
    </main>
  )
}
