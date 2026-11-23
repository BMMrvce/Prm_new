'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AccountConnections } from '@/modules/integrations/account-connections'
import { useProfile, useUpdateProfile, useUser } from '@/core/session'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/ui/button'
import { Field, Input, Select } from '@/ui/field'
import { Avatar, Card } from '@/ui/misc'
import { toast } from '@/ui/toast'

function timezones() {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
}

export default function ProfilePage() {
  const user = useUser()
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [email, setEmail] = useState(user.email)
  const [emailBusy, setEmailBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setName(profile.fullName ?? '')
    setTimezone(profile.timezone)
  }, [profile])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    await update.mutateAsync({ fullName: name, timezone })
    toast.success('Profile saved')
  }

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault()
    setEmailBusy(true)
    const { error } = await supabase().auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` })
    setEmailBusy(false)
    if (error) return toast.error(error.message)
    toast.success('Check both inboxes: confirm the change from the links we sent.')
  }

  return (
    <div className="space-y-5">
      <Card title="Profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={name || user.email} src={profile?.avatarUrl} size={56} />
            <p className="text-xs text-ink-2">Your initials are shown next to your work. Co-members of your workspaces can see your name.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">{(props) => <Input {...props} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}</Field>
            <Field label="Time zone" hint="Used for reminders and the daily digest.">
              {(props) => (
                <Select {...props} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                  {timezones().map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll('_', ' ')}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>
      <Card title="Email address" description="Changing it needs confirmation from both the old and the new address.">
        <form onSubmit={changeEmail} className="flex flex-wrap items-end gap-3">
          <Field label="Email" className="min-w-60 flex-1">
            {(props) => <Input {...props} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
          </Field>
          <Button type="submit" variant="secondary" loading={emailBusy} disabled={email.trim() === user.email}>
            Change email
          </Button>
        </form>
      </Card>
      <AccountConnections />
    </div>
  )
}
