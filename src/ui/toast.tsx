'use client'

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { cn } from './cn'

type Tone = 'success' | 'error' | 'info'
type Toast = { id: number; tone: Tone; message: string; action?: { label: string; onClick: () => void } }

/**
 * Tiny global toast store. Lives outside React state so a toast never re-renders the
 * rest of the app; only <Toaster> subscribes.
 */
let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

function dismiss(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

function push(tone: Tone, message: string, action?: Toast['action']) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, tone, message, action }]
  emit()
  setTimeout(() => dismiss(id), tone === 'error' ? 7000 : action ? 6000 : 3500)
  return id
}

export const toast = {
  success: (message: string, action?: Toast['action']) => push('success', message, action),
  error: (message: string) => push('error', message),
  info: (message: string, action?: Toast['action']) => push('info', message, action),
  dismiss,
}

/** Turns any thrown value into a readable sentence for a toast. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  const message = (error as { message?: string }).message
  if (!message) return fallback
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'You seem to be offline. Check your connection.'
  if (/JWT|session/i.test(message)) return 'Your session expired. Sign in again.'
  if (/row-level security|permission denied|42501/i.test(message)) return 'You do not have permission to do that.'
  return message
}

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info }
const TONES = { success: 'text-success-ink', error: 'text-error-ink', info: 'text-primary-ink' }

export function Toaster() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
    () => toasts,
  )
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
      aria-live="polite"
      role="status"
    >
      {current.map((item) => {
        const Icon = ICONS[item.tone]
        return (
          <div
            key={item.id}
            className="neo-popover animate-toast pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl py-2.5 pr-2 pl-3.5"
            role={item.tone === 'error' ? 'alert' : undefined}
          >
            <Icon size={17} className={cn('shrink-0', TONES[item.tone])} aria-hidden />
            <p className="min-w-0 flex-1 text-ui text-ink">{item.message}</p>
            {item.action && (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-ui font-medium text-primary-ink hover:bg-primary-light"
                onClick={() => {
                  item.action?.onClick()
                  dismiss(item.id)
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
