import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedPushEndpoint } from './push-endpoints'

/** Web Push (VAPID) to every browser or installed app where a user turned reminders on. */
export type PushPayload = {
  title: string
  body: string
  /** Opened when the notification is clicked: an app path or an https meeting link. */
  url: string
  /** Notifications with the same tag replace each other. */
  tag: string
}

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let configured = false

function configure() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || process.env.SITE_URL || 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

type SubscriptionRow = { endpoint: string; user_id: string; p256dh: string; auth: string }

const CONCURRENCY = 10

/** Sends to all of these users' devices; drops subscriptions the browser revoked. Returns devices reached. */
export async function pushToUsers(userIds: string[], payload: PushPayload) {
  if (!userIds.length || !pushConfigured()) return 0
  configure()
  const admin = createAdminClient()
  const { data, error } = await admin.from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', [...new Set(userIds)])
  if (error) throw new Error(`push_subscriptions read failed: ${error.message}`)
  const rows = (data ?? []) as SubscriptionRow[]
  let sent = 0
  const body = JSON.stringify(payload)
  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    await Promise.all(
      rows.slice(index, index + CONCURRENCY).map(async (row) => {
        // Rows predating the allow-list (or edited directly) are never contacted.
        if (!isAllowedPushEndpoint(row.endpoint)) return void (await admin.from('push_subscriptions').delete().eq('endpoint', row.endpoint))
        try {
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, { TTL: 60 * 60, urgency: 'high', timeout: 10_000 })
          sent++
          await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('endpoint', row.endpoint)
        } catch (failure) {
          const status = (failure as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
          else console.error('[push] send failed', status ?? 'network')
        }
      }),
    )
  }
  return sent
}
