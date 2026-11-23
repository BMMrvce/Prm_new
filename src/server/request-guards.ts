import 'server-only'

/**
 * Defence in depth for state-changing requests on top of SameSite=Lax session cookies: a
 * browser always sends `Origin` on cross-site POST/DELETE, so a different origin is refused.
 */
export function crossSite(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return null
  const expected = [new URL(request.url).origin, process.env.SITE_URL].filter(Boolean).map((value) => new URL(value!).origin)
  return expected.includes(origin) ? null : Response.json({ error: 'Cross-site request refused.' }, { status: 403 })
}

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** JSON response that is never cached by the browser or a CDN. */
export const privateJson = (data: unknown, init: ResponseInit = {}) => Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } })
