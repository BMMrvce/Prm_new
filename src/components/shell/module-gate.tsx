'use client'

import { PackageOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { isModuleEnabled, moduleById } from '@/core/modules'
import { workspaceHref } from '@/core/routes'
import { canAdmin, useCurrentWorkspace } from '@/core/workspaces'
import { ButtonLink } from '@/ui/button'
import { EmptyState } from '@/ui/misc'

/** Renders a module's page only when the module is switched on for this workspace. */
export function ModuleGate({ id, children }: { id: string; children: ReactNode }) {
  const workspace = useCurrentWorkspace()
  if (isModuleEnabled(workspace, id)) return children
  const manifest = moduleById(id)
  return (
    <EmptyState
      icon={PackageOpen}
      title={`${manifest?.label ?? 'This module'} is turned off in ${workspace.name}`}
      hint={manifest?.description}
      action={
        canAdmin(workspace) ? (
          <ButtonLink href={workspaceHref(workspace.slug, 'settings') + '?tab=modules'} variant="primary">
            Turn it on in Settings
          </ButtonLink>
        ) : (
          <p className="text-xs text-ink-3">Ask a workspace admin to turn it on.</p>
        )
      }
    />
  )
}
