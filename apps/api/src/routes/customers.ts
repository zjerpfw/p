// apps/api/src/routes/customers.ts
import { createDb } from '@crm/db/client'
import { activities, customers, deals } from '@crm/db/schema'
import { and, count, desc, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const customerRoutes = new Hono<{ Bindings: Env }>()

customerRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

function parsePagination(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

customerRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 10, 100)
  const filters = [
    search ? like(customers.name, `%${search}%`) : undefined,
    status ? eq(customers.status, status) : undefined,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length ? and(...filters) : undefined
  const [customerList, [{ total }]] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(customers).where(where),
  ])

  return c.json({
    data: customerList,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
})

customerRoutes.get('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const customerId = c.req.param('id')
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)

  if (!customer) {
    return c.json({ error: '客户不存在' }, 404)
  }

  const customerDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.customerId, customer.id))
    .orderBy(desc(deals.createdAt))

  const customerActivities = customerDeals.length
    ? await db
        .select({
          id: activities.id,
          dealId: activities.dealId,
          dealStage: deals.stage,
          type: activities.type,
          notes: activities.notes,
          checkInLng: activities.checkInLng,
          checkInLat: activities.checkInLat,
          checkInAddress: activities.checkInAddress,
          createdBy: activities.createdBy,
          createdAt: activities.createdAt,
        })
        .from(activities)
        .innerJoin(deals, eq(activities.dealId, deals.id))
        .where(inArray(activities.dealId, customerDeals.map((deal) => deal.id)))
        .orderBy(desc(activities.createdAt))
    : []

  return c.json({
    customer,
    deals: customerDeals,
    activities: customerActivities,
  })
})
