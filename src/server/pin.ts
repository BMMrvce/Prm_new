import 'server-only'
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (password: Buffer, salt: Buffer, keylen: number, options: object) => Promise<Buffer>

// scrypt cost: ~50 ms and 32 MB per attempt on a typical server; with the rate limit and
// lockout this makes guessing a 6-digit PIN impractical even with the database leaked
// (the pepper below is not in the database).
const N = 2 ** 15
const R = 8
const P = 1
const KEY_LENGTH = 32

/** A server-side secret mixed into every PIN, so stolen hashes alone cannot be brute-forced. */
function pepper() {
  const value = process.env.VAULT_PEPPER
  if (!value || value.length < 32) throw new Error('VAULT_PEPPER is not set (32+ random characters).')
  return value
}

const peppered = (pin: string) => createHmac('sha256', pepper()).update(pin.normalize('NFKC')).digest()

export const PIN_RULE = /^\d{6,12}$|^.{8,64}$/

export function validPin(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_RULE.test(pin) && !/^(\d)\1+$/.test(pin) && !['123456', '654321', '12345678'].includes(pin)
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(peppered(pin), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPin(pin: string, stored: string) {
  const [scheme, n, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scryptAsync(peppered(pin), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
