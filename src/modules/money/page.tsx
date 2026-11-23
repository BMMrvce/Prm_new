'use client'

import { Settings2, Wallet } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { workspaceHref } from '@/core/routes'
import { canAdmin } from '@/core/workspaces'
import { ButtonLink } from '@/ui/button'
import { EmptyState, PageHeader } from '@/ui/misc'
import { TabPanel, Tabs } from '@/ui/tabs'
import { BudgetsTab } from './budgets'
import { ClaimsTab } from './claims'
import { monthKey } from './logic'
import { OverviewTab, type OverviewLinks } from './overview'
import { RecurringTab } from './recurring'
import { SavingsTab } from './savings'
import { useMoney, type MoneyContext } from './shared'
import { defaultFilters, TransactionsTab, type TransactionFilters } from './transactions'

type Tab = 'overview' | 'transactions' | 'claims' | 'budgets' | 'savings' | 'recurring'

/** The tabs this workspace shows, from the Money module's "Show" option. */
function tabsFor({ features }: MoneyContext) {
  const records = features.has('expenses') || features.has('income')
  const tabs: { value: Tab; label: string }[] = []
  if (records || features.has('budgets')) tabs.push({ value: 'overview', label: 'Overview' })
  if (records) tabs.push({ value: 'transactions', label: 'Transactions' })
  if (features.has('claims')) tabs.push({ value: 'claims', label: 'Claims' })
  if (features.has('budgets')) tabs.push({ value: 'budgets', label: 'Budget' })
  if (features.has('savings')) tabs.push({ value: 'savings', label: 'Savings' })
  if (features.has('recurring')) tabs.push({ value: 'recurring', label: 'Recurring' })
  return tabs
}

export function MoneyPage() {
  return (
    <ModuleGate id="money">
      <MoneyScreen />
    </ModuleGate>
  )
}

function MoneyScreen() {
  const context = useMoney()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [month, setMonth] = useState(() => monthKey())
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters)

  const tabs = tabsFor(context)
  const requested = params.get('tab') as Tab | null
  const tab = tabs.find((entry) => entry.value === requested)?.value ?? tabs[0]?.value
  const select = (value: Tab) => router.replace(`${pathname}?tab=${value}`, { scroll: false })

  const links: OverviewLinks = {
    transactions: ({ kind, categoryId }) => {
      setFilters({ ...defaultFilters(), month, kind: kind ?? 'all', categoryId: categoryId ?? '' })
      select('transactions')
    },
    tab: select,
  }

  const description =
    context.features.has('claims') && tabs.length === 1
      ? 'Claim back what you spend for work. Workspace admins review claims.'
      : context.features.has('claims')
        ? `Amounts in ${context.currency}. Admins see your claims; everything else is only yours.`
        : `Amounts in ${context.currency}. Only you can see your money records.`

  if (!tab) {
    return (
      <>
        <PageHeader title="Money" />
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={Wallet}
            title="Nothing is switched on in Money yet"
            hint="Choose what this workspace tracks: expenses, income, claims, budgets, savings or recurring payments."
            action={
              canAdmin(context.workspace) ? (
                <ButtonLink href={`${workspaceHref(context.workspace.slug, 'settings')}?tab=modules`} variant="primary" icon={<Settings2 size={15} aria-hidden />}>
                  Open module settings
                </ButtonLink>
              ) : (
                <p className="text-xs text-ink-3">Ask a workspace admin to choose what Money shows.</p>
              )
            }
          />
        </div>
      </>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Money" description={description} />
      {tabs.length > 1 && <Tabs label="Money sections" items={tabs} value={tab} onChange={select} idBase="money" className="mb-5" />}
      <Panel single={tabs.length === 1} tab={tab}>
        {tab === 'overview' && <OverviewTab context={context} month={month} onMonth={setMonth} links={links} />}
        {tab === 'transactions' && <TransactionsTab context={context} filters={filters} onFilters={setFilters} />}
        {tab === 'claims' && <ClaimsTab context={context} />}
        {tab === 'budgets' && (
          <BudgetsTab context={context} month={month} onMonth={setMonth} onSelectCategory={(categoryId) => links.transactions({ kind: 'expense', categoryId })} />
        )}
        {tab === 'savings' && <SavingsTab context={context} />}
        {tab === 'recurring' && <RecurringTab context={context} />}
      </Panel>
    </div>
  )
}

function Panel({ single, tab, children }: { single: boolean; tab: Tab; children: ReactNode }) {
  // A lone section has no tab list to label it, so it is a plain region.
  if (single) return <div className="animate-reveal">{children}</div>
  return (
    <TabPanel idBase="money" value={tab} className="animate-reveal" key={tab}>
      {children}
    </TabPanel>
  )
}
