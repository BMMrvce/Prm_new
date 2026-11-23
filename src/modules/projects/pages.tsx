'use client'

import { ChevronDown, ClipboardList, FolderKanban, FolderOpen, Kanban, ListTodo, LockKeyhole, MoreHorizontal, NotebookText, Pencil, PenTool, Plus, SquareCheck, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { color } from '@/core/colors'
import { isModuleEnabled } from '@/core/modules'
import { boardHref, noteHref, projectHref, workspaceHref } from '@/core/routes'
import { useUser } from '@/core/session'
import { canAdmin, canWrite, useCurrentWorkspace, useMembers, useTeams } from '@/core/workspaces'
import { useCreateNote, useNotes } from '@/modules/notes/queries'
import { BoardView } from '@/modules/tasks/board-view'
import { useBoards, useCreateBoard } from '@/modules/whiteboard/queries'
import { ProjectWorkLog } from '@/modules/worklog/project-log'
import { mailDate } from '@/lib/format'
import { NewTaskDialog } from '@/modules/tasks/new-task-dialog'
import { isOpen, useTasks } from '@/modules/tasks/queries'
import { TaskListView } from '@/modules/tasks/task-list-view'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { Menu } from '@/ui/menu'
import { Avatar, Badge, EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { toast } from '@/ui/toast'
import { ProjectDocuments } from './documents'
import { PROJECT_STATUSES, ProjectDialog } from './project-dialog'
import { useDeleteProject, useProjects, type Project } from './queries'

export function ProjectsPage() {
  const workspace = useCurrentWorkspace()
  const router = useRouter()
  const { data: projects, isPending, error, refetch } = useProjects(workspace.id)
  const { data: tasks = [] } = useTasks(workspace.id)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'current' | 'done'>('current')

  const progress = useMemo(() => {
    const map = new Map<string, { open: number; total: number }>()
    for (const task of tasks) {
      if (!task.projectId || task.parentId) continue
      const entry = map.get(task.projectId) ?? { open: 0, total: 0 }
      entry.total += 1
      if (isOpen(task)) entry.open += 1
      map.set(task.projectId, entry)
    }
    return map
  }, [tasks])

  const shown = (projects ?? []).filter((project) => (filter === 'current' ? !['completed', 'archived'].includes(project.status) : ['completed', 'archived'].includes(project.status)))

  return (
    <ModuleGate id="projects">
      <PageHeader
        title="Projects"
        description="Projects you can see in this workspace."
        actions={
          canWrite(workspace) && (
            <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setCreating(true)}>
              New project
            </Button>
          )
        }
      />
      <Tabs
        label="Show"
        value={filter}
        onChange={setFilter}
        className="mb-4"
        items={[
          { value: 'current', label: 'Current' },
          { value: 'done', label: 'Completed & archived' },
        ]}
      />
      {error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} progress={progress.get(project.id)} href={projectHref(workspace.slug, project.slug)} />
          ))}
        </div>
      ) : (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={FolderKanban}
            title={filter === 'current' ? 'No projects yet' : 'Nothing completed or archived'}
            hint="Projects group tasks, notes and boards, and can be shared with a team or kept private."
            action={filter === 'current' && canWrite(workspace) ? <Button variant="primary" size="sm" onClick={() => setCreating(true)}>Create a project</Button> : undefined}
          />
        </div>
      )}
      {creating && (
        <ProjectDialog
          workspace={workspace}
          onClose={() => setCreating(false)}
          onSaved={() => {
            toast.success('Project created')
            router.refresh()
          }}
        />
      )}
    </ModuleGate>
  )
}

function ProjectCard({ project, progress, href }: { project: Project; progress?: { open: number; total: number }; href: string }) {
  const tone = color(project.color)
  const done = progress ? progress.total - progress.open : 0
  const percent = progress?.total ? Math.round((done / progress.total) * 100) : 0
  return (
    <Link href={href} className="neo-card group animate-row flex flex-col rounded-xl p-4 hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1 size-3 shrink-0 rounded', tone.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-card font-semibold text-ink group-hover:text-primary-ink">{project.name}</h2>
          {project.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{project.description}</p>}
        </div>
        {project.visibility !== 'workspace' && (
          <span title={project.visibility === 'private' ? 'Private' : 'Team only'}>
            {project.visibility === 'private' ? <LockKeyhole size={14} className="text-ink-3" aria-label="Private" /> : <Users size={14} className="text-ink-3" aria-label="Team only" />}
          </span>
        )}
      </div>
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between text-2xs text-ink-2">
          <Badge>{PROJECT_STATUSES.find((status) => status.value === project.status)?.label}</Badge>
          <span className="tabular-nums">{progress?.total ? `${done}/${progress.total} done` : 'No tasks yet'}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <div className={cn('h-full rounded-full transition-[width] duration-500', tone.dot)} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </Link>
  )
}

