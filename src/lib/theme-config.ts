/**
 * Theme constants shared by the server layout and the client theme hook. No 'use client'
 * here, so server components get the real values rather than client references.
 */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'workbench-theme'
export const TEXT_SIZE_KEY = 'kala-text-size'
export const STYLE_KEY = 'kala-style'

/** Visual styles: Mono (default) and Classic (indigo / yellow). */
export const STYLES = [
  { value: 'mono', label: 'Mono', description: 'Simple, minimal, green accents' },
  { value: 'classic', label: 'Classic', description: 'Indigo and turquoise' },
] as const

/** Text size choices: a multiplier for the whole type scale. */
export const TEXT_SIZES = [
  { value: '1', label: 'Compact' },
  { value: '1.1', label: 'Default' },
  { value: '1.2', label: 'Large' },
  { value: '1.3', label: 'Larger' },
] as const

/** Browser chrome color per theme; matches `--background` in globals.css. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f3f4f8', dark: '#000000' }

/**
 * Runs in <head> before the page paints so dark mode never flashes white. Kept as a
 * string because it must run before React loads.
 */
export const THEME_SCRIPT = `try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);if(localStorage.getItem('${STYLE_KEY}')==='classic')document.documentElement.dataset.style='classic';var t=localStorage.getItem('${TEXT_SIZE_KEY}');if(t&&/^1(\\.[0-3])?$/.test(t))document.documentElement.style.setProperty('--font-scale',t)}catch(e){}`
