'use client'

import { Check, CircleDollarSign, FileCheck2, MoreHorizontal, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useUser } from '@/core/session'
import { canAdmin, useMembers } from '@/core/workspaces'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { ConfirmDialog } from '@/ui/dialog'
import { Menu } from '@/ui/menu'
import { Avatar, EmptyState, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { errorMessage, toast } from '@/ui/toast'
import { ClaimDialog } from './claim-dialog'
import { monthKey, round, shiftMonth, type ClaimStatus } from './logic'
import { openReceipt, useClaimsToReview, useDeleteTransaction, useMyClaims, useReviewClaim, type Transaction } from './queries'
import { CategoryLabel, formatDay, Stat, type MoneyContext } from './shared'

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning-light text-warning-ink' },
  approved: { label: 'Approved', className: 'bg-info-light text-info-ink' },
  rejected: { label: 'Rejected', className: 'bg-error-light text-error-ink' },
  paid: { label: 'Paid', className: 'bg-success-light text-success-ink' },
}

function StatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, className: 'bg-surface-2 text-ink-2' }
  return <span className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-medium', entry.className)}>{entry.label}</span>
}

const showReceipt = (path: string) => openReceipt(path).catch((error) => toast.error(errorMessage(error)))

export function ClaimsTab({ context }: { context: MoneyContext }) {
  const admin = canAdmin(context.workspace)
  const [view, setView] = useState<'mine' | 'review'>('mine')
  const review = useClaimsToReview(context.workspace.id, 'open', admin)
  return (
    <div className="space-y-4">
      {admin && (
        <Tabs
          label="Claims"
          value={view}
          onChange={setView}
          items={[
            { value: 'mine', label: 'My claims' },
            { value: 'review', label: 'To review', count: review.data?.filter((claim) => claim.status === 'pending').length },
          ]}
        />
      )}
      {view === 'review' && admin ? <ReviewList context={context} /> : <MyClaims context={context} />}
    </div>
  )
}

