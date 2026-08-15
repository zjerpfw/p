// apps/api/src/routes/users.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { z } from 'zod'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const userRoutes = new Hono<{ Bindings: Env }>()

const userPayloadSchema = z.object({
  name: z.string().trim().min(1, '请填写员工姓名').max(100, '员工姓名不能超过 100 个字符'),
  username: z.string().trim().min(1, '请填写登录账号或手机号').max(100, '登录账号或手机号不能超过 100 个字符'),
  pin_code: z.string().min(1, '请填写登录密码').max(100, '登录密码不能超过 100 个字符'),
  role: z.enum(['admin', 'sales'], { errorMap: () => ({ message: '角色只能设置为系统管理员或普通销售' }) }),
  wechat_userid: z.string().trim().max(100, '企业微信 UserID 不能超过 100 个字符').optional().default(''),
})

const updateUserPayloadSchema = userPayloadSchema.extend({ pin_code: z.string().min(1, '请填写登录密码').max(100, '登录密码不能超过 100 个字符').optional() })

userRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

userRoutes.get('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)

  const db = createDb(c.env.DB)
  const userList = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      wechatUserId: users.wechatUserId,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.name))

  if (actor.role !== 'admin') {
    return c.json({
      users: userList.map(({ id, name, avatarUrl, role }) => ({ id, name, avatarUrl, role })),
    })
  }

  return c.json({ users: userList })
})

userRoutes.post('/', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以新建员工' }, 403)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  const parsed = userPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '员工资料格式无效' }, 400)

  const db = createDb(c.env.DB)
  const user = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    username: parsed.data.username,
    wechatUserId: parsed.data.wechat_userid || null,
    pinCode: parsed.data.pin_code,
    role: parsed.data.role,
    createdAt: new Date(),
  }
  try {
    await db.insert(users).values(user)
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return c.json({ error: '登录账号或企业微信 UserID 已被使用' }, 409)
    }
    throw error
  }
  return c.json({ user }, 201)
})

userRoutes.put('/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以编辑员工' }, 403)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  const parsed = updateUserPayloadSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? '员工资料格式无效' }, 400)

  const userId = c.req.param('id')
  if (userId === actor.id && parsed.data.role !== 'admin') {
    return c.json({ error: '不能移除当前管理员自己的管理员权限' }, 400)
  }

  const db = createDb(c.env.DB)
  const result = await db.update(users).set({
    name: parsed.data.name,
    username: parsed.data.username,
    wechatUserId: parsed.data.wechat_userid || null,
    role: parsed.data.role,
    ...(parsed.data.pin_code ? { pinCode: parsed.data.pin_code } : {}),
  }).where(eq(users.id, userId)).returning({
    id: users.id, name: users.name, username: users.username, wechatUserId: users.wechatUserId, role: users.role, createdAt: users.createdAt,
  })
  const [user] = result
  if (!user) return c.json({ error: '人员不存在' }, 404)

  return c.json({ user })
})
