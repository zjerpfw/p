// apps/api/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDb } from '@crm/db/client'
import { activityRoutes } from './routes/activities'
import { auth } from './routes/auth'
import { customerRoutes } from './routes/customers'
import { dealRoutes } from './routes/deals'
import { storage } from './routes/storage'
import { userRoutes } from './routes/users'
import type { Env } from './env'
import { sendRenewalReminders } from './scheduled/renewal-reminders'

export type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 86400,
  }),
)

app.get('/health', (c) => {
  const db = createDb(c.env.DB)
  return c.json({ status: 'ok', database: Boolean(db) })
})

app.route('/api/auth', auth)
app.route('/api/customers', customerRoutes)
app.route('/api/deals', dealRoutes)
app.route('/api/activities', activityRoutes)
app.route('/api/storage', storage)
app.route('/api/users', userRoutes)

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(
      sendRenewalReminders(env).catch((error) => {
        console.error('Renewal reminder job failed', error)
        throw error
      }),
    )
  },
} satisfies ExportedHandler<Env>
export type ApiApp = typeof app