function MyClaims({ context }: { context: MoneyContext }) {
  const [since] = useState(() => `${shiftMonth(monthKey(), -11)}-01`)
  const { data, isPending, error, refetch } = useMyClaims(context.workspace.id, since)
  const remove = useDeleteTransaction(context.workspace.id)
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const totals = useMemo(() => {
    const sum = (status: ClaimStatus) => round((data ?? []).filter((claim) => claim.status === status && claim.currency === context.currency).reduce((total, claim) => total + claim.amount, 0))
    return { pending: sum('pending'), approved: sum('approved'), paid: sum('paid') }
  }, [data, context.currency])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-2">Claims from the last 12 months, plus any still open.</p>
        {context.writable && (
          <Button size="sm" variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
            Submit a claim
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Waiting for review" value={context.format(totals.pending)} />
        <Stat label="Approved, not yet paid" value={context.format(totals.approved)} />
        <Stat label="Paid back" value={context.format(totals.paid)} />
      </div>
      <section className="neo-card overflow-hidden rounded-xl">
        {error ? (
          <div className="p-4">
            <ErrorNotice message={error.message} onRetry={() => refetch()} />
          </div>
        ) : isPending ? (
          <ListSkeleton />
        ) : data?.length ? (
          <ul>
            {data.map((claim) => {
              const editable = context.writable && (claim.status === 'pending' || claim.status === 'rejected')
              return (
                <ClaimRow key={claim.id} claim={claim} context={context}>
                  {editable && (
                    <Menu
                      label={`Actions for ${claim.description}`}
                      items={[
                        { label: claim.status === 'rejected' ? 'Edit and resubmit' : 'Edit', icon: <Pencil size={14} />, onSelect: () => setEditing(claim) },
                        { label: 'Withdraw claim', icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(claim) },
                      ]}
                      trigger={(props) => (
                        <button {...props} type="button" aria-label={`Actions for ${claim.description}`} className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    />
                  )}
                </ClaimRow>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon={FileCheck2}
            title="No claims yet"
            hint="Spent your own money on work? Submit a claim with the receipt and an admin will review it."
            action={
              context.writable ? (
                <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
                  Submit a claim
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
      {editing && <ClaimDialog context={context} claim={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Withdraw this claim?"
          message={`“${deleting.description}” and its receipt will be deleted.`}
          confirmLabel="Withdraw"
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            remove.mutate(deleting, { onSuccess: () => toast.success('Claim withdrawn') })
            setDeleting(null)
          }}
        />
      )}
    </>
  )
}

function ReviewList({ context }: { context: MoneyContext }) {
  const user = useUser()
  const [scope, setScope] = useState<'open' | 'done'>('open')
  const { data, isPending, error, refetch } = useClaimsToReview(context.workspace.id, scope, true)
  const { data: members = [] } = useMembers(context.workspace.id)
  const reviewClaim = useReviewClaim(context.workspace.id)
  const [rejecting, setRejecting] = useState<Transaction | null>(null)
  const people = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])

  const decide = (claim: Transaction, status: ClaimStatus) =>
    reviewClaim.mutate({ id: claim.id, status }, { onSuccess: () => toast.success(status === 'paid' ? 'Marked as paid' : `Claim ${STATUS[status].label.toLowerCase()}`) })

  return (
    <>
      <Tabs
        label="Review queue"
        value={scope}
        onChange={setScope}
        items={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Settled (90 days)' },
        ]}
      />
      <section className="neo-card overflow-hidden rounded-xl">
        {error ? (
          <div className="p-4">
            <ErrorNotice message={error.message} onRetry={() => refetch()} />
          </div>
        ) : isPending ? (
          <ListSkeleton />
        ) : data?.length ? (
          <ul>
            {data.map((claim) => {
              const person = people.get(claim.userId)
              // The server refuses self-review too; this only hides buttons that would fail.
              const own = claim.userId === user.id
              return (
                <ClaimRow key={claim.id} claim={claim} context={context} person={person?.fullName ?? person?.email ?? 'Former member'} avatar={person?.avatarUrl}>
                  {!own && claim.status === 'pending' && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="subtle" icon={<Check size={14} aria-hidden />} onClick={() => decide(claim, 'approved')} aria-label={`Approve ${claim.description}`}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" icon={<X size={14} aria-hidden />} onClick={() => setRejecting(claim)} aria-label={`Reject ${claim.description}`}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {!own && claim.status === 'approved' && (
                    <Button size="sm" variant="subtle" icon={<CircleDollarSign size={14} aria-hidden />} onClick={() => decide(claim, 'paid')} aria-label={`Mark ${claim.description} as paid`}>
                      Mark paid
                    </Button>
                  )}
                </ClaimRow>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={FileCheck2} title={scope === 'open' ? 'Nothing to review' : 'Nothing settled recently'} hint={scope === 'open' ? 'New claims from members show up here.' : undefined} />
        )}
      </section>
      {rejecting && (
        <ConfirmDialog
          title="Reject this claim?"
          message={`${people.get(rejecting.userId)?.fullName ?? 'The member'} can edit “${rejecting.description}” and submit it again.`}
          confirmLabel="Reject"
          onClose={() => setRejecting(null)}
          onConfirm={() => {
            decide(rejecting, 'rejected')
            setRejecting(null)
          }}
        />
      )}
    </>
  )
}

function ClaimRow({ claim, context, person, avatar, children }: { claim: Transaction; context: MoneyContext; person?: string; avatar?: string | null; children?: ReactNode }) {
  const category = claim.categoryId ? context.categoryById.get(claim.categoryId) : undefined
  return (
    <li className="animate-row flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 last:border-b-0 sm:flex-nowrap">
      {person && <Avatar name={person} src={avatar} size={28} />}
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate text-ui text-ink">{claim.description}</span>
          <StatusBadge status={claim.status} />
        </p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-2xs text-ink-2">
          {person && <span className="font-medium text-ink">{person}</span>}
          <span>{formatDay(claim.occurredOn)}</span>
          <CategoryLabel category={category} />
          {claim.receiptPath && (
            <button type="button" onClick={() => showReceipt(claim.receiptPath!)} className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline">
              <Paperclip size={12} aria-hidden />
              Receipt
            </button>
          )}
        </p>
        {claim.note && <p className="mt-1 line-clamp-2 text-2xs text-ink-3">{claim.note}</p>}
      </div>
      <span className="text-ui font-semibold whitespace-nowrap text-ink tabular-nums">{claim.currency === context.currency ? context.format(claim.amount) : `${claim.currency} ${claim.amount.toFixed(2)}`}</span>
      {children}
    </li>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-label="Loading claims">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}
