// apps/api/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDb } from '@crm/db/client'
import { systemConfigs } from '@crm/db/schema'
import { eq } from 'drizzle-orm'
import { activityRoutes } from './routes/activities'
import { auditLogRoutes } from './routes/audit-logs'
import { auth } from './routes/auth'
import { configRoutes } from './routes/configs'
import { contractRoutes } from './routes/contracts'
import { customerRoutes } from './routes/customers'
import { dashboardRoutes } from './routes/dashboard'
import { dealRoutes } from './routes/deals'
import { financeRoutes } from './routes/finance'
import { invoiceRoutes } from './routes/invoices'
import { paymentRoutes } from './routes/payments'
import { storage } from './routes/storage'
import { taskRoutes } from './routes/tasks'
import { userRoutes } from './routes/users'
import type { Env } from './env'
import { sendRenewalReminders } from './scheduled/renewal-reminders'
import { sendTaskReminders } from './scheduled/task-reminders'

export type { Env } from './env'

const app = new Hono<{ Bindings: Env }>()

const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function getAllowedOrigins(env: Env) {
  const configuredOrigins = env.FRONTEND_URL
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => {
      try {
        const parsed = new URL(origin)
        return parsed.protocol === 'https:' || LOCAL_DEVELOPMENT_ORIGINS.has(origin)
      } catch {
        return false
      }
    })
  return new Set([...LOCAL_DEVELOPMENT_ORIGINS, ...configuredOrigins])
}

app.get('/', (c) => c.text('CRM API is running normally! 🚀'))

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => getAllowedOrigins(c.env).has(origin) ? origin : '',
    allowHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key'],
    exposeHeaders: ['Content-Disposition'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
)

app.get('/health', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1').first()
    return c.json({ status: 'ok', database: 'ok' })
  } catch (error) {
    console.error('Health check database probe failed', error)
    return c.json({ status: 'unavailable', database: 'unavailable' }, 503)
  }
})

app.get('/:verificationFile{WW_verify_[A-Za-z0-9_-]+\\.txt}', async (c) => {
  const verificationFile = c.req.param('verificationFile')
  const code = verificationFile?.slice('WW_verify_'.length, -'.txt'.length)
  if (!code) {
    return c.notFound()
  }

  const db = createDb(c.env.DB)
  const [config] = await db
    .select({ configValue: systemConfigs.configValue })
    .from(systemConfigs)
    .where(eq(systemConfigs.configKey, 'ww_verify_code'))
    .limit(1)

  if (!config || config.configValue !== code) {
    return c.notFound()
  }

  return c.text(code)
})

app.route('/api/auth', auth)
app.route('/api/audit-logs', auditLogRoutes)
app.route('/api/configs', configRoutes)
app.route('/api/contracts', contractRoutes)
app.route('/api/invoices', invoiceRoutes)
app.route('/api/payments', paymentRoutes)
app.route('/api/finance', financeRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/customers', customerRoutes)
app.route('/api/deals', dealRoutes)
app.route('/api/activities', activityRoutes)
app.route('/api/storage', storage)
app.route('/api/tasks', taskRoutes)
app.route('/api/users', userRoutes)

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(Promise.all([
      sendRenewalReminders(env).catch((error) => { console.error('Renewal reminder job failed', error); throw error }),
      sendTaskReminders(env).catch((error) => { console.error('Task reminder job failed', error); throw error }),
    ]))
  },
} satisfies ExportedHandler<Env>
export type ApiApp = typeof app
