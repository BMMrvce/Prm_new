'use client'

import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import type { Goal, GoalStatus } from '@/modules/growth/types'
import { CategoryField } from '@/modules/growth/ui'
import { Button } from '@/ui/button'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { toast } from '@/ui/toast'
import { useDeleteGoal, useSaveGoal } from './queries'

/** Add or edit a goal. A new goal can start with a list of milestones, one per line. */
export function GoalDialog({ workspace, goal, onClose }: { workspace: Workspace; goal: Goal | null; onClose: () => void }) {
  const save = useSaveGoal(workspace.id)
  const remove = useDeleteGoal(workspace.id)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'active')
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [notes, setNotes] = useState(goal?.notes ?? '')
  const [milestones, setMilestones] = useState('')
  const [confirming, setConfirming] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    await save.mutateAsync({
      goal: goal ?? undefined,
      input: { title, status, categoryId: categoryId || null, targetDate: targetDate || null, notes },
      milestones: milestones.split('\n'),
    })
    toast.success(goal ? 'Goal saved' : 'Goal added')
    onClose()
  }

  return (
    <Dialog title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Goal">
          {(props) => <Input {...props} required autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Run a half marathon" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            {(props) => (
              <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as GoalStatus)}>
                <option value="active">Active</option>
                <option value="completed">Achieved</option>
                <option value="abandoned">Dropped</option>
              </Select>
            )}
          </Field>
          <Field label="Target date" optional>
            {(props) => <Input {...props} type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />}
          </Field>
          <CategoryField workspace={workspace} scope="goal" label="Area" value={categoryId} onChange={setCategoryId} />
        </div>
        {!goal && (
          <Field label="Milestones" optional hint="One per line. Progress is the share of milestones done.">
            {(props) => <Textarea {...props} rows={4} value={milestones} onChange={(event) => setMilestones(event.target.value)} />}
          </Field>
        )}
        <Field label="Notes" optional>
          {(props) => <Textarea {...props} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Why it matters, how you will know" />}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
          {goal ? (
            <Button variant="ghost" className="text-error-ink" onClick={() => setConfirming(true)}>
              Delete goal
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim()}>
              {goal ? 'Save goal' : 'Add goal'}
            </Button>
          </div>
        </div>
      </form>
      {confirming && goal && (
        <ConfirmDialog
          title="Delete this goal?"
          message={`“${goal.title}” and its milestones will be deleted.`}
          busy={remove.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate(goal.id, { onSuccess: onClose })}
        />
      )}
    </Dialog>
  )
}
