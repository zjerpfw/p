// apps/api/src/routes/customers.ts
import { createDb } from '@crm/db/client'
import { activities, attachments, contacts, customerStatuses, customerTagAssignments, customerTags, customers, dealSplits, deals, tasks, users } from '@crm/db/schema'
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, like, lt, lte, or, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'
import { csvResponse } from '../lib/csv'
import { addShanghaiCalendarYears, startOfShanghaiDay, todayInShanghai } from '../lib/shanghai-date'

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
  province?: unknown
  city?: unknown
  address?: unknown
}

interface UpdateCustomerPayload {
  name?: unknown
  contact_phone?: unknown
  status?: unknown
  province?: unknown
  city?: unknown
  address?: unknown
  owner_id?: unknown
  saas_expire_date?: unknown
}

const tagNameSchema = z.string().trim().min(1, '请填写标签名称').max(40, '标签名称不能超过 40 个字符')
const customerStatusSchema = z.enum(customerStatuses, { errorMap: () => ({ message: '客户状态无效' }) })
const customerTagIdsSchema = z.object({
  tag_ids: z.array(z.string().uuid('标签编号无效')).max(20, '每个客户最多添加 20 个标签'),
})
const transferCustomersSchema = z.object({
  customer_ids: z.array(z.string().min(1, '客户编号不能为空')).min(1, '请至少选择一位客户').max(50, '单次最多转交 50 位客户'),
  owner_id: z.string().min(1, '请选择新的客户负责人'),
})
const MAX_CUSTOMER_IMPORT_BYTES = 512 * 1024
const MAX_CUSTOMER_IMPORT_ROWS = 200
const customerImportHeaderAliases: Record<string, 'name' | 'contactPhone' | 'status' | 'province' | 'city' | 'address'> = {
  '客户名称': 'name',
  name: 'name',
  '联系电话': 'contactPhone',
  contact_phone: 'contactPhone',
  phone: 'contactPhone',
  '当前状态': 'status',
  status: 'status',
  '省份': 'province',
  province: 'province',
  '城市': 'city',
  city: 'city',
  '公司地址': 'address',
  '详细地址': 'address',
  address: 'address',
}

interface ContactPayload {
  name?: unknown
  position?: unknown
  phone?: unknown
  email?: unknown
  wechat?: unknown
  is_primary?: unknown
  notes?: unknown
}

const contactPayloadSchema = z.object({
  name: z.string().trim().min(1, '请填写联系人姓名').max(100, '联系人姓名不能超过 100 个字符'),
  position: z.string().trim().max(100, '职位不能超过 100 个字符').optional().default(''),
  phone: z.string().trim().max(30, '手机号不能超过 30 个字符').optional().default(''),
  email: z.string().trim().email('邮箱格式无效').max(254, '邮箱不能超过 254 个字符').optional().or(z.literal('')).default(''),
  wechat: z.string().trim().max(100, '企业微信或微信号不能超过 100 个字符').optional().default(''),
  is_primary: z.boolean().optional().default(false),
  notes: z.string().trim().max(2_000, '备注不能超过 2000 个字符').optional().default(''),
})

interface DirectWonCustomerPayload {
  name?: unknown
  contact_phone?: unknown
  province?: unknown
  city?: unknown
  address?: unknown
  product_name?: unknown
  channel?: unknown
  original_price_cents?: unknown
  amount_cents?: unknown
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

const directWonSchema = z.object({
  name: z.string().trim().min(1, '请填写客户名称').max(100, '客户名称不能超过 100 个字符'),
  contact_phone: z.string().trim().max(30, '联系电话不能超过 30 个字符').optional().default(''),
  province: z.string().trim().max(50, '省份不能超过 50 个字符').optional().default(''),
  city: z.string().trim().max(50, '城市不能超过 50 个字符').optional().default(''),
  address: z.string().trim().max(500, '详细地址不能超过 500 个字符').optional().default(''),
  product_name: z.string().trim().min(1, '请填写购买产品或规格').max(200, '购买产品或规格不能超过 200 个字符'),
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
  original_price_cents: z.number().int().nonnegative('原价不能小于 0').optional(),
  amount_cents: z.number().int().nonnegative('成交金额不能小于 0'),
  start_date: z.union([z.string(), z.number()]),
  duration_years: z.number().int().positive('服务年限必须大于 0'),
  gift_months: z.number().int().nonnegative('赠送时长不能小于 0').optional().default(0),
  expire_date: z.union([z.string(), z.number()]),
  renewal_reminder_days: z.number().int().nonnegative('提前提醒天数不能小于 0').default(30),
  software_cost_cents: z.number().int().nonnegative('软件成本不能小于 0'),
  tax_cost_cents: z.number().int().nonnegative('开票成本不能小于 0'),
  rebate_amount_cents: z.number().int().nonnegative('返利不能小于 0'),
  net_profit_cents: z.number().int().nonnegative('实际利润不能小于 0'),
  splits: z.array(z.object({
    user_id: z.string().trim().min(1, '请选择分成人员'),
    split_amount_cents: z.number().int().nonnegative('分成金额不能小于 0'),
  })),
})

const renewCustomerSchema = z.object({
  amount_cents: z.number().int().positive('续费金额必须大于 0'),
  years: z.number().int().min(1, '续费年限至少为 1 年').max(20, '续费年限不能超过 20 年').optional().default(1),
  product: z.string().trim().min(1, '请选择续费产品').max(200, '续费产品不能超过 200 个字符'),
  channel: z.string().trim().max(100, '渠道名称不能超过 100 个字符').optional().default(''),
})

function getIdempotencyKey(c: Context) {
  const value = c.req.header('x-idempotency-key')?.trim()
  return value && z.string().uuid().safeParse(value).success ? value : null
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  return value.trim().slice(0, maxLength) || null
}

function normalizePhone(value: string | null) {
  return value?.replaceAll(/[\s\-()]/g, '') || null
}

function parseCsvRows(content: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) return null
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function getCustomerImportColumnIndexes(headers: string[]) {
  const columns = new Map<'name' | 'contactPhone' | 'status' | 'province' | 'city' | 'address', number>()
  headers.forEach((header, index) => {
    const key = customerImportHeaderAliases[header.trim().replace(/^\uFEFF/, '').toLowerCase()]
    if (key && !columns.has(key)) columns.set(key, index)
  })
  return columns.has('name') ? columns : null
}

async function findDuplicateCustomer(
  db: ReturnType<typeof createDb>,
  name: string,
  contactPhone: string | null,
) {
  const normalizedPhone = normalizePhone(contactPhone)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(
      eq(customers.isDeleted, false),
      or(
        sql`lower(${customers.name}) = lower(${name})`,
        normalizedPhone
          ? sql`replace(replace(replace(replace(${customers.contactPhone}, ' ', ''), '-', ''), '(', ''), ')', '') = ${normalizedPhone}`
          : undefined,
      ),
    ))
    .limit(1)
  return customer ?? null
}

