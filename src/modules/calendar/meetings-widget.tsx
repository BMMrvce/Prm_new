'use client'

import { CalendarDays, Video } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { ALL_HREF, workspaceHref } from '@/core/routes'
import { useWorkspaces } from '@/core/workspaces'
import { localDate, timeOfDay } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetAdd, WidgetFrame } from '@/modules/dashboard/widget-frame'
import { usePathname } from 'next/navigation'
import { createAndReturn } from '@/core/return-to'
import { cn } from '@/ui/cn'
import { ErrorNotice, IconTile } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { meetingTone } from './calendar-items'
import { addDays, isSafeLink, sameDate, startOfDay } from './logic'
import { useMeetingTypes, useUpcomingMeetings, type Meeting } from './queries'

/** Join links show from this long before a meeting starts until it ends. */
const JOIN_LEAD_MS = 15 * 60_000

/** Today's remaining meetings and the next week's, grouped by day. */
export function MeetingsWidget({ workspace, scope }: WidgetProps) {
  const now = useNow(60_000)
  const pathname = usePathname()
  const { data, isPending, error, refetch } = useUpcomingMeetings(scope)
  const types = useMeetingTypes(scope)
  const { data: workspaces = [] } = useWorkspaces()
  const typesById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types])
  const workspacesById = useMemo(() => new Map(workspaces.map((ws) => [ws.id, ws])), [workspaces])

  const groups = useMemo(() => {
    if (!now) return []
    const upcoming = (data ?? []).filter((meeting) => new Date(meeting.endsAt).getTime() > now).slice(0, 12)
    const map = new Map<string, { day: Date; meetings: Meeting[] }>()
    for (const meeting of upcoming) {
      const day = startOfDay(new Date(Math.max(new Date(meeting.startsAt).getTime(), now)))
      const key = localDate(day)
      if (!map.has(key)) map.set(key, { day, meetings: [] })
      map.get(key)!.meetings.push(meeting)
    }
    return [...map.values()]
  }, [data, now])

  const calendarHref = (day: Date) => {
    const query = `?date=${localDate(day)}&view=day`
    return workspace ? `${workspaceHref(workspace.slug, 'calendar')}${query}` : `${ALL_HREF}/calendar${query}`
  }
  const dayLabel = (day: Date) => {
    const today = startOfDay(new Date(now ?? Date.now()))
    if (sameDate(day, today)) return 'Today'
    if (sameDate(day, addDays(today, 1))) return 'Tomorrow'
    return day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
  }

  return (
    <WidgetFrame
      title="Meetings"
      icon={<CalendarDays size={15} />}
      action={
        <span className="flex items-center gap-2">
          <Link href={workspace ? workspaceHref(workspace.slug, 'calendar') : `${ALL_HREF}/calendar`} className="text-2xs font-medium text-primary-ink hover:underline">
            Calendar
          </Link>
          <WidgetAdd label="New meeting" href={createAndReturn(workspace ? workspaceHref(workspace.slug, 'calendar') : `${ALL_HREF}/calendar`, pathname)} />
        </span>
      }
    >
      {error ? (
        <ErrorNotice title="Could not load meetings" message={error.message} onRetry={() => void refetch()} />
      ) : isPending || !now ? (
        <Skeleton className="h-24" />
      ) : !groups.length ? (
        <p className="py-6 text-center text-xs text-ink-3">No meetings in the next 7 days.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section key={group.day.toISOString()} aria-label={dayLabel(group.day)}>
              <h3 className="mb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{dayLabel(group.day)}</h3>
              <ul className="-mx-2">
                {group.meetings.map((meeting) => {
                  const tone = meetingTone(meeting, typesById)
                  const ws = scope === 'all' ? workspacesById.get(meeting.workspaceId) : undefined
                  const starts = new Date(meeting.startsAt).getTime()
                  const live = starts <= now && new Date(meeting.endsAt).getTime() > now
                  const joinable = meeting.meetingUrl && isSafeLink(meeting.meetingUrl) && starts - JOIN_LEAD_MS <= now
                  return (
                    <li key={meeting.id} className="animate-row flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <span className={cn('h-8 w-1 shrink-0 rounded-full', tone.dot)} aria-hidden />
                      <Link href={calendarHref(group.day)} className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-ink">{meeting.title}</span>
                        <span className="block truncate text-2xs text-ink-2 tabular-nums">
                          {meeting.allDay ? 'All day' : `${timeOfDay(meeting.startsAt)} – ${timeOfDay(meeting.endsAt)}`}
                          {live && <span className="ml-1.5 font-semibold text-accent-ink">Now</span>}
                          {meeting.location ? ` · ${meeting.location}` : ''}
                          {ws ? ` · ${ws.name}` : ''}
                        </span>
                      </Link>
                      {ws && <IconTile icon={ws.icon} colorKey={ws.color} size={18} />}
                      {joinable && (
                        <a
                          href={meeting.meetingUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-2xs font-semibold text-on-primary hover:bg-primary-hover"
                          aria-label={`Join ${meeting.title}`}
                        >
                          <Video size={12} aria-hidden /> Join
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </WidgetFrame>
  )
}
