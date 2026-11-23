import 'server-only'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentSession } from '@/lib/supabase/user'

export type VaultRecord = {
  user_id: string
  pin_hash: string | null
  failed_attempts: number
  locked_until: string | null
  auto_lock_minutes: number
}

export async function vaultRecord(userId: string) {
  const { data, error } = await createAdminClient().from('user_security').select('*').eq('user_id', userId).maybeSingle<VaultRecord>()
  if (error) throw error
  return data
}

/** The signed-in user and their browser session, or a 401 response. */
export async function requireSession() {
  const session = await currentSession()
  if (!session) return { error: Response.json({ error: 'Sign in required' }, { status: 401 }) } as const
  return { session } as const
}

/** True when this browser session currently holds an unexpired unlock grant. */
export async function sessionUnlocked(userId: string, sessionId: string) {
  const { data } = await createAdminClient()
    .from('unlock_grants')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return Boolean(data)
}

export async function grantUnlock(userId: string, sessionId: string, minutes: number) {
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()
  const { error } = await createAdminClient()
    .from('unlock_grants')
    .upsert({ user_id: userId, session_id: sessionId, expires_at: expiresAt })
  if (error) throw error
  return expiresAt
}

export async function revokeUnlock(userId: string, sessionId?: string) {
  let query = createAdminClient().from('unlock_grants').delete().eq('user_id', userId)
  if (sessionId) query = query.eq('session_id', sessionId)
  const { error } = await query
  if (error) throw error
}

/**
 * Confirms the account password without touching the browser's session: signs in on a
 * throwaway client and immediately revokes that extra session.
 */
export async function passwordMatches(email: string, password: string) {
  if (!email || typeof password !== 'string' || !password) return false
  const client = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) return false
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return true
}

/** Body as JSON object, or null. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
}