function customerSearchCondition(search: string | undefined) {
  if (!search) return undefined
  const pattern = `%${search}%`
  return or(
    like(customers.name, pattern),
    like(customers.contactPhone, pattern),
    sql`exists (
      select 1 from ${contacts}
      where ${contacts.customerId} = ${customers.id}
        and (${contacts.name} like ${pattern} or ${contacts.phone} like ${pattern})
    )`,
  )
}

function parseMultiValueQuery(value: string | undefined, maxValues = 20) {
  if (!value) return []
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, maxValues)
}

const wonCustomerExpiryBuckets = ['expired', 'within_30', 'within_90', 'beyond_90', 'unspecified'] as const

function wonCustomerExpiryCondition(buckets: string[], now: Date) {
  if (buckets.length === 0) return undefined
  const day30 = new Date(now)
  day30.setDate(day30.getDate() + 30)
  const day90 = new Date(now)
  day90.setDate(day90.getDate() + 90)
  return or(
    buckets.includes('expired') ? and(isNotNull(customers.saasExpireDate), lt(customers.saasExpireDate, now)) : undefined,
    buckets.includes('within_30') ? and(isNotNull(customers.saasExpireDate), gte(customers.saasExpireDate, now), lte(customers.saasExpireDate, day30)) : undefined,
    buckets.includes('within_90') ? and(isNotNull(customers.saasExpireDate), gt(customers.saasExpireDate, day30), lte(customers.saasExpireDate, day90)) : undefined,
    buckets.includes('beyond_90') ? and(isNotNull(customers.saasExpireDate), gt(customers.saasExpireDate, day90)) : undefined,
    buckets.includes('unspecified') ? sql`${customers.saasExpireDate} is null` : undefined,
  )
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
  const statusResult = customerStatusSchema.safeParse(optionalText(body.status, 50) ?? 'Active')
  const province = optionalText(body.province, 50)
  const city = optionalText(body.city, 50)
  const address = optionalText(body.address, 500)
  if (!name || contactPhone === undefined || province === undefined || city === undefined || address === undefined) {
    return c.json({ error: '客户名称、联系电话、地域或详细地址格式无效' }, 400)
  }
  if (!statusResult.success) return c.json({ error: '客户状态无效' }, 400)

  const now = new Date()
  const customer = {
    id: crypto.randomUUID(),
    name,
    contactPhone,
    status: statusResult.data,
    province,
    city,
    address,
    ownerId: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  const db = createDb(c.env.DB)
  if (await findDuplicateCustomer(db, name, contactPhone)) {
    return c.json({ error: '客户名称或联系电话已存在，请先搜索确认' }, 409)
  }
  await db.insert(customers).values(customer)
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Customer', entityId: customer.id, action: 'Created', after: customer }))

  return c.json({ customer }, 201)
})

