import type { Metadata } from 'next'
import { ProjectsPage } from '@/modules/projects/pages'

export const metadata: Metadata = { title: 'Projects' }

export default function Page() {
  return <ProjectsPage />
}
