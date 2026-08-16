// apps/api/src/routes/contracts.ts
import { createDb } from '@crm/db/client'
import { contracts, customers, deals, payments } from '@crm/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const contractRoutes = new Hono<{ Bindings: Env }>()

contractRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

const contractStatusSchema = z.enum(['Draft', 'Active', 'Expired', 'Terminated', 'Void'])
const optionalDateSchema = z.union([z.string(), z.number()]).optional().nullable()
const contractPayloadSchema = z.object({
  customer_id: z.string().uuid('客户编号无效'),
  deal_id: z.string().uuid('商机编号无效'),
  contract_number: z.string().trim().min(1, '请填写合同编号').max(100, '合同编号不能超过 100 个字符'),
  title: z.string().trim().min(1, '请填写合同名称').max(200, '合同名称不能超过 200 个字符'),
  status: contractStatusSchema.optional().default('Draft'),
  total_amount_cents: z.number().int().nonnegative('合同金额不能小于 0'),
  signed_at: optionalDateSchema,
  effective_start_date: optionalDateSchema,
  effective_end_date: optionalDateSchema,
})
const updateContractPayloadSchema = contractPayloadSchema.omit({ customer_id: true, deal_id: true }).partial()

function parseOptionalDate(value: string | number | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function parsePagination(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

contractRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const customerId = c.req.query('customer_id')
  const page = parsePagination(c.req.query('page'), 1, 10_000)
  const limit = parsePagination(c.req.query('limit'), 20, 100)
  const db = createDb(c.env.DB)
  const filters = [
    eq(customers.isDeleted, false),
    customerId ? eq(contracts.customerId, customerId) : undefined,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = and(...filters)
  const data = await db.select({
    id: contracts.id,
    customerId: contracts.customerId,
    customerName: customers.name,
    dealId: contracts.dealId,
    contractNumber: contracts.contractNumber,
    title: contracts.title,
    status: contracts.status,
    totalAmountCents: contracts.totalAmountCents,
    receivedAmountCents: sql<number>`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0)`,
    signedAt: contracts.signedAt,
    effectiveStartDate: contracts.effectiveStartDate,
    effectiveEndDate: contracts.effectiveEndDate,
    createdAt: contracts.createdAt,
    updatedAt: contracts.updatedAt,
  }).from(contracts)
    .innerJoin(customers, eq(contracts.customerId, customers.id))
    .leftJoin(payments, eq(payments.contractId, contracts.id))
    .where(where)
    .groupBy(contracts.id)
    .orderBy(sql`${contracts.updatedAt} desc`)
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(contracts).innerJoin(customers, eq(contracts.customerId, customers.id)).where(where)
  return c.json({
    data: data.map((contract) => ({ ...contract, outstandingAmountCents: contract.totalAmountCents - Number(contract.receivedAmountCents) })),
    total: Number(total), page, totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
  })
})

contractRoutes.get('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [contract] = await db.select({
    id: contracts.id, customerId: contracts.customerId, customerName: customers.name, dealId: contracts.dealId,
    contractNumber: contracts.contractNumber, title: contracts.title, status: contracts.status,
    totalAmountCents: contracts.totalAmountCents,
    receivedAmountCents: sql<number>`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0)`,
    signedAt: contracts.signedAt, effectiveStartDate: contracts.effectiveStartDate, effectiveEndDate: contracts.effectiveEndDate,
    createdAt: contracts.createdAt, updatedAt: contracts.updatedAt,
  }).from(contracts).innerJoin(customers, eq(contracts.customerId, customers.id)).leftJoin(payments, eq(payments.contractId, contracts.id))
    .where(and(eq(contracts.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .groupBy(contracts.id).limit(1)
  if (!contract) return c.json({ error: '合同不存在或无权访问' }, 404)
  return c.json({ contract: { ...contract, outstandingAmountCents: contract.totalAmountCents - Number(contract.receivedAmountCents) } })
})

contractRoutes.post('/', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = contractPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '合同资料格式无效' }, 400)
  const signedAt = parseOptionalDate(parsed.data.signed_at)
  const effectiveStartDate = parseOptionalDate(parsed.data.effective_start_date)
  const effectiveEndDate = parseOptionalDate(parsed.data.effective_end_date)
  if (signedAt === undefined || effectiveStartDate === undefined || effectiveEndDate === undefined) return c.json({ error: '合同日期格式无效' }, 400)
  if (effectiveStartDate && effectiveEndDate && effectiveStartDate > effectiveEndDate) return c.json({ error: '合同生效结束日不能早于开始日' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [deal] = await db.select({ id: deals.id }).from(deals).innerJoin(customers, eq(deals.customerId, customers.id))
    .where(and(eq(deals.id, parsed.data.deal_id), eq(deals.customerId, parsed.data.customer_id), eq(deals.isDeleted, false), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined)).limit(1)
  if (!deal) return c.json({ error: '商机不存在、客户不匹配或无权创建合同' }, 404)
  const now = new Date()
  const contract = { id: crypto.randomUUID(), customerId: parsed.data.customer_id, dealId: deal.id, contractNumber: parsed.data.contract_number, title: parsed.data.title, status: parsed.data.status, totalAmountCents: parsed.data.total_amount_cents, signedAt, effectiveStartDate, effectiveEndDate, createdBy: actor.id, createdAt: now, updatedAt: now }
  try { await db.insert(contracts).values(contract) } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '合同编号已存在' }, 409)
    throw error
  }
  return c.json({ contract }, 201)
})

