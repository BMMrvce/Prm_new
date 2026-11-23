import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint } from '../push-endpoints'
import { isBlockedAddress, MailHostError, resolveMailServer, validHostname, type LookupAll } from './hosts'

const resolvesTo =
  (...addresses: string[]): LookupAll =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))

describe('validHostname', () => {
  it('accepts public host names', () => {
    expect(validHostname('imap.hostinger.com')).toBe('imap.hostinger.com')
    expect(validHostname(' IMAP.Example.ORG. ')).toBe('imap.example.org')
    expect(validHostname('mail.xn--80ak6aa92e.com')).toBe('mail.xn--80ak6aa92e.com')
  })

  it('rejects IP literals, single labels and internal names', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '::1', '[::1]', 'localhost', 'mail', 'imap.local', 'db.internal', 'x.localhost', 'nas.home.arpa', 'a..b.com', '-bad.com', 'bad-.com', 'mail.example.123', '']) {
      expect(validHostname(host), host).toBeNull()
    }
  })
})

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local, CGNAT, multicast and reserved IPv4', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.10', '198.18.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
  })

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '100.128.0.1']) expect(isBlockedAddress(ip), ip).toBe(false)
  })

  it('blocks internal IPv6, including IPv4 hidden inside it', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2001::1']) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
  })

  it('allows global IPv6 and refuses garbage', () => {
    expect(isBlockedAddress('2607:f8b0:4004:c1b::6c')).toBe(false)
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false)
    expect(isBlockedAddress('not an ip')).toBe(true)
  })
})

describe('resolveMailServer', () => {
  it('returns the checked address and keeps the host name for TLS', async () => {
    await expect(resolveMailServer('imap', 'imap.example.com', 993, resolvesTo('93.184.216.34'))).resolves.toEqual({
      address: '93.184.216.34',
      servername: 'imap.example.com',
      port: 993,
      tls: 'implicit',
    })
    await expect(resolveMailServer('smtp', 'smtp.example.com', 587, resolvesTo('93.184.216.34'))).resolves.toMatchObject({ tls: 'starttls' })
  })

  it('refuses ports outside the allow-list', async () => {
    for (const [protocol, port] of [
      ['imap', 25],
      ['imap', 465],
      ['imap', 6379],
      ['smtp', 25],
      ['smtp', 993],
      ['smtp', 2525],
      ['imap', 993.5],
    ] as const) {
      await expect(resolveMailServer(protocol, 'mail.example.com', port, resolvesTo('93.184.216.34')), `${protocol}:${port}`).rejects.toBeInstanceOf(MailHostError)
    }
  })

  it('refuses names that resolve to internal addresses, even partly (rebinding)', async () => {
    await expect(resolveMailServer('imap', 'evil.example.com', 993, resolvesTo('127.0.0.1'))).rejects.toBeInstanceOf(MailHostError)
    await expect(resolveMailServer('imap', 'evil.example.com', 993, resolvesTo('93.184.216.34', '10.0.0.1'))).rejects.toBeInstanceOf(MailHostError)
    await expect(resolveMailServer('imap', 'meta.example.com', 993, resolvesTo('::ffff:169.254.169.254'))).rejects.toBeInstanceOf(MailHostError)
    await expect(resolveMailServer('imap', 'none.example.com', 993, resolvesTo())).rejects.toBeInstanceOf(MailHostError)
  })

  it('refuses IP literals and internal names before any lookup', async () => {
    let looked = false
    const lookup: LookupAll = async () => {
      looked = true
      return [{ address: '93.184.216.34', family: 4 }]
    }
    await expect(resolveMailServer('imap', '169.254.169.254', 993, lookup)).rejects.toBeInstanceOf(MailHostError)
    await expect(resolveMailServer('imap', 'localhost', 993, lookup)).rejects.toBeInstanceOf(MailHostError)
    expect(looked).toBe(false)
  })
})

describe('isAllowedPushEndpoint', () => {
  it('accepts the browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QF4abc')).toBe(true)
  })

  it('refuses other hosts, http, credentials, odd ports and oversized URLs', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(1000)}`)).toBe(false)
    expect(isAllowedPushEndpoint('not a url')).toBe(false)
  })
})
