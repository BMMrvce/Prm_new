'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cloud, Copy, ExternalLink, FileText, FolderOpen, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { must, supabase } from '@/lib/supabase/client'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Field, Input } from '@/ui/field'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { errorMessage, toast } from '@/ui/toast'

export type ProjectLink = { id: string; kind: 'folder' | 'file'; title: string; url: string; note: string | null; position: number }

type Provider = { id: string; name: string; tone: string }

/** Which service a link points to, from its host name (display only). */
export function providerOf(url: string): Provider {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    // Not a URL: shown as a plain link.
  }
  if (host === '1drv.ms' || host.endsWith('onedrive.live.com') || host.endsWith('-my.sharepoint.com')) return { id: 'onedrive', name: 'OneDrive', tone: 'bg-cat-blue-light text-cat-blue-ink' }
  if (host.endsWith('.sharepoint.com')) return { id: 'sharepoint', name: 'SharePoint', tone: 'bg-cat-teal-light text-cat-teal-ink' }
  if (host === 'drive.google.com' || host === 'docs.google.com') return { id: 'gdrive', name: 'Google Drive', tone: 'bg-cat-green-light text-cat-green-ink' }
  if (host.endsWith('dropbox.com')) return { id: 'dropbox', name: 'Dropbox', tone: 'bg-cat-violet-light text-cat-violet-ink' }
  return { id: 'web', name: 'Link', tone: 'bg-cat-slate-light text-cat-slate-ink' }
}

/** Only real https links are stored (the database checks this too). */
function cleanUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const isMissingTable = (error: unknown) => ['PGRST205', '42P01'].includes((error as { code?: string } | null)?.code ?? '')
const key = (projectId: string) => ['project-links', projectId] as const

function useProjectLinks(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    retry: (count, error) => !isMissingTable(error) && count < 2,
    queryFn: async () =>
      must(await supabase().from('project_links').select('id, kind, title, url, note, position').eq('project_id', projectId).order('position').order('created_at')) as ProjectLink[],
  })
}

function useSaveLink(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...link }: Omit<ProjectLink, 'id' | 'position'> & { id?: string }) => {
      if (id) return must(await supabase().from('project_links').update(link).eq('id', id))
      return must(await supabase().from('project_links').insert({ ...link, workspace_id: workspaceId, project_id: projectId, position: Date.now() }))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(projectId) }),
  })
}

function useDeleteLink(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('project_links').delete().eq('id', id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(projectId) }),
  })
}

/**
 * The project's documents: one linked cloud folder (OneDrive by default) plus pinned
 * files. Files stay in your own cloud storage; only the links are kept here.
 */
export function ProjectDocuments({ workspaceId, projectId, projectName, writable }: { workspaceId: string; projectId: string; projectName: string; writable: boolean }) {
  const links = useProjectLinks(projectId)
  const [editingFolder, setEditingFolder] = useState(false)
  const [addingFile, setAddingFile] = useState(false)

  if (isMissingTable(links.error))
    return (
      <div className="rounded-xl border border-warning/40 bg-warning-light px-4 py-3 text-ui text-warning-ink" role="alert">
        <p className="font-medium">Project documents aren’t set up in your database yet.</p>
        <p className="mt-1">
          In Supabase → SQL Editor, run <code className="font-mono text-xs">supabase/migrations/20261113000008_project_documents.sql</code>, then reload.
        </p>
      </div>
    )
  if (links.error) return <ErrorNotice message={links.error.message} onRetry={() => links.refetch()} />
  if (links.isPending) return <Skeleton className="h-48 rounded-xl" />

  const folder = links.data.find((link) => link.kind === 'folder')
  const files = links.data.filter((link) => link.kind === 'file')

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="neo-card rounded-xl">
        <header className="flex items-center gap-2 border-b border-line-soft px-5 py-3.5">
          <FolderOpen size={16} className="text-ink-2" aria-hidden />
          <h2 className="flex-1 text-card font-semibold">Project folder</h2>
          {folder && writable && !editingFolder && (
            <IconButton label="Change folder link" size="sm" variant="ghost" onClick={() => setEditingFolder(true)}>
              <Pencil size={14} />
            </IconButton>
          )}
        </header>
        <div className="p-5">
          {folder && !editingFolder ? (
            <FolderCard link={folder} projectId={projectId} writable={writable} />
          ) : writable ? (
            <>
              {!folder && <OneDriveSetup />}
              <LinkForm
                workspaceId={workspaceId}
                projectId={projectId}
                kind="folder"
                link={folder}
                defaultTitle={`${projectName} documents`}
                urlLabel="Folder share link"
                onDone={() => setEditingFolder(false)}
              />
            </>
          ) : (
            <p className="text-ui text-ink-3">No folder linked yet. Ask a workspace member to link the project’s OneDrive folder.</p>
          )}
        </div>
      </section>

      <section className="neo-card rounded-xl">
        <header className="flex items-center gap-2 border-b border-line-soft px-5 py-3.5">
          <FileText size={16} className="text-ink-2" aria-hidden />
          <h2 className="flex-1 text-card font-semibold">Pinned documents</h2>
          {writable && !addingFile && (
            <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden />} onClick={() => setAddingFile(true)}>
              Pin a document
            </Button>
          )}
        </header>
        <div className="space-y-3 p-5">
          {addingFile && <LinkForm workspaceId={workspaceId} projectId={projectId} kind="file" urlLabel="Document link" onDone={() => setAddingFile(false)} />}
          {files.length ? (
            <ul className="-mx-2 divide-y divide-line-soft">
              {files.map((file) => (
                <FileRow key={file.id} link={file} workspaceId={workspaceId} projectId={projectId} writable={writable} />
              ))}
            </ul>
          ) : (
            !addingFile && <p className="text-ui text-ink-3">Pin the documents you open most (the brief, the contract, the plan) for one-click access.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function OneDriveSetup() {
  return (
    <div className="mb-5 rounded-lg bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-ui font-medium text-ink">
        <Cloud size={15} className="text-cat-blue-ink" aria-hidden /> Link this project’s OneDrive folder
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-ink-2">
        <li>
          Open OneDrive (
          <a href="https://onedrive.live.com" target="_blank" rel="noopener noreferrer" className="text-primary-ink underline">
            personal
          </a>{' '}
          or your work OneDrive in Microsoft 365) and create a folder for this project.
        </li>
        <li>Select the folder → <b>Share</b> → choose who can open it (keep it to specific people or your organisation) → <b>Copy link</b>.</li>
        <li>Paste the link below and save. Everyone who can see this project gets an “Open in OneDrive” button.</li>
      </ol>
      <p className="mt-2 text-2xs text-ink-3">Your files stay in OneDrive with its own permissions; this app only keeps the link. SharePoint, Google Drive and Dropbox links work too.</p>
    </div>
  )
}

function FolderCard({ link, projectId, writable }: { link: ProjectLink; projectId: string; writable: boolean }) {
  const provider = providerOf(link.url)
  const remove = useDeleteLink(projectId)
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', provider.tone)}>
          <FolderOpen size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-card font-semibold text-ink">{link.title}</p>
          <p className="truncate text-2xs text-ink-3">{provider.name} folder</p>
        </div>
      </div>
      {link.note && <p className="mt-3 text-xs text-ink-2">{link.note}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-ui font-medium text-on-primary hover:bg-primary-hover">
          <ExternalLink size={15} aria-hidden /> Open in {provider.name}
        </a>
        <Button variant="secondary" size="md" icon={<Copy size={14} aria-hidden />} onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success('Link copied'))}>
          Copy link
        </Button>
        {writable && (
          <Button variant="ghost" size="md" icon={<Trash2 size={14} aria-hidden />} onClick={() => remove.mutate(link.id, { onSuccess: () => toast.success('Folder unlinked') })}>
            Unlink
          </Button>
        )}
      </div>
    </div>
  )
}

