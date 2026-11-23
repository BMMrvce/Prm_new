import 'server-only'
import { deleteConnection, getConnectionInfo, oauthSession, ReconnectRequired, saveConnection, saveConnectionSettings, type OAuthSecret, type TokenGrant } from './connections'
import { googleConfigured, googleFetch, refreshGoogleToken } from './google'

/**
 * A YouTube playlist the user picks as their "watch later" list (YouTube's own Watch Later
 * is not available to apps). Account-wide connection: kind 'youtube', no workspace. The
 * chosen playlist is a non-secret setting.
 */
const API = 'https://www.googleapis.com/youtube/v3'
const MAX_PAGES = 4
const SCOPE = { workspaceId: null, kind: 'youtube' as const }

export type YouTubePlaylist = { id: string; title: string; count: number }
export type YouTubeVideo = { id: string; title: string; channel: string; thumbnail: string | null; addedAt: string; url: string }
export type YouTubeStatus =
  | { state: 'not_configured' }
  | { state: 'needs_auth' }
  | { state: 'needs_playlist'; account: string }
  | { state: 'connected'; account: string; playlist: { id: string; title: string } }

async function api<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const response = await googleFetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new ReconnectRequired()
  const data = (await response.json().catch(() => null)) as T | null
  if (!response.ok || !data) {
    console.error('[youtube] request failed', path, response.status)
    throw new Error('YouTube request failed.')
  }
  return data
}

const session = (userId: string) => oauthSession<OAuthSecret>(userId, SCOPE, refreshGoogleToken)

/** Saves a fresh Google grant (from the OAuth callback), keeping any chosen playlist. */
export async function connectYouTube(userId: string, grant: TokenGrant) {
  const channels = await api<{ items?: { snippet?: { title?: string } }[] }>(grant.access_token, 'channels', { part: 'snippet', mine: 'true' })
  const previous = await getConnectionInfo(userId, SCOPE)
  await saveConnection<OAuthSecret>(userId, SCOPE, {
    provider: 'youtube',
    account: channels.items?.[0]?.snippet?.title || 'YouTube account',
    secret: { accessToken: grant.access_token, refreshToken: grant.refresh_token ?? '', expiresAt: Date.now() + grant.expires_in * 1000 },
    settings: previous?.settings ?? {},
  })
}

/** Forgets the sign-in (not revoked at Google: that would also cut off a Gmail mailbox on the same grant). */
export const disconnectYouTube = (userId: string) => deleteConnection(userId, SCOPE)

export async function youtubeStatus(userId: string): Promise<YouTubeStatus> {
  if (!googleConfigured()) return { state: 'not_configured' }
  const info = await getConnectionInfo(userId, SCOPE)
  if (!info) return { state: 'needs_auth' }
  const id = typeof info.settings.playlistId === 'string' ? info.settings.playlistId : null
  if (!id) return { state: 'needs_playlist', account: info.account }
  return { state: 'connected', account: info.account, playlist: { id, title: String(info.settings.playlistTitle ?? 'Playlist') } }
}

export async function listPlaylists(userId: string): Promise<YouTubePlaylist[]> {
  const { token } = await session(userId)
  const data = await api<{ items?: { id: string; snippet?: { title?: string }; contentDetails?: { itemCount?: number } }[] }>(token, 'playlists', {
    part: 'snippet,contentDetails',
    mine: 'true',
    maxResults: '50',
  })
  return (data.items ?? []).map((item) => ({ id: item.id, title: item.snippet?.title || 'Untitled playlist', count: item.contentDetails?.itemCount ?? 0 }))
}

/** Only a playlist on the user's own account can be chosen. */
export async function choosePlaylist(userId: string, playlistId: string) {
  const playlist = (await listPlaylists(userId)).find((item) => item.id === playlistId)
  if (!playlist) return false
  await saveConnectionSettings(userId, SCOPE, { playlistId: playlist.id, playlistTitle: playlist.title.slice(0, 200) })
  return true
}

type PlaylistItem = {
  snippet?: { title?: string; publishedAt?: string; videoOwnerChannelTitle?: string; thumbnails?: Record<string, { url?: string }>; resourceId?: { videoId?: string } }
}

const httpsOrNull = (url?: string) => (url && url.startsWith('https://') ? url : null)

/** Videos in the chosen playlist, most recently added first. */
export async function listVideos(userId: string, playlistId: string): Promise<YouTubeVideo[]> {
  const { token } = await session(userId)
  const items: PlaylistItem[] = []
  let pageToken = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await api<{ items?: PlaylistItem[]; nextPageToken?: string }>(token, 'playlistItems', {
      part: 'snippet',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    })
    items.push(...(data.items ?? []))
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return items
    .filter((item) => item.snippet?.resourceId?.videoId && item.snippet.videoOwnerChannelTitle)
    .map((item) => {
      const snippet = item.snippet!
      const id = snippet.resourceId!.videoId!
      const thumbs = snippet.thumbnails ?? {}
      return {
        id,
        title: snippet.title || 'Untitled video',
        channel: snippet.videoOwnerChannelTitle ?? '',
        thumbnail: httpsOrNull((thumbs.medium ?? thumbs.high ?? thumbs.default)?.url),
        addedAt: snippet.publishedAt ?? '',
        url: `https://www.youtube.com/watch?${new URLSearchParams({ v: id, list: playlistId })}`,
      }
    })
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}