type ProjectTab = 'tasks' | 'board' | 'notes' | 'boards' | 'docs' | 'worklog' | 'people'

export function ProjectPage({ slug }: { slug: string }) {
  const workspace = useCurrentWorkspace()
  const router = useRouter()
  const user = useUser()
  const { data: projects, isPending } = useProjects(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const { data: teams = [] } = useTeams(workspace.id)
  const remove = useDeleteProject(workspace.id)
  const [tab, setTab] = useState<ProjectTab>(isModuleEnabled(workspace, 'board') ? 'board' : 'tasks')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState<{ statusId?: string } | null>(null)
  const project = projects?.find((entry) => entry.slug === slug)
  const createNote = useCreateNote(workspace.id)
  const createBoard = useCreateBoard(workspace.id)
  const notesOn = isModuleEnabled(workspace, 'notes')
  const boardsOn = isModuleEnabled(workspace, 'whiteboard')
  const newNote = () =>
    createNote.mutate({ projectId: project!.id }, { onSuccess: (id) => router.push(noteHref(workspace.slug, id)), onError: () => toast.error('Could not create the note') })
  const newBoard = () =>
    createBoard.mutate({ title: `${project!.name} board`, projectId: project!.id }, { onSuccess: (id) => router.push(boardHref(workspace.slug, id)), onError: () => toast.error('Could not create the board') })

  if (isPending) return <Skeleton className="h-40 rounded-xl" />
  if (!project) {
    return <EmptyState icon={FolderKanban} title="Project not found" hint="It may have been renamed, deleted, or made private." />
  }

  const tone = color(project.color)
  const team = teams.find((entry) => entry.id === project.teamId)
  const projectMembers = members.filter((member) => project.memberIds.includes(member.id))
  const mayEdit = canWrite(workspace)
  const mayDelete = canAdmin(workspace) || project.createdBy === user.id

  return (
    <ModuleGate id="projects">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className={cn('size-4 rounded', tone.dot)} aria-hidden />
            {project.name}
          </span>
        }
        description={project.description ?? undefined}
        actions={
          <>
            {mayEdit && (
              <Menu
                label="Create in this project"
                items={[
                  { label: 'Task', icon: <SquareCheck size={14} />, hint: 'N', onSelect: () => setCreating({}) },
                  ...(notesOn ? [{ label: 'Note', icon: <NotebookText size={14} />, onSelect: newNote }] : []),
                  ...(boardsOn ? [{ label: 'Whiteboard', icon: <PenTool size={14} />, onSelect: newBoard }] : []),
                  { label: 'Work log entry', icon: <ClipboardList size={14} />, onSelect: () => setTab('worklog') },
                  { label: 'Document link', icon: <FolderOpen size={14} />, onSelect: () => setTab('docs') },
                ]}
                trigger={(props) => (
                  <Button {...props} variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} loading={createNote.isPending || createBoard.isPending}>
                    <span className="flex items-center gap-1">
                      New <ChevronDown size={13} aria-hidden />
                    </span>
                  </Button>
                )}
              />
            )}
            {(mayEdit || mayDelete) && (
              <Menu
                label="Project actions"
                items={[
                  ...(mayEdit ? [{ label: 'Edit project', icon: <Pencil size={14} />, onSelect: () => setEditing(true) }] : []),
                  ...(mayDelete ? [{ label: 'Delete project', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(true) }] : []),
                ]}
                trigger={(props) => (
                  <button {...props} type="button" aria-label="Project actions" className="neo-control grid size-8 place-items-center rounded-lg text-ink-2 hover:text-ink">
                    <MoreHorizontal size={16} />
                  </button>
                )}
              />
            )}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <Badge>{PROJECT_STATUSES.find((status) => status.value === project.status)?.label}</Badge>
        <span>{project.visibility === 'private' ? 'Private to its members' : project.visibility === 'team' ? `Team: ${team?.name ?? '—'}` : 'Visible to the whole workspace'}</span>
        {project.targetDate && <span>Target {new Date(project.targetDate).toLocaleDateString()}</span>}
      </div>
      <Tabs
        label="Project view"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          ...(isModuleEnabled(workspace, 'board') ? [{ value: 'board' as const, label: <span className="flex items-center gap-1.5"><Kanban size={14} aria-hidden /> Board</span> }] : []),
          { value: 'tasks', label: <span className="flex items-center gap-1.5"><ListTodo size={14} aria-hidden /> List</span> },
          ...(isModuleEnabled(workspace, 'notes') ? [{ value: 'notes' as const, label: <span className="flex items-center gap-1.5"><NotebookText size={14} aria-hidden /> Notes</span> }] : []),
          ...(isModuleEnabled(workspace, 'whiteboard') ? [{ value: 'boards' as const, label: <span className="flex items-center gap-1.5"><PenTool size={14} aria-hidden /> Whiteboards</span> }] : []),
          { value: 'docs', label: <span className="flex items-center gap-1.5"><FolderOpen size={14} aria-hidden /> Documents</span> },
          ...(isModuleEnabled(workspace, 'worklog') ? [{ value: 'worklog' as const, label: <span className="flex items-center gap-1.5"><ClipboardList size={14} aria-hidden /> Work log</span> }] : []),
          { value: 'people', label: <span className="flex items-center gap-1.5"><Users size={14} aria-hidden /> Members</span>, count: projectMembers.length },
        ]}
      />
      {tab === 'board' && <BoardView key={project.id} scope={workspace.id} projectId={project.id} onNew={mayEdit ? (statusId) => setCreating({ statusId }) : undefined} />}
      {tab === 'tasks' && <TaskListView key={project.id} scope={workspace.id} projectId={project.id} />}
      {tab === 'notes' && <ProjectNotes workspaceId={workspace.id} slug={workspace.slug} projectId={project.id} onCreate={mayEdit ? newNote : undefined} />}
      {tab === 'boards' && <ProjectBoards workspaceId={workspace.id} slug={workspace.slug} projectId={project.id} onCreate={mayEdit ? newBoard : undefined} />}
      {tab === 'docs' && <ProjectDocuments workspaceId={workspace.id} projectId={project.id} projectName={project.name} writable={mayEdit} />}
      {tab === 'worklog' && <ProjectWorkLog workspaceId={workspace.id} slug={workspace.slug} projectId={project.id} />}
      {tab === 'people' && (
        <div className="neo-card rounded-xl p-2">
          {projectMembers.length ? (
            <ul>
              {projectMembers.map((member) => (
                <li key={member.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <Avatar name={member.fullName ?? member.email} src={member.avatarUrl} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui">{member.fullName ?? member.email}</span>
                    <span className="block text-2xs text-ink-3">{member.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No project members" hint={project.visibility === 'private' ? 'Add members so they can see this private project.' : 'Everyone who can see the project can work on it. Add members to keep them in the loop.'} />
          )}
        </div>
      )}
      {creating && <NewTaskDialog workspace={workspace} defaults={{ projectId: project.id, statusId: creating.statusId }} onClose={() => setCreating(null)} />}
      {editing && <ProjectDialog workspace={workspace} project={project} onClose={() => setEditing(false)} onSaved={() => toast.success('Project saved')} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${project.name}?`}
          message="Its tasks are deleted too. Notes and whiteboards filed under it are kept and simply unfiled. This cannot be undone."
          busy={remove.isPending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await remove.mutateAsync(project.id)
            toast.success('Project deleted')
            router.push(workspaceHref(workspace.slug, 'projects'))
          }}
        />
      )}
    </ModuleGate>
  )
}

function ProjectNotes({ workspaceId, slug, projectId, onCreate }: { workspaceId: string; slug: string; projectId: string; onCreate?: () => void }) {
  const { data = [] } = useNotes(workspaceId)
  const notes = data.filter((note) => note.projectId === projectId)
  return (
    <div className="neo-card rounded-xl p-2">
      {notes.length ? (
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <Link href={noteHref(slug, note.id)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                <NotebookText size={15} className="text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ui">{note.title || 'Untitled'}</span>
                <span className="text-2xs text-ink-3">{mailDate(note.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={NotebookText}
          title="No notes in this project"
          hint="Create one here, or file an existing note under this project from its project menu."
          action={onCreate && <Button size="sm" variant="primary" icon={<Plus size={14} aria-hidden />} onClick={onCreate}>New note</Button>}
        />
      )}
    </div>
  )
}

function ProjectBoards({ workspaceId, slug, projectId, onCreate }: { workspaceId: string; slug: string; projectId: string; onCreate?: () => void }) {
  const { data = [] } = useBoards(workspaceId)
  const boards = data.filter((board) => board.projectId === projectId)
  return (
    <div className="neo-card rounded-xl p-2">
      {boards.length ? (
        <ul>
          {boards.map((board) => (
            <li key={board.id}>
              <Link href={boardHref(slug, board.id)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                <PenTool size={15} className="text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ui">{board.title}</span>
                <span className="text-2xs text-ink-3">{mailDate(board.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={PenTool}
          title="No whiteboards in this project"
          hint="Create one here, or choose this project from a board’s toolbar to file it here."
          action={onCreate && <Button size="sm" variant="primary" icon={<Plus size={14} aria-hidden />} onClick={onCreate}>New whiteboard</Button>}
        />
      )}
    </div>
  )
}
