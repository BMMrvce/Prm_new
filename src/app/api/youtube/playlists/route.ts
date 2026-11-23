import { currentUser } from '@/lib/supabase/user'
import { ReconnectRequired } from '@/server/connections'
import { allow, tooMany } from '@/server/rate-limit'
import { privateJson } from '@/server/request-guards'
import { listPlaylists } from '@/server/youtube'

/** GET /api/youtube/playlists → the signed-in user's own YouTube playlists. */
export async function GET() {
  const user = await currentUser()
  if (!user) return privateJson({ error: 'Sign in required' }, { status: 401 })
  if (!(await allow(`youtube:${user.id}`, 60, 60))) return tooMany()
  try {
    return privateJson({ playlists: await listPlaylists(user.id) })
  } catch (error) {
    if (error instanceof ReconnectRequired) return privateJson({ error: 'Connect YouTube again.' }, { status: 401 })
    return privateJson({ error: 'Could not load your playlists.' }, { status: 502 })
  }
}