customerRoutes.post('/import/csv', async (c) => {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: '导入请求必须使用 multipart/form-data' }, 400)
  }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_CUSTOMER_IMPORT_BYTES) {
    return c.json({ error: '请选择不超过 512 KiB 的 CSV 文件' }, 400)
  }
  if (!file.name.toLowerCase().endsWith('.csv')) return c.json({ error: '仅支持 CSV 文件' }, 400)

  const rows = parseCsvRows(await file.text())
  if (!rows || rows.length < 2) return c.json({ error: 'CSV 内容无效或缺少数据行' }, 400)
  const columns = getCustomerImportColumnIndexes(rows[0] ?? [])
  if (!columns) return c.json({ error: 'CSV 必须包含“客户名称”或 name 表头' }, 400)
  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim().length > 0))
  if (dataRows.length === 0) return c.json({ error: 'CSV 中没有可导入的客户' }, 400)
  if (dataRows.length > MAX_CUSTOMER_IMPORT_ROWS) return c.json({ error: `单次最多导入 ${MAX_CUSTOMER_IMPORT_ROWS} 位客户` }, 400)

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const now = new Date()
  const seenNames = new Set<string>()
  const seenPhones = new Set<string>()
  const importedCustomers: Array<{ id: string; name: string; contactPhone: string | null; status: (typeof customerStatuses)[number]; province: string | null; city: string | null; address: string | null; ownerId: string; createdAt: Date; updatedAt: Date }> = []
  const errors: Array<{ row: number; reason: string }> = []
  let skipped = 0

  for (const [index, row] of dataRows.entries()) {
    const name = optionalText(row[columns.get('name')!], 100)
    const contactPhone = optionalText(columns.has('contactPhone') ? row[columns.get('contactPhone')!] : undefined, 30)
    const statusResult = customerStatusSchema.safeParse(optionalText(columns.has('status') ? row[columns.get('status')!] : undefined, 50) ?? 'Active')
    const province = optionalText(columns.has('province') ? row[columns.get('province')!] : undefined, 50)
    const city = optionalText(columns.has('city') ? row[columns.get('city')!] : undefined, 50)
    const address = optionalText(columns.has('address') ? row[columns.get('address')!] : undefined, 500)
    const rowNumber = index + 2
    if (!name || contactPhone === undefined || province === undefined || city === undefined || address === undefined || !statusResult.success) {
      errors.push({ row: rowNumber, reason: !statusResult.success ? '客户状态无效' : '客户名称、联系电话、地域或详细地址格式无效' })
      continue
    }
    const normalizedName = name.toLowerCase()
    const normalizedPhone = normalizePhone(contactPhone)
    if (seenNames.has(normalizedName) || (normalizedPhone && seenPhones.has(normalizedPhone)) || await findDuplicateCustomer(db, name, contactPhone)) {
      skipped += 1
      continue
    }
    seenNames.add(normalizedName)
    if (normalizedPhone) seenPhones.add(normalizedPhone)
    importedCustomers.push({
      id: crypto.randomUUID(), name, contactPhone, status: statusResult.data, province, city, address,
      ownerId: actor.id, createdAt: now, updatedAt: now,
    })
  }

  if (importedCustomers.length > 0) {
    const [firstCustomer, ...remainingCustomers] = importedCustomers
    if (!firstCustomer) return c.json({ error: 'CSV 中没有可导入的客户' }, 400)
    await db.batch([
      db.insert(customers).values(firstCustomer),
      ...remainingCustomers.map((customer) => db.insert(customers).values(customer)),
    ])
    c.executionCtx.waitUntil(Promise.all(importedCustomers.map((customer) => writeAuditLog(c.env, {
      actorId: actor.id, entityType: 'Customer', entityId: customer.id, action: 'Created', after: customer,
    }))))
  }
  return c.json({ created: importedCustomers.length, skipped, errors })
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
  const calculatedExpireDate = new Date(startDate)
  calculatedExpireDate.setFullYear(calculatedExpireDate.getFullYear() + parsed.data.duration_years)
  calculatedExpireDate.setMonth(calculatedExpireDate.getMonth() + parsed.data.gift_months)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(expireDate.getTime()) || expireDate.getTime() !== calculatedExpireDate.getTime()) {
    return c.json({ error: '服务日期无效，到期时间必须晚于使用日期' }, 400)
  }

  const calculatedNetProfitCents = parsed.data.amount_cents - parsed.data.software_cost_cents - parsed.data.tax_cost_cents - parsed.data.rebate_amount_cents
  const totalSplitAmountCents = parsed.data.splits.reduce((total, split) => total + split.split_amount_cents, 0)
  if (parsed.data.net_profit_cents !== calculatedNetProfitCents || totalSplitAmountCents > calculatedNetProfitCents) {
    return c.json({ error: '实际利润或分成金额不合法' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  if (await findDuplicateCustomer(db, parsed.data.name, parsed.data.contact_phone || null)) {
    return c.json({ error: '客户名称或联系电话已存在，请先搜索确认' }, 409)
  }
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
    province: parsed.data.province || null,
    city: parsed.data.city || null,
    address: parsed.data.address || null,
    ownerId: actor.id,
    saasExpireDate: expireDate,
    createdAt: now,
    updatedAt: now,
  })
  const dealInsert = db.insert(deals).values({
    id: dealId,
    customerId,
    productName: parsed.data.product_name,
    amountCents: parsed.data.amount_cents,
    channel: parsed.data.channel || null,
    originalPriceCents: parsed.data.original_price_cents ?? parsed.data.amount_cents,
    stage: 'Won',
    expectedCloseDate: startDate,
    wonAt: now,
    startDate,
    durationYears: parsed.data.duration_years,
    giftMonths: parsed.data.gift_months,
    expireDate,
    renewalReminderDays: parsed.data.renewal_reminder_days,
    softwareCostCents: parsed.data.software_cost_cents,
    taxCostCents: parsed.data.tax_cost_cents,
    rebateAmountCents: parsed.data.rebate_amount_cents,
    netProfitCents: parsed.data.net_profit_cents,
    createdAt: now,
    updatedAt: now,
  })
  const splitInserts = parsed.data.splits.map((split) => db.insert(dealSplits).values({
    id: crypto.randomUUID(),
    dealId,
    userId: split.user_id,
    splitAmountCents: split.split_amount_cents,
  }))

  // D1 batch commits all customer, deal, and split records atomically.
  await db.batch([customerInsert, dealInsert, ...splitInserts])
  c.executionCtx.waitUntil(writeAuditLog(c.env, {
    actorId: actor.id,
    entityType: 'Customer',
    entityId: customerId,
    action: 'Created',
    after: { id: customerId, name: parsed.data.name, status: 'Active', saasExpireDate: expireDate },
  }))
  c.executionCtx.waitUntil(writeAuditLog(c.env, {
    actorId: actor.id,
    entityType: 'Deal',
    entityId: dealId,
    action: 'Won',
    after: { id: dealId, customerId, productName: parsed.data.product_name, amountCents: parsed.data.amount_cents, stage: 'Won' },
  }))
  return c.json({ customerId, dealId, stage: 'Won' }, 201)
})

