// apps/wecom-bot-gateway/src/connection.ts
import { activeMessage, frame, streamReply, subscribe, type WeComFrame } from './protocol'
import type { Env } from './env'
import { DurableObject } from 'cloudflare:workers'

const HEARTBEAT_MS = 30_000
const ALARM_MS = 15_000
const MAX_BACKOFF_MS = 60_000

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
  private state: ConnectionState = { connected: false, connecting: false, reconnectAttempt: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<ConnectionState>('state')
      if (saved) {
        // WebSocket 不能跨 Durable Object 进程恢复；仅保留诊断信息。
        this.state = { ...saved, connected: false, connecting: false }
      }
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
    if (!this.env.WEWORK_BOT_ID || !this.env.WEWORK_BOT_SECRET) {
      this.state.lastError = 'WEWORK_BOT_ID 或 WEWORK_BOT_SECRET 未配置'
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
        this.send(subscribe(this.env.WEWORK_BOT_ID, this.env.WEWORK_BOT_SECRET))
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
        this.send(streamReply(parsed.headers?.req_id, isGroup
          ? 'CRM 提醒群已绑定。续费和任务提醒将发送到本群。\n\n发送“帮助”可查看可用指令。'
          : '已收到消息。CRM 查询能力正在接入中。发送“帮助”可查看可用指令。'))
      }
    }
    await this.persist()
  }

  private snapshot(): ConnectionState {
    return { ...this.state }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('state', this.state)
  }
}
