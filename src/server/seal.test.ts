import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { keyRing, parseKey, payloadKeyId, seal, SealConfigError, unseal } from './seal'

const keyA = randomBytes(32).toString('base64')
const keyB = randomBytes(32).toString('base64')
const ring = keyRing(keyA)
const AAD = 'user-1|workspace-1|mail'

/** Replaces one base64url part of a payload with a value that differs in one byte. */
function flip(payload: string, index: number) {
  const parts = payload.split('.')
  const bytes = Buffer.from(parts[index], 'base64url')
  bytes[0] ^= 1
  parts[index] = bytes.toString('base64url')
  return parts.join('.')
}

describe('seal / unseal', () => {
  it('round-trips JSON values', () => {
    const secret = { user: 'ada@example.com', pass: 'p@ss wörd', nested: { n: 1 } }
    const payload = seal(ring, secret, AAD)
    expect(payload.startsWith('v1.')).toBe(true)
    expect(payload.split('.')).toHaveLength(4)
    expect(payload).not.toContain('p@ss')
    expect(unseal(ring, payload, AAD)).toEqual(secret)
  })

  it('uses a fresh IV every time', () => {
    expect(seal(ring, 'same', AAD)).not.toBe(seal(ring, 'same', AAD))
  })

  it('rejects tampered ciphertext, tag or IV', () => {
    const payload = seal(ring, { token: 'abc' }, AAD)
    expect(unseal(ring, flip(payload, 1), AAD)).toBeNull()
    expect(unseal(ring, flip(payload, 2), AAD)).toBeNull()
    expect(unseal(ring, flip(payload, 3), AAD)).toBeNull()
  })

  it('rejects a payload moved to another row (different AAD)', () => {
    const payload = seal(ring, { token: 'abc' }, AAD)
    expect(unseal(ring, payload, 'user-2|workspace-1|mail')).toBeNull()
    expect(unseal(ring, payload, 'user-1||youtube')).toBeNull()
  })

  it('rejects the wrong key, unknown key ids and malformed payloads', () => {
    const payload = seal(ring, 'x', AAD)
    expect(unseal(keyRing(keyB), payload, AAD)).toBeNull()
    expect(unseal(ring, payload.replace(/^v1/, 'v9'), AAD)).toBeNull()
    expect(unseal(ring, 'not-a-payload', AAD)).toBeNull()
    expect(unseal(ring, 'v1.a.b', AAD)).toBeNull()
    expect(unseal(ring, '', AAD)).toBeNull()
  })

  it('opens payloads sealed with a previous key after rotation', () => {
    const old = keyRing(keyA, 'v1')
    const payload = seal(old, { token: 'old' }, AAD)
    const rotated = keyRing(keyB, 'v2', `v1:${keyA}`)
    expect(payloadKeyId(payload)).toBe('v1')
    expect(unseal(rotated, payload, AAD)).toEqual({ token: 'old' })
    expect(payloadKeyId(seal(rotated, 'new', AAD))).toBe('v2')
  })
})

describe('key parsing fails closed', () => {
  it('accepts a base64 32-byte key', () => {
    expect(parseKey(keyA)).toHaveLength(32)
  })

  it('refuses missing, short, long or non-base64 keys', () => {
    expect(() => parseKey(undefined)).toThrow(SealConfigError)
    expect(() => parseKey('')).toThrow(SealConfigError)
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(SealConfigError)
    expect(() => parseKey(randomBytes(48).toString('base64'))).toThrow(SealConfigError)
    // A 32-character passphrase is not a key: no SHA-256 fallback.
    expect(() => parseKey('correct horse battery staple 1234')).toThrow(SealConfigError)
  })

  it('refuses bad key ids and duplicate previous ids', () => {
    expect(() => keyRing(keyA, 'key1')).toThrow(SealConfigError)
    expect(() => keyRing(keyA, 'v1', `v1:${keyB}`)).toThrow(SealConfigError)
    expect(() => keyRing(keyA, 'v2', 'v1')).toThrow(SealConfigError)
  })
})
