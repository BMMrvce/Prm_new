import { z } from 'zod'
import { currentUser } from '@/lib/supabase/user'
import { ReconnectRequired } from '@/server/connections'
import { allow, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'
import { logSecurityEvent } from '@/server/security-log'
import { jsonBody } from '@/server/vault'
import { choosePlaylist, disconnectYouTube, listVideos, youtubeStatus } from '@/server/youtube'

/** GET /api/youtube → connection status and, once a playlist is chosen, its videos. */
export async function GET() {
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  if (!(await allow(`youtube:${user.id}`, 60, 60))) return tooMany()
  try {
    const status = await youtubeStatus(user.id)
    if (status.state !== 'connected') return privateJson({ status, videos: [] })
    try {
      return privateJson({ status, videos: await listVideos(user.id, status.playlist.id) })
    } catch (error) {
      if (error instanceof ReconnectRequired) return privateJson({ status: { state: 'needs_auth' }, videos: [] })
      return privateJson({ status, videos: [], error: 'Could not load videos from YouTube.' })
    }
  } catch (error) {
    console.error('[youtube] status failed', error instanceof Error ? error.message : 'error')
    return privateJson({ error: 'Could not load YouTube.' }, { status: 500 })
  }
}

const chooseBody = z.object({ playlistId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/) })

/** POST /api/youtube { playlistId } → chooses the playlist shown on the dashboard. */
export async function POST(request: Request) {
  const refused = crossSite(request)
  if (refused) return refused
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  if (!(await allow(`youtube:${user.id}`, 60, 60))) return tooMany()
  const parsed = chooseBody.safeParse(await jsonBody(request))
  if (!parsed.success) return privateJson({ error: 'Choose a playlist.' }, { status: 400 })
  try {
    if (!(await choosePlaylist(user.id, parsed.data.playlistId))) return privateJson({ error: 'That playlist is not on your YouTube account.' }, { status: 400 })
    return privateJson({ ok: true })
  } catch (error) {
    if (error instanceof ReconnectRequired) return privateJson({ error: 'Connect YouTube again.' }, { status: 401 })
    return privateJson({ error: 'Could not save the playlist.' }, { status: 502 })
  }
}

/** DELETE /api/youtube → forgets this user's YouTube sign-in. */
export async function DELETE(request: Request) {
  const refused = crossSite(request)
  if (refused) return refused
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  try {
    await disconnectYouTube(user.id)
  } catch {
    return privateJson({ error: 'Could not disconnect.' }, { status: 500 })
  }
  await logSecurityEvent(request, user.id, 'youtube.disconnected')
  return privateJson({ ok: true })
}
