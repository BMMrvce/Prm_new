'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The current time in ms, rounded down to `stepMs` and refreshed as it passes. It is
 * null during server rendering and hydration, so anything that depends on the viewer's
 * clock or timezone renders only in the browser and never mismatches.
 */
export function useNow(stepMs = 60_000, enabled = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => undefined
      const timer = window.setInterval(onChange, Math.min(stepMs, 5_000))
      return () => window.clearInterval(timer)
    },
    [stepMs, enabled],
  )
  const value = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / stepMs) * stepMs,
    () => 0,
  )
  return value || null
}
