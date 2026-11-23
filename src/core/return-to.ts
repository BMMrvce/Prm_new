/**
 * Where to go back to after a create flow started elsewhere (`?return=/w/acme`). Only
 * same-site paths are accepted, so the parameter can never send someone to another site.
 */
export function safeReturn(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}

/** `href` with `?new=1&return=<current path>` added. */
export function createAndReturn(href: string, returnTo: string) {
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}new=1&return=${encodeURIComponent(returnTo)}`
}
