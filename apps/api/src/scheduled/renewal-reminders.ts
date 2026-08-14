// apps/api/src/scheduled/renewal-reminders.ts
import { createDb } from '@crm/db/client'
import { customers, dealSplits, deals, users } from '@crm/db/schema'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
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
    julianday(date(${deals.expireDate}, 'unixepoch', ${SHANGHAI_TIME_OFFSET})) -
    julianday(date(${nowUnixSeconds}, 'unixepoch', ${SHANGHAI_TIME_OFFSET}))
    as integer
  )`
  const expiringDeals = await db
    .selectDistinct({
      dealId: deals.id,
      customerName: customers.name,
      salesUserId: users.id,
      expireDate: deals.expireDate,
      reminderDays: deals.renewalReminderDays,
      daysRemaining,
    })
    .from(deals)
    .innerJoin(customers, eq(deals.customerId, customers.id))
    .innerJoin(dealSplits, eq(deals.id, dealSplits.dealId))
    .innerJoin(users, eq(dealSplits.userId, users.id))
    .where(
      and(
        eq(deals.stage, 'Won'),
        isNotNull(deals.expireDate),
        sql`${daysRemaining} >= 0`,
        sql`${daysRemaining} <= ${deals.renewalReminderDays}`,
      ),
    )

  if (expiringDeals.length === 0) return { matched: 0, sent: 0, failed: 0 }

  const accessToken = await getWeChatAccessToken(env)
  const results = await Promise.allSettled(
    expiringDeals.map((deal) => {
      const content = [
        '🚨 **续费预警**',
        `客户：**${deal.customerName}**`,
        `状态：还有 ${deal.daysRemaining} 天到期`,
        `到期日：${formatDateInShanghai(deal.expireDate!)}`,
        '请及时跟进续费！',
      ].join('\n')

      return sendWeChatMarkdownMessage(env, accessToken, deal.salesUserId, content)
    }),
  )
  const sent = results.filter((result) => result.status === 'fulfilled').length
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  for (const failure of failures) {
    console.error('Renewal reminder delivery failed', failure.reason)
  }

  const summary = { matched: expiringDeals.length, sent, failed: results.length - sent }
  console.info('Renewal reminder job completed', summary)
  return summary
}
