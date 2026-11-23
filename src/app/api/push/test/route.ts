import { currentUser } from '@/lib/supabase/user'
import { pushConfigured, pushToUsers } from '@/server/push'
import { allow, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'

/** POST /api/push/test → sends a test notification to all of your devices. */
export async function POST(request: Request) {
  const refused = crossSite(request)
  if (refused) return refused
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  if (!pushConfigured()) return privateJson({ error: 'Push reminders are not set up on this server.' }, { status: 503 })
  if (!(await allow(`push-test:${user.id}`, 5, 10 * 60))) return tooMany(10 * 60)
  try {
    const sent = await pushToUsers([user.id], {
      title: 'Reminders are on',
      body: 'You will get meeting, deadline and daily digest reminders on this device.',
      url: '/account/preferences',
      tag: 'test',
    })
    return privateJson({ sent })
  } catch (error) {
    console.error('[push] test failed', error instanceof Error ? error.message : 'error')
    return privateJson({ error: 'Could not send a test notification.' }, { status: 500 })
  }
}
