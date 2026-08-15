// apps/api/src/routes/customers.ts
import { createDb } from '@crm/db/client'
import { activities, customers, dealSplits, deals, users } from '@crm/db/schema'
import { and, count, desc, eq, inArray, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
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

interface CreateCustomerPayload {
  name?: unknown
  contact_phone?: unknown
  status?: unknown
  address?: unknown
}

interface UpdateCustomerPayload {
  name?: unknown
  contact_phone?: unknown
  status?: unknown
  address?: unknown
}

interface DirectWonCustomerPayload {
  name?: unknown
  contact_phone?: unknown
  address?: unknown
  product_name?: unknown
  amount?: unknown
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

const directWonSchema = z.object({
  name: z.string().trim().min(1, '请填写客户名称').max(100, '客户名称不能超过 100 个字符'),
  contact_phone: z.string().trim().max(30, '联系电话不能超过 30 个字符').optional().default(''),
  address: z.string().trim().max(500, '详细地址不能超过 500 个字符').optional().default(''),
  product_name: z.string().trim().min(1, '请填写购买产品或规格').max(200, '购买产品或规格不能超过 200 个字符'),
  amount: z.number().int().nonnegative('成交金额不能小于 0'),
  start_date: z.union([z.string(), z.number()]),
  duration_years: z.number().int().positive('服务年限必须大于 0'),
  expire_date: z.union([z.string(), z.number()]),
  renewal_reminder_days: z.number().int().nonnegative('提前提醒天数不能小于 0').default(30),
  software_cost: z.number().int().nonnegative('软件成本不能小于 0'),
  tax_cost: z.number().int().nonnegative('开票成本不能小于 0'),
  rebate_amount: z.number().int().nonnegative('返利不能小于 0'),
  net_profit: z.number().int().nonnegative('实际利润不能小于 0'),
  splits: z.array(z.object({
    user_id: z.string().trim().min(1, '请选择分成人员'),
    split_amount: z.number().int().nonnegative('分成金额不能小于 0'),
  })),
})

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  return value.trim().slice(0, maxLength) || null
}

customerRoutes.post('/', async (c) => {
  let body: CreateCustomerPayload

  try {
    body = await c.req.json<CreateCustomerPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const name = optionalText(body.name, 100)
  const contactPhone = optionalText(body.contact_phone, 30)
  const status = optionalText(body.status, 50) ?? 'Active'
  const address = optionalText(body.address, 500)
  if (!name || contactPhone === undefined || address === undefined) {
    return c.json({ error: '客户名称、联系电话或详细地址格式无效' }, 400)
  }

  const now = new Date()
  const customer = {
    id: crypto.randomUUID(),
    name,
    contactPhone,
    status,
    address,
    ownerId: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  const db = createDb(c.env.DB)
  await db.insert(customers).values(customer)

  return c.json({ customer }, 201)
})

customerRoutes.post('/direct-won', async (c) => {
  let body: DirectWonCustomerPayload
  try {
    body = await c.req.json<DirectWonCustomerPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const parsed = directWonSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '成交客户资料格式无效' }, 400)
  const startDate = new Date(parsed.data.start_date)
  const expireDate = new Date(parsed.data.expire_date)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(expireDate.getTime()) || expireDate <= startDate) {
    return c.json({ error: '服务日期无效，到期时间必须晚于使用日期' }, 400)
  }

  const calculatedNetProfit = parsed.data.amount - parsed.data.software_cost - parsed.data.tax_cost - parsed.data.rebate_amount
  const totalSplitAmount = parsed.data.splits.reduce((total, split) => total + split.split_amount, 0)
  if (parsed.data.net_profit !== calculatedNetProfit || totalSplitAmount > calculatedNetProfit) {
    return c.json({ error: '实际利润或分成金额不合法' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const splitUserIds = [...new Set(parsed.data.splits.map((split) => split.user_id))]
  if (splitUserIds.length > 0) {
    const splitUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, splitUserIds))
    if (splitUsers.length !== splitUserIds.length) return c.json({ error: '存在无效的分成人员' }, 400)
  }

  const now = new Date()
  const customerId = crypto.randomUUID()
  const dealId = crypto.randomUUID()
  const customerInsert = db.insert(customers).values({
    id: customerId,
    name: parsed.data.name,
    contactPhone: parsed.data.contact_phone || null,
    status: 'Active',
    address: parsed.data.address || null,
    ownerId: actor.id,
    createdAt: now,
    updatedAt: now,
  })
  const dealInsert = db.insert(deals).values({
    id: dealId,
    customerId,
    productName: parsed.data.product_name,
    amount: parsed.data.amount,
    stage: 'Won',
    expectedCloseDate: startDate,
    startDate,
    durationYears: parsed.data.duration_years,
    expireDate,
    renewalReminderDays: parsed.data.renewal_reminder_days,
    softwareCost: parsed.data.software_cost,
    taxCost: parsed.data.tax_cost,
    rebateAmount: parsed.data.rebate_amount,
    netProfit: parsed.data.net_profit,
    createdAt: now,
  })
  const splitInserts = parsed.data.splits.map((split) => db.insert(dealSplits).values({
    id: crypto.randomUUID(),
    dealId,
    userId: split.user_id,
    splitAmount: split.split_amount,
  }))

  // D1 batch commits all customer, deal, and split records atomically.
  await db.batch([customerInsert, dealInsert, ...splitInserts])
  return c.json({ customerId, dealId, stage: 'Won' }, 201)
})

customerRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 10, 100)
  const filters = [
    eq(customers.isDeleted, false),
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
    .where(and(eq(customers.id, customerId), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)

  if (!customer) {
    return c.json({ error: '客户不存在' }, 404)
  }

  const customerDeals = await db
    .select()
    .from(deals)
    .where(and(eq(deals.customerId, customer.id), eq(deals.isDeleted, false)))
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

customerRoutes.put('/:id', async (c) => {
  let body: UpdateCustomerPayload
  try {
    body = await c.req.json<UpdateCustomerPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const name = body.name === undefined ? undefined : optionalText(body.name, 100)
  const contactPhone = body.contact_phone === undefined ? undefined : optionalText(body.contact_phone, 30)
  const status = body.status === undefined ? undefined : optionalText(body.status, 50)
  const address = body.address === undefined ? undefined : optionalText(body.address, 500)
  if (name === undefined || name === null || contactPhone === undefined || status === undefined || address === undefined) {
    return c.json({ error: '客户资料格式无效' }, 400)
  }

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(contactPhone !== undefined ? { contactPhone } : {}),
    ...(status !== undefined ? { status: status ?? 'Active' } : {}),
    ...(address !== undefined ? { address } : {}),
    updatedAt: new Date(),
  }
  const db = createDb(c.env.DB)
  const [customer] = await db
    .update(customers)
    .set(updates)
    .where(and(eq(customers.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .returning()
  if (!customer) return c.json({ error: '客户不存在或无权编辑' }, 404)

  return c.json({ customer })
})

customerRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const customerId = c.req.param('id')
  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权作废' }, 404)

  const [wonDeal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.customerId, customer.id), eq(deals.stage, 'Won'), eq(deals.isDeleted, false)))
    .limit(1)
  if (wonDeal) return c.json({ error: '客户存在已赢单商机，不能作废' }, 409)

  await db.update(customers).set({ isDeleted: true, updatedAt: new Date() }).where(eq(customers.id, customer.id))
  return c.json({ id: customer.id, isDeleted: true })
})
