'use client'

import { ListVideo } from 'lucide-react'
import Link from 'next/link'
import { ACCOUNT_HREF } from '@/core/routes'
import { mailDate } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { useYouTube } from './youtube'

/** Videos from the YouTube playlist the user picked as their "watch later" list. */
export function WatchLaterWidget(_props: WidgetProps) {
  const { data, isPending, error, refetch } = useYouTube()
  const status = data?.status
  const videos = data?.videos ?? []
  return (
    <WidgetFrame
      title={status?.state === 'connected' ? status.playlist.title : 'Watch later'}
      icon={<ListVideo size={15} />}
      action={
        <Link href={ACCOUNT_HREF} className="text-xs font-medium text-primary-ink hover:underline">
          Settings
        </Link>
      }
    >
      {isPending ? (
        <Skeleton className="h-24" />
      ) : error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : status?.state !== 'connected' ? (
        <p className="py-6 text-center text-xs text-ink-3">
          {status?.state === 'not_configured' ? 'YouTube is not set up on this server.' : 'Connect YouTube and pick a playlist in your account settings.'}
        </p>
      ) : data?.error ? (
        <ErrorNotice message={data.error} onRetry={() => refetch()} />
      ) : !videos.length ? (
        <p className="py-6 text-center text-xs text-ink-3">This playlist is empty.</p>
      ) : (
        <ul className="-mx-2">
          {videos.slice(0, 20).map((video) => (
            <li key={video.id}>
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                {video.thumbnail ? (
                  <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-16 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-10 w-16 shrink-0 rounded bg-surface-2" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-ui text-ink">{video.title}</span>
                  <span className="block truncate text-2xs text-ink-3">
                    {video.channel}
                    {video.addedAt && ` · added ${mailDate(video.addedAt)}`}
                  </span>
                </span>
                <span className="sr-only">(opens YouTube in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  )
}
