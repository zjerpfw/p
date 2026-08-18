// apps/api/src/routes/invoices.ts
import { createDb } from '@crm/db/client'
import { contracts, customers, invoices, payments } from '@crm/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'

export const invoiceRoutes = new Hono<{ Bindings: Env }>()

invoiceRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

const invoiceStatusSchema = z.enum(['Draft', 'Issued', 'Voided'])
const optionalInvoiceNumberSchema = z.string().trim().min(1).max(100).nullable().optional()
const optionalDateSchema = z.union([z.string(), z.number()]).nullable().optional()
const invoicePayloadSchema = z.object({
  contract_id: z.string().uuid('合同编号无效'),
  invoice_number: optionalInvoiceNumberSchema,
  title: z.string().trim().min(1, '请填写发票抬头').max(200, '发票抬头不能超过 200 个字符'),
  content: z.string().trim().min(1, '请填写开票内容').max(500, '开票内容不能超过 500 个字符'),
  status: invoiceStatusSchema.optional().default('Draft'),
  amount_cents: z.number().int().nonnegative('开票金额必须是非负整数分'),
  tax_amount_cents: z.number().int().nonnegative('税额必须是非负整数分').optional().default(0),
  issued_at: optionalDateSchema,
})
const updateInvoicePayloadSchema = invoicePayloadSchema.omit({ contract_id: true }).partial()

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
    .where(and(
      eq(contracts.id, contractId),
      eq(customers.isDeleted, false),
      ownershipFilter(actor),
    ))
    .limit(1)
  return contract ?? null
}

invoiceRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const customerId = c.req.query('customer_id')
  const contractId = c.req.query('contract_id')
  const statusResult = invoiceStatusSchema.optional().safeParse(c.req.query('status'))
  if (!statusResult.success) return c.json({ error: '发票状态无效' }, 400)
  const status = statusResult.data
  const page = parsePagination(c.req.query('page'), 1, 10_000)
  const limit = parsePagination(c.req.query('limit'), 20, 100)
  const db = createDb(c.env.DB)
  const filters = [
    eq(customers.isDeleted, false),
    customerId ? eq(invoices.customerId, customerId) : undefined,
    contractId ? eq(invoices.contractId, contractId) : undefined,
    status ? eq(invoices.status, status) : undefined,
    ownershipFilter(actor),
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = and(...filters)
  const data = await db.select({
    id: invoices.id,
    customerId: invoices.customerId,
    customerName: customers.name,
    dealId: invoices.dealId,
    contractId: invoices.contractId,
    contractNumber: contracts.contractNumber,
    invoiceNumber: invoices.invoiceNumber,
    title: invoices.title,
    content: invoices.content,
    status: invoices.status,
    amountCents: invoices.amountCents,
    taxAmountCents: invoices.taxAmountCents,
    issuedAt: invoices.issuedAt,
    createdAt: invoices.createdAt,
    updatedAt: invoices.updatedAt,
  }).from(invoices)
    .innerJoin(contracts, eq(invoices.contractId, contracts.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(where)
    .orderBy(sql`${invoices.updatedAt} desc`)
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ total }] = await db.select({ total: sql<number>`count(*)` })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(where)
  return c.json({ data, total: Number(total), page, totalPages: Math.max(1, Math.ceil(Number(total) / limit)) })
})

invoiceRoutes.get('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [invoice] = await db.select({
    id: invoices.id,
    customerId: invoices.customerId,
    customerName: customers.name,
    dealId: invoices.dealId,
    contractId: invoices.contractId,
    contractNumber: contracts.contractNumber,
    invoiceNumber: invoices.invoiceNumber,
    title: invoices.title,
    content: invoices.content,
    status: invoices.status,
    amountCents: invoices.amountCents,
    taxAmountCents: invoices.taxAmountCents,
    issuedAt: invoices.issuedAt,
    createdAt: invoices.createdAt,
    updatedAt: invoices.updatedAt,
  }).from(invoices)
    .innerJoin(contracts, eq(invoices.contractId, contracts.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!invoice) return c.json({ error: '发票不存在或无权访问' }, 404)
  return c.json({ invoice })
})

invoiceRoutes.post('/', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = invoicePayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '发票资料格式无效' }, 400)
  const issuedAt = parseOptionalDate(parsed.data.issued_at)
  if (issuedAt === undefined) return c.json({ error: '开票日期格式无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const contract = await findAuthorizedContract(db, actor, parsed.data.contract_id)
  if (!contract) return c.json({ error: '合同不存在或无权创建发票' }, 404)
  const now = new Date()
  const invoice = {
    id: crypto.randomUUID(),
    customerId: contract.customerId,
    dealId: contract.dealId,
    contractId: contract.id,
    invoiceNumber: parsed.data.invoice_number ?? null,
    title: parsed.data.title,
    content: parsed.data.content,
    status: parsed.data.status,
    amountCents: parsed.data.amount_cents,
    taxAmountCents: parsed.data.tax_amount_cents,
    issuedAt,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.insert(invoices).values(invoice)
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '发票号码已存在' }, 409)
    throw error
  }
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Invoice', entityId: invoice.id, action: 'Created', after: invoice }))
  return c.json({ invoice }, 201)
})

invoiceRoutes.put('/:id', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = updateInvoicePayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '发票资料格式无效' }, 400)
  const issuedAt = parseOptionalDate(parsed.data.issued_at)
  if (parsed.data.issued_at !== undefined && issuedAt === undefined) return c.json({ error: '开票日期格式无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, title: invoices.title, content: invoices.content, status: invoices.status, amountCents: invoices.amountCents, taxAmountCents: invoices.taxAmountCents, issuedAt: invoices.issuedAt }).from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!authorized) return c.json({ error: '发票不存在或无权编辑' }, 404)
  const updates = {
    ...(parsed.data.invoice_number !== undefined ? { invoiceNumber: parsed.data.invoice_number } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.amount_cents !== undefined ? { amountCents: parsed.data.amount_cents } : {}),
    ...(parsed.data.tax_amount_cents !== undefined ? { taxAmountCents: parsed.data.tax_amount_cents } : {}),
    ...(parsed.data.issued_at !== undefined ? { issuedAt } : {}),
    updatedAt: new Date(),
  }
  try {
    const [invoice] = await db.update(invoices).set(updates).where(eq(invoices.id, authorized.id)).returning()
    c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Invoice', entityId: invoice.id, action: 'Updated', before: authorized, after: invoice }))
    return c.json({ invoice })
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '发票号码已存在' }, 409)
    throw error
  }
})

invoiceRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [authorized] = await db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, title: invoices.title, content: invoices.content, status: invoices.status, amountCents: invoices.amountCents, taxAmountCents: invoices.taxAmountCents, issuedAt: invoices.issuedAt }).from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, c.req.param('id')), eq(customers.isDeleted, false), ownershipFilter(actor)))
    .limit(1)
  if (!authorized) return c.json({ error: '发票不存在或无权删除' }, 404)
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(payments).where(eq(payments.invoiceId, authorized.id))
  if (Number(count) > 0) return c.json({ error: '发票已关联回款记录，不能删除' }, 409)
  await db.delete(invoices).where(eq(invoices.id, authorized.id))
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Invoice', entityId: authorized.id, action: 'Deleted', before: authorized }))
  return c.json({ id: authorized.id, deleted: true })
})
