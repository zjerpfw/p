// apps/api/src/routes/deals.ts
import { createDb } from '@crm/db/client'
import { customers, dealSplits, deals, dealStages, users } from '@crm/db/schema'
import { and, count, desc, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const dealRoutes = new Hono<{ Bindings: Env }>()

dealRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

interface DealSplitPayload {
  user_id?: unknown
  split_amount?: unknown
}

interface WonDealPayload {
  start_date?: unknown
  duration_years?: unknown
  expire_date?: unknown
  renewal_reminder_days?: unknown
  software_cost?: unknown
  tax_cost?: unknown
  rebate_amount?: unknown
  net_profit?: unknown
  splits?: unknown
}

const financialFields = [
  'duration_years',
  'renewal_reminder_days',
  'software_cost',
  'tax_cost',
  'rebate_amount',
  'net_profit',
] as const

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parsePagination(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

dealRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const stage = status && dealStages.includes(status as (typeof dealStages)[number]) ? status : undefined
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 10, 100)
  const filters = [
    search ? like(customers.name, `%${search}%`) : undefined,
    stage ? eq(deals.stage, stage as (typeof dealStages)[number]) : undefined,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length ? and(...filters) : undefined
  const dealQuery = db
    .select({
      id: deals.id,
      customerId: deals.customerId,
      customerName: customers.name,
      amount: deals.amount,
      stage: deals.stage,
      expectedCloseDate: deals.expectedCloseDate,
      startDate: deals.startDate,
      durationYears: deals.durationYears,
      expireDate: deals.expireDate,
      renewalReminderDays: deals.renewalReminderDays,
      softwareCost: deals.softwareCost,
      taxCost: deals.taxCost,
      rebateAmount: deals.rebateAmount,
      netProfit: deals.netProfit,
      createdAt: deals.createdAt,
    })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(where)
    .orderBy(desc(deals.createdAt))
    .limit(limit)
    .offset((page - 1) * limit)
  const totalQuery = db
    .select({ total: count() })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(where)
  const [dealList, [{ total }]] = await Promise.all([dealQuery, totalQuery])

  return c.json({
    data: dealList,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
})

dealRoutes.post('/:id/won', async (c) => {
  let body: WonDealPayload

  try {
    body = await c.req.json<WonDealPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const startDate = parseDate(body.start_date)
  const expireDate = parseDate(body.expire_date)
  if (
    !startDate ||
    !expireDate ||
    expireDate <= startDate ||
    financialFields.some((field) => !isInteger(body[field])) ||
    (body.duration_years as number) <= 0 ||
    (body.renewal_reminder_days as number) < 0 ||
    !Array.isArray(body.splits) ||
    !body.splits.every(
      (split): split is DealSplitPayload =>
        typeof split === 'object' &&
        split !== null &&
        typeof split.user_id === 'string' &&
        split.user_id.length > 0 &&
        isInteger(split.split_amount) &&
        split.split_amount >= 0,
    )
  ) {
    return c.json({ error: '成交参数无效，请检查日期、财务字段和分成明细' }, 400)
  }

  const dealId = c.req.param('id')
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const [deal] = await db
    .select({ id: deals.id, amount: deals.amount })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, dealId), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!deal) {
    return c.json({ error: '商机不存在' }, 404)
  }

  const splits = body.splits
  const expectedNetProfit =
    deal.amount -
    (body.software_cost as number) -
    (body.tax_cost as number) -
    (body.rebate_amount as number)
  const totalSplitAmount = splits.reduce((total, split) => total + (split.split_amount as number), 0)
  if ((body.net_profit as number) !== expectedNetProfit || totalSplitAmount > expectedNetProfit) {
    return c.json({ error: '实际利润或分成金额不合法' }, 400)
  }

  const userIds = [...new Set(splits.map((split) => split.user_id as string))]
  if (userIds.length > 0) {
    const splitUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, userIds))
    if (splitUsers.length !== userIds.length) {
      return c.json({ error: '存在无效的分成用户' }, 400)
    }
  }

  const updateDeal = db
    .update(deals)
    .set({
      stage: 'Won',
      startDate,
      durationYears: body.duration_years as number,
      expireDate,
      renewalReminderDays: body.renewal_reminder_days as number,
      softwareCost: body.software_cost as number,
      taxCost: body.tax_cost as number,
      rebateAmount: body.rebate_amount as number,
      netProfit: body.net_profit as number,
    })
    .where(eq(deals.id, dealId))

  const splitInserts = splits.map((split) =>
    db.insert(dealSplits).values({
      id: crypto.randomUUID(),
      dealId,
      userId: split.user_id as string,
      splitAmount: split.split_amount as number,
    }),
  )

  // Cloudflare D1 commits a batch atomically, which provides the transaction boundary here.
  await db.batch([updateDeal, ...splitInserts])

  return c.json({ id: dealId, stage: 'Won', splitCount: splits.length })
})
