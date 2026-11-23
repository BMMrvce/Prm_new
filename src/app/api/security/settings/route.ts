import { createAdminClient } from '@/lib/supabase/admin'
import { jsonBody, requireSession } from '@/server/vault'

/** PATCH { autoLockMinutes } — how long the vault stays unlocked without activity. */
export async function PATCH(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const body = await jsonBody(request)
  const minutes = Number(body?.autoLockMinutes)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
    return Response.json({ error: 'Choose between 1 and 240 minutes.' }, { status: 400 })
  }
  const { error } = await createAdminClient()
    .from('user_security')
    .upsert({ user_id: auth.session.user.id, auto_lock_minutes: minutes, updated_at: new Date().toISOString() })
  if (error) return Response.json({ error: 'Could not save.' }, { status: 500 })
  return Response.json({ ok: true })
}
