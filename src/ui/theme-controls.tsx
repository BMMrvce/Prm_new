'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTheme, type ThemeOrigin, type ThemePreference } from '@/lib/theme'
import { STYLE_KEY, STYLES, TEXT_SIZE_KEY, TEXT_SIZES } from '@/lib/theme-config'

/** The center of the pressed control, where the new theme's reveal starts. */
const centerOf = (element: Element): ThemeOrigin => {
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

const OPTIONS: [ThemePreference, string, typeof Sun][] = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
]

/** One-click light/dark switch for the header. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme.resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={(event) => theme.toggle(centerOf(event.currentTarget))}
      className="neo-control grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {/* Both icons render; CSS shows the right one so there is no flash before hydration. */}
      <Moon size={17} className="dark:hidden" aria-hidden />
      <Sun size={17} className="hidden dark:block" aria-hidden />
    </button>
  )
}

/** Light / Dark / System choice as a segmented radio group (account menu, settings). */
export function ThemePicker({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const theme = useTheme()
  const md = size === 'md'
  return (
    <div
      className={`grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1 ${md ? 'max-w-sm' : ''}`}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map(([value, label, Icon]) => {
        const selected = theme.preference === value
        return (
          <button
            type="button"
            key={value}
            role="radio"
            aria-checked={selected}
            onClick={(event) => theme.choose(value, centerOf(event.currentTarget))}
            className={`flex items-center justify-center gap-1.5 rounded-md ${
              md ? 'h-9 text-ui' : 'flex-col gap-1 py-1.5 text-2xs'
            } ${selected ? 'bg-segment font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            <Icon size={md ? 15 : 14} className={selected ? 'text-primary-ink' : ''} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Text size for the whole app, saved in this browser (applied before paint by THEME_SCRIPT). */
const textSizeListeners = new Set<() => void>()
const readTextSize = () => document.documentElement.style.getPropertyValue('--font-scale') || '1.1'

export function TextSizePicker() {
  const value = useSyncExternalStore(
    (listener) => (textSizeListeners.add(listener), () => textSizeListeners.delete(listener)),
    readTextSize,
    () => '1.1',
  )
  const choose = (next: string) => {
    document.documentElement.style.setProperty('--font-scale', next)
    try {
      localStorage.setItem(TEXT_SIZE_KEY, next)
    } catch {}
    textSizeListeners.forEach((listener) => listener())
  }
  return (
    <div className="grid max-w-sm grid-cols-4 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Text size">
      {TEXT_SIZES.map((size, index) => {
        const selected = value === size.value
        return (
          <button
            type="button"
            key={size.value}
            role="radio"
            aria-checked={selected}
            onClick={() => choose(size.value)}
            className={`flex h-9 items-center justify-center rounded-md ${selected ? 'bg-segment font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            style={{ fontSize: `${12 + index * 1.5}px` }}
          >
            {size.label}
          </button>
        )
      })}
    </div>
  )
}

const styleListeners = new Set<() => void>()
const readStyle = () => document.documentElement.dataset.style ?? 'mono'

/** Mono or Classic look, saved in this browser (applied before paint by THEME_SCRIPT). */
export function StylePicker() {
  const value = useSyncExternalStore(
    (listener) => (styleListeners.add(listener), () => styleListeners.delete(listener)),
    readStyle,
    () => 'mono',
  )
  const choose = (next: string) => {
    if (next === 'classic') document.documentElement.dataset.style = 'classic'
    else delete document.documentElement.dataset.style
    try {
      localStorage.setItem(STYLE_KEY, next)
    } catch {}
    styleListeners.forEach((listener) => listener())
  }
  return (
    <div className="grid max-w-sm grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Style">
      {STYLES.map((style) => {
        const selected = value === style.value
        return (
          <button
            type="button"
            key={style.value}
            role="radio"
            aria-checked={selected}
            onClick={() => choose(style.value)}
            className={`flex flex-col items-start rounded-md px-3 py-1.5 text-left ${selected ? 'bg-segment text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            <span className="text-ui font-medium">{style.label}</span>
            <span className="text-2xs text-ink-3">{style.description}</span>
          </button>
        )
      })}
    </div>
  )
}
