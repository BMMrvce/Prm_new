'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createContext, use, useEffect, type ReactNode } from 'react'
import { must, supabase } from '@/lib/supabase/client'
import { keys } from './query'
import type { Profile } from './types'

export type SessionUser = { id: string; email: string }

const SessionContext = createContext<SessionUser | null>(null)

/**
 * The signed-in user, resolved on the server by the (app) layout and handed down, so
 * pages never flash a signed-out state. Signing out in another tab signs this one out.
 */
export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  useEffect(() => {
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== user.id)) {
        queryClient.clear()
        router.replace('/login')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [router, queryClient, user.id])
  return <SessionContext value={user}>{children}</SessionContext>
}

export function useUser() {
  const user = use(SessionContext)
  if (!user) throw new Error('useUser() must be used inside <SessionProvider>')
  return user
}

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
  timezone: string
  locale: string
  preferences: Profile['preferences'] | null
  onboarding: Profile['onboarding'] | null
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    locale: row.locale,
    preferences: row.preferences ?? {},
    onboarding: row.onboarding ?? {},
  }
}

export function useProfile() {
  const user = useUser()
  return useQuery({
    queryKey: keys.profile,
    queryFn: async () =>
      toProfile(must(await supabase().from('profiles').select('*').eq('id', user.id).single<ProfileRow>())),
  })
}

export function useUpdateProfile() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: Partial<Pick<Profile, 'fullName' | 'timezone' | 'preferences' | 'onboarding' | 'avatarUrl'>>) => {
      const row: Record<string, unknown> = {}
      if (changes.fullName !== undefined) row.full_name = changes.fullName?.trim() || null
      if (changes.timezone !== undefined) row.timezone = changes.timezone
      if (changes.preferences !== undefined) row.preferences = changes.preferences
      if (changes.onboarding !== undefined) row.onboarding = changes.onboarding
      if (changes.avatarUrl !== undefined) row.avatar_url = changes.avatarUrl
      return toProfile(must(await supabase().from('profiles').update(row).eq('id', user.id).select('*').single<ProfileRow>()))
    },
    onSuccess: (profile) => queryClient.setQueryData(keys.profile, profile),
  })
}

export async function signOut(scope: 'local' | 'global' = 'local') {
  await fetch('/api/security/lock', { method: 'POST' }).catch(() => undefined)
  await supabase().auth.signOut({ scope })
  window.location.assign('/login')
}
