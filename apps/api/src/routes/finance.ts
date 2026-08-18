// apps/api/src/routes/finance.ts
import { createDb } from '@crm/db/client'
import { contracts, customers, invoices, payments } from '@crm/db/schema'
import { and, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { csvResponse } from '../lib/csv'

export const financeRoutes = new Hono<{ Bindings: Env }>()

financeRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

financeRoutes.get('/summary', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const db = createDb(c.env.DB)
  const ownerFilter = actor.role === 'admin' ? undefined : eq(customers.ownerId, actor.id)
  const contractFilters = [eq(customers.isDeleted, false), ne(contracts.status, 'Void'), ownerFilter]
    .filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const paymentFilters = [eq(customers.isDeleted, false), ne(contracts.status, 'Void'), eq(payments.status, 'Received'), ownerFilter]
    .filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const invoiceFilters = [eq(customers.isDeleted, false), ne(contracts.status, 'Void'), eq(invoices.status, 'Issued'), ownerFilter]
    .filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))

  const [contractRows, [received], [issued]] = await Promise.all([
    db.select({
      totalAmountCents: contracts.totalAmountCents,
      receivedAmountCents: sql<number>`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0)`,
    }).from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .leftJoin(payments, eq(payments.contractId, contracts.id))
      .where(and(...contractFilters))
      .groupBy(contracts.id),
    db.select({ totalAmountCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
      .from(payments).innerJoin(contracts, eq(payments.contractId, contracts.id)).innerJoin(customers, eq(payments.customerId, customers.id))
      .where(and(...paymentFilters)),
    db.select({ totalAmountCents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)` })
      .from(invoices).innerJoin(contracts, eq(invoices.contractId, contracts.id)).innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(...invoiceFilters)),
  ])

  const contractAmountCents = contractRows.reduce((sum, contract) => sum + contract.totalAmountCents, 0)
  const outstandingAmountCents = contractRows.reduce((sum, contract) => sum + Math.max(0, contract.totalAmountCents - Number(contract.receivedAmountCents)), 0)
  return c.json({ contractCount: contractRows.length, contractAmountCents, receivedAmountCents: Number(received?.totalAmountCents ?? 0), outstandingAmountCents, issuedInvoiceAmountCents: Number(issued?.totalAmountCents ?? 0) })
})

financeRoutes.get('/export/csv', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const kind = c.req.query('kind')
  if (kind !== 'contracts' && kind !== 'invoices' && kind !== 'payments') {
    return c.json({ error: '导出类型无效' }, 400)
  }

  const db = createDb(c.env.DB)
  const ownerFilter = actor.role === 'admin' ? undefined : eq(customers.ownerId, actor.id)
  const dateValue = (value: Date | null) => value ? value.toISOString().slice(0, 10) : ''
  const yuan = (value: number) => (value / 100).toFixed(2)

  if (kind === 'contracts') {
    const rows = await db.select({
      customerName: customers.name,
      ownerName: sql<string>`coalesce((select name from users where users.id = ${customers.ownerId}), '')`,
      contractNumber: contracts.contractNumber,
      title: contracts.title,
      status: contracts.status,
      totalAmountCents: contracts.totalAmountCents,
      receivedAmountCents: sql<number>`coalesce(sum(case when ${payments.status} = 'Received' then ${payments.amountCents} else 0 end), 0)`,
      paymentDueAt: contracts.paymentDueAt,
      signedAt: contracts.signedAt,
      createdAt: contracts.createdAt,
    }).from(contracts)
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .leftJoin(payments, eq(payments.contractId, contracts.id))
      .where(and(eq(customers.isDeleted, false), ownerFilter))
      .groupBy(contracts.id)
      .orderBy(sql`${contracts.updatedAt} desc`)
      .limit(5_000)
    return csvResponse('合同台账.csv', ['客户', '归属销售', '合同编号', '合同名称', '状态', '合同金额（元）', '已回款（元）', '待回款（元）', '回款截止日', '签约日期', '创建时间'], rows.map((row) => {
      const receivedAmountCents = Number(row.receivedAmountCents)
      return [row.customerName, row.ownerName, row.contractNumber, row.title, row.status, yuan(row.totalAmountCents), yuan(receivedAmountCents), yuan(Math.max(0, row.totalAmountCents - receivedAmountCents)), dateValue(row.paymentDueAt), dateValue(row.signedAt), row.createdAt]
    }))
  }

  if (kind === 'invoices') {
    const rows = await db.select({
      customerName: customers.name,
      ownerName: sql<string>`coalesce((select name from users where users.id = ${customers.ownerId}), '')`,
      contractNumber: contracts.contractNumber,
      invoiceNumber: invoices.invoiceNumber,
      title: invoices.title,
      content: invoices.content,
      status: invoices.status,
      amountCents: invoices.amountCents,
      taxAmountCents: invoices.taxAmountCents,
      issuedAt: invoices.issuedAt,
      createdAt: invoices.createdAt,
    }).from(invoices)
      .innerJoin(contracts, eq(invoices.contractId, contracts.id))
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(customers.isDeleted, false), ownerFilter))
      .orderBy(sql`${invoices.updatedAt} desc`)
      .limit(5_000)
    return csvResponse('发票台账.csv', ['客户', '归属销售', '合同编号', '发票号码', '发票抬头', '开票内容', '状态', '开票金额（元）', '税额（元）', '开票日期', '创建时间'], rows.map((row) => [row.customerName, row.ownerName, row.contractNumber, row.invoiceNumber, row.title, row.content, row.status, yuan(row.amountCents), yuan(row.taxAmountCents), dateValue(row.issuedAt), row.createdAt]))
  }

  const rows = await db.select({
    customerName: customers.name,
    ownerName: sql<string>`coalesce((select name from users where users.id = ${customers.ownerId}), '')`,
    contractNumber: contracts.contractNumber,
    invoiceNumber: invoices.invoiceNumber,
    paymentNumber: payments.paymentNumber,
    status: payments.status,
    amountCents: payments.amountCents,
    paidAt: payments.paidAt,
    note: payments.note,
    createdAt: payments.createdAt,
  }).from(payments)
    .innerJoin(contracts, eq(payments.contractId, contracts.id))
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(eq(customers.isDeleted, false), ownerFilter))
    .orderBy(sql`${payments.paidAt} desc nulls last`, sql`${payments.updatedAt} desc`)
    .limit(5_000)
  return csvResponse('回款台账.csv', ['客户', '归属销售', '合同编号', '关联发票', '回款编号', '状态', '回款金额（元）', '到账日期', '备注', '创建时间'], rows.map((row) => [row.customerName, row.ownerName, row.contractNumber, row.invoiceNumber, row.paymentNumber, row.status, yuan(row.amountCents), dateValue(row.paidAt), row.note, row.createdAt]))
})
