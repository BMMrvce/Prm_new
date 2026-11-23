/**
 * URL builders. Workspace pages live under /w/<slug>/…; everything built here so a route
 * change is a one-line edit.
 */

export function workspaceHref(slug: string, ...segments: (string | undefined)[]) {
  return ['', 'w', slug, ...segments.filter(Boolean)].join('/')
}

export function taskHref(slug: string, taskId: string) {
  return `${workspaceHref(slug, 'tasks')}?task=${taskId}`
}

export function projectHref(slug: string, projectSlug: string) {
  return workspaceHref(slug, 'projects', projectSlug)
}

export function noteHref(slug: string, noteId: string) {
  return `${workspaceHref(slug, 'notes')}?note=${noteId}`
}

export function boardHref(slug: string, boardId: string) {
  return workspaceHref(slug, 'whiteboard', boardId)
}

export const ALL_HREF = '/all'
export const ACCOUNT_HREF = '/account'
export const HELP_HREF = '/help'
export const WELCOME_HREF = '/welcome'

/** Only same-site relative paths, so a `next` parameter can never redirect elsewhere. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  return next && /^\/[a-zA-Z0-9]/.test(next) && !next.startsWith('//') ? next : fallback
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replaceAll('&', 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'untitled'
  )
}
