import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/core/routes'
import { createClient } from '@/lib/supabase/server'

/**
 * Landing point for links in Supabase emails (confirm sign-up, reset password, change
 * email). Exchanges the code or token for a session, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = safeNext(url.searchParams.get('next'), '/')
  const supabase = await createClient()

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('This link is incomplete.') }

  if (error) {
    const target = new URL('/login', url.origin)
    target.searchParams.set('error', 'That link has expired or was already used. Sign in, or request a new one.')
    return NextResponse.redirect(target)
  }
  return NextResponse.redirect(new URL(next, url.origin))
}
