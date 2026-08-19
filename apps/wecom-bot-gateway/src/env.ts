// apps/wecom-bot-gateway/src/env.ts
import type { WeComBotConnection } from './connection'

export interface Env {
  BOT_CONNECTION: DurableObjectNamespace<WeComBotConnection>
  WEWORK_WS_URL: string
  WEWORK_BOT_ID: string
  WEWORK_BOT_SECRET: string
  CRM_GATEWAY_SECRET: string
}
