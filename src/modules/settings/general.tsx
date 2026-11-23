'use client'

import { DEFAULT_CURRENCY } from '@/lib/format'
import { useState, type FormEvent } from 'react'
import type { ColorKey, Workspace } from '@/core/types'
import { canAdmin, useUpdateWorkspace } from '@/core/workspaces'
import { Button } from '@/ui/button'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { Card } from '@/ui/misc'
import { ColorPicker, IconPicker } from '@/ui/pickers'
import { toast } from '@/ui/toast'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CHF', 'ZAR', 'BRL', 'MXN', 'NZD', 'SEK', 'NOK', 'DKK', 'HKD', 'CNY', 'SAR']

export function GeneralSettings({ workspace }: { workspace: Workspace }) {
  const update = useUpdateWorkspace(workspace.id)
  const admin = canAdmin(workspace)
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [icon, setIcon] = useState(workspace.icon)
  const [colorKey, setColorKey] = useState<ColorKey>(workspace.color)
  const [prefix, setPrefix] = useState(workspace.taskPrefix)
  const [currency, setCurrency] = useState(workspace.settings.currency ?? DEFAULT_CURRENCY)
  const [weekStart, setWeekStart] = useState(String(workspace.settings.weekStart ?? 1))
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^[A-Z0-9]{2,6}$/.test(prefix.toUpperCase())) return setError('Use 2–6 letters or digits, e.g. ACME.')
    setError(null)
    await update.mutateAsync({
      name,
      description,
      icon,
      color: colorKey,
      taskPrefix: prefix.toUpperCase(),
      settings: { ...workspace.settings, currency, weekStart: Number(weekStart) as 0 | 1 },
    })
    toast.success('Workspace saved')
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card title="Name and look" description="Shown in the sidebar and the workspace switcher.">
        <fieldset disabled={!admin} className="space-y-5">
          <Field label="Name">{(props) => <Input {...props} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />}</Field>
          <Field label="Description" optional>
            {(props) => <Textarea {...props} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="What this workspace is for" />}
          </Field>
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-2">Color</p>
            <ColorPicker value={colorKey} onChange={setColorKey} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-2">Icon</p>
            <IconPicker value={icon} colorKey={colorKey} onChange={setIcon} />
          </div>
        </fieldset>
      </Card>
      <Card title="Preferences">
        <fieldset disabled={!admin} className="grid gap-4 sm:grid-cols-3">
          <Field label="Task ID prefix" hint={`Tasks are numbered ${prefix.toUpperCase() || 'ACME'}-1, -2…`} error={error}>
            {(props) => <Input {...props} value={prefix} maxLength={6} onChange={(event) => setPrefix(event.target.value.toUpperCase())} />}
          </Field>
          <Field label="Currency">
            {(props) => (
              <Select {...props} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Week starts on">
            {(props) => (
              <Select {...props} value={weekStart} onChange={(event) => setWeekStart(event.target.value)}>
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
              </Select>
            )}
          </Field>
        </fieldset>
      </Card>
      {admin ? (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={update.isPending}>
            Save changes
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-3">Only owners and admins can change these settings.</p>
      )}
    </form>
  )
}
