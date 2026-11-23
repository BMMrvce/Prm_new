import { logSecurityEvent } from '@/server/security-log'
import { jsonBody, requireSession, revokeUnlock } from '@/server/vault'

/** POST: lock the vault on this device (or { everywhere: true } on every device). */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user, sessionId } = auth.session
  const body = await jsonBody(request)
  const everywhere = body?.everywhere === true
  await revokeUnlock(user.id, everywhere ? undefined : sessionId)
  if (everywhere) await logSecurityEvent(request, user.id, 'vault.locked_everywhere')
  return Response.json({ ok: true })
}
