// apps/api/src/scheduled/renewal-reminders.ts
import { createDb } from '@crm/db/client'
import { customers, deals, notificationLogs } from '@crm/db/schema'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { sendWeChatGroupMarkdownMessage } from '../services/wechat'
import { isWeComBotGatewayConfigured, sendWeComBotGroupMarkdownMessage } from '../services/wecom-bot-gateway'

const SHANGHAI_TIME_OFFSET = '+8 hours'

function formatDateInShanghai(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('/', '-')
}

function getReminderDateInShanghai(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function sendRenewalReminders(env: Env, now = new Date()) {
  const db = createDb(env.DB)
  const nowUnixSeconds = Math.floor(now.getTime() / 1000)
  const daysRemaining = sql<number>`cast(
    julianday(date(${customers.saasExpireDate}, 'unixepoch', ${SHANGHAI_TIME_OFFSET})) -
    julianday(date(${nowUnixSeconds}, 'unixepoch', ${SHANGHAI_TIME_OFFSET}))
    as integer
  )`
  const expiringServices = await db
    .select({
      dealId: deals.id,
      customerName: customers.name,
      ownerId: customers.ownerId,
      expireDate: customers.saasExpireDate,
      reminderDays: deals.renewalReminderDays,
      daysRemaining,
    })
    .from(customers)
    .innerJoin(deals, and(
      eq(deals.customerId, customers.id),
      sql`${deals.id} = (
        select latest_deal.id
        from deals as latest_deal
        where latest_deal.customer_id = ${customers.id}
          and latest_deal.stage = 'Won'
          and latest_deal.is_deleted = 0
        order by latest_deal.created_at desc
        limit 1
      )`,
    ))
    .where(
      and(
        eq(customers.isDeleted, false),
        isNotNull(customers.saasExpireDate),
        sql`${daysRemaining} >= 0`,
        sql`${daysRemaining} <= ${deals.renewalReminderDays}`,
      ),
    )

  if (expiringServices.length === 0) return { matched: 0, sent: 0, failed: 0 }

  const reminders = expiringServices.map((service) => ({ service, localUserId: service.ownerId }))
  const skippedRecipients = 0

  const reminderDate = getReminderDateInShanghai(now)
  const candidates = reminders.map((reminder) => ({
    ...reminder,
    logId: `renewal:${reminder.service.dealId}:${reminder.localUserId}:${reminderDate}`,
  }))
  const existingRows = await db
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(inArray(notificationLogs.id, candidates.map((candidate) => candidate.logId)))
  const existingIds = new Set(existingRows.map((row) => row.id))
  const claimedReminders = [] as typeof candidates
  for (const candidate of candidates) {
    if (existingIds.has(candidate.logId)) continue
    const [inserted] = await db.insert(notificationLogs).values({
      id: candidate.logId,
      type: 'RenewalReminder',
      referenceId: candidate.service.dealId,
      recipientUserId: candidate.localUserId,
      reminderDate,
      status: 'Pending',
      attemptCount: 0,
      createdAt: now,
    }).onConflictDoNothing().returning({ id: notificationLogs.id })
    if (inserted) claimedReminders.push(candidate)
  }
  if (claimedReminders.length === 0) {
    const summary = { matched: expiringServices.length, sent: 0, failed: 0, skippedRecipients, deduplicated: reminders.length }
    console.info('Renewal reminder job completed', summary)
    return summary
  }

  const content = claimedReminders.map(({ service }) => [
        '🚨 **续费预警**',
        `客户：**${service.customerName}**`,
        `状态：还有 ${service.daysRemaining} 天到期`,
        `到期日：${formatDateInShanghai(service.expireDate!)}`,
        '请及时跟进续费！',
      ].join('\n')).join('\n\n---\n\n')
  try {
    const message = `🔔 **CRM 续费提醒汇总（${claimedReminders.length} 条）**\n\n${content}`
    if (await isWeComBotGatewayConfigured(env)) await sendWeComBotGroupMarkdownMessage(env, message)
    else await sendWeChatGroupMarkdownMessage(env, message)
    await db.update(notificationLogs).set({ status: 'Sent', sentAt: new Date(), lastError: null, attemptCount: 1 }).where(inArray(notificationLogs.id, claimedReminders.map(({ logId }) => logId)))
    const summary = { matched: expiringServices.length, sent: claimedReminders.length, failed: 0, skippedRecipients, deduplicated: reminders.length - claimedReminders.length }
    console.info('Renewal reminder job completed', summary)
    return summary
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 1_000) : '企业微信群机器人发送失败'
    await db.update(notificationLogs).set({ status: 'Failed', lastError, attemptCount: 1 }).where(inArray(notificationLogs.id, claimedReminders.map(({ logId }) => logId)))
    const summary = { matched: expiringServices.length, sent: 0, failed: claimedReminders.length, skippedRecipients, deduplicated: reminders.length - claimedReminders.length }
    console.error('Renewal reminder delivery failed', error)
    console.info('Renewal reminder job completed', summary)
    return summary
  }
}
