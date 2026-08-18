// apps/api/src/scheduled/renewal-reminders.ts
import { createDb } from '@crm/db/client'
import { customers, dealSplits, deals, users } from '@crm/db/schema'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Env } from '../env'
import { getWeChatAccessToken, sendWeChatMarkdownMessage } from '../services/wechat'

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

  const dealIds = expiringServices.map((service) => service.dealId)
  const splitRows = await db
    .select({ dealId: dealSplits.dealId, userId: dealSplits.userId })
    .from(dealSplits)
    .where(inArray(dealSplits.dealId, dealIds))
  const splitUsersByDeal = new Map<string, string[]>()
  for (const split of splitRows) {
    const userIds = splitUsersByDeal.get(split.dealId) ?? []
    userIds.push(split.userId)
    splitUsersByDeal.set(split.dealId, userIds)
  }

  const localUserIds = [...new Set([
    ...expiringServices.map((service) => service.ownerId),
    ...splitRows.map((split) => split.userId),
  ])]
  const wechatUsers = localUserIds.length > 0
    ? await db
        .select({ id: users.id, wechatUserId: users.wechatUserId })
        .from(users)
        .where(inArray(users.id, localUserIds))
    : []
  const wechatUserIdByLocalId = new Map(
    wechatUsers
      .filter((user): user is { id: string; wechatUserId: string } => Boolean(user.wechatUserId?.trim()))
      .map((user) => [user.id, user.wechatUserId.trim()]),
  )
  const reminders = expiringServices.flatMap((service) => {
    const localRecipientIds = new Set([service.ownerId, ...(splitUsersByDeal.get(service.dealId) ?? [])])
    return [...localRecipientIds]
      .map((localUserId) => wechatUserIdByLocalId.get(localUserId))
      .filter((wechatUserId): wechatUserId is string => Boolean(wechatUserId))
      .map((wechatUserId) => ({ service, wechatUserId }))
  })
  const skippedRecipients = localUserIds.length - wechatUserIdByLocalId.size
  if (skippedRecipients > 0) {
    console.warn('Renewal reminder skipped users without a WeChat UserID', { skippedRecipients })
  }
  if (reminders.length === 0) {
    const summary = { matched: expiringServices.length, sent: 0, failed: 0, skippedRecipients }
    console.info('Renewal reminder job completed', summary)
    return summary
  }

  const accessToken = await getWeChatAccessToken(env)
  const results = await Promise.allSettled(
    reminders.map(({ service, wechatUserId }) => {
      const content = [
        '🚨 **续费预警**',
        `客户：**${service.customerName}**`,
        `状态：还有 ${service.daysRemaining} 天到期`,
        `到期日：${formatDateInShanghai(service.expireDate!)}`,
        '请及时跟进续费！',
      ].join('\n')

      return sendWeChatMarkdownMessage(env, accessToken, wechatUserId, content)
    }),
  )
  const sent = results.filter((result) => result.status === 'fulfilled').length
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  for (const failure of failures) {
    console.error('Renewal reminder delivery failed', failure.reason)
  }

  const summary = { matched: expiringServices.length, sent, failed: results.length - sent, skippedRecipients }
  console.info('Renewal reminder job completed', summary)
  return summary
}
