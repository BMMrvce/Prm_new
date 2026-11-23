'use client'

import { Download, Plus } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { canAdmin, useCurrentWorkspace, useMembers } from '@/core/workspaces'
import { toCsv, downloadCsv } from '@/lib/csv'
import { duration, localDate } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { addDays, startOfDay } from '@/modules/calendar/logic'
import { BarRows, ColumnChart, Legend, SERIES, StatTile } from '@/ui/charts'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'
import { Card, ErrorNotice, PageHeader } from '@/ui/misc'
import { PageSkeleton, Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { EntriesTable } from './entries-table'
import { EntryDialog } from './entry-dialog'
import { estimateRows, presetRange, RANGE_PRESETS, sumSeconds, timeBuckets, totalsBy, type RangePreset } from './logic'
import { useTaskTotals, useTimeEntries } from './queries'
import { StartTimerForm } from './timer-widget'

export function TimePage() {
  return (
    <ModuleGate id="time">
      <Suspense fallback={<PageSkeleton />}>
        <TimeReport />
      </Suspense>
    </ModuleGate>
  )
}

function TimeReport() {
  const now = useNow(60_000)
  if (!now) return <PageSkeleton />
  return <TimeBody now={now} />
}

const hours = (seconds: number) => seconds / 3600

function TimeBody({ now }: { now: number }) {
  const workspace = useCurrentWorkspace()
  const admin = canAdmin(workspace)
  const weekStart = workspace.settings.weekStart ?? 1
  const [preset, setPreset] = useState<RangePreset>('this-week')
  const [custom, setCustom] = useState(() => ({ from: localDate(addDays(new Date(now), -13)), to: localDate(new Date(now)) }))
  const [who, setWho] = useState<'me' | 'everyone'>('me')
  const [logging, setLogging] = useState(false)

  const { start, end } = useMemo(() => presetRange(preset, new Date(now), weekStart, custom), [preset, now, weekStart, custom])
  const entriesQuery = useTimeEntries(workspace.id, admin ? who : 'me', start, end)
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data])
  const { data: members = [] } = useMembers(workspace.id)
  const people = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const tick = useNow(1_000, entries.some((entry) => entry.state === 'running')) ?? now

  const total = sumSeconds(entries, tick)
  const elapsedDays = Math.max(1, Math.round((Math.min(end.getTime(), startOfDay(new Date(now)).getTime() + 86_400_000) - start.getTime()) / 86_400_000))
  const buckets = timeBuckets(entries, start, end, tick, weekStart)
  const chart = buckets.map((bucket) => ({
    label: bucket.unit === 'week' ? bucket.start.toLocaleDateString([], { day: 'numeric', month: 'short' }) : buckets.length <= 7 ? bucket.start.toLocaleDateString([], { weekday: 'short' }) : String(bucket.start.getDate()),
    detail: bucket.unit === 'week' ? `Week of ${bucket.start.toLocaleDateString([], { day: 'numeric', month: 'short' })}` : bucket.start.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }),
    values: [hours(bucket.seconds)],
  }))
  const byProject = totalsBy(entries, (entry) => entry.project?.name ?? 'No project', tick).slice(0, 8)
  const byTask = totalsBy(entries, (entry) => entry.task?.title ?? (entry.taskId ? 'Hidden task' : 'No task'), tick).slice(0, 8)

  const estimated = useMemo(() => {
    const map = new Map<string, { id: string; title: string; estimateMinutes: number | null }>()
    for (const entry of entries) if (entry.taskId && entry.task?.estimateMinutes) map.set(entry.taskId, { id: entry.taskId, title: entry.task.title, estimateMinutes: entry.task.estimateMinutes })
    return [...map.values()].slice(0, 100)
  }, [entries])
  const totals = useTaskTotals(estimated.map((task) => task.id).sort())
  const estimates = useMemo(() => {
    const logged = new Map<string, number>()
    for (const row of totals.data ?? []) logged.set(row.taskId, (logged.get(row.taskId) ?? 0) + sumSeconds([row], tick))
    return estimateRows(estimated, logged)
  }, [estimated, totals.data, tick])
  const estimateUse = estimates.length ? estimates.reduce((sum, row) => sum + row.loggedMinutes, 0) / estimates.reduce((sum, row) => sum + row.estimateMinutes, 0) : null

  const exportCsv = () => {
    const rows = [...entries].reverse().map((entry) => {
      const seconds = secondsRounded(sumSeconds([entry], tick))
      const person = people.get(entry.userId)
      return [
        localDate(new Date(entry.startedAt)),
        new Date(entry.startedAt).toLocaleTimeString(),
        entry.endedAt ? new Date(entry.endedAt).toLocaleTimeString() : '',
        person?.fullName ?? person?.email ?? '',
        entry.task ? `${workspace.taskPrefix}-${entry.task.number} ${entry.task.title}` : '',
        entry.project?.name ?? '',
        entry.description ?? '',
        String(Math.round(seconds / 60)),
        (seconds / 3600).toFixed(2),
      ]
    })
    downloadCsv(`time-${workspace.slug}-${localDate(start)}-${localDate(addDays(end, -1))}.csv`, toCsv(['Date', 'Start', 'End', 'Person', 'Task', 'Project', 'Note', 'Minutes', 'Hours'], rows))
  }

  return (
    <>
      <PageHeader
        title="Time"
        description={who === 'everyone' ? `Everyone's tracked time in ${workspace.name}.` : 'Your tracked time, estimates and logs.'}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Download size={14} aria-hidden />} onClick={exportCsv} disabled={!entries.length}>
              Export CSV
            </Button>
            {!workspace.archivedAt && (
              <Button variant="primary" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setLogging(true)}>
                Log time
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs label="Range" items={RANGE_PRESETS} value={preset} onChange={setPreset} />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From" value={custom.from} onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} className="h-8 w-40 text-xs" />
            <span className="text-xs text-ink-3">to</span>
            <Input type="date" aria-label="To" value={custom.to} onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} className="h-8 w-40 text-xs" />
          </div>
        )}
        {admin && (
          <Tabs
            label="Whose time"
            items={[
              { value: 'me', label: 'Me' },
              { value: 'everyone', label: 'Everyone' },
            ]}
            value={who}
            onChange={setWho}
            className="ml-auto"
          />
        )}
      </div>

      {entriesQuery.error ? (
        <ErrorNotice title="Could not load time entries" message={entriesQuery.error.message} onRetry={() => void entriesQuery.refetch()} />
      ) : entriesQuery.isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading time">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="animate-reveal space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total" value={duration(total / 60)} note={`${localDate(start)} – ${localDate(addDays(end, -1))}`} />
            <StatTile label="Daily average" value={duration(total / 60 / elapsedDays)} note={`over ${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'}`} />
            <StatTile label="Entries" value={String(entries.length)} />
            <StatTile
              label="Estimates used"
              value={estimateUse === null ? '—' : `${Math.round(estimateUse * 100)}%`}
              note={estimateUse === null ? 'No estimated tasks in range' : estimateUse > 1 ? 'Tasks take longer than estimated' : 'Within estimates so far'}
            />
          </div>

          <Card title={buckets[0]?.unit === 'week' ? 'Hours per week' : 'Hours per day'}>
            <ColumnChart
              label="Hours tracked"
              data={chart}
              series={[{ name: 'Tracked', color: SERIES[0] }]}
              format={(value) => duration(value * 60)}
              axisFormat={(value) => `${value}h`}
              labelEvery={chart.length > 16 ? Math.ceil(chart.length / 12) : 1}
            />
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="By project">
              {byProject.length ? (
                <BarRows rows={byProject.map((row) => ({ label: row.key, values: [row.seconds / 60] }))} series={[{ name: 'Tracked', color: SERIES[0] }]} format={duration} />
              ) : (
                <p className="text-xs text-ink-3">No time tracked in this range.</p>
              )}
            </Card>
            <Card title="By task">
              {byTask.length ? (
                <BarRows rows={byTask.map((row) => ({ label: row.key, values: [row.seconds / 60] }))} series={[{ name: 'Tracked', color: SERIES[0] }]} format={duration} />
              ) : (
                <p className="text-xs text-ink-3">No time tracked in this range.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card
              title="Estimate vs actual"
              description="Tasks with an estimate worked on in this range; logged time is all time, by everyone you can see."
              actions={<Legend series={[{ name: 'Logged', color: SERIES[0] }, { name: 'Estimate', color: SERIES[1] }]} />}
            >
              {totals.isPending && estimated.length ? (
                <Skeleton className="h-24" />
              ) : estimates.length ? (
                <EstimateTable rows={estimates} />
              ) : (
                <p className="text-xs text-ink-3">Add an estimate to a task and track time on it to compare them here.</p>
              )}
            </Card>
            {!workspace.archivedAt && (
              <Card title="Start a timer">
                <StartTimerForm scope={workspace.id} />
              </Card>
            )}
          </div>

          <Card title={who === 'everyone' ? 'All entries' : 'My entries'}>
            <EntriesTable workspace={workspace} entries={entries} people={people} now={tick} showPeople={who === 'everyone'} />
          </Card>
        </div>
      )}

      {logging && <EntryDialog workspace={workspace} onClose={() => setLogging(false)} />}
    </>
  )
}

