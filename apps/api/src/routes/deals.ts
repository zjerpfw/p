// apps/api/src/routes/deals.ts
import { createDb } from '@crm/db/client'
import { customers, dealSplits, deals, dealStages, users } from '@crm/db/schema'
import { and, count, desc, eq, inArray, isNull, like, lt, ne, or, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'
import { csvResponse } from '../lib/csv'

export const dealRoutes = new Hono<{ Bindings: Env }>()

dealRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

interface DealSplitPayload {
  user_id?: unknown
  split_amount_cents?: unknown
}

interface WonDealPayload {
  product_name?: unknown
  channel?: unknown
  original_price_cents?: unknown
  start_date?: unknown
  duration_years?: unknown
  gift_months?: unknown
  expire_date?: unknown
  renewal_reminder_days?: unknown
  software_cost_cents?: unknown
  tax_cost_cents?: unknown
  rebate_amount_cents?: unknown
  net_profit_cents?: unknown
  splits?: unknown
}

interface UpdateDealPayload {
  product_name?: unknown
  channel?: unknown
  original_price_cents?: unknown
  amount_cents?: unknown
  stage?: unknown
  expected_close_date?: unknown
  software_cost_cents?: unknown
  tax_cost_cents?: unknown
  rebate_amount_cents?: unknown
  net_profit_cents?: unknown
  probability?: unknown
  lost_reason?: unknown
}

interface CreateDealPayload {
  customer_id?: unknown
  product_name?: unknown
  channel?: unknown
  original_price_cents?: unknown
  amount_cents?: unknown
  stage?: unknown
  probability?: unknown
  lost_reason?: unknown
  expected_close_date?: unknown
}

const productNameSchema = z.string().trim().min(1, '请填写产品名称或版本').max(200, '产品名称或版本不能超过 200 个字符')
const createDealSchema = z.object({
  customer_id: z.string().uuid('客户编号无效'),
  product_name: productNameSchema,
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
  original_price_cents: z.number().int().nonnegative('原价不能小于 0').optional(),
  amount_cents: z.number().int().nonnegative('预计金额不能小于 0'),
  stage: z.enum(['Leads', 'Qualified', 'Proposal', 'Lost']).optional().default('Leads'),
  probability: z.number().int().min(0, '成交概率不能小于 0').max(100, '成交概率不能超过 100').optional(),
  lost_reason: z.string().trim().min(1, '请填写输单原因').max(500, '输单原因不能超过 500 个字符').optional(),
  expected_close_date: z.union([z.string(), z.number()]),
})
const updateProductSchema = z.object({
  product_name: productNameSchema.optional(),
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional(),
  original_price_cents: z.number().int().nonnegative('原价不能小于 0').optional(),
})
const wonProductSchema = z.object({
  product_name: productNameSchema,
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
  original_price_cents: z.number().int().nonnegative('原价不能小于 0').optional(),
})
const wonGiftMonthsSchema = z.object({ gift_months: z.number().int().nonnegative('赠送时长不能小于 0').optional().default(0) })
const probabilitySchema = z.number().int().min(0, '成交概率不能小于 0').max(100, '成交概率不能超过 100')
const lostReasonSchema = z.string().trim().min(1, '请填写输单原因').max(500, '输单原因不能超过 500 个字符')

const defaultProbabilityByStage: Record<(typeof dealStages)[number], number> = {
  Leads: 10,
  Qualified: 35,
  Proposal: 65,
  Won: 100,
  Lost: 0,
}

const financialFields = [
  'duration_years',
  'renewal_reminder_days',
  'software_cost_cents',
  'tax_cost_cents',
  'rebate_amount_cents',
  'net_profit_cents',
] as const

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function getIdempotencyKey(c: Context) {
  const value = c.req.header('x-idempotency-key')?.trim()
  return value && z.string().uuid().safeParse(value).success ? value : null
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

interface PipelineCursor {
  createdAt: number
  id: string
}

function encodePipelineCursor(cursor: PipelineCursor) {
  return btoa(JSON.stringify(cursor)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function decodePipelineCursor(value: string | undefined): PipelineCursor | null | undefined {
  if (!value) return undefined
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const parsed: unknown = JSON.parse(atob(padded))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('createdAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.createdAt !== 'number' ||
      !Number.isSafeInteger(parsed.createdAt) ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0
    ) {
      return null
    }
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

const dealSelection = {
  id: deals.id,
  customerId: deals.customerId,
  customerName: customers.name,
  amountCents: deals.amountCents,
  channel: deals.channel,
  originalPriceCents: deals.originalPriceCents,
  dealType: deals.dealType,
  productName: deals.productName,
  stage: deals.stage,
  probability: deals.probability,
  lostReason: deals.lostReason,
  expectedCloseDate: deals.expectedCloseDate,
  startDate: deals.startDate,
  durationYears: deals.durationYears,
  giftMonths: deals.giftMonths,
  expireDate: deals.expireDate,
  renewalReminderDays: deals.renewalReminderDays,
  softwareCostCents: deals.softwareCostCents,
  taxCostCents: deals.taxCostCents,
  rebateAmountCents: deals.rebateAmountCents,
  netProfitCents: deals.netProfitCents,
  updatedAt: deals.updatedAt,
  createdAt: deals.createdAt,
}

dealRoutes.get('/pipeline', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const db = createDb(c.env.DB)
  const rows = await db
    .select({
      stage: deals.stage,
      count: count(),
      totalAmountCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)`,
      weightedAmountCents: sql<number>`coalesce(sum(case when ${deals.stage} in ('Leads', 'Qualified', 'Proposal') then ${deals.amountCents} * ${deals.probability} / 100 else 0 end), 0)`,
    })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(
      eq(deals.isDeleted, false),
      eq(customers.isDeleted, false),
      search ? like(customers.name, `%${search}%`) : undefined,
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .groupBy(deals.stage)

  const byStage = new Map(rows.map((row) => [row.stage, row]))
  const stages = dealStages.map((stage) => {
    const row = byStage.get(stage)
    return {
      stage,
      count: Number(row?.count ?? 0),
      totalAmountCents: Number(row?.totalAmountCents ?? 0),
      weightedAmountCents: Number(row?.weightedAmountCents ?? 0),
    }
  })

  return c.json({
    count: stages.reduce((total, stage) => total + stage.count, 0),
    totalAmountCents: stages.reduce((total, stage) => total + stage.totalAmountCents, 0),
    weightedAmountCents: stages.reduce((total, stage) => total + stage.weightedAmountCents, 0),
    stages,
  })
})

dealRoutes.get('/pipeline/:stage', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const stageParam = c.req.param('stage')
  if (!dealStages.includes(stageParam as (typeof dealStages)[number])) {
    return c.json({ error: '商机阶段无效' }, 400)
  }
  const stage = stageParam as (typeof dealStages)[number]
  const search = c.req.query('search')?.trim().slice(0, 100)
  const limit = parsePagination(c.req.query('limit'), 10, 50)
  const cursor = decodePipelineCursor(c.req.query('cursor'))
  if (cursor === null) return c.json({ error: '分页游标无效' }, 400)

  const cursorDate = cursor ? new Date(cursor.createdAt) : undefined
  const db = createDb(c.env.DB)
  const rows = await db
    .select(dealSelection)
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(
      eq(deals.stage, stage),
      eq(deals.isDeleted, false),
      eq(customers.isDeleted, false),
      search ? like(customers.name, `%${search}%`) : undefined,
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
      cursor && cursorDate
        ? or(
            lt(deals.createdAt, cursorDate),
            and(eq(deals.createdAt, cursorDate), lt(deals.id, cursor.id)),
          )
        : undefined,
    ))
    .orderBy(desc(deals.createdAt), desc(deals.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const lastItem = data.at(-1)
  return c.json({
    data,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && lastItem
        ? encodePipelineCursor({ createdAt: lastItem.createdAt.getTime(), id: lastItem.id })
        : null,
    },
  })
})

dealRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const stage = status && dealStages.includes(status as (typeof dealStages)[number]) ? status : undefined
  const activeOnly = c.req.query('active_only') === 'true' || c.req.query('active_only') === '1'
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 10, 100)
  const filters = [
    eq(deals.isDeleted, false),
    eq(customers.isDeleted, false),
    search ? like(customers.name, `%${search}%`) : undefined,
    stage ? eq(deals.stage, stage as (typeof dealStages)[number]) : undefined,
    activeOnly ? inArray(deals.stage, ['Leads', 'Qualified', 'Proposal']) : undefined,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length ? and(...filters) : undefined
  const dealQuery = db
    .select(dealSelection)
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

dealRoutes.get('/export/won.csv', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const db = createDb(c.env.DB)
  const rows = await db
    .select({
      customerName: customers.name,
      productName: deals.productName,
      dealType: deals.dealType,
      channel: deals.channel,
      originalPriceCents: deals.originalPriceCents,
      amountCents: deals.amountCents,
      netProfitCents: deals.netProfitCents,
      startDate: deals.startDate,
      expireDate: deals.expireDate,
      expectedCloseDate: deals.expectedCloseDate,
      ownerName: users.name,
      createdAt: deals.createdAt,
    })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .leftJoin(users, eq(customers.ownerId, users.id))
    .where(and(
      eq(deals.stage, 'Won'),
      eq(deals.isDeleted, false),
      eq(customers.isDeleted, false),
      search ? like(customers.name, `%${search}%`) : undefined,
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .orderBy(desc(deals.expectedCloseDate), desc(deals.createdAt))
    .limit(5_000)

  return csvResponse(
    '已赢单商机.csv',
    ['客户名称', '产品/版本', '订单类型', '渠道', '原价（元）', '成交金额（元）', '净利润（元）', '服务开始日', '服务到期日', '成交日期', '归属销售', '录入时间'],
    rows.map((row) => [
      row.customerName,
      row.productName,
      row.dealType === 'Renewal' ? '续费' : '新签',
      row.channel,
      row.originalPriceCents === null ? '' : (row.originalPriceCents / 100).toFixed(2),
      (row.amountCents / 100).toFixed(2),
      row.netProfitCents === null ? '' : (row.netProfitCents / 100).toFixed(2),
      row.startDate,
      row.expireDate,
      row.expectedCloseDate,
      row.ownerName,
      row.createdAt,
    ]),
  )
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
  if (parsed.data.stage === 'Lost' && !parsed.data.lost_reason) return c.json({ error: '输单时必须填写输单原因' }, 400)
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
    amountCents: parsed.data.amount_cents,
    channel: parsed.data.channel || null,
    originalPriceCents: parsed.data.original_price_cents ?? parsed.data.amount_cents,
    stage: parsed.data.stage,
    probability: parsed.data.stage === 'Lost' ? 0 : parsed.data.probability ?? defaultProbabilityByStage[parsed.data.stage],
    lostReason: parsed.data.stage === 'Lost' ? parsed.data.lost_reason : null,
    expectedCloseDate,
    updatedAt: new Date(),
    createdAt: new Date(),
  }
  await db.insert(deals).values(deal)
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Deal', entityId: deal.id, action: 'Created', after: deal }))
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
        isInteger(split.split_amount_cents) &&
        split.split_amount_cents >= 0,
    )
  ) {
    return c.json({ error: '成交参数无效，请检查日期、财务字段和分成明细' }, 400)
  }
  const idempotencyKey = getIdempotencyKey(c)
  if (!idempotencyKey) return c.json({ error: 'x-idempotency-key 必须为 UUID' }, 400)
  const calculatedExpireDate = calculateExpireDate(startDate, durationYears, giftMonthsResult.data.gift_months)
  if (expireDate.getTime() !== calculatedExpireDate.getTime()) {
    return c.json({ error: '到期时间与服务年限、赠送时长不一致' }, 400)
  }

  const dealId = c.req.param('id')
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const [deal] = await db
    .select({ id: deals.id, customerId: deals.customerId, amountCents: deals.amountCents, originalPriceCents: deals.originalPriceCents, stage: deals.stage, idempotencyKey: deals.idempotencyKey })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, dealId), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!deal) {
    return c.json({ error: '商机不存在' }, 404)
  }
  if (deal.stage === 'Won') {
    if (deal.idempotencyKey === idempotencyKey) return c.json({ id: dealId, stage: 'Won', idempotent: true })
    return c.json({ error: '商机已确认赢单，不能重复操作' }, 409)
  }
  if (deal.idempotencyKey) {
    return c.json({ error: deal.idempotencyKey === idempotencyKey ? '赢单请求正在处理中' : '商机已有待处理的赢单请求' }, 409)
  }

  const splits = body.splits
  const expectedNetProfit =
    deal.amountCents -
    (body.software_cost_cents as number) -
    (body.tax_cost_cents as number) -
    (body.rebate_amount_cents as number)
  const totalSplitAmountCents = splits.reduce((total, split) => total + (split.split_amount_cents as number), 0)
  if ((body.net_profit_cents as number) !== expectedNetProfit || totalSplitAmountCents > expectedNetProfit) {
    return c.json({ error: '实际利润或分成金额不合法' }, 400)
  }

  const userIds = [...new Set(splits.map((split) => split.user_id as string))]
  if (userIds.length > 0) {
    const splitUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, userIds))
    if (splitUsers.length !== userIds.length) {
      return c.json({ error: '存在无效的分成用户' }, 400)
    }
  }

  // Claim the request key first. Only the caller that wins this atomic update may insert splits.
  try {
    const claimed = await db
      .update(deals)
      .set({ idempotencyKey, updatedAt: new Date() })
      .where(and(eq(deals.id, dealId), eq(deals.isDeleted, false), isNull(deals.idempotencyKey), ne(deals.stage, 'Won')))
      .returning({ id: deals.id })
    if (claimed.length === 0) return c.json({ error: '赢单请求正在处理中，请刷新后确认结果' }, 409)
  } catch (error) {
    if (!(error instanceof Error) || !/unique/i.test(error.message)) throw error
    const [existingRequest] = await db
      .select({ id: deals.id, stage: deals.stage })
      .from(deals)
      .where(eq(deals.idempotencyKey, idempotencyKey))
      .limit(1)
    if (existingRequest?.id === dealId && existingRequest.stage === 'Won') {
      return c.json({ id: dealId, stage: 'Won', idempotent: true })
    }
    return c.json({ error: '幂等请求键已被并发请求使用' }, 409)
  }

  const updateDeal = db
    .update(deals)
    .set({
      stage: 'Won',
      probability: 100,
      lostReason: null,
      productName: productNameResult.data.product_name,
      channel: productNameResult.data.channel || null,
      originalPriceCents: productNameResult.data.original_price_cents ?? deal.originalPriceCents ?? deal.amountCents,
      startDate,
      durationYears,
      giftMonths: giftMonthsResult.data.gift_months,
      expireDate,
      renewalReminderDays: body.renewal_reminder_days as number,
      softwareCostCents: body.software_cost_cents as number,
      taxCostCents: body.tax_cost_cents as number,
      rebateAmountCents: body.rebate_amount_cents as number,
      netProfitCents: body.net_profit_cents as number,
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, dealId), eq(deals.idempotencyKey, idempotencyKey)))
  const updateCustomerExpireDate = db
    .update(customers)
    .set({ saasExpireDate: expireDate, status: 'Active', updatedAt: new Date() })
    .where(eq(customers.id, deal.customerId))

  const splitInserts = splits.map((split) =>
    db.insert(dealSplits).values({
      id: crypto.randomUUID(),
      dealId,
      userId: split.user_id as string,
      splitAmountCents: split.split_amount_cents as number,
    }),
  )

  // Cloudflare D1 commits a batch atomically, which provides the transaction boundary here.
  try {
    await db.batch([updateDeal, updateCustomerExpireDate, ...splitInserts])
  } catch (error) {
    // Release a failed claim so the client can safely retry with a new request key.
    await db.update(deals)
      .set({ idempotencyKey: null })
      .where(and(eq(deals.id, dealId), eq(deals.idempotencyKey, idempotencyKey), ne(deals.stage, 'Won')))
    throw error
  }
  c.executionCtx.waitUntil(writeAuditLog(c.env, {
    actorId: actor.id,
    entityType: 'Deal',
    entityId: dealId,
    action: 'Won',
    before: deal,
    after: { stage: 'Won', productName: productNameResult.data.product_name, amountCents: deal.amountCents, startDate, expireDate, netProfitCents: body.net_profit_cents },
  }))

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
  const amountCents = body.amount_cents === undefined ? undefined : isInteger(body.amount_cents) && body.amount_cents >= 0 ? body.amount_cents : null
  const productNameResult = updateProductSchema.safeParse(body)
  const stage = body.stage === undefined ? undefined : typeof body.stage === 'string' && dealStages.includes(body.stage as (typeof dealStages)[number]) ? body.stage as (typeof dealStages)[number] : null
  const expectedCloseDate = body.expected_close_date === undefined ? undefined : parseDate(body.expected_close_date)
  const probability = body.probability === undefined ? undefined : probabilitySchema.safeParse(body.probability)
  const lostReason = body.lost_reason === undefined ? undefined : lostReasonSchema.safeParse(body.lost_reason)
  const integerFields = [
    ['softwareCostCents', body.software_cost_cents],
    ['taxCostCents', body.tax_cost_cents],
    ['rebateAmountCents', body.rebate_amount_cents],
    ['netProfitCents', body.net_profit_cents],
  ] as const
  if (!productNameResult.success || amountCents === null || stage === null || (body.expected_close_date !== undefined && !expectedCloseDate) || (probability !== undefined && !probability.success) || (lostReason !== undefined && !lostReason.success) || integerFields.some(([, value]) => value !== undefined && (!isInteger(value) || value < 0))) {
    return c.json({ error: '商机资料格式无效' }, 400)
  }
  if (stage === 'Lost' && (!lostReason || !lostReason.success)) return c.json({ error: '输单时必须填写输单原因' }, 400)

  const updates = {
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(productNameResult.data.product_name !== undefined ? { productName: productNameResult.data.product_name } : {}),
    ...(productNameResult.data.channel !== undefined ? { channel: productNameResult.data.channel || null } : {}),
    ...(productNameResult.data.original_price_cents !== undefined ? { originalPriceCents: productNameResult.data.original_price_cents } : {}),
    ...(stage !== undefined ? { stage } : {}),
    ...(stage === 'Won' ? { probability: 100, lostReason: null } : {}),
    ...(stage === 'Lost' ? { probability: 0, lostReason: lostReason!.data } : {}),
    ...(stage !== undefined && stage !== 'Won' && stage !== 'Lost' ? { probability: probability?.success ? probability.data : defaultProbabilityByStage[stage], lostReason: null } : {}),
    ...(stage === undefined && probability?.success ? { probability: probability.data } : {}),
    ...(stage === undefined && lostReason?.success ? { lostReason: lostReason.data } : {}),
    ...(expectedCloseDate ? { expectedCloseDate } : {}),
    ...Object.fromEntries(integerFields.filter(([, value]) => value !== undefined).map(([key, value]) => [key, value])),
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: '请至少提供一个需要更新的字段' }, 400)
  }
  const db = createDb(c.env.DB)
  const [authorizedDeal] = await db
    .select({ id: deals.id, stage: deals.stage, productName: deals.productName, amountCents: deals.amountCents, probability: deals.probability, lostReason: deals.lostReason, expectedCloseDate: deals.expectedCloseDate })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, c.req.param('id')), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!authorizedDeal) return c.json({ error: '商机不存在或无权编辑' }, 404)
  if (stage === 'Won' && authorizedDeal.stage !== 'Won') {
    return c.json({ error: '请使用确认赢单流程完成服务期限、财务和分成信息' }, 400)
  }

  if (authorizedDeal.stage === 'Won' && body.net_profit_cents !== undefined) {
    const netProfitCents = body.net_profit_cents
    if (!isInteger(netProfitCents) || netProfitCents < 0) {
      return c.json({ error: '商机资料格式无效' }, 400)
    }
    const splitRows = await db
      .select({ splitAmountCents: dealSplits.splitAmountCents })
      .from(dealSplits)
      .where(eq(dealSplits.dealId, authorizedDeal.id))
    const assignedAmountCents = splitRows.reduce((total, split) => total + split.splitAmountCents, 0)
    if (assignedAmountCents > netProfitCents) {
      return c.json({ error: '实际利润不能低于已分配的订单分成金额' }, 400)
    }
  }

  const [deal] = await db
    .update(deals)
    .set(updates)
    .where(eq(deals.id, authorizedDeal.id))
    .returning()
  if (!deal) return c.json({ error: '商机更新失败' }, 500)

  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Deal', entityId: deal.id, action: 'Updated', before: authorizedDeal, after: deal }))

  return c.json({ deal })
})

dealRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorizedDeal] = await db
    .select({ id: deals.id, productName: deals.productName, amountCents: deals.amountCents, stage: deals.stage })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, c.req.param('id')), eq(deals.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!authorizedDeal) return c.json({ error: '商机不存在或无权作废' }, 404)

  const [deal] = await db
    .update(deals)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(deals.id, authorizedDeal.id))
    .returning({ id: deals.id })
  if (!deal) return c.json({ error: '商机作废失败' }, 500)

  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Deal', entityId: deal.id, action: 'Deleted', before: authorizedDeal, after: { isDeleted: true} }))

  return c.json({ id: deal.id, isDeleted: true })
})
