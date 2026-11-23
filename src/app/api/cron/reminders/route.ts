import { createHash, timingSafeEqual } from 'node:crypto'
import { runReminders } from '@/server/reminders'

/**
 * POST (or GET) /api/cron/reminders with `Authorization: Bearer $CRON_SECRET` → sends due
 * meeting, deadline and digest reminders, then runs housekeeping. Called every minute by
 * pg_cron (supabase/cron.sql). Public in the proxy; protected by the secret here.
 */
const digest = (value: string) => createHash('sha256').update(value).digest()

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  // Hashing first makes the comparison constant-time regardless of length.
  return timingSafeEqual(digest(given), digest(secret))
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const sent = await runReminders()
    return Response.json({ ok: sent.ok, sent }, { status: sent.ok ? 200 : 500 })
  } catch (error) {
    console.error('[reminders] run failed', error instanceof Error ? error.message : 'error')
    return Response.json({ ok: false }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const maxDuration = 60