const secondsRounded = (seconds: number) => Math.round(seconds)

function EstimateTable({ rows }: { rows: ReturnType<typeof estimateRows> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-ui">
        <caption className="sr-only">Estimate against time logged per task</caption>
        <thead>
          <tr className="border-b border-line text-left text-2xs tracking-wide text-ink-3 uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">Task</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Estimate</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Logged</th>
            <th scope="col" className="w-32 py-2 font-medium">
              <span className="sr-only">Progress</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.slice(0, 20).map((row) => (
            <tr key={row.id} className="animate-row">
              <td className="max-w-0 truncate py-2 pr-3 font-medium text-ink">{row.title}</td>
              <td className="py-2 pr-3 text-right text-ink-2 tabular-nums">{duration(row.estimateMinutes)}</td>
              <td className={row.ratio > 1 ? 'py-2 pr-3 text-right font-semibold text-warning-ink tabular-nums' : 'py-2 pr-3 text-right font-semibold tabular-nums'}>
                {duration(row.loggedMinutes)}
                <span className="sr-only">{row.ratio > 1 ? `, ${duration(row.differenceMinutes)} over` : `, ${duration(-row.differenceMinutes)} left`}</span>
              </td>
              <td className="py-2" aria-hidden>
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
                  <div className={row.ratio > 1 ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-primary'} style={{ width: `${Math.min(100, row.ratio * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
