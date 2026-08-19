# 企业微信智能机器人长连接网关

这是一个独立的 Cloudflare Worker + Durable Object 网关。它通过单个固定名称的 Durable Object 管理企业微信智能机器人的唯一 WebSocket 长连接，不需要可信 IP。

## 配置

企业微信 BotID 和长连接 Secret 不需要配置为部署 Secret，直接在 CRM 前端“系统设置 → 企业微信提醒”中填写。CRM API 与网关都从同一个 D1 数据库读取长连接 Secret，并用它签名和校验内部请求。

本项目已将 API 的网关地址配置为当前 Cloudflare 账户的 `crm-wecom-bot-gateway.q84536346.workers.dev`；不要把 BotID、任意 Secret 或 WebSocket 密钥写进 `wrangler.jsonc`。

未填写 BotID 或长连接 Secret 时，网关仍会部署但不会建立连接；不会影响现有 CRM API 与前端发布。

## 启动连接

部署后会由每 5 分钟一次的 Cron 自动确保连接存在；也可由 CRM Worker 使用 `POST /internal/connect` 主动启动。请求必须携带：

```text
X-CRM-Timestamp: Unix 时间戳（秒或毫秒）
X-CRM-Signature: base64url(HMAC-SHA256(系统设置中的长连接专用 Secret, timestamp + "." + 原始请求体))
```

网关会自动发送 `aibot_subscribe`，每 30 秒发送 `ping`，断线后以指数退避自动重连。

## 主动推送

`POST /internal/messages` 请求体：

```json
{
  "content": "**CRM 提醒**\n客户将在 7 天后到期"
}
```

首次请把机器人加入目标内部群并 `@机器人` 发送任意消息，网关会自动保存该群会话。之后 CRM 仅提交 `content` 即可向此群发提醒。需要指定收件人时，可额外传入 `chatid` 和 `chat_type`，其中 `1` 表示单聊、`2` 表示群聊。

智能机器人只能主动推送给已与机器人建立会话的用户或群；单聊必须先由员工给机器人发送过消息。

## 本地验证

```powershell
pnpm --filter @crm/wecom-bot-gateway check
pnpm --filter @crm/wecom-bot-gateway dev
```

首次部署前，必须在企业微信智能机器人后台开启“API 模式 → 长连接”，并使用长连接专用 Secret。相同 BotID 同时只能保持一个有效连接，请确保生产环境只有一个网关实例。
