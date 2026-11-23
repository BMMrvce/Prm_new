import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppProviders } from '@/components/shell/app-providers'
import { currentClaims } from '@/lib/supabase/user'

/**
 * Every signed-in page. The session's JWT is verified on the server before anything
 * renders (locally, so page loads don't wait on Supabase Auth), then handed to the
 * client providers.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentClaims()
  if (!user) redirect('/login')
  return <AppProviders user={user}>{children}</AppProviders>
}
