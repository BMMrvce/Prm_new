'use client'

import { ArrowLeft, ArrowRight, Mail, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { Logo } from '@/components/brand/logo'
import { workspaceHref } from '@/core/routes'
import { useProfile, useUpdateProfile, useUser } from '@/core/session'
import { useAcceptInvitation, useCreateWorkspace, useMyInvitations, useWorkspaces } from '@/core/workspaces'
import { seedSampleData } from '@/modules/onboarding/sample-data'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Field, Input, Switch } from '@/ui/field'
import { ThemeToggle } from '@/ui/theme-controls'
import { toast } from '@/ui/toast'
import { draftFromTemplate, IdentityFields, ModulePicker, TemplatePicker, type WorkspaceDraft } from './workspace-form'

type Step = 'profile' | 'template' | 'identity' | 'modules'

/**
 * First-run setup (and "New workspace" later, with ?new=1): your name, then a workspace
 * from a template you can adjust: name, look and modules. Pending invitations are shown
 * first so a new teammate can simply join.
 */
export function Onboarding() {
  const router = useRouter()
  const params = useSearchParams()
  const user = useUser()
  const { data: profile } = useProfile()
  const { data: workspaces } = useWorkspaces()
  const { data: invitations = [] } = useMyInvitations()
  const accept = useAcceptInvitation()
  const updateProfile = useUpdateProfile()
  const create = useCreateWorkspace()
  const addingAnother = params.get('new') === '1'
  const firstTime = !addingAnother && workspaces?.length === 0

  const [step, setStep] = useState<Step>('profile')
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<WorkspaceDraft>(() => draftFromTemplate('company'))
  const [sample, setSample] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile && !name) setName(profile.fullName ?? '')
    if (profile && addingAnother) setStep((current) => (current === 'profile' ? 'template' : current))
  }, [profile, addingAnother, name])

  const steps: Step[] = addingAnother ? ['template', 'identity', 'modules'] : ['profile', 'template', 'identity', 'modules']
  const index = steps.indexOf(step)
  const back = () => index > 0 && setStep(steps[index - 1])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await updateProfile.mutateAsync({ fullName: name, timezone })
    setStep('template')
  }

  const finish = async () => {
    if (!draft.name.trim()) return setStep('identity')
    if (!draft.modules.length) return toast.error('Choose at least one module.')
    setBusy(true)
    try {
      const workspace = await create.mutateAsync({
        name: draft.name,
        template: draft.template,
        icon: draft.icon,
        color: draft.color,
        modules: draft.modules,
        moduleConfig: { money: { features: draft.moneyFeatures } },
      })
      if (sample) await seedSampleData(workspace.id, user.id, draft.modules).catch(() => toast.info('The workspace is ready; sample items could not be added.'))
      if (!profile?.onboarding.completedAt) {
        await updateProfile.mutateAsync({ onboarding: { ...profile?.onboarding, completedAt: new Date().toISOString() } })
      }
      const tour = !profile?.onboarding.tour?.completedAt && !profile?.onboarding.tour?.dismissedAt
      router.replace(`${workspaceHref(workspace.slug)}${tour ? '?tour=1' : ''}`)
    } catch {
      setBusy(false)
    }
  }

  return (
    <main className="workbench-scale min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <Link href="/" aria-label="Home">
          <Logo className="h-8" />
        </Link>
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-16">
        {!addingAnother && invitations.length > 0 && (
          <section className="neo-card animate-reveal mb-8 rounded-2xl p-5">
            <h2 className="flex items-center gap-2 text-card font-semibold">
              <Mail size={17} className="text-primary-ink" aria-hidden /> You’ve been invited
            </h2>
            <ul className="mt-3 space-y-2">
              {invitations.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                  <span className="text-ui">
                    <strong className="font-semibold">{invite.workspace_name}</strong>
                    <span className="text-ink-2"> as {invite.role}{invite.invited_by_name ? `, from ${invite.invited_by_name}` : ''}</span>
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={accept.isPending && accept.variables?.id === invite.id}
                    onClick={async () => {
                      await accept.mutateAsync({ id: invite.id })
                      toast.success(`You joined ${invite.workspace_name}`)
                      router.push('/')
                    }}
                  >
                    Join
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
          {steps.map((entry, position) => (
            <li
              key={entry}
              aria-current={entry === step ? 'step' : undefined}
              className={cn('h-1.5 flex-1 rounded-full transition-colors', position <= index ? 'bg-primary' : 'bg-line')}
            />
          ))}
        </ol>

        <div key={step} className="animate-reveal">
          {step === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-6">
              <Heading eyebrow={`Welcome${firstTime ? '' : ' back'}`} title="What should we call you?" text="Your name appears on tasks, comments and notes you share." />
              <Field label="Your name">
                {(props) => <Input {...props} autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Your full name" />}
              </Field>
              <Nav canBack={false} onBack={back} next={<Button type="submit" variant="primary" loading={updateProfile.isPending}>Continue <ArrowRight size={15} aria-hidden /></Button>} />
            </form>
          )}

          {step === 'template' && (
            <div className="space-y-6">
              <Heading
                eyebrow={addingAnother ? 'New workspace' : 'Your first workspace'}
                title="What is this workspace for?"
                text="A workspace keeps one company, client or part of your life separate. Pick a starting point; you can change everything later."
              />
              <TemplatePicker draft={draft} onChange={(next) => setDraft({ ...next, name: draft.name })} />
              <Nav canBack={!addingAnother} onBack={back} next={<Button variant="primary" onClick={() => setStep('identity')}>Continue <ArrowRight size={15} aria-hidden /></Button>} />
            </div>
          )}

          {step === 'identity' && (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault()
                setStep('modules')
              }}
            >
              <Heading eyebrow="Name and look" title="Make it recognisable" text="The color and icon help you tell workspaces apart at a glance." />
              <IdentityFields draft={draft} onChange={setDraft} />
              <Nav canBack onBack={back} next={<Button type="submit" variant="primary" disabled={!draft.name.trim()}>Continue <ArrowRight size={15} aria-hidden /></Button>} />
            </form>
          )}

          {step === 'modules' && (
            <div className="space-y-6">
              <Heading eyebrow="Modules" title="Choose what you need" text="Only checked modules appear in the sidebar. Turn modules on or off any time in Settings." />
              <ModulePicker draft={draft} onChange={setDraft} />
              <div className="neo-card rounded-xl p-4">
                <Switch
                  checked={sample}
                  onChange={setSample}
                  label="Add a few sample items"
                  description="A sample project, tasks and a note to explore with. Delete them whenever you like."
                />
              </div>
              <Nav
                canBack
                onBack={back}
                next={
                  <Button variant="primary" loading={busy} onClick={finish} icon={<Sparkles size={15} aria-hidden />}>
                    Create workspace
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function Heading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-primary-ink">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-xl text-ui text-ink-2">{text}</p>
    </div>
  )
}

function Nav({ canBack, onBack, next }: { canBack: boolean; onBack: () => void; next: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-line-soft pt-5">
      {canBack ? (
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={15} aria-hidden />}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {next}
    </div>
  )
}
