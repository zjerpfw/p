// apps/api/src/services/wechat.ts
import type { Env } from '../env'

const WECHAT_ACCESS_TOKEN_KEY = 'wechat_access_token'
const WECHAT_ACCESS_TOKEN_TTL_SECONDS = 7000

interface WeChatAccessTokenResponse {
  errcode?: number
  errmsg?: string
  access_token?: string
}

interface WeChatApiResponse {
  errcode?: number
  errmsg?: string
}

export function isWeChatApiError(response: WeChatApiResponse) {
  return response.errcode !== undefined && response.errcode !== 0
}

export async function getWeChatAccessToken(env: Env): Promise<string> {
  const cachedToken = await env.CACHE.get(WECHAT_ACCESS_TOKEN_KEY)
  if (cachedToken) return cachedToken

  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken')
  url.searchParams.set('corpid', env.CORP_ID)
  url.searchParams.set('corpsecret', env.CORP_SECRET)

  const response = await fetch(url)
  if (!response.ok) throw new Error('WeChat token request failed')

  const data = (await response.json()) as WeChatAccessTokenResponse
  if (isWeChatApiError(data) || !data.access_token) {
    throw new Error(`WeChat token request failed: ${data.errcode ?? 'unknown'}`)
  }

  await env.CACHE.put(WECHAT_ACCESS_TOKEN_KEY, data.access_token, {
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
  const agentId = Number(env.WECHAT_AGENT_ID)
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
