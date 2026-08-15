// apps/api/src/routes/deals.ts
import { createDb } from '@crm/db/client'
import { customers, dealSplits, deals, dealStages, users } from '@crm/db/schema'
import { and, count, desc, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
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
  product_name?: unknown
  channel?: unknown
  original_price?: unknown
  start_date?: unknown
  duration_years?: unknown
  gift_months?: unknown
  expire_date?: unknown
  renewal_reminder_days?: unknown
  software_cost?: unknown
  tax_cost?: unknown
  rebate_amount?: unknown
  net_profit?: unknown
  splits?: unknown
}

interface UpdateDealPayload {
  product_name?: unknown
  channel?: unknown
  original_price?: unknown
  amount?: unknown
  stage?: unknown
  expected_close_date?: unknown
  start_date?: unknown
  duration_years?: unknown
  gift_months?: unknown
  expire_date?: unknown
  renewal_reminder_days?: unknown
  software_cost?: unknown
  tax_cost?: unknown
  rebate_amount?: unknown
  net_profit?: unknown
}

interface CreateDealPayload {
  customer_id?: unknown
  product_name?: unknown
  channel?: unknown
  original_price?: unknown
  amount?: unknown
  stage?: unknown
  expected_close_date?: unknown
}

const productNameSchema = z.string().trim().min(1, '请填写产品名称或版本').max(200, '产品名称或版本不能超过 200 个字符')
const createDealSchema = z.object({
  customer_id: z.string().uuid('客户编号无效'),
  product_name: productNameSchema,
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
  original_price: z.number().int().nonnegative('原价不能小于 0').optional(),
  amount: z.number().int().nonnegative('预计金额不能小于 0'),
  stage: z.enum(['Leads', 'Qualified', 'Proposal', 'Lost']).optional().default('Leads'),
  expected_close_date: z.union([z.string(), z.number()]),
})
const updateProductSchema = z.object({
  product_name: productNameSchema.optional(),
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional(),
  original_price: z.number().int().nonnegative('原价不能小于 0').optional(),
})
const wonProductSchema = z.object({
  product_name: productNameSchema,
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
  original_price: z.number().int().nonnegative('原价不能小于 0').optional(),
})
const wonGiftMonthsSchema = z.object({ gift_months: z.number().int().nonnegative('赠送时长不能小于 0').optional().default(0) })
const updateGiftMonthsSchema = z.object({ gift_months: z.number().int().nonnegative('赠送时长不能小于 0').optional() })

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

