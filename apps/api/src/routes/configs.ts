// apps/api/src/routes/configs.ts
import { createDb } from '@crm/db/client'
import { systemConfigs } from '@crm/db/schema'
import { asc, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'

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

function maskConfigValue(key: string, value: string) {
  if (!SENSITIVE_KEY_PATTERN.test(key)) return value
  if (value.length <= 4) return '****'
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`
}

configRoutes.get('/public', async (c) => {
  const db = createDb(c.env.DB)
  const configs = await db
    .select({ key: systemConfigs.configKey, value: systemConfigs.configValue })
    .from(systemConfigs)
    .where(inArray(systemConfigs.configKey, [...PUBLIC_CONFIG_KEYS]))

  return c.json({ configs: Object.fromEntries(configs.map(({ key, value }) => [key, value])) })
})

configRoutes.use('/', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

configRoutes.use('/', async (c, next) => {
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
