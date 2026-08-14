// apps/api/src/routes/auth.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { Env } from '../env'

const JWT_TTL_SECONDS = 60 * 60 * 8

interface LoginPayload {
  username?: unknown
  pin_code?: unknown
}

export const auth = new Hono<{ Bindings: Env }>()

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
    typeof body.pin_code !== 'string' ||
    body.pin_code.length === 0
  ) {
    return c.json({ error: 'username 和 pin_code 是必填项' }, 400)
  }

  const username = body.username.trim()
  const db = createDb(c.env.DB)
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        or(eq(users.id, username), eq(users.name, username)),
        eq(users.pinCode, body.pin_code),
      ),
    )
    .limit(1)

  if (!user) {
    return c.json({ error: '账号或 PIN 密码错误' }, 401)
  }

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
    user,
  })
})
