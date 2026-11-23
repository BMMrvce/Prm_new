import { createClient } from './server'

/**
 * The verified signed-in user for server code (route handlers, server components):
 * `getUser()` asks Supabase Auth, so a forged or revoked cookie is rejected.
 */
export async function currentUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/**
 * Who is signed in, for rendering pages: the JWT is verified locally against the
 * project's signing keys (no Auth round trip). Data access is still enforced by RLS,
 * and API routes keep using currentUser() / currentSession().
 */
export async function currentClaims() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
}

export async function currentUserId() {
  return (await currentUser())?.id ?? null
}

/**
 * The user and the id of this browser session (the JWT's `session_id` claim). Unlock
 * grants for the privacy vault are bound to that session.
 */
export async function currentSession() {
  const supabase = await createClient()
  const [{ data: userData }, { data: claimsData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()])
  const user = userData.user
  const sessionId = claimsData?.claims?.session_id as string | undefined
  if (!user || !sessionId || claimsData?.claims?.sub !== user.id) return null
  return { user, sessionId }
}
