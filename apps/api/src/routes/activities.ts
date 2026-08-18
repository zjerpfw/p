// apps/api/src/routes/activities.ts
import { createDb } from '@crm/db/client'
import { activities, activityTypes, customers, deals } from '@crm/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'

interface ActivityPayload {
  customer_id?: unknown
  deal_id?: unknown
  type?: unknown
  notes?: unknown
  check_in_lng?: unknown
  check_in_lat?: unknown
  check_in_address?: unknown
}

function isNullableNumber(value: unknown): value is number | null | undefined {
  return value === null || value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export const activityRoutes = new Hono<{ Bindings: Env }>()

activityRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

activityRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const db = createDb(c.env.DB)
  const activityList = await db
    .select({
      id: activities.id,
      type: activities.type,
      notes: activities.notes,
      checkInAddress: activities.checkInAddress,
      createdAt: activities.createdAt,
      dealId: activities.dealId,
      customerId: customers.id,
      customerName: customers.name,
      productName: deals.productName,
      dealStage: deals.stage,
    })
    .from(activities)
    .innerJoin(customers, eq(activities.customerId, customers.id))
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .where(and(
      eq(activities.createdBy, actor.id),
      eq(customers.isDeleted, false),
    ))
    .orderBy(desc(activities.createdAt))
    .limit(30)

  return c.json({ activities: activityList })
})

activityRoutes.post('/', async (c) => {
  let body: ActivityPayload

  try {
    body = await c.req.json<ActivityPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (
    typeof body.customer_id !== 'string' ||
    body.customer_id.trim().length === 0 ||
    (body.deal_id !== undefined && body.deal_id !== null && (typeof body.deal_id !== 'string' || body.deal_id.trim().length === 0)) ||
    typeof body.type !== 'string' ||
    !activityTypes.includes(body.type as (typeof activityTypes)[number]) ||
    typeof body.notes !== 'string' ||
    body.notes.trim().length === 0 ||
    !isNullableNumber(body.check_in_lng) ||
    !isNullableNumber(body.check_in_lat) ||
    (body.check_in_address !== undefined && body.check_in_address !== null && typeof body.check_in_address !== 'string')
  ) {
    return c.json({ error: '跟进记录参数无效' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(
      eq(customers.id, body.customer_id),
      eq(customers.isDeleted, false),
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .limit(1)
  if (!customer) {
    return c.json({ error: '客户不存在或无权添加跟进记录' }, 404)
  }

  let dealId: string | null = null
  if (typeof body.deal_id === 'string') {
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.id, body.deal_id), eq(deals.customerId, customer.id), eq(deals.isDeleted, false)))
      .limit(1)
    if (!deal) return c.json({ error: '关联商机不存在或不属于当前客户' }, 400)
    dealId = deal.id
  }

  const activity = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    dealId,
    type: body.type as (typeof activityTypes)[number],
    notes: body.notes.trim(),
    checkInLng: body.check_in_lng ?? null,
    checkInLat: body.check_in_lat ?? null,
    checkInAddress: typeof body.check_in_address === 'string' ? body.check_in_address.trim().slice(0, 500) || null : null,
    createdBy: actor.id,
    createdAt: new Date(),
  }

  await db.insert(activities).values(activity)
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Activity', entityId: activity.id, action: 'Created', after: activity }))

  return c.json({ activity }, 201)
})
