// apps/api/src/routes/audit-logs.ts
import { createDb } from '@crm/db/client'
import { auditActions, auditLogs, users } from '@crm/db/schema'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const auditLogRoutes = new Hono<{ Bindings: Env }>()

auditLogRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

auditLogRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以查看审计日志' }, 403)
  const entityType = c.req.query('entity_type')?.trim().slice(0, 50)
  const action = c.req.query('action')?.trim()
  if (action && !auditActions.includes(action as (typeof auditActions)[number])) return c.json({ error: '操作类型无效' }, 400)
  const rawPage = Number.parseInt(c.req.query('page') ?? '', 10)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000) : 1
  const rawLimit = Number.parseInt(c.req.query('limit') ?? '', 10)
  const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50
  const db = createDb(c.env.DB)
  const filters = [
    entityType ? eq(auditLogs.entityType, entityType) : undefined,
    action ? eq(auditLogs.action, action as (typeof auditActions)[number]) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length > 0 ? and(...filters) : undefined
  const [logs, [{ total }]] = await Promise.all([
    db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      actorName: users.name,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      beforeValue: auditLogs.beforeValue,
      afterValue: auditLogs.afterValue,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
    .limit(limit)
    .offset((page - 1) * limit),
    db.select({ total: count() }).from(auditLogs).where(where),
  ])
  return c.json({ logs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
})
