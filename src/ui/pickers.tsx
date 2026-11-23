'use client'

import { Check } from 'lucide-react'
import { COLOR_KEYS, COLORS } from '@/core/colors'
import type { ColorKey } from '@/core/types'
import { cn } from './cn'
import { Icon, PICKABLE_ICONS } from './icon'

/** Swatches for the theme color keys (radio group). */
export function ColorPicker({ value, onChange, label = 'Color' }: { value: string; onChange: (value: ColorKey) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {COLOR_KEYS.map((key) => {
        const selected = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLORS[key].label}
            title={COLORS[key].label}
            onClick={() => onChange(key)}
            className={cn(
              'grid size-7 place-items-center rounded-full',
              COLORS[key].dot,
              selected && 'ring-2 ring-offset-2 ring-offset-surface',
              selected && COLORS[key].ring,
            )}
          >
            {selected && <Check size={14} className="text-on-primary" strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}

export function IconPicker({ value, onChange, colorKey = 'indigo' }: { value: string; onChange: (value: string) => void; colorKey?: string }) {
  const tone = COLORS[(colorKey as ColorKey) in COLORS ? (colorKey as ColorKey) : 'indigo']
  return (
    <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
      {PICKABLE_ICONS.map((name) => {
        const selected = name === value
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name.replace('-', ' ')}
            title={name.replace('-', ' ')}
            onClick={() => onChange(name)}
            className={cn(
              'grid size-9 place-items-center rounded-lg border',
              selected ? `${tone.soft} ${tone.ink} border-transparent` : 'border-line text-ink-2 hover:bg-surface-2',
            )}
          >
            <Icon name={name} size={17} />
          </button>
        )
      })}
    </div>
  )
}
