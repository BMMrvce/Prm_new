'use client'

import { useQuery } from '@tanstack/react-query'
import { Inbox, ListVideo } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { keys } from '@/core/query'
import { workspaceHref } from '@/core/routes'
import { useWorkspaces } from '@/core/workspaces'
import { must, supabase } from '@/lib/supabase/client'
import { Button, buttonClass } from '@/ui/button'
import { ConfirmDialog } from '@/ui/dialog'
import { Field, Select } from '@/ui/field'
import { Card, ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { errorMessage, toast } from '@/ui/toast'
import { useOAuthResult } from './use-oauth-result'
import { connectYouTubeUrl, useChoosePlaylist, useDisconnectYouTube, usePlaylists, useYouTube } from './youtube'

type ConnectionRow = { id: string; workspace_id: string | null; kind: string; provider: string; account: string }

/** Connected accounts on /account: YouTube (account-wide) and a list of your workspace mailboxes. */
export function AccountConnections() {
  return (
    <div className="space-y-5">
      <YouTubeCard />
      <Mailboxes />
    </div>
  )
}

function YouTubeCard() {
  const feed = useYouTube()
  const disconnect = useDisconnectYouTube()
  const [choosing, setChoosing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  useOAuthResult('youtube', 'YouTube connected. Pick the playlist to show.', () => feed.refetch())
  const status = feed.data?.status

  return (
    <Card title="YouTube" description="Show videos from one of your playlists as a “Watch later” widget. Read-only access.">
      {feed.isPending ? (
        <Skeleton className="h-10" />
      ) : feed.error ? (
        <ErrorNotice message={feed.error.message} onRetry={() => feed.refetch()} />
      ) : status?.state === 'not_configured' ? (
        <p className="text-xs text-ink-3">Google sign-in is not set up on this server.</p>
      ) : status?.state === 'needs_auth' ? (
        <a href={connectYouTubeUrl('/account')} className={buttonClass('primary')}>
          Connect YouTube
        </a>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary-light text-primary-ink" aria-hidden>
              <ListVideo size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui font-medium text-ink">{status && 'account' in status ? status.account : ''}</p>
              <p className="text-xs text-ink-2">{status?.state === 'connected' ? `Playlist: ${status.playlist.title}` : 'Choose a playlist to show.'}</p>
            </div>
            {status?.state === 'connected' && !choosing && (
              <Button size="sm" onClick={() => setChoosing(true)}>
                Change playlist
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-error-ink" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          </div>
          {(status?.state === 'needs_playlist' || choosing) && <PlaylistPicker onDone={() => setChoosing(false)} current={status?.state === 'connected' ? status.playlist.id : ''} />}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Disconnect YouTube?"
          message="The app forgets your YouTube sign-in. Your playlists are not changed."
          confirmLabel="Disconnect"
          busy={disconnect.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await disconnect.mutateAsync()
            setConfirming(false)
            toast.success('YouTube disconnected.')
          }}
        />
      )}
    </Card>
  )
}

function PlaylistPicker({ current, onDone }: { current: string; onDone: () => void }) {
  const playlists = usePlaylists(true)
  const choose = useChoosePlaylist()
  const [picked, setPicked] = useState(current)
  const list = playlists.data ?? []
  const value = picked || (list.find((item) => /later/i.test(item.title)) ?? list[0])?.id || ''
  if (playlists.isPending) return <Skeleton className="h-9 max-w-sm" />
  if (playlists.error) return <ErrorNotice message={playlists.error.message} onRetry={() => playlists.refetch()} />
  if (!list.length) return <p className="text-xs text-ink-3">No playlists on this YouTube account yet. Create one on YouTube and save videos to it.</p>
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        try {
          await choose.mutateAsync(value)
          toast.success('Playlist saved.')
          onDone()
        } catch (caught) {
          toast.error(errorMessage(caught))
        }
      }}
    >
      <Field label="Playlist" className="min-w-56 flex-1">
        {(props) => (
          <Select {...props} value={value} onChange={(event) => setPicked(event.target.value)}>
            {list.map((item) => (
              <option key={item.id} value={item.id}>{`${item.title} (${item.count})`}</option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" variant="primary" loading={choose.isPending}>
        Save
      </Button>
    </form>
  )
}

function Mailboxes() {
  const { data: workspaces = [] } = useWorkspaces()
  const connections = useQuery({
    queryKey: keys.connections,
    queryFn: async () => must(await supabase().rpc('my_connections')) as ConnectionRow[],
  })
  const mail = (connections.data ?? []).filter((row) => row.kind === 'mail' && row.workspace_id)
  return (
    <Card title="Mailboxes" description="Each workspace has its own mailbox. Connect or disconnect one in that workspace’s Settings → Mail.">
      {connections.isPending ? (
        <Skeleton className="h-10" />
      ) : connections.error ? (
        <ErrorNotice message={connections.error.message} onRetry={() => connections.refetch()} />
      ) : !mail.length ? (
        <p className="text-xs text-ink-3">No mailboxes connected.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {mail.map((row) => {
            const workspace = workspaces.find((ws) => ws.id === row.workspace_id)
            return (
              <li key={row.id} className="flex items-center gap-3 py-2">
                <Inbox size={15} className="text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-ui text-ink">{row.account}</span>
                {workspace && (
                  <Link href={`${workspaceHref(workspace.slug, 'settings')}?tab=mail`} className="text-xs font-medium text-primary-ink hover:underline">
                    {workspace.name}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
