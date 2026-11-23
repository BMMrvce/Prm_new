'use client'

import { LockKeyhole, NotebookText, PenTool, Pin } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { boardHref, noteHref, workspaceHref } from '@/core/routes'
import { mailDate } from '@/lib/format'
import { useCreateNote, useNotes } from '@/modules/notes/queries'
import { canWrite } from '@/core/workspaces'
import { toast } from '@/ui/toast'
import { useBoards, useCreateBoard } from '@/modules/whiteboard/queries'
import { WidgetAdd, WidgetFrame } from '../widget-frame'
import type { WidgetProps } from '../registry'

export function RecentNotesWidget({ workspace }: WidgetProps) {
  const { data = [] } = useNotes(workspace?.id ?? '')
  const create = useCreateNote(workspace?.id ?? '')
  const router = useRouter()
  if (!workspace) return null
  const notes = [...data].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
  return (
    <WidgetFrame
      title="Notes"
      icon={<NotebookText size={15} />}
      action={
        <span className="flex items-center gap-2">
          <Link href={workspaceHref(workspace.slug, 'notes')} className="text-2xs font-medium text-primary-ink">
            All
          </Link>
          {canWrite(workspace) && (
            <WidgetAdd
              label="New note"
              busy={create.isPending}
              onClick={() => create.mutate({}, { onSuccess: (id) => router.push(noteHref(workspace.slug, id)), onError: () => toast.error('Could not create the note') })}
            />
          )}
        </span>
      }
    >
      {notes.length ? (
        <ul className="-mx-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Link href={noteHref(workspace.slug, note.id)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                {note.pinned && <Pin size={12} className="shrink-0 text-primary-ink" aria-label="Pinned" />}
                {note.protected && <LockKeyhole size={12} className="shrink-0 text-warning-ink" aria-label="Protected" />}
                <span className="min-w-0 flex-1 truncate text-ui">{note.title || 'Untitled'}</span>
                <span className="shrink-0 text-2xs text-ink-3">{mailDate(note.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs text-ink-3">No notes yet.</p>
      )}
    </WidgetFrame>
  )
}

export function RecentBoardsWidget({ workspace }: WidgetProps) {
  const { data = [] } = useBoards(workspace?.id ?? '')
  const create = useCreateBoard(workspace?.id ?? '')
  const router = useRouter()
  if (!workspace) return null
  return (
    <WidgetFrame
      title="Whiteboards"
      icon={<PenTool size={15} />}
      action={
        <span className="flex items-center gap-2">
          <Link href={workspaceHref(workspace.slug, 'whiteboard')} className="text-2xs font-medium text-primary-ink">
            All
          </Link>
          {canWrite(workspace) && (
            <WidgetAdd
              label="New whiteboard"
              busy={create.isPending}
              onClick={() => create.mutate({ title: 'Untitled board' }, { onSuccess: (id) => router.push(boardHref(workspace.slug, id)), onError: () => toast.error('Could not create the board') })}
            />
          )}
        </span>
      }
    >
      {data.length ? (
        <ul className="-mx-2">
          {data.slice(0, 8).map((board) => (
            <li key={board.id}>
              <Link href={boardHref(workspace.slug, board.id)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <PenTool size={13} className="shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ui">{board.title}</span>
                <span className="shrink-0 text-2xs text-ink-3">{mailDate(board.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs text-ink-3">No boards yet.</p>
      )}
    </WidgetFrame>
  )
}
