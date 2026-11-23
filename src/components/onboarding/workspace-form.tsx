'use client'

import { Check } from 'lucide-react'
import { MODULE_GROUPS, MODULES, TEMPLATES, type ModuleGroup } from '@/core/modules'
import type { ColorKey } from '@/core/types'
import { cn } from '@/ui/cn'
import { Field, Input } from '@/ui/field'
import { Icon } from '@/ui/icon'
import { ColorPicker, IconPicker } from '@/ui/pickers'

export type WorkspaceDraft = {
  name: string
  template: string
  icon: string
  color: ColorKey
  modules: string[]
  moneyFeatures: string[]
}

export function draftFromTemplate(templateId: string, name = ''): WorkspaceDraft {
  const template = TEMPLATES.find((entry) => entry.id === templateId) ?? TEMPLATES[TEMPLATES.length - 1]
  return {
    name,
    template: template.id,
    icon: template.icon,
    color: template.color as ColorKey,
    modules: template.modules,
    moneyFeatures: (template.moduleConfig?.money?.features as string[]) ?? ['expenses', 'income'],
  }
}

/** Template cards. Picking one resets icon, color and modules to its preset. */
export function TemplatePicker({ draft, onChange }: { draft: WorkspaceDraft; onChange: (draft: WorkspaceDraft) => void }) {
  return (
    <div role="radiogroup" aria-label="Start from" className="grid gap-3 sm:grid-cols-2">
      {TEMPLATES.map((template) => {
        const selected = draft.template === template.id
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({ ...draftFromTemplate(template.id, draft.name) })}
            className={cn(
              'relative flex gap-3 rounded-xl border p-4 text-left transition-colors',
              selected ? 'border-primary bg-primary-subtle ring-1 ring-primary' : 'border-line hover:border-line-strong hover:bg-surface-2',
            )}
          >
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', selected ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink-2')}>
              <Icon name={template.icon} size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-ui font-semibold text-ink">{template.label}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{template.description}</span>
            </span>
            {selected && <Check size={16} className="absolute top-3 right-3 text-primary-ink" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

export function IdentityFields({ draft, onChange }: { draft: WorkspaceDraft; onChange: (draft: WorkspaceDraft) => void }) {
  return (
    <div className="space-y-5">
      <Field label="Workspace name" hint="For example the company, client or area of life: “Acme Corp”, “Freelance”, “Home”.">
        {(props) => (
          <Input
            {...props}
            autoFocus
            value={draft.name}
            maxLength={80}
            placeholder="Acme Corp"
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            required
          />
        )}
      </Field>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">Color</p>
        <ColorPicker value={draft.color} onChange={(color) => onChange({ ...draft, color })} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">Icon</p>
        <IconPicker value={draft.icon} colorKey={draft.color} onChange={(icon) => onChange({ ...draft, icon })} />
      </div>
    </div>
  )
}

/** Module checklist grouped like the sidebar. */
export function ModulePicker({ draft, onChange }: { draft: WorkspaceDraft; onChange: (draft: WorkspaceDraft) => void }) {
  const toggle = (id: string) =>
    onChange({ ...draft, modules: draft.modules.includes(id) ? draft.modules.filter((m) => m !== id) : [...draft.modules, id] })
  const groups = Object.keys(MODULE_GROUPS) as ModuleGroup[]
  const moneyOption = MODULES.find((manifest) => manifest.id === 'money')?.options?.[0]
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <fieldset key={group}>
          <legend className="mb-2 text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">{MODULE_GROUPS[group]}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULES.filter((manifest) => manifest.group === group).map((manifest) => {
              const on = draft.modules.includes(manifest.id)
              return (
                <label
                  key={manifest.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                    on ? 'border-primary/60 bg-primary-subtle' : 'border-line hover:bg-surface-2',
                  )}
                >
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(manifest.id)} />
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]',
                      on ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-field',
                    )}
                    aria-hidden
                  >
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-ui font-medium text-ink">
                      <Icon name={manifest.icon} size={15} className="text-ink-2" /> {manifest.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-2">{manifest.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      {draft.modules.includes('money') && moneyOption?.choices && (
        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-ui font-medium">What should Money track here?</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {moneyOption.choices.map((choice) => {
              const on = draft.moneyFeatures.includes(choice.value)
              return (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({
                      ...draft,
                      moneyFeatures: on ? draft.moneyFeatures.filter((value) => value !== choice.value) : [...draft.moneyFeatures, choice.value],
                    })
                  }
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium',
                    on ? 'border-primary bg-primary-light text-primary-ink' : 'border-line text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {choice.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}
