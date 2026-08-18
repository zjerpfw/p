// apps/api/src/routes/payments.ts
import { createDb } from '@crm/db/client'
import { contracts, customers, invoices, payments, users } from '@crm/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'

export const paymentRoutes = new Hono<{ Bindings: Env }>()

paymentRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

const paymentStatusSchema = z.enum(['Pending', 'Received', 'Reversed'])
const optionalDateSchema = z.union([z.string(), z.number()]).nullable().optional()
const optionalNoteSchema = z.string().trim().max(1_000, '备注不能超过 1000 个字符').nullable().optional()
const paymentPayloadSchema = z.object({
  contract_id: z.string().uuid('合同编号无效'),
  invoice_id: z.string().uuid('发票编号无效').nullable().optional(),
  payment_number: z.string().trim().min(1, '请填写回款编号').max(100, '回款编号不能超过 100 个字符'),
  amount_cents: z.number().int().positive('回款金额必须为正整数分'),
  status: paymentStatusSchema.optional().default('Pending'),
  paid_at: optionalDateSchema,
  note: optionalNoteSchema,
  claimed_by: z.string().trim().min(1, '认领人编号无效').max(128, '认领人编号无效').optional(),
})
const updatePaymentPayloadSchema = paymentPayloadSchema.omit({ contract_id: true, invoice_id: true }).partial()

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

function ownershipFilter(actor: NonNullable<ReturnType<typeof getAuthenticatedActor>>) {
  return actor.role === 'admin' ? undefined : eq(customers.ownerId, actor.id)
}

async function findAuthorizedContract(
  db: ReturnType<typeof createDb>,
  actor: NonNullable<ReturnType<typeof getAuthenticatedActor>>,
  contractId: string,
) {
  const [contract] = await db.select({
    id: contracts.id,
    customerId: contracts.customerId,
    dealId: contracts.dealId,
  }).from(contracts)
    .innerJoin(customers, eq(contracts.customerId, customers.id))
    .where(and(eq(contracts.id, contractId), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  return contract ?? null
}

async function validateInvoiceForContract(
  db: ReturnType<typeof createDb>,
  invoiceId: string | null | undefined,
  contractId: string,
) {
  if (!invoiceId) return true
  const [invoice] = await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.contractId, contractId)))
    .limit(1)
  return Boolean(invoice)
}

async function resolveClaimedBy(
  db: ReturnType<typeof createDb>,
  actor: NonNullable<ReturnType<typeof getAuthenticatedActor>>,
  requestedClaimedBy: string | undefined,
) {
  const claimedBy = actor.role === 'admin' ? requestedClaimedBy ?? actor.id : actor.id
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, claimedBy)).limit(1)
  return user?.id ?? null
}

paymentRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const customerId = c.req.query('customer_id')
  const contractId = c.req.query('contract_id')
  const invoiceId = c.req.query('invoice_id')
  const page = parsePagination(c.req.query('page'), 1, 10_000)
  const limit = parsePagination(c.req.query('limit'), 20, 100)
  const db = createDb(c.env.DB)
  const filters = [
    eq(customers.isDeleted, false),
    customerId ? eq(payments.customerId, customerId) : undefined,
    contractId ? eq(payments.contractId, contractId) : undefined,
    invoiceId ? eq(payments.invoiceId, invoiceId) : undefined,
    ownershipFilter(actor),
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = and(...filters)
  const data = await db.select({
    id: payments.id,
    customerId: payments.customerId,
    customerName: customers.name,
    dealId: payments.dealId,
    contractId: payments.contractId,
    contractNumber: contracts.contractNumber,
    invoiceId: payments.invoiceId,
    invoiceNumber: invoices.invoiceNumber,
    paymentNumber: payments.paymentNumber,
    amountCents: payments.amountCents,
    status: payments.status,
    paidAt: payments.paidAt,
    note: payments.note,
    claimedBy: payments.claimedBy,
    createdBy: payments.createdBy,
    createdAt: payments.createdAt,
    updatedAt: payments.updatedAt,
  }).from(payments)
    .innerJoin(contracts, eq(payments.contractId, contracts.id))
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(where)
    .orderBy(sql`${payments.paidAt} desc nulls last`, sql`${payments.updatedAt} desc`)
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(payments)
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .where(where)
  return c.json({ data, total: Number(total), page, totalPages: Math.max(1, Math.ceil(Number(total) / limit)) })
})

