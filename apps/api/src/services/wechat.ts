// apps/api/src/services/wechat.ts
import { createDb } from '@crm/db/client'
import { systemConfigs } from '@crm/db/schema'
import { inArray } from 'drizzle-orm'
import type { Env } from '../env'

const WECHAT_ACCESS_TOKEN_TTL_SECONDS = 7000
const WECHAT_DIRECTORY_CACHE_TTL_SECONDS = 5 * 60
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

export interface WeChatDirectoryUser {
  userid: string
  name: string
  department?: number[]
  status?: number
}

interface WeChatUserListResponse extends WeChatApiResponse {
  userlist?: WeChatDirectoryUser[]
}

interface WeChatAgentResponse extends WeChatApiResponse {
  allow_userinfos?: WeChatVisibleUsers
  allow_users?: WeChatVisibleUsers
  allow_partys?: Array<number | string | { id?: number | string }>
}

type WeChatVisibleUser = { userid?: string } | string
type WeChatVisibleUsers = WeChatVisibleUser[] | { user?: WeChatVisibleUser[] }

interface WeChatUserInfoResponse extends WeChatApiResponse {
  UserId?: string
  DeviceId?: string
  user_info?: { userid?: string; name?: string }
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

export async function getWeChatCorpId(env: Env) {
  const configuration = await getWeChatConfiguration(env)
  return configuration.corpId
}

export function isWeChatApiError(response: WeChatApiResponse) {
  return response.errcode !== undefined && response.errcode !== 0
}

class WeChatApiError extends Error {
  constructor(readonly operation: string, readonly errcode?: number, readonly errmsg?: string) {
    super(`企业微信 ${operation} 失败：${errcode ?? 'unknown'}${errmsg ? ` ${errmsg}` : ''}`)
  }
}

function assertWeChatApiSuccess(operation: string, response: WeChatApiResponse) {
  if (isWeChatApiError(response)) throw new WeChatApiError(operation, response.errcode, response.errmsg)
}

function normalizeDirectoryUsers(users: WeChatDirectoryUser[]) {
  const result = new Map<string, WeChatDirectoryUser>()
  for (const user of users) {
    const userid = user.userid?.trim()
    const name = user.name?.trim()
    // 2=已禁用，5=已退出企业；其余状态仍可由管理员按需绑定。
    if (!userid || !name || user.status === 2 || user.status === 5 || result.has(userid)) continue
    result.set(userid, { userid, name, department: user.department, status: user.status })
  }
  return [...result.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function extractVisibleUserIds(value: WeChatVisibleUsers | undefined) {
  const entries = Array.isArray(value) ? value : value?.user ?? []
  return entries
    .map((item) => typeof item === 'string' ? item : item.userid)
    .filter((userid): userid is string => Boolean(userid?.trim()))
}

async function getWeChatApi<T extends WeChatApiResponse>(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(`https://qyapi.weixin.qq.com/cgi-bin/${path}`)
  url.searchParams.set('access_token', accessToken)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`企业微信 ${path} 请求失败：HTTP ${response.status}`)
  const data = (await response.json()) as T
  assertWeChatApiSuccess(path, data)
  return data
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
  if (isWeChatApiError(data) || !data.access_token) throw new WeChatApiError('gettoken', data.errcode, data.errmsg)

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

export async function listWeChatUsers(env: Env): Promise<WeChatDirectoryUser[]> {
  const configuration = await getWeChatConfiguration(env)
  const cacheKey = `wechat_directory_users:${configuration.cacheVersion}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    try { return JSON.parse(cached) as WeChatDirectoryUser[] } catch { /* Ignore stale malformed cache. */ }
  }

  const accessToken = await getWeChatAccessToken(env)
  let directoryUsers: WeChatDirectoryUser[]
  try {
    // 与旧项目一致：根部门加 fetch_child=1，覆盖全部子部门，而不是只读取根节点直属成员。
    const result = await getWeChatApi<WeChatUserListResponse>('user/list', accessToken, { department_id: '1', fetch_child: '1' })
    directoryUsers = result.userlist ?? []
  } catch (error) {
    if (!(error instanceof WeChatApiError) || error.errcode !== 60011) throw error

    // 60011 表示没有全通讯录权限。退回到当前自建应用配置的可见人员和可见部门。
    const agentId = configuration.agentId.trim()
    if (!agentId) throw new Error('企业微信 Agent ID 未配置，无法读取应用可见范围')
    const agent = await getWeChatApi<WeChatAgentResponse>('agent/get', accessToken, { agentid: agentId })
    const directUsers = [...new Set([
      ...extractVisibleUserIds(agent.allow_userinfos),
      ...extractVisibleUserIds(agent.allow_users),
    ])]
    const visibleDepartments = (agent.allow_partys ?? [])
      .map((item) => typeof item === 'object' ? item.id : item)
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)

    const departmentResults = await Promise.all(visibleDepartments.map((departmentId) =>
      getWeChatApi<WeChatUserListResponse>('user/list', accessToken, { department_id: departmentId, fetch_child: '1' }),
    ))
    const directProfiles = await Promise.all(directUsers.map(async (userid) => {
      try {
        return await getWeChatApi<WeChatDirectoryUser & WeChatApiResponse>('user/get', accessToken, { userid })
      } catch {
        // 某些权限组合只会暴露 UserID；保留该 ID，管理员仍可完成绑定。
        return { userid, name: userid }
      }
    }))
    directoryUsers = [...directProfiles, ...departmentResults.flatMap((result) => result.userlist ?? [])]
  }

  const users = normalizeDirectoryUsers(directoryUsers)
  await env.CACHE.put(cacheKey, JSON.stringify(users), { expirationTtl: WECHAT_DIRECTORY_CACHE_TTL_SECONDS })
  return users
}

export async function getWeChatUserByCode(env: Env, code: string) {
  const accessToken = await getWeChatAccessToken(env)
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('code', code)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`WeChat OAuth request failed: ${response.status}`)

  const result = (await response.json()) as WeChatUserInfoResponse
  assertWeChatApiSuccess('auth/getuserinfo', result)

  const userid = result.UserId?.trim() || result.user_info?.userid?.trim()
  if (!userid) throw new Error('WeChat OAuth did not return a UserID')
  return { userid, name: result.user_info?.name?.trim() || userid }
}
