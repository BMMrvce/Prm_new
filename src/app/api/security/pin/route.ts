import { createAdminClient } from '@/lib/supabase/admin'
import { allow, tooMany } from '@/server/rate-limit'
import { hashPin, validPin } from '@/server/pin'
import { logSecurityEvent } from '@/server/security-log'
import { jsonBody, passwordMatches, requireSession, revokeUnlock } from '@/server/vault'

/**
 * POST { password, pin } sets or changes the vault PIN. DELETE { password } removes it.
 * Both need the account password, so a borrowed, signed-in browser cannot take over the
 * vault. Changing the PIN signs every other device out of the vault.
 */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user, sessionId } = auth.session
  if (!(await allow(`pin-set:${user.id}`, 5, 15 * 60))) return tooMany(15 * 60)

  const body = await jsonBody(request)
  if (!validPin(body?.pin)) {
    return Response.json({ error: 'Use 6–12 digits (not all the same) or a passphrase of 8+ characters.' }, { status: 400 })
  }
  if (!(await passwordMatches(user.email ?? '', String(body?.password ?? '')))) {
    await logSecurityEvent(request, user.id, 'pin.password_failed')
    return Response.json({ error: 'Your account password is not correct.' }, { status: 403 })
  }

  const { error } = await createAdminClient()
    .from('user_security')
    .upsert({ user_id: user.id, pin_hash: await hashPin(body.pin as string), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
  if (error) return Response.json({ error: 'Could not save the PIN.' }, { status: 500 })

  const others = await createAdminClient().from('unlock_grants').delete().eq('user_id', user.id).neq('session_id', sessionId)
  if (others.error) console.error('[vault] revoke other sessions', others.error.message)
  await logSecurityEvent(request, user.id, 'pin.set')
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user } = auth.session
  if (!(await allow(`pin-set:${user.id}`, 5, 15 * 60))) return tooMany(15 * 60)

  const body = await jsonBody(request)
  if (!(await passwordMatches(user.email ?? '', String(body?.password ?? '')))) {
    return Response.json({ error: 'Your account password is not correct.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const [notes, workspaces] = await Promise.all([
    admin.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('protected', true),
    admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, role)', { count: 'exact', head: true })
      .eq('protected', true)
      .eq('workspace_members.user_id', user.id)
      .in('workspace_members.role', ['owner', 'admin']),
  ])
  if ((notes.count ?? 0) > 0 || (workspaces.count ?? 0) > 0) {
    return Response.json(
      { error: 'Unprotect your protected notes and workspaces first, so nothing becomes unreachable.' },
      { status: 409 },
    )
  }

  const { error } = await admin.from('user_security').update({ pin_hash: null, failed_attempts: 0, locked_until: null }).eq('user_id', user.id)
  if (error) return Response.json({ error: 'Could not remove the PIN.' }, { status: 500 })
  await revokeUnlock(user.id)
  await logSecurityEvent(request, user.id, 'pin.removed')
  return Response.json({ ok: true })
}
