'use client'

import {
  CalendarClock,
  CalendarDays,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  List,
  ListChecks,
  ListOrdered,
  Megaphone,
  Minus,
  Palette,
  Pilcrow,
  Pin,
  PinOff,
  Quote,
  Trash2,
  Users,
  LogOut,
  FolderKanban,
  LockKeyhole,
  Unlock,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVault } from '@/components/security/vault'
import { setProtection } from '@/modules/settings/privacy-danger'
import { color } from '@/core/colors'
import { useProfile, useUser } from '@/core/session'
import type { Member, Workspace } from '@/core/types'
import { initials } from '@/lib/format'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { useCategories } from '@/modules/categories/queries'
import type { Project } from '@/modules/projects/queries'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { PeoplePicker } from '@/ui/people-picker'
import { toast } from '@/ui/toast'
import { blocksOf, caretBlock, mergeBlocks, normalizeBlocks, snapshot } from './blocks'
import { useDeleteNote, useShareNote, useUpdateNote, type Note, type NoteChanges } from './queries'
import { useNoteLive, type Blocks } from './use-note-live'

/* ---------------------------------------------------------------- block helpers */

const BLOCKS = 'p,div,h1,h2,h3,blockquote,pre,li'
const COLOR_CLASSES = [
  'nc-yellow',
  'nc-orange',
  'nc-red',
  'nc-green',
  'nc-blue',
  'nc-purple',
  'nc-pink',
  'nc-hl-yellow',
  'nc-hl-green',
  'nc-hl-blue',
  'nc-hl-pink',
  'nc-callout',
]

/** The block (paragraph, heading, list item…) holding the caret, wrapping bare text first. */
function blockAtCaret(root: HTMLElement): HTMLElement | null {
  const selection = document.getSelection()
  let node = selection?.anchorNode ?? null
  if (!node || !root.contains(node)) return null
  if (node === root || node.parentNode === root) {
    // Text typed straight into the editor: give it a paragraph so it can be styled.
    if (node.nodeType === Node.TEXT_NODE || node === root) {
      document.execCommand('formatBlock', false, 'p')
      node = document.getSelection()?.anchorNode ?? null
      if (!node) return null
    }
  }
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const block = element?.closest(BLOCKS) as HTMLElement | null
  return block && block !== root && root.contains(block) ? block : null
}

function styleBlock(root: HTMLElement, className: string | null) {
  const block = blockAtCaret(root)
  if (!block) return
  block.classList.remove(...COLOR_CLASSES)
  if (className) block.classList.add(className)
  if (!block.classList.length) block.removeAttribute('class')
}

/** Turns the list at the caret into a to-do list (making one first if needed). */
function makeTodo(root: HTMLElement) {
  let block = blockAtCaret(root)
  if (!block?.closest('ul')) {
    document.execCommand('insertUnorderedList')
    block = blockAtCaret(root)
  }
  const list = block?.closest('ul')
  if (!list || !root.contains(list)) return
  list.setAttribute('data-type', 'todo')
  list.querySelectorAll(':scope > li').forEach((item) => {
    if (!item.hasAttribute('data-checked')) item.setAttribute('data-checked', 'false')
  })
}

function format(tag: string) {
  document.execCommand('formatBlock', false, tag)
}

type Command = {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  /** Extra words that find the command. */
  keywords?: string
  /** Swatch class for color commands. */
  swatch?: string
  run: (root: HTMLElement) => void
}

