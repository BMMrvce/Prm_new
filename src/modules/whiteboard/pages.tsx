'use client'

import { ArrowLeft, MoreHorizontal, PenTool, Plus, Trash2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { color } from '@/core/colors'
import { isModuleEnabled } from '@/core/modules'
import { boardHref, workspaceHref } from '@/core/routes'
import { useProfile, useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import { canAdmin, canWrite, useCurrentWorkspace, useMembers } from '@/core/workspaces'
import { initials, mailDate } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { Select } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { Skeleton, Spinner } from '@/ui/spinner'
import { toast } from '@/ui/toast'
import { useBoard, useBoards, useCreateBoard, useDeleteBoard, useUpdateBoard } from './queries'

// Excalidraw is large and browser-only: load it on demand, never on the server.
const BoardCanvas = dynamic(() => import('./board-canvas').then((module) => module.BoardCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-ink-3">
      <Spinner size={22} label="Loading the whiteboard" />
    </div>
  ),
})

export function WhiteboardsPage() {
  const workspace = useCurrentWorkspace()
  const router = useRouter()
  const { data: boards, isPending, error, refetch } = useBoards(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const projectsOn = isModuleEnabled(workspace, 'projects')
  const { data: projects = [] } = useProjects(projectsOn ? workspace.id : undefined)
  const create = useCreateBoard(workspace.id)
  const [projectFilter, setProjectFilter] = useState('')
  const people = new Map(members.map((member) => [member.id, member]))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const shown = (boards ?? []).filter((board) => !projectFilter || board.projectId === projectFilter)

  const add = async () => {
    const id = await create.mutateAsync({ title: 'Untitled board', projectId: projectFilter || null })
    router.push(boardHref(workspace.slug, id))
  }

  return (
    <ModuleGate id="whiteboard">
      <PageHeader
        title="Whiteboard"
        description="Sketch, diagram and plan together. Everyone on a board sees changes live."
        actions={
          <>
            {projects.length > 0 && (
              <Select aria-label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="h-8 w-44 text-xs">
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            )}
            {canWrite(workspace) && (
              <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} loading={create.isPending} onClick={add}>
                New board
              </Button>
            )}
          </>
        }
      />
      {error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : shown.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((board) => {
            const project = board.projectId ? projectById.get(board.projectId) : undefined
            const editor = board.updatedBy ? people.get(board.updatedBy) : undefined
            return (
              <li key={board.id} className="animate-row">
                <Link href={boardHref(workspace.slug, board.id)} className="neo-card group flex h-full flex-col overflow-hidden rounded-xl hover:border-line-strong">
                  <div className="grid h-28 place-items-center bg-surface-2 text-ink-3 transition-colors group-hover:bg-primary-subtle group-hover:text-primary-ink">
                    <PenTool size={28} aria-hidden />
                  </div>
                  <div className="p-3.5">
                    <h2 className="truncate text-ui font-semibold group-hover:text-primary-ink">{board.title}</h2>
                    <p className="mt-0.5 truncate text-2xs text-ink-3">
                      Edited {mailDate(board.updatedAt)}
                      {editor ? ` by ${editor.fullName ?? editor.email}` : ''}
                    </p>
                    {project && (
                      <p className={cn('mt-1.5 flex items-center gap-1 text-2xs', color(project.color).ink)}>
                        <span className={cn('size-1.5 rounded-full', color(project.color).dot)} aria-hidden /> {project.name}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={PenTool}
            title="No boards yet"
            hint="Draw flows, mind maps, wireframes or retros. Boards save automatically."
            action={canWrite(workspace) ? <Button variant="primary" size="sm" onClick={add}>Create a board</Button> : undefined}
          />
        </div>
      )}
    </ModuleGate>
  )
}

type Peer = { id: string; name: string; color: ColorKey }

export function BoardPage({ id }: { id: string }) {
  const workspace = useCurrentWorkspace()
  const router = useRouter()
  const user = useUser()
  const { data: profile } = useProfile()
  const { data: board, isPending } = useBoard(id)
  const projectsOn = isModuleEnabled(workspace, 'projects')
  const { data: projects = [] } = useProjects(projectsOn ? workspace.id : undefined)
  const update = useUpdateBoard(workspace.id)
  const remove = useDeleteBoard(workspace.id)
  const [peers, setPeers] = useState<Peer[]>([])
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'pending' | 'error'>('saved')
  const [title, setTitle] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const onPeers = useCallback((list: Peer[]) => setPeers(list), [])
  const onSaveState = useCallback((state: 'saved' | 'saving' | 'pending' | 'error') => setSaveState(state), [])

  if (isPending) return <Skeleton className="h-[70vh] rounded-xl" />
  if (!board) return <EmptyState icon={PenTool} title="Board not found" hint="It may have been deleted, or it belongs to a project you cannot see." />

  const readOnly = !canWrite(workspace)
  const mayDelete = canAdmin(workspace) || board.createdBy === user.id

  return (
    <ModuleGate id="whiteboard">
      <div className="-mx-4 -mt-5 flex h-[calc(100dvh-3.5rem)] flex-col md:-mx-8 md:-mt-7">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-surface px-3 py-2">
          <Link href={workspaceHref(workspace.slug, 'whiteboard')} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="All boards">
            <ArrowLeft size={16} />
          </Link>
          <input
            value={title ?? board.title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title !== null && title.trim() !== board.title) update.mutate({ id: board.id, title: title.trim() })
            }}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            readOnly={readOnly}
            maxLength={200}
            aria-label="Board name"
            className="min-w-32 flex-1 rounded-md bg-transparent px-2 py-1 text-card font-semibold outline-none hover:bg-surface-2 focus:bg-surface-2 sm:max-w-sm"
          />
          {projects.length > 0 && !readOnly && (
            <Select aria-label="Project" value={board.projectId ?? ''} onChange={(event) => update.mutate({ id: board.id, projectId: event.target.value || null })} className="h-8 w-40 text-xs">
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}
          <span className="ml-auto flex items-center gap-3">
            {peers.length > 0 && (
              <span className="flex -space-x-1.5" aria-label={`Here now: ${peers.map((peer) => peer.name).join(', ')}`}>
                {peers.slice(0, 5).map((peer) => (
                  <span key={peer.id} title={peer.name} className={cn('grid size-7 place-items-center rounded-full text-[10px] font-bold text-on-primary ring-2 ring-surface', color(peer.color).dot)}>
                    {initials(peer.name)}
                  </span>
                ))}
              </span>
            )}
            <span className={cn('text-2xs', saveState === 'error' ? 'text-error-ink' : 'text-ink-3')} aria-live="polite">
              {readOnly ? 'View only' : saveState === 'saving' ? 'Saving…' : saveState === 'pending' ? 'Editing…' : saveState === 'error' ? 'Offline: will retry' : 'Saved'}
            </span>
            {mayDelete && (
              <Menu
                label="Board actions"
                items={[{ label: 'Delete board', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(true) }]}
                trigger={(props) => (
                  <button {...props} type="button" aria-label="Board actions" className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
                    <MoreHorizontal size={16} />
                  </button>
                )}
              />
            )}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <BoardCanvas board={board} me={{ id: user.id, name: profile?.fullName || user.email }} readOnly={readOnly} onPeers={onPeers} onSaveState={onSaveState} />
        </div>
      </div>
      {deleting && (
        <ConfirmDialog
          title={`Delete “${board.title}”?`}
          message="The board and its images are deleted for everyone. This cannot be undone."
          busy={remove.isPending}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await remove.mutateAsync(board.id)
            toast.success('Board deleted')
            router.push(workspaceHref(workspace.slug, 'whiteboard'))
          }}
        />
      )}
    </ModuleGate>
  )
}
