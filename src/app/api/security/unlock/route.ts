import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPin } from '@/server/pin'
import { allow, clientIp, tooMany } from '@/server/rate-limit'
import { logSecurityEvent } from '@/server/security-log'
import { grantUnlock, jsonBody, requireSession, vaultRecord } from '@/server/vault'

const MAX_FAILURES = 5

/**
 * POST { pin } unlocks protected workspaces and notes for this browser session only.
 * Five wrong PINs lock the vault for 15 minutes, doubling each time after that; every
 * attempt is rate-limited per user and per IP and written to the security log.
 */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user, sessionId } = auth.session

  if (!(await allow(`unlock:${user.id}`, 10, 15 * 60)) || !(await allow(`unlock-ip:${clientIp(request)}`, 30, 15 * 60))) {
    return tooMany(15 * 60)
  }

  const record = await vaultRecord(user.id)
  if (!record?.pin_hash) return Response.json({ error: 'Set a PIN in Account → Security first.' }, { status: 409 })
  if (record.locked_until && new Date(record.locked_until) > new Date()) {
    return Response.json({ error: 'Too many wrong PINs. Try again later.', lockedUntil: record.locked_until }, { status: 423 })
  }

  const body = await jsonBody(request)
  const pin = typeof body?.pin === 'string' ? body.pin.slice(0, 64) : ''
  const admin = createAdminClient()

  if (!pin || !(await verifyPin(pin, record.pin_hash))) {
    const failures = record.failed_attempts + 1
    const lockMinutes = failures >= MAX_FAILURES ? 15 * 2 ** Math.min(failures - MAX_FAILURES, 6) : 0
    const lockedUntil = lockMinutes ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : null
    await admin.from('user_security').update({ failed_attempts: failures, locked_until: lockedUntil }).eq('user_id', user.id)
    await logSecurityEvent(request, user.id, lockedUntil ? 'vault.locked_out' : 'vault.unlock_failed', { failures })
    return Response.json(
      {
        error: lockedUntil ? 'Too many wrong PINs. The vault is locked for a while.' : 'That PIN is not correct.',
        attemptsLeft: Math.max(0, MAX_FAILURES - failures),
        lockedUntil,
      },
      { status: lockedUntil ? 423 : 403 },
    )
  }

  await admin.from('user_security').update({ failed_attempts: 0, locked_until: null }).eq('user_id', user.id)
  const unlockedUntil = await grantUnlock(user.id, sessionId, record.auto_lock_minutes)
  await logSecurityEvent(request, user.id, 'vault.unlocked')
  return Response.json({ unlockedUntil })
}
