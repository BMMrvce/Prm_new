'use client'

import { Archive, ArchiveRestore, ArrowRight, ChevronDown, GraduationCap, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import type { Workspace } from '@/core/types'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import type { Category } from '@/modules/categories/queries'
import { LEARNING_STAGES, nextStage } from '@/modules/growth/logic'
import { Linkified } from '@/modules/growth/linkified'
import type { LearningTopic } from '@/modules/growth/types'
import { CategoryChip, ProgressBar, useCategoryMap } from '@/modules/growth/ui'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { Select } from '@/ui/field'
import { Menu, type MenuItem } from '@/ui/menu'
import { EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { PageSkeleton } from '@/ui/spinner'
import { errorMessage } from '@/ui/toast'
import { useDeleteTopic, useLearningTopics, useUpdateTopic } from './queries'
import { TopicDialog } from './topic-dialog'

export function LearningPage() {
  return (
    <ModuleGate id="learning">
      <Learning />
    </ModuleGate>
  )
}

function Learning() {
  const workspace = useCurrentWorkspace()
  const writable = canWrite(workspace)
  const topics = useLearningTopics(workspace.id)
  const categories = useCategoryMap(workspace.id, 'learning')
  const [editing, setEditing] = useState<LearningTopic | null | undefined>(undefined)
  const [area, setArea] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const list = useMemo(() => topics.data ?? [], [topics.data])
  const active = useMemo(() => list.filter((topic) => !topic.archivedAt && (!area || topic.categoryId === area)), [list, area])
  const archived = list.filter((topic) => topic.archivedAt)
  const mastered = active.filter((topic) => topic.status === 'mastered').length

  return (
    <>
      <PageHeader
        title="Learning"
        description="Topics you are learning, from first look to mastery."
        actions={
          writable && (
            <Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing(null)}>
              New topic
            </Button>
          )
        }
      />
      {topics.error ? (
        <ErrorNotice message={errorMessage(topics.error)} onRetry={() => topics.refetch()} />
      ) : topics.isPending ? (
        <PageSkeleton rows={4} />
      ) : !list.length ? (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={GraduationCap}
            title="Nothing to learn yet?"
            hint="Add a topic, keep its links and notes together, and move it along: learning, practised, mastered."
            action={
              writable && (
                <Button variant="primary" onClick={() => setEditing(null)}>
                  Add a topic
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-48 flex-1 items-center gap-3">
              <ProgressBar value={active.length ? (mastered / active.length) * 100 : 0} label="Share of topics mastered" className="max-w-72 flex-1" tone="bg-success" />
              <span className="text-xs text-ink-2">
                {mastered} of {active.length} mastered
              </span>
            </div>
            {categories.list.length > 0 && (
              <Select aria-label="Filter by area" value={area} onChange={(event) => setArea(event.target.value)} className="h-8 w-auto text-xs">
                <option value="">All areas</option>
                {categories.list.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {LEARNING_STAGES.map((stage) => {
              const items = active.filter((topic) => topic.status === stage.key)
              return (
                <section key={stage.key} aria-label={stage.label} className="rounded-xl bg-surface-2/60 p-2">
                  <header className="px-1.5 pt-1 pb-2">
                    <h2 className="flex items-center gap-2 text-ui font-semibold text-ink">
                      {stage.label}
                      <span className="rounded bg-surface-3 px-1 text-2xs font-medium text-ink-2">{items.length}</span>
                    </h2>
                    <p className="text-2xs text-ink-3">{stage.hint}</p>
                  </header>
                  <ul className="space-y-2">
                    {items.map((topic) => (
                      <TopicCard key={topic.id} workspace={workspace} topic={topic} category={topic.categoryId ? categories.byId.get(topic.categoryId) : undefined} onEdit={() => setEditing(topic)} />
                    ))}
                    {!items.length && <li className="px-1.5 py-3 text-2xs text-ink-3">Nothing here.</li>}
                  </ul>
                </section>
              )
            })}
          </div>
          {archived.length > 0 && (
            <section>
              <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)} className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
                <ChevronDown size={14} aria-hidden className={cn('transition-transform', !showArchived && '-rotate-90')} />
                Archived ({archived.length})
              </button>
              {showArchived && (
                <ul className="animate-reveal mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {archived.map((topic) => (
                    <TopicCard key={topic.id} workspace={workspace} topic={topic} category={topic.categoryId ? categories.byId.get(topic.categoryId) : undefined} onEdit={() => setEditing(topic)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
      {editing !== undefined && <TopicDialog key={editing?.id ?? 'new'} workspace={workspace} topic={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}

function TopicCard({ workspace, topic, category, onEdit }: { workspace: Workspace; topic: LearningTopic; category: Category | undefined; onEdit: () => void }) {
  const writable = canWrite(workspace)
  const update = useUpdateTopic(workspace.id)
  const remove = useDeleteTopic(workspace.id)
  const [confirming, setConfirming] = useState(false)
  const [open, setOpen] = useState(false)
  const next = nextStage(topic.status)
  const items: MenuItem[] = [
    { label: 'Edit', icon: <Pencil size={14} />, onSelect: onEdit },
    { heading: 'Move to' },
    ...LEARNING_STAGES.filter((stage) => stage.key !== topic.status).map((stage) => ({ label: stage.label, onSelect: () => update.mutate({ id: topic.id, status: stage.key }) })),
    'separator',
    topic.archivedAt
      ? { label: 'Restore', icon: <ArchiveRestore size={14} />, onSelect: () => update.mutate({ id: topic.id, archived: false }) }
      : { label: 'Archive', icon: <Archive size={14} />, onSelect: () => update.mutate({ id: topic.id, archived: true }) },
    { label: 'Delete…', icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirming(true) },
  ]

  return (
    <li className="animate-row neo-card rounded-lg p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ui font-medium text-ink">{topic.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <CategoryChip category={category} />
          </div>
        </div>
        {writable && (
          <Menu
            label={`${topic.title} actions`}
            trigger={(props) => (
              <IconButton {...props} size="sm" label={`More for ${topic.title}`}>
                <MoreHorizontal size={15} />
              </IconButton>
            )}
            items={items}
          />
        )}
      </div>
      {(topic.resources || topic.notes) && (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-2 flex items-center gap-1 text-2xs font-medium text-ink-2 hover:text-ink">
            <ChevronDown size={12} aria-hidden className={cn('transition-transform', !open && '-rotate-90')} />
            Resources and notes
          </button>
          {open && (
            <div className="animate-reveal mt-2 space-y-2 text-xs whitespace-pre-line text-ink-2">
              {topic.resources && <Linkified text={topic.resources} />}
              {topic.notes && <p className="border-t border-line-soft pt-2">{topic.notes}</p>}
            </div>
          )}
        </>
      )}
      {writable && next && !topic.archivedAt && (
        <Button size="sm" variant="ghost" className="mt-2 -ml-1" icon={<ArrowRight size={13} aria-hidden />} onClick={() => update.mutate({ id: topic.id, status: next })}>
          {LEARNING_STAGES.find((stage) => stage.key === next)?.label}
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this topic?"
          message={`“${topic.title}” and its notes will be deleted.`}
          busy={remove.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate(topic.id, { onSuccess: () => setConfirming(false) })}
        />
      )}
    </li>
  )
}
