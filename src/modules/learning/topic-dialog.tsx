'use client'

import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import { LEARNING_STAGES } from '@/modules/growth/logic'
import type { LearningStatus, LearningTopic } from '@/modules/growth/types'
import { CategoryField } from '@/modules/growth/ui'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { toast } from '@/ui/toast'
import { useSaveTopic } from './queries'

/** Add or edit a learning topic: stage, area, resources and notes. */
export function TopicDialog({ workspace, topic, onClose }: { workspace: Workspace; topic: LearningTopic | null; onClose: () => void }) {
  const save = useSaveTopic(workspace.id)
  const [title, setTitle] = useState(topic?.title ?? '')
  const [status, setStatus] = useState<LearningStatus>(topic?.status ?? 'not_started')
  const [categoryId, setCategoryId] = useState(topic?.categoryId ?? '')
  const [resources, setResources] = useState(topic?.resources ?? '')
  const [notes, setNotes] = useState(topic?.notes ?? '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    await save.mutateAsync({ id: topic?.id, input: { title, status, categoryId: categoryId || null, resources, notes } })
    toast.success(topic ? 'Topic saved' : 'Topic added')
    onClose()
  }

  return (
    <Dialog title={topic ? 'Edit topic' : 'New topic'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Topic">
          {(props) => <Input {...props} required autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Kubernetes networking" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage">
            {(props) => (
              <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as LearningStatus)}>
                {LEARNING_STAGES.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <CategoryField workspace={workspace} scope="learning" label="Area" value={categoryId} onChange={setCategoryId} />
        </div>
        <Field label="Resources" optional hint="Links, books or courses, one per line.">
          {(props) => <Textarea {...props} rows={3} maxLength={4000} value={resources} onChange={(event) => setResources(event.target.value)} />}
        </Field>
        <Field label="Notes and exercises" optional>
          {(props) => <Textarea {...props} rows={4} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim()}>
            {topic ? 'Save topic' : 'Add topic'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
