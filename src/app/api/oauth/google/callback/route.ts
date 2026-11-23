import { NextResponse, type NextRequest } from 'next/server'
import { currentUser } from '@/lib/supabase/user'
import { NotConfigured } from '@/server/connections'
import { exchangeGoogleCode, GOOGLE_SCOPES, googleCallbackUrl, grantHasScopes } from '@/server/google'
import { connectGmail } from '@/server/mail'
import { finishOAuth, pendingNext } from '@/server/oauth-state'
import { logSecurityEvent } from '@/server/security-log'
import { workspaceAccess } from '@/server/workspace-access'
import { connectYouTube } from '@/server/youtube'

/**
 * GET /api/oauth/google/callback → Google redirects here. The state cookie must match and
 * belong to the signed-in user. Results return to the stored same-site path as
 * `?mail=` / `?youtube=` `connected|error` plus a fixed `reason` code (never provider text).
 */
export async function GET(request: NextRequest) {
  const user = await currentUser()
  const search = request.nextUrl.searchParams
  const back = (path: string, param: string, result: string, reason?: string) => {
    const url = new URL(path, request.nextUrl.origin)
    url.searchParams.set(param, result)
    if (reason) url.searchParams.set('reason', reason)
    return NextResponse.redirect(url)
  }
  if (!user) return NextResponse.redirect(new URL('/login', request.nextUrl.origin))

  const fallback = await pendingNext('google')
  const flow = await finishOAuth(request, 'google', user.id)
  if (!flow) return back(fallback, 'mail', 'error', 'expired')
  const workspaceId = flow.purpose.startsWith('mail:') ? flow.purpose.slice(5) : null
  const param = workspaceId ? 'mail' : 'youtube'
  if (search.get('error')) return back(flow.next, param, 'error', search.get('error') === 'access_denied' ? 'denied' : 'failed')
  const code = search.get('code')
  if (!code || code.length > 2000) return back(flow.next, param, 'error', 'failed')

  try {
    const grant = await exchangeGoogleCode(code, googleCallbackUrl(request.nextUrl.origin))
    if (workspaceId) {
      if (!grantHasScopes(grant, GOOGLE_SCOPES.gmail)) return back(flow.next, param, 'error', 'scopes')
      const gate = await workspaceAccess(workspaceId)
      if ('error' in gate) return back(flow.next, param, 'error', 'access')
      await connectGmail(user.id, gate.access.workspace.id, grant)
      await logSecurityEvent(request, user.id, 'mail.connected', { workspace: workspaceId, provider: 'gmail' })
    } else {
      if (!grantHasScopes(grant, GOOGLE_SCOPES.youtube)) return back(flow.next, param, 'error', 'scopes')
      await connectYouTube(user.id, grant)
      await logSecurityEvent(request, user.id, 'youtube.connected')
    }
  } catch (error) {
    console.error('[oauth/google] callback failed', error instanceof Error ? error.message : 'error')
    return back(flow.next, param, 'error', error instanceof NotConfigured ? 'config' : 'failed')
  }
  return back(flow.next, param, 'connected')
}
