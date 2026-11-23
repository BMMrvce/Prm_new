import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'

/** Pages that are not inside one workspace: All workspaces, Account, Help, Invitations. */
export default function GlobalLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace={null}>{children}</AppShell>
}
