// apps/api/src/services/wecom-bot-gateway.ts
import type { Env } from '../env'
import { createDb } from '@crm/db/client'
import { systemConfigs } from '@crm/db/schema'
import { inArray } from 'drizzle-orm'

const encoder = new TextEncoder()
const WECOM_BOT_CONFIG_KEYS = ['wecom_bot_id', 'wecom_bot_secret'] as const

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

async function sign(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))
}

async function configuredGateway(env: Env) {
  const baseUrl = env.WECOM_BOT_GATEWAY_URL?.trim()
  if (!baseUrl) return undefined
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('WECOM_BOT_GATEWAY_URL 格式无效') }
  if (url.protocol !== 'https:') throw new Error('WECOM_BOT_GATEWAY_URL 必须使用 HTTPS')
  return { baseUrl: url.toString().replace(/\/$/u, '') }
}

async function getBotCredentials(env: Env) {
  const db = createDb(env.DB)
  const configs = await db.select({ key: systemConfigs.configKey, value: systemConfigs.configValue })
    .from(systemConfigs).where(inArray(systemConfigs.configKey, [...WECOM_BOT_CONFIG_KEYS]))
  const values = new Map(configs.map((config) => [config.key, config.value.trim()]))
  return { botId: values.get('wecom_bot_id') ?? '', botSecret: values.get('wecom_bot_secret') ?? '' }
}

export async function isWeComBotGatewayConfigured(env: Env) {
  if (!(await configuredGateway(env))) return false
  const credentials = await getBotCredentials(env)
  return Boolean(credentials.botId && credentials.botSecret)
}

export async function sendWeComBotGroupMarkdownMessage(env: Env, content: string) {
  const gateway = await configuredGateway(env)
  if (!gateway) throw new Error('企业微信智能机器人网关未配置')
  const { botSecret } = await getBotCredentials(env)
  if (!botSecret) throw new Error('请先在系统设置中配置智能机器人的长连接专用 Secret')
  const body = JSON.stringify({ content })
  const timestamp = String(Date.now())
  const response = await fetch(`${gateway.baseUrl}/internal/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CRM-Timestamp': timestamp,
      'X-CRM-Signature': await sign(botSecret, timestamp, body),
    },
    body,
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`企业微信智能机器人网关发送失败：HTTP ${response.status}${detail ? ` ${detail}` : ''}`)
  }
}
