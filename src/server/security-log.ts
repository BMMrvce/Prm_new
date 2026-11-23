import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from './rate-limit'

/** Appends to public.security_events (the user can read their own in Account → Security). */
export async function logSecurityEvent(request: Request, userId: string, kind: string, data: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from('security_events')
    .insert({
      user_id: userId,
      kind,
      ip: clientIp(request),
      user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      data,
    })
  if (error) console.error('[security-log]', error.message)
}