customerRoutes.post('/:id/renew', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  const parsed = renewCustomerSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '续费资料格式无效' }, 400)
  const idempotencyKey = getIdempotencyKey(c)
  if (!idempotencyKey) return c.json({ error: 'x-idempotency-key 必须为 UUID' }, 400)

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [existingRequest] = await db
    .select({ id: deals.id, customerId: deals.customerId, dealType: deals.dealType })
    .from(deals)
    .where(eq(deals.idempotencyKey, idempotencyKey))
    .limit(1)
  if (existingRequest) {
    if (existingRequest.customerId === c.req.param('id') && existingRequest.dealType === 'Renewal') {
      return c.json({ customerId: existingRequest.customerId, dealId: existingRequest.id, dealType: 'Renewal', idempotent: true })
    }
    return c.json({ error: '幂等请求键已被其他业务请求使用' }, 409)
  }
  const [customer] = await db
    .select({ id: customers.id, saasExpireDate: customers.saasExpireDate })
    .from(customers)
    .where(and(
      eq(customers.id, c.req.param('id')),
      eq(customers.isDeleted, false),
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权续费' }, 404)

  const [latestWonDeal] = await db
    .select({ reminderDays: deals.renewalReminderDays })
    .from(deals)
    .where(and(eq(deals.customerId, customer.id), eq(deals.stage, 'Won'), eq(deals.isDeleted, false)))
    .orderBy(desc(deals.createdAt))
    .limit(1)

  const now = new Date()
  const today = todayInShanghai(now)
  const recordedExpireDate = customer.saasExpireDate
  const normalizedExpireDate = recordedExpireDate ? startOfShanghaiDay(recordedExpireDate) : null
  const renewalStartDate = normalizedExpireDate && normalizedExpireDate.getTime() >= today.getTime() ? normalizedExpireDate : today
  const newExpireDate = addShanghaiCalendarYears(renewalStartDate, parsed.data.years)
  const dealId = crypto.randomUUID()
  const insertRenewalDeal = db.insert(deals).values({
    id: dealId,
    customerId: customer.id,
    amountCents: parsed.data.amount_cents,
    channel: parsed.data.channel || null,
    originalPriceCents: parsed.data.amount_cents,
    dealType: 'Renewal',
    productName: parsed.data.product,
    stage: 'Won',
    expectedCloseDate: now,
    wonAt: now,
    startDate: renewalStartDate,
    durationYears: parsed.data.years,
    giftMonths: 0,
    expireDate: newExpireDate,
    renewalReminderDays: latestWonDeal?.reminderDays ?? 30,
    idempotencyKey,
    probability: 100,
    updatedAt: now,
    createdAt: now,
  })
  const updateCustomerExpireDate = db
    .update(customers)
    .set({ saasExpireDate: newExpireDate, status: 'Active', updatedAt: now })
    .where(eq(customers.id, customer.id))

  try {
    await db.batch([insertRenewalDeal, updateCustomerExpireDate])
  } catch (error) {
    if (!(error instanceof Error) || !/unique/i.test(error.message)) throw error
    const [existingDeal] = await db
      .select({ id: deals.id, customerId: deals.customerId, dealType: deals.dealType })
      .from(deals)
      .where(eq(deals.idempotencyKey, idempotencyKey))
      .limit(1)
    if (existingDeal?.customerId === customer.id && existingDeal.dealType === 'Renewal') {
      return c.json({ customerId: customer.id, dealId: existingDeal.id, dealType: 'Renewal', idempotent: true })
    }
    return c.json({ error: '续费请求已被并发处理，请刷新后确认结果' }, 409)
  }
  c.executionCtx.waitUntil(writeAuditLog(c.env, {
    actorId: actor.id,
    entityType: 'Customer',
    entityId: customer.id,
    action: 'Renewed',
    before: { saasExpireDate: recordedExpireDate },
    after: { saasExpireDate: newExpireDate, amountCents: parsed.data.amount_cents, years: parsed.data.years },
  }))
  c.executionCtx.waitUntil(writeAuditLog(c.env, {
    actorId: actor.id,
    entityType: 'Deal',
    entityId: dealId,
    action: 'Renewed',
    after: { customerId: customer.id, productName: parsed.data.product, amountCents: parsed.data.amount_cents, stage: 'Won' },
  }))
  return c.json({
    customerId: customer.id,
    dealId,
    dealType: 'Renewal',
    previousExpireDate: recordedExpireDate?.toISOString() ?? null,
    renewalStartDate: renewalStartDate.toISOString(),
    newExpireDate: newExpireDate.toISOString(),
  }, 201)
})

customerRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const tagId = c.req.query('tag_id')?.trim()
  const followUp = c.req.query('follow_up')?.trim()
  if (tagId && !z.string().uuid().safeParse(tagId).success) return c.json({ error: '标签编号无效' }, 400)
  const statusResult = status ? customerStatusSchema.safeParse(status) : undefined
  if (statusResult && !statusResult.success) return c.json({ error: '客户状态无效' }, 400)
  if (followUp && followUp !== 'stale') return c.json({ error: '跟进状态筛选无效' }, 400)
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 10, 100)
  const staleFollowUpAt = new Date(Date.now() - 7 * 86_400_000)
  const filters = [
    eq(customers.isDeleted, false),
    customerSearchCondition(search),
    statusResult?.success ? eq(customers.status, statusResult.data) : undefined,
    tagId ? sql`exists (select 1 from ${customerTagAssignments} where ${customerTagAssignments.customerId} = ${customers.id} and ${customerTagAssignments.tagId} = ${tagId})` : undefined,
    followUp === 'stale' ? sql`not exists (select 1 from ${activities} where ${activities.customerId} = ${customers.id} and ${activities.createdAt} >= ${staleFollowUpAt})` : undefined,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = filters.length ? and(...filters) : undefined
  const [customerList, [{ total }]] = await Promise.all([
    db.select({
      id: customers.id,
      name: customers.name,
      contactPhone: customers.contactPhone,
      status: customers.status,
      lng: customers.lng,
      lat: customers.lat,
      province: customers.province,
      city: customers.city,
      address: customers.address,
      ownerId: customers.ownerId,
      ownerName: users.name,
      saasExpireDate: customers.saasExpireDate,
      lastActivityAt: sql<number | null>`(select max(${activities.createdAt}) from ${activities} where ${activities.customerId} = ${customers.id})`,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    }).from(customers).leftJoin(users, eq(customers.ownerId, users.id)).where(where).orderBy(desc(customers.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(customers).where(where),
  ])

  return c.json({
    data: customerList.map((customer) => ({
      ...customer,
      lastActivityAt: customer.lastActivityAt ? new Date(customer.lastActivityAt).toISOString() : null,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
})

customerRoutes.get('/won-customers', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const provinces = parseMultiValueQuery(c.req.query('provinces'))
  const cities = parseMultiValueQuery(c.req.query('cities'))
  const expiryBuckets = parseMultiValueQuery(c.req.query('expiry')).filter((bucket) => wonCustomerExpiryBuckets.includes(bucket as (typeof wonCustomerExpiryBuckets)[number]))
  if (c.req.query('expiry') && expiryBuckets.length !== parseMultiValueQuery(c.req.query('expiry')).length) {
    return c.json({ error: '服务到期筛选无效' }, 400)
  }
  const page = parsePagination(c.req.query('page'), 1, 1_000_000)
  const limit = parsePagination(c.req.query('limit'), 20, 100)
  const now = new Date()
  const db = createDb(c.env.DB)
  const filters = [
    eq(customers.isDeleted, false),
    customerSearchCondition(search),
    provinces.length > 0 ? inArray(customers.province, provinces) : undefined,
    cities.length > 0 ? inArray(customers.city, cities) : undefined,
    wonCustomerExpiryCondition(expiryBuckets, now),
    sql`exists (select 1 from ${deals} where ${deals.customerId} = ${customers.id} and ${deals.stage} = 'Won' and ${deals.isDeleted} = false)`,
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const where = and(...filters)
  const [rows, [{ total }], regions] = await Promise.all([
    db.select({
      id: customers.id,
      name: customers.name,
      contactPhone: customers.contactPhone,
      province: customers.province,
      city: customers.city,
      address: customers.address,
      lng: customers.lng,
      lat: customers.lat,
      saasExpireDate: customers.saasExpireDate,
      ownerId: customers.ownerId,
      ownerName: users.name,
      latestWonAt: sql<number | null>`(select max(${deals.wonAt}) from ${deals} where ${deals.customerId} = ${customers.id} and ${deals.stage} = 'Won' and ${deals.isDeleted} = false)`,
      latestProductName: sql<string | null>`(select ${deals.productName} from ${deals} where ${deals.customerId} = ${customers.id} and ${deals.stage} = 'Won' and ${deals.isDeleted} = false order by ${deals.wonAt} desc, ${deals.createdAt} desc limit 1)`,
    }).from(customers)
      .leftJoin(users, eq(customers.ownerId, users.id))
      .where(where)
      .orderBy(asc(sql`case when ${customers.saasExpireDate} is null then 1 else 0 end`), asc(customers.saasExpireDate), asc(customers.name))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(customers).where(where),
    db.selectDistinct({ province: customers.province, city: customers.city })
      .from(customers)
      .where(and(
        eq(customers.isDeleted, false),
        sql`exists (select 1 from ${deals} where ${deals.customerId} = ${customers.id} and ${deals.stage} = 'Won' and ${deals.isDeleted} = false)`,
        actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
      ))
      .orderBy(asc(customers.province), asc(customers.city)),
  ])
  return c.json({
    data: rows.map((customer) => ({
      ...customer,
      latestWonAt: customer.latestWonAt ? new Date(customer.latestWonAt).toISOString() : null,
    })),
    regions: regions.filter((region) => region.province || region.city),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
})

customerRoutes.get('/export/csv', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const search = c.req.query('search')?.trim().slice(0, 100)
  const status = c.req.query('status')?.trim().slice(0, 50)
  const tagId = c.req.query('tag_id')?.trim()
  const followUp = c.req.query('follow_up')?.trim()
  if (tagId && !z.string().uuid().safeParse(tagId).success) return c.json({ error: '标签编号无效' }, 400)
  const statusResult = status ? customerStatusSchema.safeParse(status) : undefined
  if (statusResult && !statusResult.success) return c.json({ error: '客户状态无效' }, 400)
  if (followUp && followUp !== 'stale') return c.json({ error: '跟进状态筛选无效' }, 400)
  const db = createDb(c.env.DB)
  const staleFollowUpAt = new Date(Date.now() - 7 * 86_400_000)
  const rows = await db
    .select({
      name: customers.name,
      contactPhone: customers.contactPhone,
      status: customers.status,
      province: customers.province,
      city: customers.city,
      address: customers.address,
      saasExpireDate: customers.saasExpireDate,
      ownerName: users.name,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .leftJoin(users, eq(customers.ownerId, users.id))
    .where(and(
      eq(customers.isDeleted, false),
      customerSearchCondition(search),
      statusResult?.success ? eq(customers.status, statusResult.data) : undefined,
      tagId ? sql`exists (select 1 from ${customerTagAssignments} where ${customerTagAssignments.customerId} = ${customers.id} and ${customerTagAssignments.tagId} = ${tagId})` : undefined,
      followUp === 'stale' ? sql`not exists (select 1 from ${activities} where ${activities.customerId} = ${customers.id} and ${activities.createdAt} >= ${staleFollowUpAt})` : undefined,
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .orderBy(desc(customers.createdAt))
    .limit(5_000)

  return csvResponse(
    '客户清单.csv',
    ['客户名称', '联系电话', '当前状态', '省份', '城市', '详细地址', '当前服务到期日', '归属销售', '创建时间'],
    rows.map((row) => [
      row.name,
      row.contactPhone,
      row.status,
      row.province,
      row.city,
      row.address,
      row.saasExpireDate,
      row.ownerName,
      row.createdAt,
    ]),
  )
})

customerRoutes.get('/tags', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const tags = await db.select({ id: customerTags.id, name: customerTags.name }).from(customerTags).orderBy(asc(customerTags.name))
  return c.json({ tags })
})

customerRoutes.post('/tags', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = tagNameSchema.safeParse(typeof body === 'object' && body !== null && 'name' in body ? body.name : undefined)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '标签资料无效' }, 400)
  const db = createDb(c.env.DB)
  const tag = { id: crypto.randomUUID(), name: parsed.data, createdAt: new Date() }
  try {
    await db.insert(customerTags).values(tag)
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '标签名称已存在' }, 409)
    throw error
  }
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'CustomerTag', entityId: tag.id, action: 'Created', after: tag }))
  return c.json({ tag }, 201)
})

customerRoutes.put('/:id/tags', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = customerTagIdsSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '标签资料无效' }, 400)
  const tagIds = [...new Set(parsed.data.tag_ids)]
  const db = createDb(c.env.DB)
  const [customer] = await db.select({ id: customers.id }).from(customers).where(and(
    eq(customers.id, c.req.param('id')),
    eq(customers.isDeleted, false),
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  )).limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权维护标签' }, 404)

  const [beforeTags, availableTags] = await Promise.all([
    db.select({ id: customerTags.id, name: customerTags.name })
      .from(customerTagAssignments)
      .innerJoin(customerTags, eq(customerTagAssignments.tagId, customerTags.id))
      .where(eq(customerTagAssignments.customerId, customer.id)),
    tagIds.length > 0
      ? db.select({ id: customerTags.id, name: customerTags.name }).from(customerTags).where(inArray(customerTags.id, tagIds))
      : Promise.resolve([]),
  ])
  if (availableTags.length !== tagIds.length) return c.json({ error: '存在不存在的标签' }, 400)

  const now = new Date()
  await db.batch([
    db.delete(customerTagAssignments).where(eq(customerTagAssignments.customerId, customer.id)),
    ...tagIds.map((tagId) => db.insert(customerTagAssignments).values({ id: crypto.randomUUID(), customerId: customer.id, tagId, createdAt: now })),
  ])
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Customer', entityId: customer.id, action: 'Updated', before: { tags: beforeTags }, after: { tags: availableTags } }))
  return c.json({ tags: availableTags })
})

