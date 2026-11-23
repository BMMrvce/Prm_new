import 'server-only'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { safeNext } from '@/core/routes'

/**
 * Carries an OAuth round-trip's `state`, what the sign-in is for, where to return and who
 * started it, in a short-lived httpOnly, SameSite=Lax cookie scoped to the provider's
 * `/api/oauth/<name>` routes. The callback only accepts a matching state from the same
 * signed-in user, so a forged or replayed callback cannot attach someone else's account.
 */
type Flow = { state: string; purpose: string; next: string; uid: string }

const cookieName = (provider: string) => `${provider}_oauth_state`
const cookiePath = (provider: string) => `/api/oauth/${provider}`

export async function startOAuth(request: NextRequest, provider: string, userId: string, purpose: string, next: string) {
  const state = randomBytes(24).toString('base64url')
  const flow: Flow = { state, purpose, next: safeNext(next), uid: userId }
  ;(await cookies()).set(cookieName(provider), Buffer.from(JSON.stringify(flow)).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: cookiePath(provider),
    maxAge: 600,
  })
  return state
}

function sameString(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * The purpose and return path of a callback, or null when the state is missing, does not
 * match, or belongs to another user. The cookie is consumed either way.
 */
export async function finishOAuth(request: NextRequest, provider: string, userId: string) {
  const store = await cookies()
  const raw = store.get(cookieName(provider))?.value
  store.delete({ name: cookieName(provider), path: cookiePath(provider) })
  if (!raw) return null
  let flow: Partial<Flow>
  try {
    flow = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Flow>
  } catch {
    return null
  }
  const given = request.nextUrl.searchParams.get('state') ?? ''
  if (typeof flow.state !== 'string' || typeof flow.purpose !== 'string' || typeof flow.uid !== 'string') return null
  if (!given || !sameString(given, flow.state) || flow.uid !== userId) return null
  return { purpose: flow.purpose, next: safeNext(flow.next) }
}

/** The return path stored in the cookie without consuming it (for error redirects). */
export async function pendingNext(provider: string) {
  const raw = (await cookies()).get(cookieName(provider))?.value
  try {
    return raw ? safeNext((JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Flow>).next) : '/'
  } catch {
    return '/'
  }
}
