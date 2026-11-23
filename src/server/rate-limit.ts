import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fixed-window rate limit stored in Postgres (public.rate_limit_hit), so it holds across
 * server instances. Returns true when the call is allowed. Fails open only when the
 * database itself is unreachable, which the caller's own query would surface anyway.
 */
export async function allow(bucket: string, maxHits: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc('rate_limit_hit', {
    bucket_key: bucket,
    max_hits: maxHits,
    window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rate-limit]', error.message)
    return true
  }
  return data === true
}

export function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  ).slice(0, 64)
}

export function tooMany(retryAfterSeconds = 60) {
  return Response.json(
    { error: 'Too many attempts. Wait a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}
