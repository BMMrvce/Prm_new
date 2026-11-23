import { redirect } from 'next/navigation'
import { WELCOME_HREF, workspaceHref } from '@/core/routes'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@/lib/supabase/user'

/** `/` opens the workspace used most recently, or the setup flow for a new account. */
export default async function RootPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_workspace_prefs')
    .select('last_opened_at, workspaces!inner(slug, archived_at)')
    .eq('user_id', user.id)
    .is('workspaces.archived_at', null)
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ workspaces: { slug: string } }>()
  redirect(data ? workspaceHref(data.workspaces.slug) : WELCOME_HREF)
}
