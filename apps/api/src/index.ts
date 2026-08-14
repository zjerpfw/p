// apps/api/src/index.ts
import { Hono } from 'hono'
import { createDb } from '@crm/db/client'
import { auth } from './routes/auth'
import { storage } from './routes/storage'
import type { Env } from './env'

export type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => {
  const db = createDb(c.env.DB)
  return c.json({ status: 'ok', database: Boolean(db) })
})

app.route('/api/auth', auth)
app.route('/api/storage', storage)

export default app
export type ApiApp = typeof app
