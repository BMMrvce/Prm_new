import type { ReactNode } from 'react'
import { WorkspaceFrame } from '@/components/shell/workspace-frame'

export default async function WorkspaceLayout({ children, params }: LayoutProps<'/w/[workspace]'>) {
  const { workspace } = await params
  return <WorkspaceFrame slug={workspace}>{children as ReactNode}</WorkspaceFrame>
}
