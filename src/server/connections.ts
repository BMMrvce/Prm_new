import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { keyRing, payloadKeyId, seal, SealConfigError, unseal, type KeyRing } from './seal'

/**
 * Per-user connected accounts in `public.user_connections` (mailboxes per workspace, YouTube
 * per account). The table has RLS on and no policies, so only this service-role code reads
 * it; the browser sees its connections through the `my_connections()` RPC, which never
 * returns secrets. Secrets are sealed with AES-256-GCM (see seal.ts) under
 * OAUTH_TOKEN_ENCRYPTION_KEY, bound to the row's user, workspace and kind.
 */

export type ConnectionKind = 'mail' | 'youtube' | 'calendar'
export type ConnectionScope = { workspaceId: string | null; kind: ConnectionKind }

export type Connection<T> = {
  id: string
  provider: string
  account: string
  settings: Record<string, unknown>
  secret: T
}

export type NewConnection<T> = { provider: string; account: string; secret: T; settings?: Record<string, unknown> }

/** The stored sign-in no longer works; the user has to connect the account again. */
export class ReconnectRequired extends Error {}

/** The server is missing configuration (keys, client ids). Shown generically to users. */
export class NotConfigured extends Error {}

let ring: KeyRing | null = null

function keys() {
  if (ring) return ring
  try {
    ring = keyRing(process.env.OAUTH_TOKEN_ENCRYPTION_KEY, process.env.OAUTH_TOKEN_KEY_ID || 'v1', process.env.OAUTH_TOKEN_PREVIOUS_KEYS || '')
  } catch (error) {
    if (error instanceof SealConfigError) {
      console.error('[connections]', error.message)
      throw new NotConfigured('Connected accounts are not set up on this server.')
    }
    throw error
  }
  return ring
}

/** True when sealing is configured (for showing setup hints without throwing). */
export function connectionsConfigured() {
  try {
    keys()
    return true
  } catch {
    return false
  }
}

const aad = (userId: string, { workspaceId, kind }: ConnectionScope) => `${userId}|${workspaceId ?? ''}|${kind}`

type Row = { id: string; provider: string; account: string; settings: Record<string, unknown> | null; secret: string }

function scoped(userId: string, scope: ConnectionScope) {
  const query = createAdminClient().from('user_connections').select('id, provider, account, settings, secret').eq('user_id', userId).eq('kind', scope.kind)
  return scope.workspaceId ? query.eq('workspace_id', scope.workspaceId) : query.is('workspace_id', null)
}

export async function getConnection<T>(userId: string, scope: ConnectionScope): Promise<Connection<T> | null> {
  const { data, error } = await scoped(userId, scope).maybeSingle<Row>()
  if (error) throw new Error(`user_connections read failed: ${error.message}`)
  if (!data) return null
  const secret = unseal<T>(keys(), data.secret, aad(userId, scope))
  if (secret === null) {
    // Wrong key, tampered or moved row: treat as disconnected so the user can reconnect.
    console.warn('[connections] could not open a stored secret', { connection: data.id, kind: scope.kind })
    return null
  }
  const connection = { id: data.id, provider: data.provider, account: data.account, settings: data.settings ?? {}, secret }
  // Rotated key: re-seal under the current key on first use.
  if (payloadKeyId(data.secret) !== keys().current.id) {
    await createAdminClient()
      .from('user_connections')
      .update({ secret: seal(keys(), secret, aad(userId, scope)) })
      .eq('id', data.id)
      .then(({ error: resealError }) => resealError && console.error('[connections] re-seal failed', resealError.message))
  }
  return connection
}

/** Non-secret part only (provider, account, settings), without opening the secret. */
export async function getConnectionInfo(userId: string, scope: ConnectionScope) {
  let query = createAdminClient().from('user_connections').select('id, provider, account, settings').eq('user_id', userId).eq('kind', scope.kind)
  query = scope.workspaceId ? query.eq('workspace_id', scope.workspaceId) : query.is('workspace_id', null)
  const { data, error } = await query.maybeSingle<Omit<Row, 'secret'>>()
  if (error) throw new Error(`user_connections read failed: ${error.message}`)
  return data ? { ...data, settings: data.settings ?? {} } : null
}

