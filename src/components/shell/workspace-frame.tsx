'use client'

import { Compass, LockKeyhole } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useVault } from '@/components/security/vault'
import { useWorkspaceRealtime } from '@/core/realtime'
import { ALL_HREF } from '@/core/routes'
import { CurrentWorkspaceContext, useSavePrefs, useWorkspaces } from '@/core/workspaces'
import { Button, ButtonLink } from '@/ui/button'
import { EmptyState, ErrorNotice, IconTile } from '@/ui/misc'
import { PageSkeleton } from '@/ui/spinner'
import { AppShell } from './app-shell'

/**
 * Resolves /w/<slug> to one of the user's workspaces and provides it to every page
 * below. A protected workspace shows a lock screen until the vault is unlocked; the
 * database hides its data either way.
 */
export function WorkspaceFrame({ slug, children }: { slug: string; children: ReactNode }) {
  const { data: workspaces, isPending, error, refetch } = useWorkspaces()
  const vault = useVault()
  const savePrefs = useSavePrefs()
  const workspace = workspaces?.find((ws) => ws.slug === slug) ?? null
  const recorded = useRef<string | null>(null)

  useWorkspaceRealtime(workspace && (!workspace.protected || vault.unlocked) ? workspace.id : undefined)

  // Remember the last workspace opened, so "/" returns here next time.
  useEffect(() => {
    if (!workspace || recorded.current === workspace.id) return
    recorded.current = workspace.id
    savePrefs.mutate({ workspaceId: workspace.id, lastOpenedAt: new Date().toISOString() })
  }, [workspace, savePrefs])

  if (isPending) {
    return (
      <AppShell workspace={null}>
        <PageSkeleton />
      </AppShell>
    )
  }
  if (error) {
    return (
      <AppShell workspace={null}>
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      </AppShell>
    )
  }
  if (!workspace) {
    return (
      <AppShell workspace={null}>
        <EmptyState
          icon={Compass}
          title="This workspace doesn’t exist, or you’re not a member"
          hint="It may have been renamed, deleted, or you were removed from it."
          action={<ButtonLink href={ALL_HREF} variant="primary">See your workspaces</ButtonLink>}
        />
      </AppShell>
    )
  }

  const locked = workspace.protected && !vault.unlocked
  return (
    <CurrentWorkspaceContext value={workspace}>
      <AppShell workspace={workspace}>
        {locked ? (
          <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
            <div className="relative">
              <IconTile icon={workspace.icon} colorKey={workspace.color} size={64} />
              <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border-2 border-canvas bg-surface text-ink-2">
                <LockKeyhole size={15} aria-hidden />
              </span>
            </div>
            <h1 className="mt-5 text-xl font-semibold">{workspace.name} is protected</h1>
            <p className="mt-2 text-ui text-ink-2">Enter your PIN to open it on this device. It locks again after a period without activity.</p>
            <Button variant="primary" className="mt-6" icon={<LockKeyhole size={15} />} onClick={() => vault.requestUnlock()}>
              Unlock
            </Button>
          </div>
        ) : (
          children
        )}
      </AppShell>
    </CurrentWorkspaceContext>
  )
}
