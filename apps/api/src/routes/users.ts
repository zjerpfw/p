// apps/api/src/routes/users.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

export const userRoutes = new Hono<{ Bindings: Env }>()

interface UpdateRolePayload {
  role?: unknown
}

userRoutes.use('*', async (c, next) => {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
})

userRoutes.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const userList = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl, role: users.role })
    .from(users)
    .orderBy(asc(users.name))

  return c.json({ users: userList })
})

userRoutes.patch('/:id/role', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  if (actor.role !== 'admin') return c.json({ error: '仅管理员可以调整人员权限' }, 403)

  let body: UpdateRolePayload
  try {
    body = await c.req.json<UpdateRolePayload>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  if (body.role !== 'admin' && body.role !== 'sales') {
    return c.json({ error: '角色只能设置为 admin 或 sales' }, 400)
  }

  const userId = c.req.param('id')
  if (userId === actor.id && body.role !== 'admin') {
    return c.json({ error: '不能移除当前管理员自己的管理员权限' }, 400)
  }

  const db = createDb(c.env.DB)
  const result = await db.update(users).set({ role: body.role }).where(eq(users.id, userId)).returning({
    id: users.id,
    name: users.name,
    role: users.role,
  })
  const [user] = result
  if (!user) return c.json({ error: '人员不存在' }, 404)

  return c.json({ user })
})
