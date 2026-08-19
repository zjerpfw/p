// apps/wecom-bot-gateway/src/protocol.ts
export interface WeComFrame {
  cmd?: string
  headers?: { req_id?: string }
  body?: Record<string, unknown>
  errcode?: number
  errmsg?: string
}

export function requestId(): string {
  return crypto.randomUUID()
}

export function frame(cmd: string, body?: Record<string, unknown>): string {
  return JSON.stringify({
    cmd,
    headers: { req_id: requestId() },
    ...(body === undefined ? {} : { body }),
  })
}

export function subscribe(botId: string, secret: string): string {
  return JSON.stringify({
    cmd: 'aibot_subscribe',
    headers: { req_id: requestId() },
    body: { bot_id: botId, secret },
  })
}

export function activeMessage(input: {
  chatid: string
  chatType: 1 | 2
  content: string
}): string {
  return frame('aibot_send_msg', {
    chatid: input.chatid,
    chat_type: input.chatType,
    msgtype: 'markdown',
    markdown: { content: input.content },
  })
}

export function streamReply(reqId: string | undefined, content: string): string {
  return JSON.stringify({
    cmd: 'aibot_respond_msg',
    headers: { req_id: reqId || requestId() },
    body: {
      msgtype: 'stream',
      stream: { id: requestId(), finish: true, content },
    },
  })
}
