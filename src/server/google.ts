import 'server-only'
import { GrantRevoked, NotConfigured, providerFetch, type TokenGrant } from './connections'

/** Google OAuth 2.0 (authorization code) shared by Gmail and YouTube; one web client. */
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * Minimum scopes per purpose. Gmail needs read, send and mark-as-read; `gmail.modify` is
 * the narrowest single scope that covers all three (it cannot delete permanently).
 */
export const GOOGLE_SCOPES = {
  youtube: ['https://www.googleapis.com/auth/youtube.readonly'],
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
} as const

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.OAUTH_TOKEN_ENCRYPTION_KEY)
}

export function googleCallbackUrl(origin: string) {
  return `${process.env.SITE_URL || origin}/api/oauth/google/callback`
}

export function googleAuthorizeUrl(redirectUri: string, state: string, scopes: readonly string[]) {
  if (!googleConfigured()) throw new NotConfigured('Google sign-in is not set up on this server.')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    // Offline access + consent so Google returns a refresh token every time.
    access_type: 'offline',
    prompt: 'consent select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export const googleFetch = (url: string, init?: RequestInit) => providerFetch('Google', url, init)

async function requestToken(grant: Record<string, string>): Promise<TokenGrant> {
  if (!googleConfigured()) throw new NotConfigured('Google sign-in is not set up on this server.')
  const response = await googleFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...grant }),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<TokenGrant> & { error?: string }
  if (!response.ok || !data.access_token) {
    if (data.error === 'invalid_grant') throw new GrantRevoked()
    console.error('[google] token request failed', response.status, data.error)
    throw new Error('Google token request failed.')
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600, scope: data.scope }
}

export const refreshGoogleToken = (refreshToken: string) => requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken })

export const exchangeGoogleCode = (code: string, redirectUri: string) =>
  requestToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })

/** With granular consent the user may untick a scope; refuse a grant missing one. */
export function grantHasScopes(grant: TokenGrant, scopes: readonly string[]) {
  const granted = new Set((grant.scope ?? '').split(/\s+/))
  return scopes.every((scope) => granted.has(scope))
}