function FileRow({ link, workspaceId, projectId, writable }: { link: ProjectLink; workspaceId: string; projectId: string; writable: boolean }) {
  const provider = providerOf(link.url)
  const remove = useDeleteLink(projectId)
  const [editing, setEditing] = useState(false)
  if (editing) return <li className="px-2 py-2"><LinkForm workspaceId={workspaceId} projectId={projectId} kind="file" link={link} urlLabel="Document link" onDone={() => setEditing(false)} /></li>
  return (
    <li className="group flex items-center gap-3 px-2 py-2">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', provider.tone)}>
        <FileText size={15} aria-hidden />
      </span>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-ui font-medium text-ink">{link.title}</span>
        <span className="block truncate text-2xs text-ink-3">{link.note || provider.name}</span>
      </a>
      {writable && (
        <span className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <IconButton label={`Edit ${link.title}`} size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil size={13} />
          </IconButton>
          <IconButton label={`Remove ${link.title}`} size="sm" variant="ghost" onClick={() => remove.mutate(link.id)}>
            <Trash2 size={13} />
          </IconButton>
        </span>
      )}
    </li>
  )
}

function LinkForm({
  workspaceId,
  projectId,
  kind,
  link,
  defaultTitle = '',
  urlLabel,
  onDone,
}: {
  workspaceId: string
  projectId: string
  kind: 'folder' | 'file'
  link?: ProjectLink
  defaultTitle?: string
  urlLabel: string
  onDone: () => void
}) {
  const save = useSaveLink(workspaceId, projectId)
  const [url, setUrl] = useState(link?.url ?? '')
  const [title, setTitle] = useState(link?.title ?? defaultTitle)
  const [note, setNote] = useState(link?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = cleanUrl(url)
    if (!clean) return setError('Paste a full link that starts with https://')
    if (!title.trim()) return setError('Give it a name.')
    setError(null)
    save.mutate(
      { id: link?.id, kind, title: title.trim(), url: clean, note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success(kind === 'folder' ? 'Folder linked' : 'Document pinned')
          onDone()
        },
        onError: (caught) => setError(errorMessage(caught)),
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label={urlLabel} error={error}>
        {(props) => (
          <Input
            {...props}
            type="url"
            inputMode="url"
            autoFocus
            value={url}
            placeholder="https://1drv.ms/f/…"
            onChange={(event) => {
              setUrl(event.target.value)
              if (!title.trim() && kind === 'file') {
                const name = decodeURIComponent(event.target.value.split('/').pop()?.split('?')[0] ?? '')
                if (/\.[a-z0-9]{2,5}$/i.test(name)) setTitle(name)
              }
            }}
          />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">{(props) => <Input {...props} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />}</Field>
        <Field label="Note" optional>
          {(props) => <Input {...props} value={note} maxLength={500} placeholder={kind === 'folder' ? 'e.g. Contracts and invoices' : 'e.g. Signed version'} onChange={(event) => setNote(event.target.value)} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {(link || kind === 'file') && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" size="sm" loading={save.isPending} icon={<Link2 size={14} aria-hidden />}>
          {link ? 'Save' : kind === 'folder' ? 'Link folder' : 'Pin document'}
        </Button>
      </div>
    </form>
  )
}
