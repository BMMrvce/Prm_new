import { ProjectPage } from '@/modules/projects/pages'

export default async function Page({ params }: PageProps<'/w/[workspace]/projects/[project]'>) {
  const { project } = await params
  return <ProjectPage slug={project} />
}