const COMMANDS: Command[] = [
  {
    id: 'text',
    label: 'Text',
    hint: 'Plain paragraph',
    icon: Pilcrow,
    keywords: 'paragraph plain normal',
    run: (root) => {
      format('p')
      styleBlock(root, null)
    },
  },
  {
    id: 'todo',
    label: 'To-do list',
    hint: 'Checklist with tick boxes',
    icon: ListChecks,
    keywords: 'checkbox check task todo',
    run: makeTodo,
  },
  {
    id: 'h1',
    label: 'Heading 1',
    hint: 'Big section title',
    icon: Heading1,
    keywords: 'title h1',
    run: () => format('h1'),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    hint: 'Medium heading',
    icon: Heading2,
    keywords: 'subtitle h2',
    run: () => format('h2'),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    hint: 'Small heading',
    icon: Heading3,
    keywords: 'h3',
    run: () => format('h3'),
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    hint: 'Simple list',
    icon: List,
    keywords: 'ul unordered',
    run: () => document.execCommand('insertUnorderedList'),
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    hint: '1, 2, 3',
    icon: ListOrdered,
    keywords: 'ol ordered',
    run: () => document.execCommand('insertOrderedList'),
  },
  {
    id: 'quote',
    label: 'Quote',
    hint: 'Indented quotation',
    icon: Quote,
    keywords: 'blockquote',
    run: () => format('blockquote'),
  },
  {
    id: 'code',
    label: 'Code',
    hint: 'Monospaced block',
    icon: Code2,
    keywords: 'pre snippet',
    run: () => format('pre'),
  },
  {
    id: 'callout',
    label: 'Callout',
    hint: 'Tinted note box',
    icon: Megaphone,
    keywords: 'note info box',
    run: (root) => {
      format('p')
      styleBlock(root, 'nc-callout')
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Horizontal line',
    icon: Minus,
    keywords: 'hr line separator',
    run: () => document.execCommand('insertHTML', false, '<hr><p><br></p>'),
  },
  {
    id: 'date',
    label: 'Today’s date',
    hint: 'Insert the date',
    icon: CalendarDays,
    keywords: 'today now',
    run: () =>
      document.execCommand(
        'insertText',
        false,
        new Date().toLocaleDateString([], {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      ),
  },
  ...(
    [
      ['yellowtext', 'Yellow text', 'nc-yellow'],
      ['orangetext', 'Orange text', 'nc-orange'],
      ['redtext', 'Red text', 'nc-red'],
      ['greentext', 'Green text', 'nc-green'],
      ['bluetext', 'Blue text', 'nc-blue'],
      ['purpletext', 'Purple text', 'nc-purple'],
      ['pinktext', 'Pink text', 'nc-pink'],
    ] as const
  ).map(([id, label, className]) => ({
    id,
    label,
    hint: 'Color this line',
    icon: Palette,
    keywords: `color colour ${id.replace('text', '')}`,
    swatch: className,
    run: (root: HTMLElement) => styleBlock(root, className),
  })),
  ...(
    [
      ['highlight', 'Yellow highlight', 'nc-hl-yellow', 'yellowhighlight marker'],
      ['greenhighlight', 'Green highlight', 'nc-hl-green', 'mark'],
      ['bluehighlight', 'Blue highlight', 'nc-hl-blue', 'mark'],
      ['pinkhighlight', 'Pink highlight', 'nc-hl-pink', 'mark'],
    ] as const
  ).map(([id, label, className, keywords]) => ({
    id,
    label,
    hint: 'Highlight this line',
    icon: Highlighter,
    keywords: `highlight background ${keywords}`,
    swatch: className,
    run: (root: HTMLElement) => styleBlock(root, className),
  })),
]

function matching(query: string) {
  const q = query.toLowerCase()
  if (!q) return COMMANDS
  return COMMANDS.filter(
    (command) =>
      command.id.startsWith(q) ||
      command.label.toLowerCase().includes(q) ||
      (command.keywords ?? '').includes(q),
  )
}

/** "/query" right before the caret, at the start of a line or after a space. */
function slashAtCaret(root: HTMLElement) {
  const selection = document.getSelection()
  if (!selection?.isCollapsed || !selection.anchorNode) return null
  const node = selection.anchorNode
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null
  const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
  const match = /(?:^|[\s ])\/([a-z]{0,20})$/i.exec(before)
  if (!match) return null
  return {
    node: node as Text,
    start: selection.anchorOffset - match[1].length - 1,
    query: match[1],
  }
}

/** Markdown-style shortcuts typed at the start of a line, e.g. "[] " for a to-do. */
const SHORTCUTS: [RegExp, (root: HTMLElement) => void][] = [
  [/^\[ ?\]$/, makeTodo],
  [/^[-*]$/, () => document.execCommand('insertUnorderedList')],
  [/^1\.$/, () => document.execCommand('insertOrderedList')],
  [/^#$/, () => format('h1')],
  [/^##$/, () => format('h2')],
  [/^###$/, () => format('h3')],
  [/^>$/, () => format('blockquote')],
]

/**
 * True only for a note with nothing in it: no text and nothing but one empty paragraph. An
 * empty to-do list, heading or divider counts as content (the placeholder would cover it).
 */
function isBlank(root: HTMLElement) {
  if ((root.innerText ?? '').trim()) return false
  if (root.children.length > 1) return false
  const first = root.firstElementChild
  return !first || (first.tagName === 'P' && !first.classList.length)
}

/** Puts the caret at the end of the note's last block and types `text` there. */
function typeAtEnd(root: HTMLElement, text: string) {
  root.focus()
  const last = root.lastElementChild ?? root
  const range = document.createRange()
  range.selectNodeContents(last)
  range.collapse(false)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('insertText', false, text)
}

/* ---------------------------------------------------------------- component */

type Menu = { query: string; top: number; left: number; node: Text; start: number }

/**
 * One note: title, meeting link (if any), and a rich body with slash commands. Saves itself
 * a moment after you stop typing, and when you leave the note.
 */
export function NoteEditor({
  note,
  workspace,
  members,
  projects,
  onDeleted,
  onListChange,
}: {
  note: Note
  workspace: Workspace
  members: Member[]
  projects: Project[]
  onDeleted: () => void
  /** Keeps the list's title in step while typing (and with collaborators' edits). */
  onListChange: (changes: NoteChanges) => void
}) {
  const user = useUser()
  const { data: profile } = useProfile()
  const vault = useVault()
  const update = useUpdateNote(workspace.id)
  const remove = useDeleteNote(workspace.id)
  const share = useShareNote(workspace.id)
  const { data: meetingTypes = [] } = useCategories(note.meetingId ? workspace.id : undefined, 'meeting')
  const root = useRef<HTMLDivElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const [sharing, setSharing] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null)
  const [protecting, setProtecting] = useState(false)
  /** Bumped when blocks move, so collaborators' markers are re-positioned. */
  const [, setLayout] = useState(0)
  const lastSaved = useRef(note.content)
  const owner = note.ownerId === user.id
  const shared = owner ? note.memberIds.length > 0 : true
  const ownerName = members.find((member) => member.id === note.ownerId)?.fullName ?? 'someone'

  const live = useNoteLive({
    noteId: note.id,
    enabled: shared && !note.protected,
    me: { id: user.id, name: profile?.fullName || user.email },
    currentBlocks: () => (root.current ? snapshot(root.current) : []),
    onBlocks: (blocks) => applyBlocks(blocks),
    onMeta: (meta) => {
      if (meta.title === undefined || document.activeElement === titleInput.current) return
      setTitle(meta.title)
      onListChange({ title: meta.title })
    },
    onSaved: (row) => {
      // Our own saves echo back too; only apply versions we have not written ourselves.
      if (typeof row.content === 'string' && row.content !== lastSaved.current && pending.current.content === undefined) {
        applyBlocks(blocksOf(row.content))
      }
      if (typeof row.title === 'string' && row.title !== title && document.activeElement !== titleInput.current && pending.current.title === undefined) {
        setTitle(row.title)
        onListChange({ title: row.title })
      }
    },
  })

  const applyBlocks = (blocks: Blocks) => {
    const editor = root.current
    if (!editor) return
    const keep = document.activeElement === editor ? (caretBlock(editor)?.getAttribute('data-b') ?? null) : null
    mergeBlocks(editor, blocks, keep)
    setEmpty(isBlank(editor))
    setLayout((value) => value + 1)
  }

  const reportCaret = () => {
    const editor = root.current
    if (editor) live.setActiveBlock(caretBlock(editor)?.getAttribute('data-b') ?? null)
  }
  const [title, setTitle] = useState(note.title)
  const [empty, setEmpty] = useState(!note.content)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [active, setActive] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved')
  const contentTimer = useRef<number | undefined>(undefined)
  const titleTimer = useRef<number | undefined>(undefined)
  const pending = useRef<{ content?: string; title?: string }>({})

  // Load the body once per note; afterwards the DOM is the source of truth while editing.
  useLayoutEffect(() => {
    if (!root.current) return
    root.current.innerHTML = sanitizeHtml(note.content) || '<p><br></p>'
    normalizeBlocks(root.current)
    setEmpty(isBlank(root.current))
    if (!note.title && !note.content) titleInput.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // "/" pressed outside any field goes to the note: the cursor moves into the body and
  // the command menu opens.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') || document.querySelector('dialog[open]') || !root.current) {
        return
      }
      event.preventDefault()
      typeAtEnd(root.current, '/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const flush = async () => {
    window.clearTimeout(contentTimer.current)
    window.clearTimeout(titleTimer.current)
    const changes = pending.current
    pending.current = {}
    if (changes.content === undefined && changes.title === undefined) return
    setSaveState('saving')
    if (changes.content !== undefined) lastSaved.current = changes.content
    try {
      await update.mutateAsync({ id: note.id, changes })
      setSaveState(Object.keys(pending.current).length ? 'pending' : 'saved')
    } catch {
      // Keep the unsaved changes and try again on the next edit.
      pending.current = { ...changes, ...pending.current }
      setSaveState('error')
    }
  }
  // Save whatever is left when switching notes or leaving the page.
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  })
  useEffect(() => () => void flushRef.current(), [])

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) event.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  const queueContent = () => {
    if (!root.current) return
    normalizeBlocks(root.current)
    pending.current.content = sanitizeHtml(root.current.innerHTML)
    setEmpty(isBlank(root.current))
    live.sendBlocks()
    reportCaret()
    setSaveState('pending')
    window.clearTimeout(contentTimer.current)
    contentTimer.current = window.setTimeout(() => void flush(), 700)
  }

  const queueTitle = (value: string) => {
    setTitle(value)
    onListChange({ title: value })
    pending.current.title = value.slice(0, 300)
    live.sendMeta({ title: value.slice(0, 300) })
    setSaveState('pending')
    window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => void flush(), 700)
  }

  const openMenuIfSlash = () => {
    const editor = root.current
    if (!editor) return
    const slash = slashAtCaret(editor)
    if (!slash || !matching(slash.query).length) return setMenu(null)
    const range = document.createRange()
    range.setStart(slash.node, slash.start)
    range.setEnd(slash.node, slash.start + 1)
    const rect = range.getBoundingClientRect()
    const below = rect.bottom + 320 < window.innerHeight
    setMenu({
      query: slash.query,
      node: slash.node,
      start: slash.start,
      left: Math.min(rect.left, window.innerWidth - 280),
      top: below ? rect.bottom + 6 : Math.max(8, rect.top - 326),
    })
    setActive(0)
  }

  const runCommand = (command: Command) => {
    const editor = root.current
    if (!editor || !menu) return
    const range = document.createRange()
    range.setStart(menu.node, menu.start)
    range.setEnd(menu.node, Math.min(menu.node.length, menu.start + 1 + menu.query.length))
    range.deleteContents()
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    setMenu(null)
    editor.focus()
    command.run(editor)
    queueContent()
  }

  const tryShortcut = () => {
    const editor = root.current
    const selection = document.getSelection()
    const node = selection?.anchorNode
    if (!editor || !node || node.nodeType !== Node.TEXT_NODE || !selection?.isCollapsed) return
    const block = blockAtCaret(editor)
    if (!block || block.tagName === 'LI' || block.tagName === 'PRE') return
    const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
    if (!/[\s ]$/.test(before) || block.textContent?.trim() !== before.trim()) return
    const marker = before.trim()
    const shortcut = SHORTCUTS.find(([pattern]) => pattern.test(marker))
    if (!shortcut) return
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, selection.anchorOffset)
    range.deleteContents()
    shortcut[1](editor)
  }

  const toggleProtection = async () => {
    if (!vault.status?.hasPin) return toast.info('Set up a PIN in Account → Security & privacy first.')
    if (!note.protected && note.memberIds.length) return toast.error('Stop sharing the note before protecting it.')
    if (!(await vault.requestUnlock())) return
    setProtecting(true)
    await flush()
    const result = await setProtection('note', note.id, !note.protected)
    setProtecting(false)
    if (!result.ok) return toast.error(result.error ?? 'Could not change protection.')
    onListChange({})
    toast.success(note.protected ? 'Protection removed' : 'Note protected: it is hidden whenever the vault is locked.')
  }

  const items = menu ? matching(menu.query) : []
  const meetingType = note.meeting?.categoryId ? meetingTypes.find((type) => type.id === note.meeting?.categoryId) : undefined
  const project = projects.find((item) => item.id === note.projectId)

  // Where each collaborator is editing: a colored bar and their name beside that block.
  const markers = live.peers.flatMap((peer) => {
    const block = peer.block && root.current ? (root.current.querySelector(`[data-b="${CSS.escape(peer.block)}"]`) as HTMLElement | null) : null
    return block ? [{ peer, top: block.offsetTop, height: block.offsetHeight }] : []
  })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
        {note.meeting ? (
          <span
            className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium', meetingType ? `${color(meetingType.color).soft} ${color(meetingType.color).ink}` : 'bg-accent-light text-accent-ink')}
            title="Notes for this meeting"
          >
            <CalendarClock size={13} className="shrink-0" aria-hidden />
            <span className="truncate">{note.meeting.title}</span>
            <span className="shrink-0 opacity-80">
              · {new Date(note.meeting.startsAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          </span>
        ) : null}
        {projects.length > 0 &&
          (owner ? (
            <label
              className={cn(
                'inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-md border px-2 text-xs',
                note.projectId ? 'border-line-strong bg-surface-2 text-ink' : 'border-dashed border-line-strong text-ink-2',
              )}
              title="Project"
            >
              {project ? <span className={cn('size-2.5 shrink-0 rounded-[3px]', color(project.color).dot)} aria-hidden /> : <FolderKanban size={13} className="shrink-0" aria-hidden />}
              <select
                value={note.projectId ?? ''}
                onChange={(event) => update.mutate({ id: note.id, changes: { projectId: event.target.value || null } })}
                className="min-w-0 truncate bg-transparent outline-none"
                aria-label="Project"
              >
                <option value="">No project</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            project && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-xs text-ink">
                <span className={cn('size-2.5 rounded-[3px]', color(project.color).dot)} aria-hidden />
                {project.name}
              </span>
            )
          ))}
        {note.protected && (
          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-warning-light px-2 text-2xs font-medium text-warning-ink">
            <LockKeyhole size={12} aria-hidden /> Protected
          </span>
        )}
        {!owner && <span className="text-2xs text-ink-2">Shared by {ownerName}</span>}

        <span className="ml-auto flex items-center gap-2">
          {live.peers.length > 0 && (
            <span className="flex -space-x-1.5" aria-label="Editing now">
              {live.peers.slice(0, 4).map((peer) => (
                <span key={peer.id} className={cn('grid size-6 place-items-center rounded-full text-[10px] font-bold text-on-primary ring-2 ring-surface', color(peer.color).dot)} title={`${peer.name} is here`}>
                  {initials(peer.name)}
                </span>
              ))}
            </span>
          )}
          {live.connected && (
            <span className="flex items-center gap-1 text-2xs font-medium text-success-ink" title="Changes sync live">
              <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
              Live
            </span>
          )}
          <span className={cn('text-2xs', saveState === 'error' ? 'text-error-ink' : 'text-ink-3')} aria-live="polite">
            {saveState === 'saving' ? 'Saving…' : saveState === 'pending' ? 'Editing…' : saveState === 'error' ? 'Not saved: retrying on your next edit' : 'Saved'}
          </span>
        </span>

        {!note.protected && members.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSharing((value) => !value)}
              aria-expanded={sharing}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium',
                note.memberIds.length ? 'border-primary/40 bg-primary-light text-primary-ink' : 'border-line-strong text-ink-2 hover:text-ink',
              )}
              title="Collaborators"
            >
              <Users size={14} aria-hidden />
              {note.memberIds.length ? note.memberIds.length : 'Share'}
            </button>
            {sharing && (
              <>
                <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={() => setSharing(false)} aria-label="Close sharing" />
                <div className="neo-popover animate-pop absolute top-10 right-0 z-30 w-[min(340px,calc(100vw-2rem))] rounded-xl p-3">
                  <p className="text-sm font-semibold text-ink">Collaborators</p>
                  <p className="mb-3 text-2xs text-ink-2">
                    {owner ? 'People you add can read and edit this note with you in real time.' : `Shared by ${ownerName}. Everyone here edits together.`}
                  </p>
                  {owner ? (
                    <PeoplePicker
                      members={members.filter((member) => member.id !== user.id)}
                      value={note.memberIds}
                      label="Collaborators"
                      placeholder="Add people"
                      onChange={(ids) =>
                        share.mutate({
                          id: note.id,
                          add: ids.filter((id) => !note.memberIds.includes(id)),
                          remove: note.memberIds.filter((id) => !ids.includes(id)),
                        })
                      }
                    />
                  ) : (
                    <button type="button" onClick={() => setConfirm('leave')} className="mt-1 flex items-center gap-1.5 text-xs font-medium text-error-ink hover:underline">
                      <LogOut size={13} aria-hidden /> Leave note
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {owner && (
          <button
            type="button"
            onClick={toggleProtection}
            disabled={protecting}
            className={cn('grid size-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-50', note.protected ? 'text-warning-ink' : 'text-ink-2')}
            aria-label={note.protected ? 'Remove protection' : 'Protect with PIN'}
            title={note.protected ? 'Remove protection' : 'Protect with PIN'}
          >
            {note.protected ? <Unlock size={15} /> : <LockKeyhole size={15} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => update.mutate({ id: note.id, changes: { pinned: !note.pinned } })}
          className={cn('grid size-8 place-items-center rounded-lg hover:bg-surface-2', note.pinned ? 'text-primary-ink' : 'text-ink-2')}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin' : 'Pin to top'}
        >
          {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        {owner && (
          <button
            type="button"
            onClick={() => setConfirm('delete')}
            className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-error-light hover:text-error-ink"
            aria-label="Delete note"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-10 sm:px-8">
        <input
          ref={titleInput}
          value={title}
          onChange={(event) => queueTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === '/' && !title && root.current) {
              event.preventDefault()
              typeAtEnd(root.current, '/')
              return
            }
            if (event.key === 'Enter' || event.key === 'ArrowDown') {
              event.preventDefault()
              root.current?.focus()
            }
          }}
          maxLength={300}
          placeholder="Untitled"
          aria-label="Note title"
          className="w-full bg-transparent text-2xl font-bold tracking-tight text-ink outline-none placeholder:text-ink-3"
        />
        <div className="relative mt-3">
          {markers.map(({ peer, top, height }) => (
            <span key={peer.id} aria-hidden>
              <span className={cn('pointer-events-none absolute -left-3 w-[3px] rounded-full transition-[top,height] duration-200', color(peer.color).dot)} style={{ top, height }} />
              <span
                className={cn('pointer-events-none absolute -left-3 -translate-y-full rounded px-1 text-[10px] leading-4 font-semibold text-on-primary transition-[top] duration-200', color(peer.color).dot)}
                style={{ top }}
              >
                {peer.name.split(' ')[0]}
              </span>
            </span>
          ))}
          {empty && (
            <p className="pointer-events-none absolute top-0 left-0 text-sm text-ink-3">
              Type <kbd className="rounded border border-line-strong px-1 font-sans">/</kbd> for to-dos, headings, colors and more…
            </p>
          )}
          <div
            ref={root}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            tabIndex={0}
            data-note-editor
            aria-multiline="true"
            aria-label="Note"
            onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
            onInput={() => {
              tryShortcut()
              openMenuIfSlash()
              queueContent()
            }}
            onKeyDown={(event) => {
              if (menu && items.length) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  setActive((index) => (index + step + items.length) % items.length)
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  runCommand(items[Math.min(active, items.length - 1)])
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setMenu(null)
                  return
                }
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                // A new to-do item starts unticked (browsers copy the ticked state).
                window.setTimeout(() => {
                  const editor = root.current
                  const item = editor && blockAtCaret(editor)
                  if (item?.tagName === 'LI' && item.closest('ul[data-type="todo"]')) item.setAttribute('data-checked', 'false')
                }, 0)
              }
            }}
            onKeyUp={reportCaret}
            onClick={reportCaret}
            onMouseDown={(event) => {
              // Clicking a to-do's box (the area left of its text) ticks it.
              const item = (event.target as HTMLElement).closest?.('li')
              if (!item || !item.closest('ul[data-type="todo"]')) return
              if (event.clientX - item.getBoundingClientRect().left > 22) return
              event.preventDefault()
              item.setAttribute('data-checked', item.getAttribute('data-checked') === 'true' ? 'false' : 'true')
              queueContent()
            }}
            onPaste={(event) => {
              const html = event.clipboardData.getData('text/html')
              if (!html) return
              event.preventDefault()
              document.execCommand('insertHTML', false, sanitizeHtml(html))
              queueContent()
            }}
            onBlur={() => {
              window.setTimeout(() => setMenu(null), 150)
              live.setActiveBlock(null)
              void flush()
            }}
            className="rich-content min-h-[50vh] text-[15px] leading-7 text-ink outline-none"
          />
        </div>
      </div>

      {menu &&
        items.length > 0 &&
        createPortal(
          <div role="listbox" aria-label="Commands" style={{ top: menu.top, left: menu.left }} className="neo-popover animate-pop fixed z-[80] max-h-[320px] w-[268px] overflow-y-auto rounded-xl p-1.5">
            {items.map((command, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                key={command.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => runCommand(command)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', index === active && 'bg-surface-2')}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-2">
                  {command.swatch ? (
                    <span className="rich-content text-sm font-bold">
                      <span className={command.swatch}>A</span>
                    </span>
                  ) : (
                    <command.icon size={15} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-ui font-medium text-ink">{command.label}</span>
                  <span className="block truncate text-2xs text-ink-3">
                    /{command.id} · {command.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}

      {confirm && (
        <ConfirmDialog
          title={confirm === 'delete' ? 'Delete this note?' : 'Leave this note?'}
          message={confirm === 'delete' ? (note.memberIds.length ? 'It is deleted for everyone it is shared with. This cannot be undone.' : 'This cannot be undone.') : 'You will no longer see it.'}
          confirmLabel={confirm === 'delete' ? 'Delete' : 'Leave'}
          busy={remove.isPending || share.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            window.clearTimeout(contentTimer.current)
            window.clearTimeout(titleTimer.current)
            pending.current = {}
            if (confirm === 'delete') await remove.mutateAsync(note.id)
            else await share.mutateAsync({ id: note.id, add: [], remove: [user.id] })
            setConfirm(null)
            onDeleted()
          }}
        />
      )}
    </div>
  )
}
