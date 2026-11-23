'use client'

import { Paperclip, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button, IconButton } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { errorMessage, toast } from '@/ui/toast'
import { parseAmount } from './logic'
import { RECEIPT_TYPES, receiptProblem, removeReceipt, today, uploadReceipt, useSaveTransaction, type Transaction } from './queries'
import { categoriesFor, NoCategoriesHint, type MoneyContext } from './shared'

/** Submit a reimbursement claim, or edit one that is pending or was rejected (which resubmits it). */
export function ClaimDialog({ context, claim, onClose }: { context: MoneyContext; claim?: Transaction; onClose: () => void }) {
  const save = useSaveTransaction(context.workspace.id)
  const fileInput = useRef<HTMLInputElement>(null)
  const [description, setDescription] = useState(claim?.description ?? '')
  const [amount, setAmount] = useState(claim ? String(claim.amount) : '')
  const [occurredOn, setOccurredOn] = useState(claim?.occurredOn ?? today())
  const [categoryId, setCategoryId] = useState(claim?.categoryId ?? '')
  const [note, setNote] = useState(claim?.note ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [keepReceipt, setKeepReceipt] = useState(Boolean(claim?.receiptPath))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = categoriesFor(context, 'expense')
  const currency = claim?.currency ?? context.currency

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (!description.trim()) return setError('Say what the claim is for.')
    if (value === null) return setError('Enter an amount above zero.')
    if (!occurredOn) return setError('Pick the date of the expense.')
    setError(null)

    let uploaded: string | null = null
    let stage: 'upload' | 'save' = 'upload'
    try {
      if (file) {
        setUploading(true)
        uploaded = await uploadReceipt(context.workspace.id, file)
      }
      stage = 'save'
      const nextReceipt = uploaded ?? (keepReceipt ? claim?.receiptPath ?? null : null)
      await save.mutateAsync({
        id: claim?.id,
        kind: 'reimbursement',
        description,
        amount: value,
        currency,
        occurredOn,
        categoryId: categoryId || null,
        note,
        receiptPath: nextReceipt,
      })
      // The old file is no longer referenced once the claim points elsewhere.
      if (claim?.receiptPath && claim.receiptPath !== nextReceipt) void removeReceipt(claim.receiptPath)
      toast.success(claim ? (claim.status === 'rejected' ? 'Claim resubmitted' : 'Claim updated') : 'Claim submitted for review')
      onClose()
    } catch (caught) {
      if (uploaded) void removeReceipt(uploaded)
      // Save errors are already reported by the mutation cache; upload errors are not.
      if (stage === 'upload') setError(`The receipt could not be uploaded. ${errorMessage(caught)}`)
    } finally {
      setUploading(false)
    }
  }

  const pick = (picked: File | undefined) => {
    if (!picked) return
    const problem = receiptProblem(picked)
    if (problem) {
      setError(problem)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setError(null)
    setFile(picked)
  }

  return (
    <Dialog
      title={claim ? 'Edit claim' : 'Submit a claim'}
      description={claim?.status === 'rejected' ? 'Saving sends it back for review.' : 'Workspace admins review claims. You can edit it until it is reviewed.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="claim-form" variant="primary" loading={uploading || save.isPending}>
            {claim ? (claim.status === 'rejected' ? 'Resubmit' : 'Save') : 'Submit claim'}
          </Button>
        </>
      }
    >
      <form id="claim-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="What was it for?">
          {(props) => <Input {...props} autoFocus value={description} maxLength={240} placeholder="Taxi to client office" onChange={(event) => setDescription(event.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount (${currency})`}>
            {(props) => <Input {...props} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />}
          </Field>
          <Field label="Date of expense">{(props) => <Input {...props} type="date" value={occurredOn} max={today()} onChange={(event) => setOccurredOn(event.target.value)} />}</Field>
        </div>
        {categories.length ? (
          <Field label="Category" optional>
            {(props) => (
              <Select {...props} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <NoCategoriesHint scope="expense" />
        )}
        <Field label="Note for the reviewer" optional>
          {(props) => <Textarea {...props} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />}
        </Field>
        <Field label="Receipt" optional hint="PNG, JPEG, WebP, HEIC or PDF, up to 10 MB. Stored in this workspace's private files.">
          {(props) => (
            <div className="space-y-2">
              {(file || keepReceipt) && (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-ui">
                  <Paperclip size={14} className="shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Current receipt'}</span>
                  <IconButton
                    label="Remove receipt"
                    size="sm"
                    onClick={() => {
                      setFile(null)
                      setKeepReceipt(false)
                      if (fileInput.current) fileInput.current.value = ''
                    }}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              )}
              <input
                {...props}
                ref={fileInput}
                type="file"
                accept={RECEIPT_TYPES}
                onChange={(event) => pick(event.target.files?.[0])}
                className="block w-full text-xs text-ink-2 file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-xs file:font-medium file:text-ink hover:file:bg-surface-2"
              />
            </div>
          )}
        </Field>
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
