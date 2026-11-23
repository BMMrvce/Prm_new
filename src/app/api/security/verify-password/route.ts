import { allow, tooMany } from '@/server/rate-limit'
import { jsonBody, passwordMatches, requireSession } from '@/server/vault'

/**
 * POST { password } → { ok } — checks the account password without replacing this
 * browser's session (which would also drop its vault unlock). Rate-limited.
 */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user } = auth.session
  if (!(await allow(`verify-password:${user.id}`, 5, 15 * 60))) return tooMany(15 * 60)
  const body = await jsonBody(request)
  return Response.json({ ok: await passwordMatches(user.email ?? '', String(body?.password ?? '')) })
}
