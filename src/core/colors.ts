import type { ColorKey } from './types'

/**
 * Color keys stored in the database map to design-token classes here, never to hex
 * values, so every color follows light and dark mode. Classes are written out in full
 * so Tailwind can see them.
 */
export const COLORS: Record<ColorKey, { label: string; dot: string; soft: string; ink: string; ring: string }> = {
  indigo: { label: 'Indigo', dot: 'bg-primary', soft: 'bg-primary-light', ink: 'text-primary-ink', ring: 'ring-primary' },
  blue: { label: 'Blue', dot: 'bg-cat-blue', soft: 'bg-cat-blue-light', ink: 'text-cat-blue-ink', ring: 'ring-cat-blue' },
  teal: { label: 'Teal', dot: 'bg-cat-teal', soft: 'bg-cat-teal-light', ink: 'text-cat-teal-ink', ring: 'ring-cat-teal' },
  green: { label: 'Green', dot: 'bg-cat-green', soft: 'bg-cat-green-light', ink: 'text-cat-green-ink', ring: 'ring-cat-green' },
  amber: { label: 'Amber', dot: 'bg-cat-amber', soft: 'bg-cat-amber-light', ink: 'text-cat-amber-ink', ring: 'ring-cat-amber' },
  orange: { label: 'Orange', dot: 'bg-cat-orange', soft: 'bg-cat-orange-light', ink: 'text-cat-orange-ink', ring: 'ring-cat-orange' },
  red: { label: 'Red', dot: 'bg-cat-red', soft: 'bg-cat-red-light', ink: 'text-cat-red-ink', ring: 'ring-cat-red' },
  pink: { label: 'Pink', dot: 'bg-cat-pink', soft: 'bg-cat-pink-light', ink: 'text-cat-pink-ink', ring: 'ring-cat-pink' },
  violet: { label: 'Violet', dot: 'bg-cat-violet', soft: 'bg-cat-violet-light', ink: 'text-cat-violet-ink', ring: 'ring-cat-violet' },
  slate: { label: 'Slate', dot: 'bg-cat-slate', soft: 'bg-cat-slate-light', ink: 'text-cat-slate-ink', ring: 'ring-cat-slate' },
}

export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[]

export function color(key: string | null | undefined) {
  return COLORS[(key as ColorKey) in COLORS ? (key as ColorKey) : 'slate']
}

export function isColorKey(value: unknown): value is ColorKey {
  return typeof value === 'string' && value in COLORS
}
