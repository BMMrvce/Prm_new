import { isIP } from 'node:net'

/**
 * SSRF guard for user-supplied IMAP/SMTP servers. The app connects from its own network,
 * so a mailbox "host" must never reach loopback, private, link-local or other internal
 * addresses, and only the standard mail ports are allowed, always with TLS.
 *
 * Hostnames are resolved here and the connection is made to the checked address (with the
 * hostname as the TLS server name), so DNS cannot change between the check and the connect.
 */

export type MailProtocol = 'imap' | 'smtp'

/** Port → how TLS starts. `implicit` is TLS from the first byte; `starttls` must upgrade. */
export const MAIL_PORTS: Record<MailProtocol, Record<number, 'implicit' | 'starttls'>> = {
  imap: { 993: 'implicit', 143: 'starttls' },
  smtp: { 465: 'implicit', 587: 'starttls' },
}

export function tlsModeFor(protocol: MailProtocol, port: number) {
  return MAIL_PORTS[protocol][port] ?? null
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.home.arpa', '.corp', '.localdomain', '.arpa', '.test', '.invalid', '.example']

/** A public DNS name (no IP literals, no single-label or internal-only names). */
export function validHostname(input: string) {
  const host = input.trim().toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 253 || isIP(host)) return null
  const labels = host.split('.')
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null
  if (!/^[a-z]{2,63}$|^xn--[a-z0-9-]{1,59}$/.test(labels.at(-1)!)) return null
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null
  return host
}

function ipv4Parts(address: string) {
  const parts = address.split('.').map(Number)
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null
}

function blockedIpv4([a, b, c]: number[]) {
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  )
}

/** Expands an IPv6 address to eight 16-bit groups, or null when it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]
  // A trailing dotted IPv4 (e.g. ::ffff:10.0.0.1) becomes two groups.
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const parts = ipv4Parts(dotted[1])
    if (!parts) return null
    text = text.slice(0, -dotted[1].length) + `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

/** True for any address a mail connection must not reach (anything not public unicast). */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) {
    const parts = ipv4Parts(address)
    return !parts || blockedIpv4(parts)
  }
  if (version !== 6) return true
  const groups = ipv6Groups(address)
  if (!groups) return true
  const [g0, g1, , , , g5, g6, g7] = groups
  if (groups.every((group) => group === 0)) return true // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true // ::1
  const embedded = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the IPv4 inside.
  if (groups.slice(0, 5).every((group) => group === 0) && (g5 === 0xffff || g5 === 0)) return blockedIpv4(embedded)
  // NAT64 (64:ff9b::/96) carries an IPv4 address too.
  if (g0 === 0x64 && g1 === 0xff9b) return blockedIpv4(embedded)
  if ((g0 & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true // site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // documentation
  if (g0 === 0x2002) return blockedIpv4([g1 >> 8, g1 & 255, groups[2] >> 8, groups[2] & 255]) // 6to4
  if (g0 === 0x2001 && g1 === 0) return true // Teredo
  if (g0 === 0x0100 && groups.slice(1, 4).every((group) => group === 0)) return true // discard-only
  return (g0 & 0xe000) !== 0x2000 // only global unicast 2000::/3
}

export class MailHostError extends Error {}

export type LookupAll = (hostname: string) => Promise<{ address: string; family: number }[]>

export type ResolvedServer = {
  /** Checked address to connect to. */
  address: string
  /** Hostname for SNI and certificate verification. */
  servername: string
  port: number
  tls: 'implicit' | 'starttls'
}

/**
 * Validates a host and port for a protocol and resolves the host. Every address the name
 * resolves to must be public, or the server is refused (a mixed answer is a rebinding sign).
 */
export async function resolveMailServer(protocol: MailProtocol, host: string, port: number, lookup: LookupAll): Promise<ResolvedServer> {
  const servername = validHostname(host)
  if (!servername) throw new MailHostError(`Enter the ${protocol.toUpperCase()} server as a public host name, like mail.example.com.`)
  const tls = Number.isInteger(port) ? tlsModeFor(protocol, port) : null
  if (!tls) {
    const allowed = Object.keys(MAIL_PORTS[protocol]).join(' or ')
    throw new MailHostError(`${protocol.toUpperCase()} must use port ${allowed}.`)
  }
  let addresses: { address: string }[]
  try {
    addresses = await lookup(servername)
  } catch {
    throw new MailHostError(`Could not find the server ${servername}.`)
  }
  if (!addresses.length || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new MailHostError(`${servername} does not point to a public mail server.`)
  }
  return { address: addresses[0].address, servername, port, tls }
}
