// apps/api/src/routes/auth.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { Env } from '../env'
import { getWeChatAccessToken, isWeChatApiError } from '../services/wechat'

const JWT_TTL_SECONDS = 60 * 60 * 8

interface WeChatUserInfoResponse {
  errcode?: number
  errmsg?: string
  UserId?: string
}

export const auth = new Hono<{ Bindings: Env }>()

auth.post('/wechat', async (c) => {
  let body: { code?: unknown }

  try {
    body = await c.req.json<{ code?: unknown }>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (typeof body.code !== 'string' || body.code.trim().length === 0) {
    return c.json({ error: 'code 是必填项' }, 400)
  }

  let accessToken: string
  try {
    accessToken = await getWeChatAccessToken(c.env)
  } catch {
    return c.json({ error: '获取企业微信 access_token 失败' }, 502)
  }

  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('code', body.code)

  let weChatUser: WeChatUserInfoResponse
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return c.json({ error: '企业微信用户信息请求失败' }, 502)
    }
    weChatUser = (await response.json()) as WeChatUserInfoResponse
  } catch {
    return c.json({ error: '企业微信用户信息请求失败' }, 502)
  }

  if (isWeChatApiError(weChatUser) || !weChatUser.UserId) {
    return c.json({ error: '企业微信授权码无效或已过期' }, 401)
  }

  const db = createDb(c.env.DB)
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, weChatUser.UserId))
    .limit(1)

  if (!user) {
    return c.json({ error: '该企业微信用户尚未开通 CRM 权限' }, 403)
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
