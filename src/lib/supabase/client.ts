import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

/** The browser's Supabase client (one per tab). Every request runs under RLS. */
export function createClient() {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  client = createBrowserClient(url, anonKey)
  return client
}

export const supabase = () => createClient()

type SupabaseError = { message: string; code?: string }
type Result = { data: unknown; error: SupabaseError | null }

function raise(error: SupabaseError): never {
  const wrapped = new Error(error.message) as Error & { code?: string }
  wrapped.code = error.code
  throw wrapped
}

/** Throws Supabase errors so React Query sees them; returns the data otherwise. */
export function must<R extends Result>(result: R): NonNullable<R['data']> {
  if (result.error) raise(result.error)
  return result.data as NonNullable<R['data']>
}

/** Like `must`, for `.maybeSingle()` lookups where "no row" is a valid answer. */
export function maybe<R extends Result>(result: R): NonNullable<R['data']> | null {
  if (result.error) raise(result.error)
  return (result.data ?? null) as NonNullable<R['data']> | null
}
