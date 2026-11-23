'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useProfile, useUpdateProfile } from '@/core/session'
import { Button } from '@/ui/button'
import { Field, Input, Select, Switch } from '@/ui/field'
import { Card } from '@/ui/misc'
import { StylePicker, TextSizePicker, ThemePicker } from '@/ui/theme-controls'
import { toast } from '@/ui/toast'

export default function PreferencesPage() {
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const [digest, setDigest] = useState(true)
  const [digestTime, setDigestTime] = useState('09:00')
  const [meetingLead, setMeetingLead] = useState('10')
  const [dueLead, setDueLead] = useState('60')

  useEffect(() => {
    const reminders = profile?.preferences.reminders
    if (!reminders) return
    setDigest(reminders.digestTime !== null)
    setDigestTime(reminders.digestTime ?? '09:00')
    setMeetingLead(String(reminders.meetingLeadMinutes ?? 10))
    setDueLead(String(reminders.dueLeadMinutes ?? 60))
  }, [profile])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await update.mutateAsync({
      preferences: {
        ...profile?.preferences,
        reminders: { digestTime: digest ? digestTime : null, meetingLeadMinutes: Number(meetingLead), dueLeadMinutes: Number(dueLead) },
      },
    })
    toast.success('Preferences saved')
  }

  return (
    <div className="space-y-5">
      <Card title="Appearance" description="Saved in this browser.">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-2">Style</p>
            <StylePicker />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-2">Mode</p>
            <ThemePicker size="md" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-2">Text size</p>
            <TextSizePicker />
          </div>
        </div>
      </Card>
      <Card title="Reminders" description="Push reminders reach this device when you turn them on from the bell. These times apply everywhere.">
        <form onSubmit={submit} className="space-y-4">
          <Switch checked={digest} onChange={setDigest} label="Daily digest" description="A morning summary of what is due today, in your time zone." />
          {digest && (
            <Field label="Digest time" className="max-w-40">
              {(props) => <Input {...props} type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} />}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Before a meeting">
              {(props) => (
                <Select {...props} value={meetingLead} onChange={(event) => setMeetingLead(event.target.value)}>
                  {[0, 5, 10, 15, 30, 60].map((value) => (
                    <option key={value} value={value}>
                      {value ? `${value} minutes before` : 'No reminder'}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Before a deadline">
              {(props) => (
                <Select {...props} value={dueLead} onChange={(event) => setDueLead(event.target.value)}>
                  {[0, 30, 60, 120, 240, 1440].map((value) => (
                    <option key={value} value={value}>
                      {!value ? 'No reminder' : value < 60 ? `${value} minutes before` : value === 1440 ? '1 day before' : `${value / 60} hour${value === 60 ? '' : 's'} before`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