customerRoutes.get('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const customerId = c.req.param('id')
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      contactPhone: customers.contactPhone,
      status: customers.status,
      lng: customers.lng,
      lat: customers.lat,
      province: customers.province,
      city: customers.city,
      address: customers.address,
      ownerId: customers.ownerId,
      ownerName: users.name,
      saasExpireDate: customers.saasExpireDate,
      isDeleted: customers.isDeleted,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .leftJoin(users, eq(customers.ownerId, users.id))
    .where(and(eq(customers.id, customerId), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)

  if (!customer) {
    return c.json({ error: '客户不存在' }, 404)
  }

  const [customerDeals, customerContacts, customerTasks, tags] = await Promise.all([
    db
    .select()
    .from(deals)
    .where(and(eq(deals.customerId, customer.id), eq(deals.isDeleted, false)))
    .orderBy(desc(deals.createdAt)),
    db
      .select()
      .from(contacts)
      .where(eq(contacts.customerId, customer.id))
      .orderBy(desc(contacts.isPrimary), desc(contacts.updatedAt)),
    db
      .select({
        id: tasks.id,
        customerId: tasks.customerId,
        dealId: tasks.dealId,
        title: tasks.title,
        description: tasks.description,
        assigneeId: tasks.assigneeId,
        dueAt: tasks.dueAt,
        priority: tasks.priority,
        status: tasks.status,
        completedAt: tasks.completedAt,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(eq(tasks.customerId, customer.id))
      .orderBy(asc(tasks.status), asc(tasks.dueAt)),
    db.select({ id: customerTags.id, name: customerTags.name })
      .from(customerTagAssignments)
      .innerJoin(customerTags, eq(customerTagAssignments.tagId, customerTags.id))
      .where(eq(customerTagAssignments.customerId, customer.id))
      .orderBy(asc(customerTags.name)),
  ])

  const customerActivities = await db
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
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .where(eq(activities.customerId, customer.id))
    .orderBy(desc(activities.createdAt))

  const customerAttachments = await db
    .select({
      id: attachments.id,
      activityId: attachments.activityId,
      fileName: attachments.fileName,
      contentType: attachments.contentType,
      uploadedBy: attachments.uploadedBy,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.customerId, customer.id))
    .orderBy(desc(attachments.createdAt))

  return c.json({
    customer,
    tags,
    contacts: customerContacts,
    tasks: customerTasks,
    deals: customerDeals,
    activities: customerActivities,
    attachments: customerAttachments,
  })
})

customerRoutes.post('/:id/contacts', async (c) => {
  let body: ContactPayload
  try {
    body = await c.req.json<ContactPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  const parsed = contactPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '联系人资料格式无效' }, 400)

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const customerId = c.req.param('id')
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权新增联系人' }, 404)

  const now = new Date()
  const contact = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    name: parsed.data.name,
    position: parsed.data.position || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    wechat: parsed.data.wechat || null,
    isPrimary: parsed.data.is_primary,
    notes: parsed.data.notes || null,
    createdAt: now,
    updatedAt: now,
  }
  const insertContact = db.insert(contacts).values(contact)
  if (contact.isPrimary) {
    await db.batch([
      db.update(contacts).set({ isPrimary: false, updatedAt: now }).where(and(eq(contacts.customerId, customer.id), eq(contacts.isPrimary, true))),
      insertContact,
    ])
  } else {
    await insertContact
  }
  return c.json({ contact }, 201)
})

