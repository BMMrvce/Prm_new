import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/core/routes'
import { currentUser } from '@/lib/supabase/user'
import { GOOGLE_SCOPES, googleAuthorizeUrl, googleCallbackUrl, googleConfigured } from '@/server/google'
import { startOAuth } from '@/server/oauth-state'
import { allow, tooMany } from '@/server/rate-limit'
import { workspaceAccess } from '@/server/workspace-access'

/**
 * GET /api/oauth/google/connect?purpose=youtube|mail:<workspaceId>&next=/path → Google sign-in
 * with only the scopes that purpose needs. A mailbox purpose requires workspace access now
 * and again in the callback.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser()
  if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 })
  if (!googleConfigured()) return Response.json({ error: 'Google sign-in is not set up on this server.' }, { status: 503 })
  if (!(await allow(`oauth-start:${user.id}`, 20, 15 * 60))) return tooMany(15 * 60)

  const search = request.nextUrl.searchParams
  const purpose = search.get('purpose') ?? ''
  const workspaceId = purpose.startsWith('mail:') ? purpose.slice(5) : null
  if (purpose !== 'youtube' && !workspaceId) return Response.json({ error: 'Unknown purpose.' }, { status: 400 })
  if (workspaceId) {
    const gate = await workspaceAccess(workspaceId)
    if ('error' in gate) return gate.error
  }
  const next = safeNext(search.get('next'), workspaceId ? '/' : '/account')
  const state = await startOAuth(request, 'google', user.id, purpose, next)
  const scopes = workspaceId ? GOOGLE_SCOPES.gmail : GOOGLE_SCOPES.youtube
  return NextResponse.redirect(googleAuthorizeUrl(googleCallbackUrl(request.nextUrl.origin), state, scopes))
}
