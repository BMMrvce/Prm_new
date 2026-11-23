'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, LockKeyhole, NotebookText, Pin, Plus, Search, Users } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDeferredValue, useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { useVault } from '@/components/security/vault'
import { color } from '@/core/colors'
import { isModuleEnabled } from '@/core/modules'
import { useUser } from '@/core/session'
import { canWrite, useCurrentWorkspace, useMembers } from '@/core/workspaces'
import { mailDate } from '@/lib/format'
import { useProjects } from '@/modules/projects/queries'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Select } from '@/ui/field'
import { EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { NoteEditor } from './note-editor'
import { noteKeys, useCreateNote, useNote, useNotes, useNoteSearch, type NoteChanges, type NoteSummary } from './queries'

type Filter = 'all' | 'pinned' | 'meetings' | 'shared' | 'protected'
const ALL = '__all'
const NONE = '__none'

/**
 * Notes: a list on the left, the open note on the right (`?note=<id>` selects one, so
 * links and notifications open a note directly). On phones the two take turns.
 */
export function NotesPage() {
  const workspace = useCurrentWorkspace()
  const user = useUser()
  const vault = useVault()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const selectedId = params.get('note')
  const { data: notes, isPending, error, refetch } = useNotes(workspace.id)
  const { data: members = [] } = useMembers(workspace.id)
  const projectsOn = isModuleEnabled(workspace, 'projects')
  const { data: projects = [] } = useProjects(projectsOn ? workspace.id : undefined)
  const create = useCreateNote(workspace.id)
  const [query, setQuery] = useState('')
  const term = useDeferredValue(query.trim())
  const textMatches = useNoteSearch(workspace.id, term)
  const [filter, setFilter] = useState<Filter>('all')
  const [projectFilter, setProjectFilter] = useState(ALL)
  const { data: selected, isPending: loadingNote } = useNote(selectedId)

  const open = (id: string | null) => router.replace(id ? `${pathname}?note=${id}` : pathname, { scroll: false })

  const add = async () => {
    const id = await create.mutateAsync({ projectId: projectFilter !== ALL && projectFilter !== NONE ? projectFilter : null })
    open(id)
  }

  const shown = useMemo(() => {
    const lower = term.toLowerCase()
    return (notes ?? [])
      .filter((note) => {
        if (filter === 'pinned' && !note.pinned) return false
        if (filter === 'meetings' && !note.meetingId) return false
        if (filter === 'shared' && !(note.memberIds.length || note.ownerId !== user.id)) return false
        if (filter === 'protected' && !note.protected) return false
        if (projectFilter === NONE && note.projectId) return false
        if (projectFilter !== ALL && projectFilter !== NONE && note.projectId !== projectFilter) return false
        if (!lower) return true
        return note.title.toLowerCase().includes(lower) || (note.meeting?.title ?? '').toLowerCase().includes(lower) || Boolean(textMatches.data?.has(note.id))
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }, [notes, filter, projectFilter, term, textMatches.data, user.id])

  const patchList = (id: string) => (changes: NoteChanges) => {
    if (!Object.keys(changes).length) {
      queryClient.invalidateQueries({ queryKey: noteKeys.list(workspace.id) })
      queryClient.invalidateQueries({ queryKey: noteKeys.one(id) })
      return
    }
    queryClient.setQueryData<NoteSummary[]>(noteKeys.list(workspace.id), (list) => list?.map((note) => (note.id === id ? { ...note, ...changes } : note)))
  }

  const projectById = new Map(projects.map((project) => [project.id, project]))

  return (
    <ModuleGate id="notes">
      <div className="grid min-h-[calc(100dvh-8rem)] min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={cn('neo-card min-w-0 flex-col overflow-hidden rounded-xl', selectedId ? 'hidden lg:flex' : 'flex')} aria-label="Notes">
          <div className="space-y-2 border-b border-line-soft p-3">
            <div className="flex items-center gap-2">
              <label className="neo-control flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5">
                <Search size={14} className="text-ink-3" aria-hidden />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3" />
              </label>
              {canWrite(workspace) && (
                <Button variant="primary" size="sm" className="h-9" loading={create.isPending} icon={<Plus size={15} aria-hidden />} onClick={add} aria-label="New note">
                  New
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
              {(['all', 'pinned', 'meetings', 'shared', 'protected'] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn('h-7 rounded-full px-2.5 text-2xs font-medium capitalize', filter === value ? 'bg-primary-light text-primary-ink' : 'text-ink-2 hover:bg-surface-2')}
                >
                  {value}
                </button>
              ))}
            </div>
            {projects.length > 0 && (
              <Select aria-label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="h-8 text-xs">
                <option value={ALL}>All projects</option>
                <option value={NONE}>No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {error ? (
              <ErrorNotice message={error.message} onRetry={() => refetch()} />
            ) : isPending ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            ) : shown.length ? (
              <ul>
                {shown.map((note) => {
                  const project = note.projectId ? projectById.get(note.projectId) : undefined
                  return (
                    <li key={note.id} className="animate-row">
                      <button
                        type="button"
                        onClick={() => open(note.id)}
                        aria-current={note.id === selectedId ? 'true' : undefined}
                        className={cn('flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left', note.id === selectedId ? 'bg-primary-light' : 'hover:bg-surface-2')}
                      >
                        <span className="flex items-center gap-1.5">
                          {note.pinned && <Pin size={12} className="shrink-0 text-primary-ink" aria-label="Pinned" />}
                          {note.protected && <LockKeyhole size={12} className="shrink-0 text-warning-ink" aria-label="Protected" />}
                          <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{note.title || 'Untitled'}</span>
                        </span>
                        <span className="flex items-center gap-2 text-2xs text-ink-3">
                          <span>{mailDate(note.updatedAt)}</span>
                          {note.meeting && (
                            <span className="flex min-w-0 items-center gap-1 truncate">
                              <CalendarClock size={11} aria-hidden /> {note.meeting.title}
                            </span>
                          )}
                          {project && (
                            <span className={cn('flex min-w-0 items-center gap-1 truncate', color(project.color).ink)}>
                              <span className={cn('size-1.5 rounded-full', color(project.color).dot)} aria-hidden /> {project.name}
                            </span>
                          )}
                          {(note.memberIds.length > 0 || note.ownerId !== user.id) && <Users size={11} aria-label="Shared" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={NotebookText}
                title={notes?.length ? 'No notes match' : 'No notes yet'}
                hint={notes?.length ? 'Try another search or filter.' : 'Write meeting minutes, ideas or reference pages.'}
              />
            )}
            {vault.status?.hasPin && !vault.unlocked && (
              <button type="button" onClick={() => vault.requestUnlock()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-2xs text-ink-3 hover:bg-surface-2">
                <LockKeyhole size={12} aria-hidden /> Protected notes are hidden. Unlock to show them.
              </button>
            )}
          </div>
        </section>

        <section className={cn('neo-card min-w-0 flex-col overflow-hidden rounded-xl', selectedId ? 'flex' : 'hidden lg:flex')} aria-label="Note">
          {selectedId && (
            <button type="button" onClick={() => open(null)} className="flex items-center gap-1.5 border-b border-line-soft px-4 py-2 text-xs font-medium text-primary-ink lg:hidden">
              <ArrowLeft size={14} aria-hidden /> All notes
            </button>
          )}
          {selectedId && loadingNote ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-64" />
            </div>
          ) : selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              workspace={workspace}
              members={members}
              projects={projects}
              onDeleted={() => open(null)}
              onListChange={patchList(selected.id)}
            />
          ) : selectedId ? (
            <EmptyState icon={NotebookText} title="This note is not available" hint="It may have been deleted, unshared, or it is protected and locked." />
          ) : (
            <EmptyState icon={NotebookText} title="Pick a note or start a new one" hint="Type / in a note for headings, lists, to-dos and more." className="my-auto" />
          )}
        </section>
      </div>
    </ModuleGate>
  )
}