customerRoutes.put('/:id/contacts/:contactId', async (c) => {
  let body: ContactPayload
  try {
    body = await c.req.json<ContactPayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  const parsed = contactPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '联系人资料格式无效' }, 400)

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const customerId = c.req.param('id')
  const contactId = c.req.param('contactId')
  const [existingContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.customerId, customerId), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!existingContact) return c.json({ error: '联系人不存在或无权编辑' }, 404)

  const now = new Date()
  const updateContact = db.update(contacts).set({
    name: parsed.data.name,
    position: parsed.data.position || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    wechat: parsed.data.wechat || null,
    isPrimary: parsed.data.is_primary,
    notes: parsed.data.notes || null,
    updatedAt: now,
  }).where(eq(contacts.id, existingContact.id)).returning()
  const [contact] = parsed.data.is_primary
    ? await db.batch([
        db.update(contacts).set({ isPrimary: false, updatedAt: now }).where(and(eq(contacts.customerId, customerId), eq(contacts.isPrimary, true))),
        updateContact,
      ]).then(([, updated]) => updated)
    : await updateContact
  return c.json({ contact })
})

customerRoutes.delete('/:id/contacts/:contactId', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.id, c.req.param('contactId')), eq(contacts.customerId, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!contact) return c.json({ error: '联系人不存在或无权删除' }, 404)
  await db.delete(contacts).where(eq(contacts.id, contact.id))
  return c.json({ id: contact.id, deleted: true })
})

