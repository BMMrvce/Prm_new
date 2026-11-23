import { grantUnlock, requireSession, sessionUnlocked, vaultRecord } from '@/server/vault'

/** POST: the user is active; keep this session's unlock alive for another auto-lock period. */
export async function POST() {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user, sessionId } = auth.session
  if (!(await sessionUnlocked(user.id, sessionId))) return Response.json({ unlockedUntil: null })
  const record = await vaultRecord(user.id)
  return Response.json({ unlockedUntil: await grantUnlock(user.id, sessionId, record?.auto_lock_minutes ?? 15) })
}
