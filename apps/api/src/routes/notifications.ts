// apps/api/src/routes/notifications.ts
import { createDb } from '@crm/db/client'
import { notificationLogs, notificationStatuses, notificationTypes, users } from '@crm/db/schema'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const notificationRoutes = new Hono<{ Bindings: Env }>()

notificationRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000) : 1
}

function parseLimit(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50
}

notificationRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以查看通知发送记录' }, 403)

  const status = c.req.query('status')
  const type = c.req.query('type')
  if (status && !notificationStatuses.includes(status as (typeof notificationStatuses)[number])) return c.json({ error: '通知状态无效' }, 400)
  if (type && !notificationTypes.includes(type as (typeof notificationTypes)[number])) return c.json({ error: '通知类型无效' }, 400)

  const filters = [
    status ? eq(notificationLogs.status, status as (typeof notificationStatuses)[number]) : undefined,
    type ? eq(notificationLogs.type, type as (typeof notificationTypes)[number]) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length > 0 ? and(...filters) : undefined
  const page = parsePage(c.req.query('page'))
  const limit = parseLimit(c.req.query('limit'))
  const db = createDb(c.env.DB)
  const [notifications, [{ total }]] = await Promise.all([
    db.select({
      id: notificationLogs.id,
      type: notificationLogs.type,
      referenceId: notificationLogs.referenceId,
      recipientUserId: notificationLogs.recipientUserId,
      recipientName: users.name,
      reminderDate: notificationLogs.reminderDate,
      status: notificationLogs.status,
      lastError: notificationLogs.lastError,
      attemptCount: notificationLogs.attemptCount,
      sentAt: notificationLogs.sentAt,
      createdAt: notificationLogs.createdAt,
    }).from(notificationLogs)
      .leftJoin(users, eq(notificationLogs.recipientUserId, users.id))
      .where(where)
      .orderBy(desc(notificationLogs.createdAt), asc(notificationLogs.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(notificationLogs).where(where),
  ])

  return c.json({ notifications, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
})

export type NotificationRoutes = typeof notificationRoutes
