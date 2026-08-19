// apps/api/src/routes/configs.ts
import { createDb } from '@crm/db/client'
import { systemConfigs, users } from '@crm/db/schema'
import { asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { getWeChatAccessToken, getWeChatCorpId, getWeChatUserByCode, listWeChatUsers, sendWeChatMarkdownMessage } from '../services/wechat'

const PUBLIC_CONFIG_KEYS = ['amap_key', 'amap_security_code'] as const
const SENSITIVE_KEY_PATTERN = /(secret|token|password|pin|verify|access_key|private_key)/i
const CONFIG_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const MAX_CONFIG_COUNT = 100
const MAX_CONFIG_VALUE_LENGTH = 10_000

interface ConfigInput {
  key?: unknown
  value?: unknown
}

interface ConfigPayload {
  keys?: unknown
}

export const configRoutes = new Hono<{ Bindings: Env }>()

const WECHAT_OAUTH_STATE_TTL_SECONDS = 10 * 60

function maskConfigValue(key: string, value: string) {
  if (!SENSITIVE_KEY_PATTERN.test(key)) return value
  if (value.length <= 4) return '****'
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`
}

function frontendOrigin(env: Env) {
  return env.FRONTEND_URL.split(',').map((origin) => origin.trim()).find(Boolean) ?? 'https://crm.jzfwsh.ltd'
}

function oauthCallbackHtml(origin: string, payload: { userid?: string; name?: string; error?: string }) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c')
  const safeOrigin = JSON.stringify(origin).replace(/</g, '\\u003c')
  return `<!doctype html><meta charset="utf-8"><title>企业微信授权</title><script>window.opener&&window.opener.postMessage(${safePayload},${safeOrigin});window.close();</script><p>授权结果已返回 CRM，可以关闭此窗口。</p>`
}

// OAuth callback is opened by WeCom and therefore cannot carry the CRM JWT.
configRoutes.get('/wechat-oauth/callback', async (c) => {
  const code = c.req.query('code')?.trim()
  const state = c.req.query('state')?.trim()
  if (!code || !state) return c.html(oauthCallbackHtml(frontendOrigin(c.env), { error: '企业微信授权参数缺失' }), 400)

  const rawState = await c.env.CACHE.get(`wechat_oauth_state:${state}`)
  if (!rawState) return c.html(oauthCallbackHtml(frontendOrigin(c.env), { error: '授权已过期，请重新发起授权' }), 400)
  await c.env.CACHE.delete(`wechat_oauth_state:${state}`)

  let stateData: { origin?: string }
  try { stateData = JSON.parse(rawState) as { origin?: string } } catch { stateData = {} }
  const origin = stateData.origin || frontendOrigin(c.env)
  try {
    const user = await getWeChatUserByCode(c.env, code)
    return c.html(oauthCallbackHtml(origin, user))
  } catch (error) {
    console.error('WeChat OAuth callback failed', error)
    return c.html(oauthCallbackHtml(origin, { error: '企业微信授权失败，请确认应用已配置网页授权域名' }), 502)
  }
})

configRoutes.get('/public', async (c) => {
  const db = createDb(c.env.DB)
  const configs = await db
    .select({ key: systemConfigs.configKey, value: systemConfigs.configValue })
    .from(systemConfigs)
    .where(inArray(systemConfigs.configKey, [...PUBLIC_CONFIG_KEYS]))

  return c.json({ configs: Object.fromEntries(configs.map(({ key, value }) => [key, value])) })
})

configRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

configRoutes.use('*', async (c, next) => {
  const payload = c.get('jwtPayload') as { role?: unknown }
  if (payload.role !== 'admin') {
    return c.json({ error: '仅管理员可以管理系统配置' }, 403)
  }
  await next()
})

configRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const configs = await db
    .select({
      key: systemConfigs.configKey,
      value: systemConfigs.configValue,
      updatedAt: systemConfigs.updatedAt,
    })
    .from(systemConfigs)
    .orderBy(asc(systemConfigs.configKey))

  return c.json({
    configs: configs.map((config) => ({
      key: config.key,
      value: maskConfigValue(config.key, config.value),
      updated_at: config.updatedAt.toISOString(),
    })),
  })
})

configRoutes.post('/', async (c) => {
  let body: ConfigPayload

  try {
    body = await c.req.json<ConfigPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > MAX_CONFIG_COUNT) {
    return c.json({ error: `keys 必须是包含 1-${MAX_CONFIG_COUNT} 项的数组` }, 400)
  }

  const entries = body.keys as ConfigInput[]
  if (
    !entries.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.key === 'string' &&
        CONFIG_KEY_PATTERN.test(entry.key) &&
        typeof entry.value === 'string' &&
        entry.value.length <= MAX_CONFIG_VALUE_LENGTH,
    )
  ) {
    return c.json({ error: '配置项格式无效，请检查 key 和 value' }, 400)
  }

  const uniqueEntries = [...new Map(entries.map((entry) => [entry.key as string, entry.value as string])).entries()]
  const updatedAt = new Date()
  const db = createDb(c.env.DB)

  const statements = uniqueEntries.map(([key, value]) =>
    db
      .insert(systemConfigs)
      .values({ configKey: key, configValue: value, updatedAt })
      .onConflictDoUpdate({
        target: systemConfigs.configKey,
        set: { configValue: value, updatedAt },
      }),
  )
  const [firstStatement, ...remainingStatements] = statements
  if (!firstStatement) {
    return c.json({ error: '没有可更新的配置项' }, 400)
  }

  await db.batch([firstStatement, ...remainingStatements])

  return c.json({ updated: uniqueEntries.length })
})

configRoutes.post('/test-wechat', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const db = createDb(c.env.DB)
  const [user] = await db
    .select({ name: users.name, wechatUserId: users.wechatUserId })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1)
  const wechatUserId = user?.wechatUserId?.trim()
  if (!wechatUserId) return c.json({ error: '请先在员工管理中为当前管理员填写企业微信 UserID' }, 400)

  try {
    const accessToken = await getWeChatAccessToken(c.env)
    await sendWeChatMarkdownMessage(
      c.env,
      accessToken,
      wechatUserId,
      [
        '✅ **CRM 企业微信测试消息**',
        `管理员：${user.name}`,
        '续费提醒和任务提醒的发送配置已连通。',
      ].join('\n'),
    )
    return c.json({ sent: true })
  } catch (error) {
    console.error('WeChat test message failed', error)
    return c.json({ error: '测试消息发送失败，请检查企业标识、应用密钥、Agent ID 和员工企业微信 UserID' }, 502)
  }
})

configRoutes.post('/wechat-oauth/start', async (c) => {
  const payload = c.get('jwtPayload') as { sub?: unknown }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return c.json({ error: '登录凭证无效' }, 401)

  let requestedOrigin = c.req.header('Origin')?.trim() || frontendOrigin(c.env)
  const allowedOrigins = new Set(c.env.FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean))
  if (!allowedOrigins.has(requestedOrigin)) requestedOrigin = frontendOrigin(c.env)

  const state = crypto.randomUUID()
  const callbackUrl = new URL('/api/configs/wechat-oauth/callback', new URL(c.req.url).origin)
  const corpId = (await getWeChatCorpId(c.env)).trim()
  if (!corpId || corpId.startsWith('REPLACE_WITH_')) return c.json({ error: '请先配置企业微信 Corp ID' }, 400)
  const authorizeUrl = new URL('https://open.weixin.qq.com/connect/oauth2/authorize')
  authorizeUrl.searchParams.set('appid', corpId)
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl.toString())
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', 'snsapi_base')
  authorizeUrl.searchParams.set('state', state)
  await c.env.CACHE.put(`wechat_oauth_state:${state}`, JSON.stringify({ actorId: payload.sub, origin: requestedOrigin }), { expirationTtl: WECHAT_OAUTH_STATE_TTL_SECONDS })

  return c.json({ authorizeUrl: `${authorizeUrl.toString()}#wechat_redirect` })
})

configRoutes.get('/wechat-users', async (c) => {
  try {
    const users = await listWeChatUsers(c.env)
    return c.json({ users })
  } catch (error) {
    console.error('WeChat user directory request failed', error)
    return c.json({ error: '企业微信成员获取失败，请检查 Corp ID、应用 Secret 及通讯录读取权限' }, 502)
  }
})