function calculateExpireDate(startDate: Date, durationYears: number, giftMonths: number) {
  const date = new Date(startDate)
  date.setFullYear(date.getFullYear() + durationYears)
  date.setMonth(date.getMonth() + giftMonths)
  return date
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
    eq(deals.isDeleted, false),
    eq(customers.isDeleted, false),
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
      channel: deals.channel,
      originalPrice: deals.originalPrice,
      productName: deals.productName,
      stage: deals.stage,
      expectedCloseDate: deals.expectedCloseDate,
      startDate: deals.startDate,
      durationYears: deals.durationYears,
      giftMonths: deals.giftMonths,
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

dealRoutes.post('/', async (c) => {
  let body: CreateDealPayload
  try {
    body = await c.req.json<CreateDealPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const parsed = createDealSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '商机资料格式无效' }, 400)
  const expectedCloseDate = parseDate(parsed.data.expected_close_date)
  if (!expectedCloseDate) return c.json({ error: '预计成交日无效' }, 400)

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(
      eq(customers.id, parsed.data.customer_id),
      eq(customers.isDeleted, false),
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权新建商机' }, 404)

  const deal = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    productName: parsed.data.product_name,
    amount: parsed.data.amount,
    channel: parsed.data.channel || null,
    originalPrice: parsed.data.original_price ?? parsed.data.amount,
    stage: parsed.data.stage,
    expectedCloseDate,
    createdAt: new Date(),
  }
  await db.insert(deals).values(deal)
  return c.json({ deal }, 201)
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
  const productNameResult = wonProductSchema.safeParse(body)
  const giftMonthsResult = wonGiftMonthsSchema.safeParse(body)
  const durationYears = body.duration_years
  if (
    !productNameResult.success ||
    !giftMonthsResult.success ||
    !startDate ||
    !expireDate ||
    !isInteger(durationYears) ||
    durationYears <= 0 ||
    financialFields.some((field) => !isInteger(body[field])) ||
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
  const calculatedExpireDate = calculateExpireDate(startDate, durationYears, giftMonthsResult.data.gift_months)
  if (expireDate.getTime() !== calculatedExpireDate.getTime()) {
    return c.json({ error: '到期时间与服务年限、赠送时长不一致' }, 400)
  }

  const dealId = c.req.param('id')
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const [deal] = await db
    .select({ id: deals.id, amount: deals.amount, originalPrice: deals.originalPrice })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, dealId), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
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
      productName: productNameResult.data.product_name,
      channel: productNameResult.data.channel || null,
      originalPrice: productNameResult.data.original_price ?? deal.originalPrice ?? deal.amount,
      startDate,
      durationYears,
      giftMonths: giftMonthsResult.data.gift_months,
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

dealRoutes.put('/:id', async (c) => {
  let body: UpdateDealPayload
  try {
    body = await c.req.json<UpdateDealPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const amount = body.amount === undefined ? undefined : isInteger(body.amount) && body.amount >= 0 ? body.amount : null
  const productNameResult = updateProductSchema.safeParse(body)
  const giftMonthsResult = updateGiftMonthsSchema.safeParse(body)
  const stage = body.stage === undefined ? undefined : typeof body.stage === 'string' && dealStages.includes(body.stage as (typeof dealStages)[number]) ? body.stage as (typeof dealStages)[number] : null
  const expectedCloseDate = body.expected_close_date === undefined ? undefined : parseDate(body.expected_close_date)
  const startDate = body.start_date === undefined ? undefined : parseDate(body.start_date)
  const expireDate = body.expire_date === undefined ? undefined : parseDate(body.expire_date)
  const integerFields = [
    ['durationYears', body.duration_years],
    ['renewalReminderDays', body.renewal_reminder_days],
    ['softwareCost', body.software_cost],
    ['taxCost', body.tax_cost],
    ['rebateAmount', body.rebate_amount],
    ['netProfit', body.net_profit],
  ] as const
  if (!productNameResult.success || !giftMonthsResult.success || amount === null || stage === null || (body.expected_close_date !== undefined && !expectedCloseDate) || (body.start_date !== undefined && !startDate) || (body.expire_date !== undefined && !expireDate) || integerFields.some(([, value]) => value !== undefined && (!isInteger(value) || value < 0))) {
    return c.json({ error: '商机资料格式无效' }, 400)
  }

  const updates = {
    ...(amount !== undefined ? { amount } : {}),
    ...(productNameResult.data.product_name !== undefined ? { productName: productNameResult.data.product_name } : {}),
    ...(productNameResult.data.channel !== undefined ? { channel: productNameResult.data.channel || null } : {}),
    ...(productNameResult.data.original_price !== undefined ? { originalPrice: productNameResult.data.original_price } : {}),
    ...(giftMonthsResult.data.gift_months !== undefined ? { giftMonths: giftMonthsResult.data.gift_months } : {}),
    ...(stage !== undefined ? { stage } : {}),
    ...(expectedCloseDate ? { expectedCloseDate } : {}),
    ...(startDate ? { startDate } : {}),
    ...(expireDate ? { expireDate } : {}),
    ...Object.fromEntries(integerFields.filter(([, value]) => value !== undefined).map(([key, value]) => [key, value])),
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: '请至少提供一个需要更新的字段' }, 400)
  }
  const db = createDb(c.env.DB)
  const [authorizedDeal] = await db
    .select({ id: deals.id, stage: deals.stage, startDate: deals.startDate, durationYears: deals.durationYears, giftMonths: deals.giftMonths })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, c.req.param('id')), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!authorizedDeal) return c.json({ error: '商机不存在或无权编辑' }, 404)
  if (stage === 'Won' && authorizedDeal.stage !== 'Won') {
    return c.json({ error: '请使用确认赢单流程完成服务期限、财务和分成信息' }, 400)
  }

  if (authorizedDeal.stage === 'Won' && (startDate || body.duration_years !== undefined || giftMonthsResult.data.gift_months !== undefined)) {
    const effectiveStartDate = startDate ?? authorizedDeal.startDate
    const effectiveDurationYears = body.duration_years ?? authorizedDeal.durationYears
    const effectiveGiftMonths = giftMonthsResult.data.gift_months ?? authorizedDeal.giftMonths
    if (!effectiveStartDate || !effectiveDurationYears || effectiveGiftMonths === null || effectiveGiftMonths === undefined) {
      return c.json({ error: '赢单商机缺少完整的服务期限信息' }, 400)
    }
    const calculatedExpireDate = calculateExpireDate(effectiveStartDate, effectiveDurationYears, effectiveGiftMonths)
    if (!expireDate || expireDate.getTime() !== calculatedExpireDate.getTime()) {
      return c.json({ error: '到期时间与服务年限、赠送时长不一致' }, 400)
    }
  }

  if (authorizedDeal.stage === 'Won' && body.net_profit !== undefined) {
    const netProfit = body.net_profit
    if (!isInteger(netProfit) || netProfit < 0) {
      return c.json({ error: '商机资料格式无效' }, 400)
    }
    const splitRows = await db
      .select({ splitAmount: dealSplits.splitAmount })
      .from(dealSplits)
      .where(eq(dealSplits.dealId, authorizedDeal.id))
    const assignedAmount = splitRows.reduce((total, split) => total + split.splitAmount, 0)
    if (assignedAmount > netProfit) {
      return c.json({ error: '实际利润不能低于已分配的订单分成金额' }, 400)
    }
  }

  const [deal] = await db
    .update(deals)
    .set(updates)
    .where(eq(deals.id, authorizedDeal.id))
    .returning()
  if (!deal) return c.json({ error: '商机更新失败' }, 500)

  return c.json({ deal })
})

dealRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorizedDeal] = await db
    .select({ id: deals.id })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, c.req.param('id')), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!authorizedDeal) return c.json({ error: '商机不存在或无权作废' }, 404)

  const [deal] = await db
    .update(deals)
    .set({ isDeleted: true })
    .where(eq(deals.id, authorizedDeal.id))
    .returning({ id: deals.id })
  if (!deal) return c.json({ error: '商机作废失败' }, 500)

  return c.json({ id: deal.id, isDeleted: true })
})
