import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM sealing for connection secrets (OAuth tokens, mailbox passwords).
 *
 * Payload: `<kid>.<iv>.<tag>.<data>` (base64url parts), e.g. `v1.…`. The key id lets a
 * deployment rotate keys: new secrets are sealed with the current key, old ones are still
 * opened with a previous key and re-sealed on next use. Each payload is bound to its row
 * through additional authenticated data, so a sealed value copied into another user's or
 * workspace's row fails to open.
 *
 * Pure (no env, no I/O) so it can be unit tested; `connections.ts` supplies the key ring.
 */

export type KeyRing = { current: { id: string; key: Buffer }; previous: Map<string, Buffer> }

export class SealConfigError extends Error {}

const KEY_ID = /^v\d{1,3}$/
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** A base64-encoded 32-byte key, or a SealConfigError. Never derives a key from other input. */
export function parseKey(raw: string | undefined, name = 'OAUTH_TOKEN_ENCRYPTION_KEY') {
  const value = raw?.trim() ?? ''
  if (!value) throw new SealConfigError(`${name} is not set.`)
  if (!STRICT_BASE64.test(value)) throw new SealConfigError(`${name} must be base64.`)
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new SealConfigError(`${name} must decode to exactly 32 bytes.`)
  return key
}

/**
 * The key ring from environment-style values: the current key (and its id, default `v1`)
 * plus optional previous keys as `v0:<base64>,v2:<base64>`.
 */
export function keyRing(current: string | undefined, currentId = 'v1', previous = ''): KeyRing {
  if (!KEY_ID.test(currentId)) throw new SealConfigError('The key id must look like v1, v2, …')
  const ring: KeyRing = { current: { id: currentId, key: parseKey(current) }, previous: new Map() }
  for (const entry of previous.split(',').map((item) => item.trim()).filter(Boolean)) {
    const [id, value] = entry.split(':')
    if (!id || !KEY_ID.test(id) || id === currentId) throw new SealConfigError('Previous keys must be "<id>:<base64>" with distinct ids.')
    ring.previous.set(id, parseKey(value, `previous key ${id}`))
  }
  return ring
}

const b64 = (buffer: Buffer) => buffer.toString('base64url')

export function seal(ring: KeyRing, value: unknown, aad: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [ring.current.id, b64(iv), b64(cipher.getAuthTag()), b64(data)].join('.')
}

/** The key id a payload was sealed with, or null for a malformed payload. */
export function payloadKeyId(payload: string) {
  const id = payload.split('.')[0]
  return id && KEY_ID.test(id) ? id : null
}

/**
 * Opens a payload sealed by `seal` with the same `aad`. Returns null when it was tampered
 * with, sealed for another row, sealed with an unknown key, or is malformed.
 */
export function unseal<T>(ring: KeyRing, payload: string, aad: string): T | null {
  const parts = typeof payload === 'string' ? payload.split('.') : []
  if (parts.length !== 4) return null
  const [id, ivPart, tagPart, dataPart] = parts
  const key = id === ring.current.id ? ring.current.key : ring.previous.get(id)
  if (!key) return null
  try {
    const iv = Buffer.from(ivPart, 'base64url')
    const tag = Buffer.from(tagPart, 'base64url')
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()])
    return JSON.parse(plain.toString('utf8')) as T
  } catch {
    return null
  }
}
