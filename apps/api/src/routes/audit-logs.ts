// apps/api/src/routes/audit-logs.ts
import { createDb } from '@crm/db/client'
import { auditLogs, users } from '@crm/db/schema'
import { asc, desc, eq } from 'drizzle-orm'
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
  const rawLimit = Number.parseInt(c.req.query('limit') ?? '', 10)
  const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100
  const db = createDb(c.env.DB)
  const logs = await db
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
    .where(entityType ? eq(auditLogs.entityType, entityType) : undefined)
    .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
    .limit(limit)
  return c.json({ logs })
})