paymentRoutes.get('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [payment] = await db.select({
    id: payments.id,
    customerId: payments.customerId,
    customerName: customers.name,
    dealId: payments.dealId,
    contractId: payments.contractId,
    contractNumber: contracts.contractNumber,
    invoiceId: payments.invoiceId,
    invoiceNumber: invoices.invoiceNumber,
    paymentNumber: payments.paymentNumber,
    amountCents: payments.amountCents,
    status: payments.status,
    paidAt: payments.paidAt,
    note: payments.note,
    claimedBy: payments.claimedBy,
    createdBy: payments.createdBy,
    createdAt: payments.createdAt,
    updatedAt: payments.updatedAt,
  }).from(payments)
    .innerJoin(contracts, eq(payments.contractId, contracts.id))
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(eq(payments.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!payment) return c.json({ error: '回款不存在或无权访问' }, 404)
  return c.json({ payment })
})

paymentRoutes.post('/', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = paymentPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '回款资料格式无效' }, 400)
  const paidAt = parseOptionalDate(parsed.data.paid_at)
  if (paidAt === undefined) return c.json({ error: '打款日期格式无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const contract = await findAuthorizedContract(db, actor, parsed.data.contract_id)
  if (!contract) return c.json({ error: '合同不存在或无权登记回款' }, 404)
  if (!await validateInvoiceForContract(db, parsed.data.invoice_id, contract.id)) return c.json({ error: '发票不存在或不属于该合同' }, 400)
  const claimedBy = await resolveClaimedBy(db, actor, parsed.data.claimed_by)
  if (!claimedBy) return c.json({ error: '认领人不存在' }, 400)
  const now = new Date()
  const payment = {
    id: crypto.randomUUID(),
    customerId: contract.customerId,
    dealId: contract.dealId,
    contractId: contract.id,
    invoiceId: parsed.data.invoice_id ?? null,
    paymentNumber: parsed.data.payment_number,
    amountCents: parsed.data.amount_cents,
    status: parsed.data.status,
    paidAt,
    note: parsed.data.note ?? null,
    claimedBy,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.insert(payments).values(payment)
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '回款编号已存在' }, 409)
    throw error
  }
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Payment', entityId: payment.id, action: 'Created', after: payment }))
  return c.json({ payment }, 201)
})

paymentRoutes.put('/:id', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = updatePaymentPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '回款资料格式无效' }, 400)
  const paidAt = parseOptionalDate(parsed.data.paid_at)
  if (paidAt === undefined) return c.json({ error: '打款日期格式无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({ id: payments.id, paymentNumber: payments.paymentNumber, amountCents: payments.amountCents, status: payments.status, paidAt: payments.paidAt, note: payments.note, claimedBy: payments.claimedBy }).from(payments)
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .where(and(eq(payments.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!authorized) return c.json({ error: '回款不存在或无权编辑' }, 404)
  const claimedBy = parsed.data.claimed_by === undefined
    ? undefined
    : await resolveClaimedBy(db, actor, parsed.data.claimed_by)
  if (parsed.data.claimed_by !== undefined && !claimedBy) return c.json({ error: '认领人不存在' }, 400)
  const updates = {
    ...(parsed.data.payment_number !== undefined ? { paymentNumber: parsed.data.payment_number } : {}),
    ...(parsed.data.amount_cents !== undefined ? { amountCents: parsed.data.amount_cents } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.paid_at !== undefined ? { paidAt } : {}),
    ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    ...(claimedBy !== undefined ? { claimedBy } : {}),
    updatedAt: new Date(),
  }
  try {
    const [payment] = await db.update(payments).set(updates).where(eq(payments.id, authorized.id)).returning()
    c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Payment', entityId: payment.id, action: 'Updated', before: authorized, after: payment }))
    return c.json({ payment })
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '回款编号已存在' }, 409)
    throw error
  }
})

paymentRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({ id: payments.id, paymentNumber: payments.paymentNumber, amountCents: payments.amountCents, status: payments.status, paidAt: payments.paidAt, note: payments.note, claimedBy: payments.claimedBy }).from(payments)
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .where(and(eq(payments.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!authorized) return c.json({ error: '回款不存在或无权删除' }, 404)
  await db.delete(payments).where(eq(payments.id, authorized.id))
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Payment', entityId: authorized.id, action: 'Deleted', before: authorized }))
  return c.json({ id: authorized.id, deleted: true })
})