customerRoutes.post('/transfer', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以批量转交客户' }, 403)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  const parsed = transferCustomersSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '批量转交参数无效' }, 400)

  const customerIds = [...new Set(parsed.data.customer_ids)]
  const db = createDb(c.env.DB)
  const [targetOwner] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, parsed.data.owner_id))
    .limit(1)
  if (!targetOwner) return c.json({ error: '新的客户负责人不存在' }, 400)

  const selectedCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      ownerId: customers.ownerId,
      status: customers.status,
      contactPhone: customers.contactPhone,
      address: customers.address,
      saasExpireDate: customers.saasExpireDate,
    })
    .from(customers)
    .where(and(inArray(customers.id, customerIds), eq(customers.isDeleted, false)))
  if (selectedCustomers.length !== customerIds.length) {
    return c.json({ error: '存在已删除或不存在的客户，无法完成批量转交' }, 404)
  }

  const changedCustomers = selectedCustomers.filter((customer) => customer.ownerId !== targetOwner.id)
  if (changedCustomers.length > 0) {
    const previousOwnerIds = [...new Set(changedCustomers.map((customer) => customer.ownerId).filter((ownerId): ownerId is string => Boolean(ownerId)))]
    const previousOwners = previousOwnerIds.length > 0
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, previousOwnerIds))
      : []
    const previousOwnerNameById = new Map(previousOwners.map((owner) => [owner.id, owner.name]))
    await db
      .update(customers)
      .set({ ownerId: targetOwner.id, updatedAt: new Date() })
      .where(inArray(customers.id, changedCustomers.map((customer) => customer.id)))
    c.executionCtx.waitUntil(Promise.all(changedCustomers.map((customer) => writeAuditLog(c.env, {
      actorId: actor.id,
      entityType: 'Customer',
      entityId: customer.id,
      action: 'Transferred',
      before: {
        customerId: customer.id,
        customerName: customer.name,
        ownerId: customer.ownerId,
        ownerName: customer.ownerId ? previousOwnerNameById.get(customer.ownerId) ?? null : null,
      },
      after: {
        customerId: customer.id,
        customerName: customer.name,
        ownerId: targetOwner.id,
        ownerName: targetOwner.name,
      },
    }))))
  }

  return c.json({
    transferred: changedCustomers.length,
    unchanged: selectedCustomers.length - changedCustomers.length,
    owner: targetOwner,
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
  const statusResult = body.status === undefined ? undefined : customerStatusSchema.safeParse(optionalText(body.status, 50) ?? 'Active')
  const province = body.province === undefined ? undefined : optionalText(body.province, 50)
  const city = body.city === undefined ? undefined : optionalText(body.city, 50)
  const address = body.address === undefined ? undefined : optionalText(body.address, 500)
  const ownerIdResult = body.owner_id === undefined ? undefined : optionalText(body.owner_id, 128)
  const expireDate = body.saas_expire_date === undefined
    ? undefined
    : body.saas_expire_date === null || body.saas_expire_date === ''
      ? null
      : typeof body.saas_expire_date === 'string' || typeof body.saas_expire_date === 'number'
        ? new Date(body.saas_expire_date)
        : undefined
  if (name === undefined || name === null || contactPhone === undefined || province === undefined || city === undefined || address === undefined) {
    return c.json({ error: '客户资料格式无效' }, 400)
  }
  if (expireDate !== undefined && (expireDate === null ? false : Number.isNaN(expireDate.getTime()))) {
    return c.json({ error: 'SaaS 到期日格式无效' }, 400)
  }
  if (statusResult && !statusResult.success) return c.json({ error: '客户状态无效' }, 400)
  if (body.owner_id !== undefined && actor.role !== 'admin') return c.json({ error: '仅管理员可以转交客户' }, 403)
  if (body.owner_id !== undefined && !ownerIdResult) return c.json({ error: '请选择有效的客户负责人' }, 400)
  const ownerId = ownerIdResult ?? undefined

  const db = createDb(c.env.DB)
  const [targetOwner] = ownerId
    ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, ownerId)).limit(1)
    : []
  if (ownerId && !targetOwner) return c.json({ error: '客户负责人不存在' }, 400)

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(contactPhone !== undefined ? { contactPhone } : {}),
    ...(statusResult?.success ? { status: statusResult.data } : {}),
    ...(province !== undefined ? { province } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(ownerId !== undefined ? { ownerId } : {}),
    ...(expireDate !== undefined ? { saasExpireDate: expireDate } : {}),
    updatedAt: new Date(),
  }
  const [beforeCustomer] = await db
    .select({ id: customers.id, name: customers.name, contactPhone: customers.contactPhone, status: customers.status, province: customers.province, city: customers.city, address: customers.address, ownerId: customers.ownerId, saasExpireDate: customers.saasExpireDate })
    .from(customers)
    .where(and(eq(customers.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!beforeCustomer) return c.json({ error: '客户不存在或无权编辑' }, 404)
  const ownershipChanged = ownerId !== undefined && ownerId !== beforeCustomer.ownerId
  const [previousOwner] = ownershipChanged && beforeCustomer.ownerId
    ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, beforeCustomer.ownerId)).limit(1)
    : []
  const [customer] = await db
    .update(customers)
    .set(updates)
    .where(eq(customers.id, beforeCustomer.id))
    .returning()
  if (!customer) return c.json({ error: '客户不存在或无权编辑' }, 404)

  c.executionCtx.waitUntil(writeAuditLog(c.env, ownershipChanged
    ? {
        actorId: actor.id,
        entityType: 'Customer',
        entityId: customer.id,
        action: 'Transferred',
        before: {
          customerId: beforeCustomer.id,
          customerName: beforeCustomer.name,
          ownerId: beforeCustomer.ownerId,
          ownerName: previousOwner?.name ?? null,
        },
        after: {
          customerId: customer.id,
          customerName: customer.name,
          ownerId: customer.ownerId,
          ownerName: targetOwner?.name ?? null,
        },
      }
    : { actorId: actor.id, entityType: 'Customer', entityId: customer.id, action: 'Updated', before: beforeCustomer, after: customer }))

  return c.json({ customer })
})

customerRoutes.delete('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const customerId = c.req.param('id')
  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, status: customers.status, saasExpireDate: customers.saasExpireDate })
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
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Customer', entityId: customer.id, action: 'Deleted', before: customer, after: { isDeleted: true } }))
  return c.json({ id: customer.id, isDeleted: true })
})
