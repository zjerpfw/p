// apps/api/src/routes/auth.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { eq, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { Env } from '../env'
import { hashPassword, verifyPassword } from '../lib/password'

const JWT_TTL_SECONDS = 60 * 60 * 8
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60
const ACCOUNT_FAILURE_LIMIT = 5
const IP_FAILURE_LIMIT = 20
const DUMMY_PASSWORD_HASH = `pbkdf2-sha256$210000$${'A'.repeat(22)}$${'A'.repeat(43)}`

interface RateLimitRecord {
  count: number
  resetAt: number
}

interface LoginPayload {
  username?: unknown
  pin_code?: unknown
}

export const auth = new Hono<{ Bindings: Env }>()

function parseRateLimitRecord(value: string | null, now: number): RateLimitRecord {
  if (!value) return { count: 0, resetAt: now + RATE_LIMIT_WINDOW_SECONDS }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'count' in parsed &&
      'resetAt' in parsed &&
      typeof parsed.count === 'number' &&
      Number.isSafeInteger(parsed.count) &&
      typeof parsed.resetAt === 'number' &&
      Number.isSafeInteger(parsed.resetAt) &&
      parsed.resetAt > now
    ) {
      return { count: parsed.count, resetAt: parsed.resetAt }
    }
  } catch {
    // Invalid or expired limiter state starts a new fixed window.
  }
  return { count: 0, resetAt: now + RATE_LIMIT_WINDOW_SECONDS }
}

async function hashRateLimitSubject(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getLoginRateLimit(env: Env, username: string, ipAddress: string) {
  const [accountDigest, ipDigest] = await Promise.all([
    hashRateLimitSubject(username.toLocaleLowerCase('en-US')),
    hashRateLimitSubject(ipAddress),
  ])
  const accountKey = `auth:login:account:${accountDigest}`
  const ipKey = `auth:login:ip:${ipDigest}`
  const now = Math.floor(Date.now() / 1000)
  const [accountValue, ipValue] = await Promise.all([env.CACHE.get(accountKey), env.CACHE.get(ipKey)])
  const account = parseRateLimitRecord(accountValue, now)
  const ip = parseRateLimitRecord(ipValue, now)
  return {
    account,
    accountKey,
    ip,
    ipKey,
    blocked: account.count >= ACCOUNT_FAILURE_LIMIT || ip.count >= IP_FAILURE_LIMIT,
    retryAfter: Math.max(1, Math.max(account.resetAt, ip.resetAt) - now),
  }
}

async function recordLoginFailure(env: Env, limiter: Awaited<ReturnType<typeof getLoginRateLimit>>) {
  await Promise.all([
    env.CACHE.put(limiter.accountKey, JSON.stringify({ ...limiter.account, count: limiter.account.count + 1 }), { expiration: limiter.account.resetAt }),
    env.CACHE.put(limiter.ipKey, JSON.stringify({ ...limiter.ip, count: limiter.ip.count + 1 }), { expiration: limiter.ip.resetAt }),
  ])
}

auth.post('/login', async (c) => {
  let body: LoginPayload

  try {
    body = await c.req.json<LoginPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (
    typeof body.username !== 'string' ||
    body.username.trim().length === 0 ||
    body.username.length > 100 ||
    typeof body.pin_code !== 'string' ||
    body.pin_code.length === 0 ||
    body.pin_code.length > 128
  ) {
    return c.json({ error: 'username 和 pin_code 是必填项' }, 400)
  }

  const username = body.username.trim()
  const ipAddress = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const limiter = await getLoginRateLimit(c.env, username, ipAddress)
  if (limiter.blocked) {
    c.header('Retry-After', String(limiter.retryAfter))
    return c.json({ error: '登录尝试过于频繁，请稍后再试' }, 429)
  }

  const db = createDb(c.env.DB)
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      pinHash: users.pinHash,
    })
    .from(users)
    .where(or(eq(users.id, username), eq(users.username, username), eq(users.name, username)))
    .limit(1)

  let passwordValid = user?.pinHash
    ? await verifyPassword(body.pin_code, user.pinHash)
    : await verifyPassword(body.pin_code, DUMMY_PASSWORD_HASH)

  if (user && !user.pinHash) {
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(users)`)
    if (columns.some((column) => column.name === 'pin_code')) {
      const legacyUsers = await db.all<{ pinCode: string }>(sql`
        SELECT pin_code AS pinCode FROM users WHERE id = ${user.id} LIMIT 1
      `)
      const legacyUser = legacyUsers[0]
      passwordValid = legacyUser?.pinCode === body.pin_code
      if (passwordValid) {
        await db.update(users).set({ pinHash: await hashPassword(body.pin_code) }).where(eq(users.id, user.id))
      }
    }
  }

  if (!user || !passwordValid) {
    await recordLoginFailure(c.env, limiter)
    return c.json({ error: '账号或 PIN 密码错误' }, 401)
  }

  await Promise.all([c.env.CACHE.delete(limiter.accountKey), c.env.CACHE.delete(limiter.ipKey)])

  const now = Math.floor(Date.now() / 1000)
  const token = await sign(
    {
      sub: user.id,
      name: user.name,
      role: user.role,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
    },
    c.env.JWT_SECRET,
  )

  return c.json({
    token,
    expiresIn: JWT_TTL_SECONDS,
    user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, role: user.role },
  })
})
