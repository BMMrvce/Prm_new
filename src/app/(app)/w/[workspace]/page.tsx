import type { Metadata } from 'next'
import { HomeDashboard } from '@/modules/dashboard/home'

export const metadata: Metadata = { title: 'Home' }

export default function WorkspaceHome() {
  return <HomeDashboard />
}
