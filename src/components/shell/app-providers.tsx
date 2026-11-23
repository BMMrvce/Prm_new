'use client'

import type { ReactNode } from 'react'
import { QueryProvider } from '@/core/query'
import { SessionProvider, type SessionUser } from '@/core/session'
import { VaultProvider } from '@/components/security/vault'

export function AppProviders({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider user={user}>
        <VaultProvider>{children}</VaultProvider>
      </SessionProvider>
    </QueryProvider>
  )
}
