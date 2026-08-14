// apps/api/src/routes/customers.ts
import { createDb } from '@crm/db/client'
import { activities, customers, deals } from '@crm/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Env } from '../env'

export const customerRoutes = new Hono<{ Bindings: Env }>()

customerRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const customerList = await db.select().from(customers).orderBy(desc(customers.createdAt))

  return c.json({ customers: customerList })
})

customerRoutes.get('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const customerId = c.req.param('id')
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1)

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
