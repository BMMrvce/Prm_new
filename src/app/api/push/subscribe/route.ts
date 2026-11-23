import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentUser } from '@/lib/supabase/user'
import { pushConfigured } from '@/server/push'
import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from '@/server/push-endpoints'
import { allow, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'
import { jsonBody } from '@/server/vault'

const endpoint = z
  .string()
  .max(MAX_ENDPOINT_LENGTH)
  .refine((value) => value.startsWith('https://') && isAllowedPushEndpoint(value))
const key = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+=*$/)

const subscribeBody = z.object({ subscription: z.object({ endpoint, keys: z.object({ p256dh: key(200), auth: key(100) }) }) })
const unsubscribeBody = z.object({ endpoint: z.string().max(MAX_ENDPOINT_LENGTH) })

/** POST /api/push/subscribe { subscription } → saves this device for the current user's reminders. */
export async function POST(request: Request) {
  const refused = crossSite(request)
  if (refused) return refused
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  if (!pushConfigured()) return privateJson({ error: 'Push reminders are not set up on this server.' }, { status: 503 })
  if (!(await allow(`push-subscribe:${user.id}`, 30, 60 * 60))) return tooMany(60 * 60)

  const parsed = subscribeBody.safeParse(await jsonBody(request))
  if (!parsed.success) return privateJson({ error: 'This browser’s push subscription is not supported.' }, { status: 400 })
  const { subscription } = parsed.data
  // The same browser signing in to another account moves its subscription to that account.
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: subscription.endpoint,
        user_id: user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) {
    console.error('[push] subscribe failed', error.message)
    return privateJson({ error: 'Could not save this device.' }, { status: 500 })
  }
  return privateJson({ ok: true })
}

/** DELETE /api/push/subscribe { endpoint } → stops reminders on this device. */
export async function DELETE(request: Request) {
  const refused = crossSite(request)
  if (refused) return refused
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  const parsed = unsubscribeBody.safeParse(await jsonBody(request))
  if (!parsed.success) return privateJson({ error: 'Invalid request.' }, { status: 400 })
  const { error } = await createAdminClient().from('push_subscriptions').delete().eq('endpoint', parsed.data.endpoint).eq('user_id', user.id)
  if (error) return privateJson({ error: 'Could not remove this device.' }, { status: 500 })
  return privateJson({ ok: true })
}
