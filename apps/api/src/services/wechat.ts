// apps/api/src/services/wechat.ts
import { createDb } from '@crm/db/client'
import { systemConfigs } from '@crm/db/schema'
import { inArray } from 'drizzle-orm'
import type { Env } from '../env'

const WECHAT_ACCESS_TOKEN_TTL_SECONDS = 7000
const WECHAT_CONFIG_KEYS = ['wechat_corp_id', 'wechat_corp_secret', 'wechat_agent_id'] as const

interface WeChatAccessTokenResponse {
  errcode?: number
  errmsg?: string
  access_token?: string
}

interface WeChatApiResponse {
  errcode?: number
  errmsg?: string
}

interface WeChatConfiguration {
  corpId: string
  corpSecret: string
  agentId: string
  cacheVersion: string
}

async function credentialFingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getWeChatConfiguration(env: Env): Promise<WeChatConfiguration> {
  const db = createDb(env.DB)
  const rows = await db
    .select({ key: systemConfigs.configKey, value: systemConfigs.configValue, updatedAt: systemConfigs.updatedAt })
    .from(systemConfigs)
    .where(inArray(systemConfigs.configKey, [...WECHAT_CONFIG_KEYS]))
  const values = new Map(rows.map((row) => [row.key, row]))
  const configuredValue = (key: (typeof WECHAT_CONFIG_KEYS)[number], fallback: string) => values.get(key)?.value.trim() || fallback
  const corpId = configuredValue('wechat_corp_id', env.CORP_ID)
  const corpSecret = configuredValue('wechat_corp_secret', env.CORP_SECRET)
  const agentId = configuredValue('wechat_agent_id', env.WECHAT_AGENT_ID)

  return {
    corpId,
    corpSecret,
    agentId,
    cacheVersion: await credentialFingerprint(`${corpId}\u0000${corpSecret}\u0000${agentId}`),
  }
}

export function isWeChatApiError(response: WeChatApiResponse) {
  return response.errcode !== undefined && response.errcode !== 0
}

export async function getWeChatAccessToken(env: Env): Promise<string> {
  const configuration = await getWeChatConfiguration(env)
  const cacheKey = `wechat_access_token:${configuration.cacheVersion}`
  const cachedToken = await env.CACHE.get(cacheKey)
  if (cachedToken) return cachedToken

  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken')
  url.searchParams.set('corpid', configuration.corpId)
  url.searchParams.set('corpsecret', configuration.corpSecret)

  const response = await fetch(url)
  if (!response.ok) throw new Error('WeChat token request failed')

  const data = (await response.json()) as WeChatAccessTokenResponse
  if (isWeChatApiError(data) || !data.access_token) {
    throw new Error(`WeChat token request failed: ${data.errcode ?? 'unknown'}`)
  }

  await env.CACHE.put(cacheKey, data.access_token, {
    expirationTtl: WECHAT_ACCESS_TOKEN_TTL_SECONDS,
  })

  return data.access_token
}

export async function sendWeChatMarkdownMessage(
  env: Env,
  accessToken: string,
  userId: string,
  content: string,
) {
  const { agentId: configuredAgentId } = await getWeChatConfiguration(env)
  const agentId = Number(configuredAgentId)
  if (!Number.isSafeInteger(agentId) || agentId <= 0) {
    throw new Error('WECHAT_AGENT_ID is not configured correctly')
  }

  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send')
  url.searchParams.set('access_token', accessToken)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: userId,
      msgtype: 'markdown',
      agentid: agentId,
      markdown: { content },
      safe: 0,
    }),
  })

  if (!response.ok) throw new Error(`WeChat message request failed: ${response.status}`)

  const result = (await response.json()) as WeChatApiResponse
  if (isWeChatApiError(result)) {
    throw new Error(`WeChat message request failed: ${result.errcode ?? 'unknown'} ${result.errmsg ?? ''}`)
  }
}
