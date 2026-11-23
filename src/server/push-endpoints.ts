/**
 * Web Push endpoints are URLs the server later POSTs to, so accepting any https URL would
 * let a user aim the reminder job at internal hosts. Only the browser vendors' push
 * services are accepted.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Chromium), Opera, Samsung Internet
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // legacy Edge / Windows
]

export const MAX_ENDPOINT_LENGTH = 1000

export function isAllowedPushEndpoint(endpoint: string) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  return PUSH_HOSTS.some((pattern) => pattern.test(url.hostname))
}
