'use client'

import { useCallback, useEffect, useState } from 'react'

/** Whether this browser (or installed app) gets reminder notifications. */
export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
}

async function call(method: 'POST' | 'DELETE', url: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = (await response.json().catch(() => ({}))) as { error?: string; sent?: number }
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Try again.')
  return data
}

const save = (subscription: PushSubscription) => call('POST', '/api/push/subscribe', { subscription: subscription.toJSON() })

/**
 * Turns Web Push reminders on or off for this device. iPhone and iPad only allow it once
 * the app is added to the Home Screen.
 */
export function usePush() {
  const [state, setState] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID_KEY) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      setState(ios && !window.matchMedia('(display-mode: standalone)').matches ? 'needs-install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') return setState('blocked')
    try {
      const subscription = await (await registration()).pushManager.getSubscription()
      if (subscription && Notification.permission === 'granted') {
        // Keep the server copy current; it may have been cleaned up.
        await save(subscription).catch(() => undefined)
        setState('on')
      } else setState('off')
    } catch {
      setState('unsupported')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        throw new Error('Notifications were not allowed.')
      }
      const manager = (await registration()).pushManager
      const subscription = (await manager.getSubscription()) ?? (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) }))
      await save(subscription)
      setState('on')
    })

  const disable = () =>
    run(async () => {
      const subscription = await (await registration()).pushManager.getSubscription()
      if (subscription) {
        await call('DELETE', '/api/push/subscribe', { endpoint: subscription.endpoint }).catch(() => undefined)
        await subscription.unsubscribe()
      }
      setState('off')
    })

  const test = async () => (await call('POST', '/api/push/test')).sent ?? 0

  return { state, busy, enable, disable, test }
}
