// apps/wecom-bot-gateway/src/env.ts
import type { WeComBotConnection } from './connection'

export interface Env {
  BOT_CONNECTION: DurableObjectNamespace<WeComBotConnection>
  DB: D1Database
  WEWORK_WS_URL: string
}