/**
 * Creates or replaces the connection for this scope. The unique index is on an expression
 * (coalesce(workspace_id, …)), which PostgREST cannot target with on_conflict, so this
 * updates the existing row or inserts one, retrying the update if an insert races.
 */
export async function saveConnection<T>(userId: string, scope: ConnectionScope, value: NewConnection<T>) {
  const row = {
    provider: value.provider,
    account: value.account.slice(0, 254),
    secret: seal(keys(), value.secret, aad(userId, scope)),
    settings: value.settings ?? {},
  }
  const admin = createAdminClient()
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await scoped(userId, scope).maybeSingle<Row>()
    if (existing.error) throw new Error(`user_connections read failed: ${existing.error.message}`)
    if (existing.data) {
      const { error } = await admin.from('user_connections').update(row).eq('id', existing.data.id)
      if (error) throw new Error(`user_connections update failed: ${error.message}`)
      return
    }
    const { error } = await admin.from('user_connections').insert({ ...row, user_id: userId, workspace_id: scope.workspaceId, kind: scope.kind })
    if (!error) return
    if (error.code !== '23505') throw new Error(`user_connections insert failed: ${error.message}`)
  }
  throw new Error('user_connections save raced twice')
}

/** Replaces the non-secret settings of an existing connection. */
export async function saveConnectionSettings(userId: string, scope: ConnectionScope, settings: Record<string, unknown>) {
  let query = createAdminClient().from('user_connections').update({ settings }).eq('user_id', userId).eq('kind', scope.kind)
  query = scope.workspaceId ? query.eq('workspace_id', scope.workspaceId) : query.is('workspace_id', null)
  const { error } = await query
  if (error) throw new Error(`user_connections settings update failed: ${error.message}`)
}

export async function deleteConnection(userId: string, scope: ConnectionScope) {
  let query = createAdminClient().from('user_connections').delete().eq('user_id', userId).eq('kind', scope.kind)
  query = scope.workspaceId ? query.eq('workspace_id', scope.workspaceId) : query.is('workspace_id', null)
  const { error } = await query
  if (error) throw new Error(`user_connections delete failed: ${error.message}`)
}

// ── OAuth sessions ──────────────────────────────────────────────────────────────────

export type OAuthSecret = { accessToken: string; refreshToken: string; expiresAt: number }
export type TokenGrant = { access_token: string; refresh_token?: string; expires_in: number; scope?: string }

/** The provider said the refresh token is no longer valid (revoked, expired). */
export class GrantRevoked extends Error {}

/**
 * A current access token for an OAuth connection, refreshing (and saving) it when it is
 * about to expire. A revoked grant deletes the connection and throws ReconnectRequired;
 * temporary failures are thrown as they are.
 */
export async function oauthSession<T extends OAuthSecret>(
  userId: string,
  scope: ConnectionScope,
  refresh: (refreshToken: string) => Promise<TokenGrant>,
): Promise<Connection<T> & { token: string }> {
  const connection = await getConnection<T>(userId, scope)
  if (!connection) throw new ReconnectRequired()
  const { secret } = connection
  if (secret.expiresAt - 60_000 > Date.now()) return { ...connection, token: secret.accessToken }
  if (!secret.refreshToken) throw new ReconnectRequired()
  let grant: TokenGrant
  try {
    grant = await refresh(secret.refreshToken)
  } catch (error) {
    if (error instanceof GrantRevoked) {
      await deleteConnection(userId, scope)
      throw new ReconnectRequired()
    }
    throw error
  }
  const next: Connection<T> = {
    ...connection,
    secret: {
      ...secret,
      accessToken: grant.access_token,
      refreshToken: grant.refresh_token ?? secret.refreshToken,
      expiresAt: Date.now() + grant.expires_in * 1000,
    },
  }
  await saveConnection(userId, scope, next)
  return { ...next, token: grant.access_token }
}

/**
 * `fetch` to a provider API with a timeout and one retry on network failure. The real
 * cause goes to the server log; callers get a generic error.
 */
export async function providerFetch(service: string, url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { cache: 'no-store', ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      if (attempt < 2) continue
      const cause = (error as { cause?: { code?: string } }).cause
      console.error(`[${service}] request to ${new URL(url).host} failed:`, cause?.code ?? (error as Error).name)
      throw new Error(`Could not reach ${service}.`, { cause: error })
    }
  }
}
