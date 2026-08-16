// apps/api/src/lib/password.ts
const ALGORITHM = 'PBKDF2'
const HASH_ALGORITHM = 'SHA-256'
const HASH_PREFIX = 'pbkdf2-sha256'
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BYTES = 32

const encoder = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null

  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const saltBuffer = new Uint8Array(salt).buffer
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    ALGORITHM,
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      hash: HASH_ALGORITHM,
      salt: saltBuffer,
      iterations,
    },
    keyMaterial,
    HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt, ITERATIONS)
  return `${HASH_PREFIX}$${ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [prefix, iterationsValue, saltValue, hashValue, extra] = encodedHash.split('$')
  if (prefix !== HASH_PREFIX || extra !== undefined) return false

  const iterations = Number(iterationsValue)
  if (!Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false

  const salt = saltValue ? base64UrlToBytes(saltValue) : null
  const expectedHash = hashValue ? base64UrlToBytes(hashValue) : null
  if (!salt || salt.length < SALT_BYTES || !expectedHash || expectedHash.length !== HASH_BYTES) return false

  const actualHash = await deriveHash(password, salt, iterations)
  return timingSafeEqual(actualHash, expectedHash)
}
