import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Paths reachable without a session. Everything else needs a signed-in user. */
const PUBLIC_PATHS = ['/login', '/auth/', '/api/health', '/api/cron/', '/manifest.webmanifest']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))
}

/**
 * Content Security Policy with a fresh nonce per request: only our own scripts (and the
 * ones Next.js marks with the nonce) run. Styles allow inline attributes because React
 * style props and the whiteboard need them; no remote scripts are ever allowed.
 */
function contentSecurityPolicy(nonce: string) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const realtime = supabase.replace(/^http/, 'ws')
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${realtime}${dev ? ' ws://localhost:*' : ''}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/**
 * Refreshes the Supabase session cookie, guards every non-public route and adds the
 * security headers. Signed-out visitors go to /login (API calls get 401).
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request: { headers: requestHeaders } })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getClaims() verifies the JWT and refreshes an expired session.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  const finish = (result: NextResponse) => {
    result.headers.set('Content-Security-Policy', csp)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) result.headers.set(name, value)
    if (request.nextUrl.protocol === 'https:') {
      result.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
    return result
  }

  const redirect = (path: string) => {
    const target = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
    return finish(target)
  }

  if (!signedIn && !isPublic(pathname)) {
    if (pathname.startsWith('/api/')) {
      return finish(NextResponse.json({ error: 'Sign in required' }, { status: 401 }))
    }
    const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
    return redirect(`/login${next}`)
  }
  if (signedIn && pathname === '/login') return redirect('/')
  return finish(response)
}

export const config = {
  // Skip Next internals and static files.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|brand/|excalidraw/|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
}
