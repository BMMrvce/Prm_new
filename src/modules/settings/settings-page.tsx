'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { isModuleEnabled } from '@/core/modules'
import { canAdmin, useCurrentWorkspace } from '@/core/workspaces'
import { CategoryEditor } from '@/modules/categories/category-editor'
import { SCOPE_LABELS, type CategoryScope } from '@/modules/categories/queries'
import { PageHeader } from '@/ui/misc'
import { TabPanel, Tabs } from '@/ui/tabs'
import { MailConnectionCard } from '@/modules/inbox/mail-connection'
import { BoardSettings } from './board'
import { GeneralSettings } from './general'
import { MemberSettings } from './members'
import { ModuleSettings } from './modules'
import { DangerZone, PrivacySettings } from './privacy-danger'
import { TeamSettings } from './teams'

type Tab = 'general' | 'modules' | 'members' | 'teams' | 'board' | 'categories' | 'mail' | 'privacy'

export function SettingsPage() {
  const workspace = useCurrentWorkspace()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const admin = canAdmin(workspace)
  const tab = (params.get('tab') as Tab) || 'general'

  const scopes = useMemo(
    () => (Object.keys(SCOPE_LABELS) as CategoryScope[]).filter((scope) => isModuleEnabled(workspace, SCOPE_LABELS[scope].module)),
    [workspace],
  )

  const tabs: { value: Tab; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'modules', label: 'Modules' },
    { value: 'members', label: 'Members' },
    { value: 'teams', label: 'Teams' },
    ...(isModuleEnabled(workspace, 'tasks') || isModuleEnabled(workspace, 'board') ? [{ value: 'board' as const, label: 'Board & labels' }] : []),
    ...(scopes.length ? [{ value: 'categories' as const, label: 'Categories' }] : []),
    ...(isModuleEnabled(workspace, 'inbox') ? [{ value: 'mail' as const, label: 'Mailbox' }] : []),
    { value: 'privacy', label: 'Privacy & danger' },
  ]

  const select = (value: Tab) => router.replace(`${pathname}?tab=${value}`, { scroll: false })

  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" description={`${workspace.name} · you are ${workspace.role === 'owner' ? 'an owner' : `a ${workspace.role}`}`} />
      <Tabs label="Settings sections" items={tabs} value={tab} onChange={select} idBase="settings" className="mb-5" />
      <TabPanel idBase="settings" value={tab}>
        {tab === 'general' && <GeneralSettings key={workspace.id} workspace={workspace} />}
        {tab === 'modules' && <ModuleSettings key={workspace.id} workspace={workspace} />}
        {tab === 'members' && <MemberSettings workspace={workspace} />}
        {tab === 'teams' && <TeamSettings workspace={workspace} />}
        {tab === 'board' && <BoardSettings workspace={workspace} />}
        {tab === 'categories' && (
          <div className="grid gap-5 md:grid-cols-2">
            {scopes.map((scope) => (
              <CategoryEditor key={scope} workspaceId={workspace.id} scope={scope} disabled={!admin && workspace.role === 'guest'} />
            ))}
          </div>
        )}
        {tab === 'mail' && <MailConnectionCard workspace={workspace} />}
        {tab === 'privacy' && (
          <div className="space-y-5">
            <PrivacySettings workspace={workspace} />
            <DangerZone workspace={workspace} />
          </div>
        )}
      </TabPanel>
    </div>
  )
}
