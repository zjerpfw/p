// apps/api/src/routes/dashboard.ts
import { createDb } from '@crm/db/client'
import { customers, deals } from '@crm/db/schema'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const dashboardRoutes = new Hono<{ Bindings: Env }>()

dashboardRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

dashboardRoutes.get('/', async (c) => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const ownerFilter = actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined
  const activeFilters = [eq(customers.isDeleted, false), eq(deals.isDeleted, false), ownerFilter]

  const [[newLead], [wonProfit], stageDistribution] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(eq(deals.stage, 'Leads'), gte(deals.createdAt, monthStart), lt(deals.createdAt, nextMonthStart), ...activeFilters)),
    db
      .select({ total: sql<number>`coalesce(sum(${deals.netProfit}), 0)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(eq(deals.stage, 'Won'), gte(deals.createdAt, monthStart), lt(deals.createdAt, nextMonthStart), ...activeFilters)),
    db
      .select({ stage: deals.stage, count: sql<number>`count(*)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(...activeFilters))
      .groupBy(deals.stage),
  ])

  return c.json({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    newLeads: Number(newLead?.count ?? 0),
    wonNetProfit: Number(wonProfit?.total ?? 0),
    stageDistribution: stageDistribution.map((item) => ({
      stage: item.stage,
      count: Number(item.count),
    })),
  })
})
