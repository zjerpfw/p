// apps/api/src/routes/tasks.ts
import { createDb } from '@crm/db/client'
import { customers, deals, taskPriorities, tasks, taskStatuses, users } from '@crm/db/schema'
import { and, asc, desc, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'
import { writeAuditLog } from '../lib/audit'

export const taskRoutes = new Hono<{ Bindings: Env }>()

taskRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

const taskPayloadSchema = z.object({
  customer_id: z.string().min(1, '客户编号不能为空'),
  deal_id: z.string().min(1).optional().nullable(),
  title: z.string().trim().min(1, '请填写任务标题').max(200, '任务标题不能超过 200 个字符'),
  description: z.string().trim().max(2_000, '任务描述不能超过 2000 个字符').optional().default(''),
  assignee_id: z.string().min(1).optional(),
  due_at: z.union([z.string(), z.number()]),
  priority: z.enum(taskPriorities).optional().default('Normal'),
})

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2_000).optional(),
  due_at: z.union([z.string(), z.number()]).optional(),
  priority: z.enum(taskPriorities).optional(),
  status: z.enum(taskStatuses).optional(),
  assignee_id: z.string().min(1, '任务负责人编号无效').optional(),
})

function parseDate(value: string | number | undefined) {
  if (value === undefined) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseLimit(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50
}

function parseBooleanQuery(value: string | undefined) {
  return value === 'true' || value === '1'
}

async function getVisibleTask(db: ReturnType<typeof createDb>, taskId: string, actor: { id: string; role: string }) {
  return db
    .select({
      id: tasks.id,
      customerId: tasks.customerId,
      customerOwnerId: customers.ownerId,
      assigneeId: tasks.assigneeId,
      createdBy: tasks.createdBy,
      dealId: tasks.dealId,
      title: tasks.title,
      description: tasks.description,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      status: tasks.status,
      completedAt: tasks.completedAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(customers, eq(tasks.customerId, customers.id))
    .where(and(
      eq(tasks.id, taskId),
      eq(customers.isDeleted, false),
      actor.role !== 'admin' ? or(eq(tasks.assigneeId, actor.id), eq(tasks.createdBy, actor.id), eq(customers.ownerId, actor.id)) : undefined,
    ))
    .limit(1)
}

taskRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const status = c.req.query('status')
  if (status && !taskStatuses.includes(status as (typeof taskStatuses)[number])) return c.json({ error: '任务状态无效' }, 400)
  const customerId = c.req.query('customer_id')?.trim()
  const assigneeOnly = parseBooleanQuery(c.req.query('assignee_only'))
  const limit = parseLimit(c.req.query('limit'))
  const db = createDb(c.env.DB)
  const filters = [
    status ? eq(tasks.status, status as (typeof taskStatuses)[number]) : undefined,
    customerId ? eq(tasks.customerId, customerId) : undefined,
    assigneeOnly ? eq(tasks.assigneeId, actor.id) : undefined,
    eq(customers.isDeleted, false),
    actor.role !== 'admin' ? or(eq(tasks.assigneeId, actor.id), eq(tasks.createdBy, actor.id), eq(customers.ownerId, actor.id)) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter))
  const rows = await db
    .select({
      id: tasks.id,
      customerId: tasks.customerId,
      customerName: customers.name,
      dealId: tasks.dealId,
      dealProductName: deals.productName,
      title: tasks.title,
      description: tasks.description,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      dueAt: tasks.dueAt,
      priority: tasks.priority,
      status: tasks.status,
      completedAt: tasks.completedAt,
      createdBy: tasks.createdBy,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(customers, eq(tasks.customerId, customers.id))
    .innerJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(deals, eq(tasks.dealId, deals.id))
    .where(and(...filters))
    .orderBy(asc(tasks.status), asc(tasks.dueAt), desc(tasks.createdAt))
    .limit(limit)

  return c.json({ tasks: rows })
})

taskRoutes.post('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = taskPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '任务资料格式无效' }, 400)
  const dueAt = parseDate(parsed.data.due_at)
  if (!dueAt) return c.json({ error: '截止时间无效' }, 400)

  const assigneeId = parsed.data.assignee_id ?? actor.id
  if (actor.role !== 'admin' && assigneeId !== actor.id) return c.json({ error: '普通销售只能将任务指派给自己' }, 403)
  const db = createDb(c.env.DB)
  const [customer] = await db.select({ id: customers.id }).from(customers).where(and(
    eq(customers.id, parsed.data.customer_id),
    eq(customers.isDeleted, false),
    actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
  )).limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权创建任务' }, 404)
  const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, assigneeId)).limit(1)
  if (!assignee) return c.json({ error: '任务负责人不存在' }, 400)
  if (parsed.data.deal_id) {
    const [deal] = await db.select({ id: deals.id }).from(deals).where(and(eq(deals.id, parsed.data.deal_id), eq(deals.customerId, customer.id), eq(deals.isDeleted, false))).limit(1)
    if (!deal) return c.json({ error: '关联商机不存在或不属于当前客户' }, 400)
  }

  const now = new Date()
  const task = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    dealId: parsed.data.deal_id ?? null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    assigneeId,
    dueAt,
    priority: parsed.data.priority,
    status: 'Open' as const,
    completedAt: null,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(tasks).values(task)
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Task', entityId: task.id, action: 'Created', after: task }))
  return c.json({ task }, 201)
})

taskRoutes.patch('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: '请求体必须是 JSON' }, 400) }
  const parsed = updateTaskSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '任务资料格式无效' }, 400)
  const db = createDb(c.env.DB)
  const [existing] = await getVisibleTask(db, c.req.param('id'), actor)
  if (!existing) return c.json({ error: '任务不存在或无权操作' }, 404)

  const dueAt = parseDate(parsed.data.due_at)
  if (parsed.data.due_at !== undefined && !dueAt) return c.json({ error: '截止时间无效' }, 400)
  if (parsed.data.assignee_id !== undefined && actor.role !== 'admin') {
    return c.json({ error: '仅管理员可以调整任务负责人' }, 403)
  }
  const assigneeId = parsed.data.assignee_id === undefined ? undefined : parsed.data.assignee_id
  if (assigneeId) {
    const [assignee] = await db.select({ id: users.id }).from(users).where(eq(users.id, assigneeId)).limit(1)
    if (!assignee) return c.json({ error: '任务负责人不存在' }, 400)
  }
  const now = new Date()
  const updates = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status, completedAt: parsed.data.status === 'Completed' ? now : null } : {}),
    ...(assigneeId !== undefined ? { assigneeId } : {}),
    updatedAt: now,
  }
  if (Object.keys(updates).length === 1) return c.json({ error: '请至少提供一个需要更新的字段' }, 400)
  const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, existing.id)).returning()
  c.executionCtx.waitUntil(writeAuditLog(c.env, { actorId: actor.id, entityType: 'Task', entityId: task.id, action: 'Updated', before: existing, after: task }))
  return c.json({ task })
})

export type TaskRoutes = typeof taskRoutes
