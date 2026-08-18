// apps/api/src/routes/finance.ts
import { createDb } from '@crm/db/client'
import { contracts, customers, invoices, payments } from '@crm/db/schema'
import { and, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

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
