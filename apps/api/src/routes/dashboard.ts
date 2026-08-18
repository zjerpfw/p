// apps/api/src/routes/dashboard.ts
import { createDb } from '@crm/db/client'
import { activities, contracts, customers, deals, payments, tasks, users } from '@crm/db/schema'
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { todayInShanghai } from '../lib/shanghai-date'

export const dashboardRoutes = new Hono<{ Bindings: Env }>()

const stageLabels: Record<string, string> = {
  Leads: '初步线索',
  Qualified: '需求确认',
  Proposal: '方案报价',
  Won: '赢单成交',
  Lost: '遗憾输单',
}

async function runDashboardQuery<T>(name: string, query: () => Promise<T>): Promise<T> {
  try {
    return await query()
  } catch (error) {
    console.error('Dashboard query failed', {
      query: name,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

dashboardRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

dashboardRoutes.get('/', async (c) => {
  const now = new Date()
  const todayStart = todayInShanghai(now)
  const renewalDeadline = new Date(now)
  renewalDeadline.setDate(renewalDeadline.getDate() + 60)
  const staleFollowUpAt = new Date(now.getTime() - 7 * 86_400_000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const ownerFilter = actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined
  const taskVisibilityFilter = actor.role !== 'admin'
    ? or(eq(tasks.assigneeId, actor.id), eq(tasks.createdBy, actor.id), eq(customers.ownerId, actor.id))
    : undefined
  const activeFilters = [eq(customers.isDeleted, false), eq(deals.isDeleted, false), ownerFilter]

  // D1 queries are deliberately serialized. Concurrent dashboard aggregates can exhaust the
  // subrequest resources available to a single Worker invocation and turn the whole page into a 500.
  const [newLead] = await runDashboardQuery('new-leads', () => db
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(eq(deals.stage, 'Leads'), gte(deals.createdAt, monthStart), lt(deals.createdAt, nextMonthStart), ...activeFilters)))
  const [wonProfit] = await runDashboardQuery('won-profit', () => db
      .select({ totalCents: sql<number>`coalesce(sum(${deals.netProfitCents}), 0)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(eq(deals.stage, 'Won'), gte(deals.wonAt, monthStart), lt(deals.wonAt, nextMonthStart), ...activeFilters)))
  const [weightedForecast] = await runDashboardQuery('weighted-forecast', () => db
      .select({ totalCents: sql<number>`coalesce(sum(${deals.amountCents} * ${deals.probability} / 100), 0)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(
        inArray(deals.stage, ['Leads', 'Qualified', 'Proposal']),
        ...activeFilters,
      )))
  const stageDistribution = await runDashboardQuery('stage-distribution', () => db
      .select({ stage: deals.stage, count: sql<number>`count(*)` })
      .from(deals)
      .innerJoin(customers, eq(deals.customerId, customers.id))
      .where(and(...activeFilters))
      .groupBy(deals.stage))
  const renewalCustomers = await runDashboardQuery('renewal-customers', () => db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        expireDate: customers.saasExpireDate,
      })
      .from(customers)
      .where(and(
        eq(customers.isDeleted, false),
        isNotNull(customers.saasExpireDate),
        gt(customers.saasExpireDate, now),
        lte(customers.saasExpireDate, renewalDeadline),
        ownerFilter,
      ))
      .orderBy(asc(customers.saasExpireDate)))
  const overdueReceivables = await runDashboardQuery('overdue-receivables', () => db
      .select({
        id: contracts.id,
        customerId: contracts.customerId,
        customerName: customers.name,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        paymentDueAt: contracts.paymentDueAt,
        totalAmountCents: contracts.totalAmountCents,
        receivedAmountCents: sql<number>`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0)`,
      })
      .from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .leftJoin(payments, eq(payments.contractId, contracts.id))
      .where(and(
        eq(contracts.status, 'Active'),
        eq(customers.isDeleted, false),
        isNotNull(contracts.paymentDueAt),
        lt(contracts.paymentDueAt, now),
        ownerFilter,
      ))
      .groupBy(contracts.id)
      .having(sql`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0) < ${contracts.totalAmountCents}`)
      .orderBy(asc(contracts.paymentDueAt))
      .limit(20))
  const [taskSummary] = await runDashboardQuery('task-summary', () => db
      .select({
        openCount: sql<number>`count(*)`,
        overdueCount: sql<number>`coalesce(sum(case when ${tasks.dueAt} < ${todayStart} then 1 else 0 end), 0)`,
      })
      .from(tasks)
      .innerJoin(customers, eq(tasks.customerId, customers.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), taskVisibilityFilter)))
  const overdueTasks = await runDashboardQuery('overdue-tasks', () => db
      .select({
        id: tasks.id,
        customerId: tasks.customerId,
        customerName: customers.name,
        title: tasks.title,
        dueAt: tasks.dueAt,
        priority: tasks.priority,
        assigneeName: users.name,
      })
      .from(tasks)
      .innerJoin(customers, eq(tasks.customerId, customers.id))
      .innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), lt(tasks.dueAt, todayStart), taskVisibilityFilter))
      .orderBy(asc(tasks.dueAt))
      .limit(10))
  const [staleFollowUpSummary] = await runDashboardQuery('stale-follow-up-summary', () => db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(
        eq(customers.isDeleted, false),
        ownerFilter,
        sql`not exists (select 1 from ${activities} where ${activities.customerId} = ${customers.id} and ${activities.createdAt} >= ${staleFollowUpAt})`,
      )))
  const staleFollowUps = await runDashboardQuery('stale-follow-ups', () => db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        ownerName: users.name,
        lastActivityAt: sql<number | null>`(select max(${activities.createdAt}) from ${activities} where ${activities.customerId} = ${customers.id})`,
      })
      .from(customers)
      .leftJoin(users, eq(customers.ownerId, users.id))
      .where(and(
        eq(customers.isDeleted, false),
        ownerFilter,
        sql`not exists (select 1 from ${activities} where ${activities.customerId} = ${customers.id} and ${activities.createdAt} >= ${staleFollowUpAt})`,
      ))
      .orderBy(asc(sql`coalesce((select max(${activities.createdAt}) from ${activities} where ${activities.customerId} = ${customers.id}), 0)`))
      .limit(10))

  const renewalCustomerIds = renewalCustomers.map((customer) => customer.customerId)
  const renewalDealRows = renewalCustomerIds.length > 0
    ? await db
        .select({
          id: deals.id,
          customerId: deals.customerId,
          productName: deals.productName,
          channel: deals.channel,
          giftMonths: deals.giftMonths,
          amountCents: deals.amountCents,
          createdAt: deals.createdAt,
        })
        .from(deals)
        .where(and(
          inArray(deals.customerId, renewalCustomerIds),
          eq(deals.stage, 'Won'),
          eq(deals.isDeleted, false),
        ))
        .orderBy(desc(deals.createdAt))
    : []
  const latestDealByCustomer = new Map<string, (typeof renewalDealRows)[number]>()
  for (const deal of renewalDealRows) {
    if (!latestDealByCustomer.has(deal.customerId)) latestDealByCustomer.set(deal.customerId, deal)
  }

  const normalizedStageDistribution = stageDistribution.map((item) => ({
    stage: item.stage,
    count: Number(item.count),
  }))

  return c.json({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    newLeads: Number(newLead?.count ?? 0),
    wonNetProfitCents: Number(wonProfit?.totalCents ?? 0),
    weightedForecastCents: Number(weightedForecast?.totalCents ?? 0),
    taskSummary: { openCount: Number(taskSummary?.openCount ?? 0), overdueCount: Number(taskSummary?.overdueCount ?? 0) },
    staleFollowUpCount: Number(staleFollowUpSummary?.count ?? 0),
    stageDistribution: normalizedStageDistribution,
    funnelDistribution: normalizedStageDistribution.map((item) => ({
      name: stageLabels[item.stage] ?? item.stage,
      value: item.count,
      stage: item.stage,
    })),
    renewalDeals: renewalCustomers.flatMap((customer) => {
      const latestDeal = latestDealByCustomer.get(customer.customerId)
      if (!latestDeal || !customer.expireDate) return []
      return [{
        ...latestDeal,
        customerId: customer.customerId,
        customerName: customer.customerName,
        expireDate: customer.expireDate.toISOString(),
      }]
    }),
    overdueReceivables: overdueReceivables.flatMap((contract) => {
      if (!contract.paymentDueAt) return []
      const outstandingAmountCents = contract.totalAmountCents - Number(contract.receivedAmountCents)
      return [{
        ...contract,
        outstandingAmountCents,
        overdueDays: Math.max(0, Math.floor((now.getTime() - contract.paymentDueAt.getTime()) / 86_400_000)),
      }]
    }),
    overdueTasks: overdueTasks.map((task) => ({
      ...task,
      overdueDays: Math.max(0, Math.floor((todayStart.getTime() - todayInShanghai(task.dueAt).getTime()) / 86_400_000)),
    })),
    staleFollowUps: staleFollowUps.map((customer) => ({
      ...customer,
      lastActivityAt: customer.lastActivityAt ? new Date(customer.lastActivityAt).toISOString() : null,
    })),
  })
})
