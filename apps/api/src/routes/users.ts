// apps/api/src/routes/users.ts
import { createDb } from '@crm/db/client'
import { users } from '@crm/db/schema'
import { asc } from 'drizzle-orm'
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'

export const userRoutes = new Hono<{ Bindings: Env }>()

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