contractRoutes.put('/:id', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = updateContractPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '合同资料格式无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({
    id: contracts.id,
    effectiveStartDate: contracts.effectiveStartDate,
    effectiveEndDate: contracts.effectiveEndDate,
  }).from(contracts).innerJoin(customers, eq(contracts.customerId, customers.id))
    .where(and(eq(contracts.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined)).limit(1)
  if (!authorized) return c.json({ error: '合同不存在或无权编辑' }, 404)
  const signedAt = parseOptionalDate(parsed.data.signed_at)
  const effectiveStartDate = parseOptionalDate(parsed.data.effective_start_date)
  const effectiveEndDate = parseOptionalDate(parsed.data.effective_end_date)
  if (signedAt === undefined || effectiveStartDate === undefined || effectiveEndDate === undefined) return c.json({ error: '合同日期格式无效' }, 400)
  const nextEffectiveStartDate = parsed.data.effective_start_date === undefined
    ? authorized.effectiveStartDate
    : effectiveStartDate
  const nextEffectiveEndDate = parsed.data.effective_end_date === undefined
    ? authorized.effectiveEndDate
    : effectiveEndDate
  if (nextEffectiveStartDate && nextEffectiveEndDate && nextEffectiveStartDate > nextEffectiveEndDate) {
    return c.json({ error: '合同生效结束日不能早于开始日' }, 400)
  }
  const updates = {
    ...(parsed.data.contract_number !== undefined ? { contractNumber: parsed.data.contract_number } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.total_amount_cents !== undefined ? { totalAmountCents: parsed.data.total_amount_cents } : {}),
    ...(parsed.data.signed_at !== undefined ? { signedAt } : {}),
    ...(parsed.data.effective_start_date !== undefined ? { effectiveStartDate } : {}),
    ...(parsed.data.effective_end_date !== undefined ? { effectiveEndDate } : {}),
    updatedAt: new Date(),
  }
  try {
    const [contract] = await db.update(contracts).set(updates).where(eq(contracts.id, authorized.id)).returning()
    return c.json({ contract })
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '合同编号已存在' }, 409)
    throw error
  }
})

contractRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({ id: contracts.id }).from(contracts).innerJoin(customers, eq(contracts.customerId, customers.id))
    .where(and(eq(contracts.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined)).limit(1)
  if (!authorized) return c.json({ error: '合同不存在或无权删除' }, 404)
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(payments).where(eq(payments.contractId, authorized.id))
  if (Number(count) > 0) return c.json({ error: '合同已存在回款记录，不能删除' }, 409)
  await db.delete(contracts).where(eq(contracts.id, authorized.id))
  return c.json({ id: authorized.id, deleted: true })
})
