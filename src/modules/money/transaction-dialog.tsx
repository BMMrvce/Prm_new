'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { Tabs } from '@/ui/tabs'
import { toast } from '@/ui/toast'
import { parseAmount, type TransactionKind } from './logic'
import { today, useSaveTransaction, type Transaction } from './queries'
import { categoriesFor, KIND_LABEL, NoCategoriesHint, type MoneyContext } from './shared'

type EntryKind = Exclude<TransactionKind, 'reimbursement'>

const PAYMENT_SUGGESTIONS = ['Cash', 'Card', 'Bank transfer', 'UPI', 'Wallet']

/** Kinds this workspace records, from the Money module's "Show" option. */
export function entryKinds(context: MoneyContext): EntryKind[] {
  const kinds: EntryKind[] = []
  if (context.features.has('expenses')) kinds.push('expense')
  if (context.features.has('income')) kinds.push('income')
  if (kinds.length) kinds.push('transfer')
  return kinds
}

/** Add or edit an expense, income or transfer. The kind of a saved record cannot change. */
export function TransactionDialog({
  context,
  transaction,
  initialKind,
  onClose,
}: {
  context: MoneyContext
  transaction?: Transaction
  initialKind?: EntryKind
  onClose: () => void
}) {
  const save = useSaveTransaction(context.workspace.id)
  const kinds = entryKinds(context)
  const [kind, setKind] = useState<EntryKind>((transaction?.kind as EntryKind) ?? initialKind ?? kinds[0] ?? 'expense')
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [occurredOn, setOccurredOn] = useState(transaction?.occurredOn ?? today())
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [paymentMethod, setPaymentMethod] = useState(transaction?.paymentMethod ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const categories = categoriesFor(context, kind)
  // Keep an archived category selectable on records that already use it.
  const current = transaction?.categoryId ? context.categoryById.get(transaction.categoryId) : undefined
  const options = current && !categories.some((category) => category.id === current.id) ? [...categories, current] : categories
  const currency = transaction?.currency ?? context.currency

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = parseAmount(amount)
    if (!description.trim()) return setError('Add a short description.')
    if (value === null) return setError('Enter an amount above zero.')
    if (!occurredOn) return setError('Pick a date.')
    setError(null)
    await save.mutateAsync({
      id: transaction?.id,
      kind,
      description,
      amount: value,
      currency,
      occurredOn,
      categoryId: kind === 'transfer' ? null : categoryId || null,
      paymentMethod,
      note,
      receiptPath: transaction?.receiptPath ?? null,
    })
    toast.success(transaction ? 'Saved' : `${KIND_LABEL[kind]} added`)
    onClose()
  }

  return (
    <Dialog
      title={transaction ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : 'Add a transaction'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" variant="primary" loading={save.isPending}>
            {transaction ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={submit} className="space-y-4" noValidate>
        {!transaction && kinds.length > 1 && (
          <Tabs
            label="Type"
            value={kind}
            onChange={(value) => {
              setKind(value)
              setCategoryId('')
            }}
            items={kinds.map((value) => ({ value, label: KIND_LABEL[value] }))}
          />
        )}
        <Field label="Description">
          {(props) => <Input {...props} autoFocus value={description} maxLength={240} placeholder="What was it for?" onChange={(event) => setDescription(event.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount (${currency})`}>
            {(props) => <Input {...props} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />}
          </Field>
          <Field label="Date">{(props) => <Input {...props} type="date" value={occurredOn} max="9999-12-31" onChange={(event) => setOccurredOn(event.target.value)} />}</Field>
        </div>
        {kind !== 'transfer' &&
          (options.length ? (
            <Field label="Category" optional>
              {(props) => (
                <Select {...props} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Uncategorised</option>
                  {options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <NoCategoriesHint scope={kind === 'income' ? 'income' : 'expense'} />
          ))}
        <Field label="Payment method" optional>
          {(props) => (
            <>
              <Input {...props} list="payment-methods" value={paymentMethod} maxLength={40} onChange={(event) => setPaymentMethod(event.target.value)} />
              <datalist id="payment-methods">
                {PAYMENT_SUGGESTIONS.map((method) => (
                  <option key={method} value={method} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Note" optional>
          {(props) => <Textarea {...props} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />}
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
