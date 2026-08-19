// apps/wecom-bot-gateway/src/connection.ts
import { activeMessage, frame, streamReply, subscribe, type WeComFrame } from './protocol'
import type { Env } from './env'
import { DurableObject } from 'cloudflare:workers'

const HEARTBEAT_MS = 30_000
const ALARM_MS = 15_000
const MAX_BACKOFF_MS = 60_000
const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct'
const AI_DAILY_LIMIT = 20

const HELP_TEXT = [
  'CRM 助手可用指令：',
  '• 客户 关键词：查找客户、地区和到期日',
  '• 到期：查看未来 30 天到期客户',
  '• 任务：查看未完成任务',
  '• 商机：查看进行中的销售商机',
  '• 统计：查看 CRM 当前概况',
  '• 帮助：显示本说明',
].join('\n')

interface ConnectionState {
  connected: boolean
  connecting: boolean
  lastError?: string
  connectedAt?: number
  lastMessageAt?: number
  reconnectAttempt: number
  defaultGroupChatId?: string
}

export class WeComBotConnection extends DurableObject<Env> {
  private socket?: WebSocket
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private botId = ''
  private botSecret = ''
  private state: ConnectionState = { connected: false, connecting: false, reconnectAttempt: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<ConnectionState>('state')
      if (saved) {
        // WebSocket 不能跨 Durable Object 进程恢复；仅保留诊断信息。
        this.state = { ...saved, connected: false, connecting: false }
      }
      await this.loadBotCredentials()
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/connect' && request.method === 'POST') {
      await this.ensureConnection()
      return Response.json(this.snapshot())
    }
    if (url.pathname === '/status' && request.method === 'GET') {
      return Response.json(this.snapshot())
    }
    if (url.pathname === '/send' && request.method === 'POST') {
      const payload = await request.json<{
        chatid?: string
        chat_type?: 1 | 2
        content?: string
      }>()
      const content = payload.content?.trim()
      const chatid = payload.chatid?.trim() || this.state.defaultGroupChatId
      const chatType = payload.chatid ? payload.chat_type : 2
      if (!chatid || !content || (chatType !== 1 && chatType !== 2)) {
        return Response.json({ error: '请先在目标群 @CRM 智能机器人发送任意消息完成群绑定，或提供 chatid、chat_type、content。' }, { status: 400 })
      }
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) await this.ensureConnection()
      const sent = this.send(activeMessage({ chatid, chatType, content }))
      if (!sent) return Response.json({ error: '机器人长连接尚未建立' }, { status: 503 })
      return Response.json({ ok: true })
    }
    return new Response('Not found', { status: 404 })
  }

  async alarm(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.ensureConnection()
    }
    await this.persist()
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS)
  }

  private async ensureConnection(): Promise<void> {
    if (this.state.connecting || (this.socket && this.socket.readyState === WebSocket.OPEN)) return
    await this.loadBotCredentials()
    if (!this.botId || !this.botSecret) {
      this.state.lastError = '请先在 CRM 系统设置中配置智能机器人 BotID 和长连接 Secret'
      await this.persist()
      return
    }
    this.state.connecting = true
    await this.persist()
    try {
      const socket = new WebSocket(this.env.WEWORK_WS_URL)
      this.socket = socket
      socket.addEventListener('open', () => {
        this.state.connecting = false
        this.state.connected = true
        this.state.connectedAt = Date.now()
        this.state.lastError = undefined
        this.state.reconnectAttempt = 0
        this.send(subscribe(this.botId, this.botSecret))
        this.startHeartbeat()
        void this.persist()
      })
      socket.addEventListener('message', (event) => void this.onMessage(event.data))
      socket.addEventListener('error', () => {
        this.state.lastError = 'WebSocket error'
        void this.persist()
      })
      socket.addEventListener('close', () => {
        this.stopHeartbeat()
        this.state.connected = false
        this.state.connecting = false
        this.state.reconnectAttempt += 1
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.state.reconnectAttempt, 6))
        void this.persist()
        void this.ctx.storage.setAlarm(Date.now() + backoff)
      })
    } catch (error) {
      this.state.connecting = false
      this.state.connected = false
      this.state.lastError = error instanceof Error ? error.message : String(error)
      this.state.reconnectAttempt += 1
      await this.persist()
      await this.ctx.storage.setAlarm(Date.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.state.reconnectAttempt, 6)))
    }
  }

  private send(payload: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(payload)
    return true
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.send(frame('ping'))) this.stopHeartbeat()
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }

  private async onMessage(data: string | ArrayBuffer): Promise<void> {
    this.state.lastMessageAt = Date.now()
    let parsed: WeComFrame | undefined
    try {
      parsed = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)) as WeComFrame
    } catch {
      await this.persist()
      return
    }
    if (parsed.cmd === 'aibot_msg_callback' && parsed.body?.chattype === 'group') {
      const chatid = typeof parsed.body.chatid === 'string' ? parsed.body.chatid.trim() : ''
      if (chatid && this.state.defaultGroupChatId !== chatid) {
        this.state.defaultGroupChatId = chatid
      }
    }
    if (parsed.cmd === 'aibot_msg_callback' && parsed.body?.msgtype === 'text') {
      const content = String((parsed.body.text as { content?: string } | undefined)?.content || '').trim()
      if (content) {
        const isGroup = parsed.body.chattype === 'group'
        const reply = await this.handleCrmMessage(content, isGroup)
        this.send(streamReply(parsed.headers?.req_id, reply))
      }
    }
    await this.persist()
  }

  private async handleCrmMessage(rawContent: string, isGroup: boolean): Promise<string> {
    const content = rawContent.replace(/@[\w\u4e00-\u9fff_-]+/gu, '').trim()
    const normalized = content.toLowerCase()
    if (!content || normalized === '帮助' || normalized === 'help' || normalized === '?') return HELP_TEXT

    if (/^(客户|查客户|搜索客户)\s*/u.test(content)) {
      const keyword = content.replace(/^(客户|查客户|搜索客户)\s*/u, '').trim()
      return this.searchCustomers(keyword)
    }
    if (/^(到期|续费|即将到期)/u.test(content)) return this.listExpiringCustomers()
    if (/^(任务|待办|我的任务)/u.test(content)) return this.listOpenTasks()
    if (/^(商机|销售机会|pipeline)/iu.test(content)) return this.listActiveDeals()
    if (/^(统计|概况|数据概览)/u.test(content)) return this.getCrmStats()

    const aiReply = await this.askWorkersAi(content)
    if (aiReply) return aiReply
    return `${isGroup ? '已收到。' : ''}暂未识别这条指令。\n\n${HELP_TEXT}`
  }

  private async searchCustomers(keyword: string): Promise<string> {
    if (!keyword) return '请在“客户”后输入名称、电话或地区关键词，例如：客户 杭州。'
    const pattern = `%${keyword.slice(0, 50)}%`
    const result = await this.env.DB.prepare(
      `SELECT name, province, city, saas_expire_date AS expireDate
       FROM customers
       WHERE is_deleted = 0 AND (name LIKE ?1 OR contact_phone LIKE ?1 OR province LIKE ?1 OR city LIKE ?1)
       ORDER BY updated_at DESC LIMIT 8`,
    ).bind(pattern).all<{ name: string; province: string | null; city: string | null; expireDate: number | null }>()
    const rows = result.results ?? []
    if (rows.length === 0) return `没有找到与“${keyword}”匹配的客户。`
    return ['客户查询结果：', ...rows.map((row, index) => `${index + 1}. ${row.name} · ${[row.province, row.city].filter(Boolean).join(' ') || '地区未填写'}${this.formatExpire(row.expireDate)}`)].join('\n')
  }

  private async listExpiringCustomers(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const limit = now + 30 * 86400
    const result = await this.env.DB.prepare(
      `SELECT name, province, city, saas_expire_date AS expireDate
       FROM customers
       WHERE is_deleted = 0 AND saas_expire_date IS NOT NULL AND saas_expire_date <= ?1
       ORDER BY saas_expire_date ASC LIMIT 10`,
    ).bind(limit).all<{ name: string; province: string | null; city: string | null; expireDate: number | null }>()
    const rows = result.results ?? []
    if (rows.length === 0) return '未来 30 天没有已登记到期的客户。'
    return ['未来 30 天到期客户：', ...rows.map((row, index) => `${index + 1}. ${row.name} · ${this.formatDate(row.expireDate)} · ${[row.province, row.city].filter(Boolean).join(' ') || '地区未填写'}`)].join('\n')
  }

  private async listOpenTasks(): Promise<string> {
    const result = await this.env.DB.prepare(
      `SELECT tasks.title, customers.name AS customerName, tasks.due_at AS dueAt
       FROM tasks JOIN customers ON customers.id = tasks.customer_id
       WHERE tasks.status = 'Open' AND customers.is_deleted = 0
       ORDER BY tasks.due_at ASC LIMIT 10`,
    ).all<{ title: string; customerName: string; dueAt: number }>()
    const rows = result.results ?? []
    if (rows.length === 0) return '当前没有未完成任务。'
    return ['未完成任务：', ...rows.map((row, index) => `${index + 1}. ${row.title} · ${row.customerName} · ${this.formatDate(row.dueAt)}`)].join('\n')
  }

  private async listActiveDeals(): Promise<string> {
    const result = await this.env.DB.prepare(
      `SELECT deals.product_name AS productName, customers.name AS customerName, deals.amount_cents AS amountCents, deals.stage
       FROM deals JOIN customers ON customers.id = deals.customer_id
       WHERE deals.is_deleted = 0 AND customers.is_deleted = 0 AND deals.stage IN ('Leads', 'Qualified', 'Proposal')
       ORDER BY deals.updated_at DESC LIMIT 10`,
    ).all<{ productName: string; customerName: string; amountCents: number; stage: string }>()
    const rows = result.results ?? []
    if (rows.length === 0) return '当前没有进行中的商机。'
    return ['进行中商机：', ...rows.map((row, index) => `${index + 1}. ${row.customerName} · ${row.productName} · ${row.stage} · ¥${(row.amountCents / 100).toLocaleString('zh-CN')}`)].join('\n')
  }

  private async getCrmStats(): Promise<string> {
    const result = await this.env.DB.prepare(
      `SELECT
        (SELECT count(*) FROM customers WHERE is_deleted = 0) AS customers,
        (SELECT count(*) FROM deals WHERE is_deleted = 0 AND stage IN ('Leads', 'Qualified', 'Proposal')) AS activeDeals,
        (SELECT count(*) FROM tasks WHERE status = 'Open') AS openTasks`,
    ).first<{ customers: number; activeDeals: number; openTasks: number }>()
    return `CRM 当前概况：\n客户 ${result?.customers ?? 0} 个 · 进行中商机 ${result?.activeDeals ?? 0} 个 · 未完成任务 ${result?.openTasks ?? 0} 个`
  }

  private async askWorkersAi(question: string): Promise<string | undefined> {
    if (!this.env.AI) return undefined
    const today = new Date().toISOString().slice(0, 10)
    const usage = await this.ctx.storage.get<{ date: string; count: number }>('ai-usage')
    const count = usage?.date === today ? usage.count : 0
    if (count >= AI_DAILY_LIMIT) return undefined
    const stats = await this.env.DB.prepare(
      `SELECT (SELECT count(*) FROM customers WHERE is_deleted = 0) AS customers,
              (SELECT count(*) FROM tasks WHERE status = 'Open') AS openTasks,
              (SELECT count(*) FROM deals WHERE is_deleted = 0 AND stage IN ('Leads', 'Qualified', 'Proposal')) AS activeDeals`,
    ).first<{ customers: number; openTasks: number; activeDeals: number }>()
    try {
      const aiResult = await this.env.AI.run(AI_MODEL, {
        messages: [
          { role: 'system', content: '你是一个中文小团队 CRM 助手。只根据给定数据回答，最多 3 句话，不要编造客户、金额或日期。' },
          { role: 'user', content: `CRM 摘要：客户${stats?.customers ?? 0}个，进行中商机${stats?.activeDeals ?? 0}个，未完成任务${stats?.openTasks ?? 0}个。用户问题：${question}` },
        ],
        max_tokens: 180,
      })
      await this.ctx.storage.put('ai-usage', { date: today, count: count + 1 })
      const response = typeof aiResult === 'string'
        ? aiResult
        : typeof aiResult === 'object' && aiResult !== null && 'response' in aiResult && typeof aiResult.response === 'string'
          ? aiResult.response
          : undefined
      return response?.trim() || undefined
    } catch (error) {
      this.state.lastError = error instanceof Error ? `Workers AI: ${error.message}` : 'Workers AI 请求失败'
      return undefined
    }
  }

  private formatExpire(timestamp: number | null) {
    return timestamp ? ` · 到期 ${this.formatDate(timestamp)}` : ''
  }

  private formatDate(timestamp: number | null) {
    if (!timestamp) return '日期未填写'
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp * 1000))
  }

  private snapshot(): ConnectionState {
    return { ...this.state }
  }

  private async loadBotCredentials(): Promise<void> {
    const rows = await this.env.DB.prepare(
      "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('wecom_bot_id', 'wecom_bot_secret')",
    ).all<{ config_key: string; config_value: string }>()
    const values = new Map((rows.results ?? []).map((row) => [row.config_key, row.config_value.trim()]))
    this.botId = values.get('wecom_bot_id') ?? ''
    this.botSecret = values.get('wecom_bot_secret') ?? ''
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('state', this.state)
  }
}
