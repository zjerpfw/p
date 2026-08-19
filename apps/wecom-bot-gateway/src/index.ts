// apps/wecom-bot-gateway/src/index.ts
import { WeComBotConnection } from './connection'
import { verifyRequest } from './security'

export { WeComBotConnection }

interface Env {
  BOT_CONNECTION: DurableObjectNamespace<WeComBotConnection>
  DB: D1Database
  WEWORK_WS_URL: string
}

function primaryStub(env: Env): DurableObjectStub {
  const id = env.BOT_CONNECTION.idFromName('primary')
  return env.BOT_CONNECTION.get(id)
}

async function verifyInternalRequest(request: Request, env: Env): Promise<boolean> {
  const result = await env.DB.prepare(
    "SELECT config_value FROM system_configs WHERE config_key = 'wecom_bot_secret' LIMIT 1",
  ).first<{ config_value: string }>()
  return verifyRequest(request, result?.config_value.trim() ?? '')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/health') {
      const status = await primaryStub(env).fetch('https://do/status')
      const body = await status.json<Record<string, unknown>>()
      return Response.json({ service: 'crm-wecom-bot-gateway', ...body })
    }

    if (url.pathname === '/internal/connect' && request.method === 'POST') {
      if (!(await verifyInternalRequest(request, env))) return new Response('Unauthorized', { status: 401 })
      return primaryStub(env).fetch('https://do/connect', { method: 'POST' })
    }

    if (url.pathname === '/internal/messages' && request.method === 'POST') {
      if (!(await verifyInternalRequest(request, env))) return new Response('Unauthorized', { status: 401 })
      const payload = await request.text()
      return primaryStub(env).fetch('https://do/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })
    }

    return new Response('Not found', { status: 404 })
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await primaryStub(env).fetch('https://do/connect', { method: 'POST' })
  },
}
