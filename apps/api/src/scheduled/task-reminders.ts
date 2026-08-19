// apps/api/src/scheduled/task-reminders.ts
import { createDb } from '@crm/db/client'
import { customers, notificationLogs, tasks, users } from '@crm/db/schema'
import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import type { Env } from '../env'
import { todayInShanghai } from '../lib/shanghai-date'
import { sendWeChatGroupMarkdownMessage } from '../services/wechat'
import { isWeComBotGatewayConfigured, sendWeComBotGroupMarkdownMessage } from '../services/wecom-bot-gateway'

type TaskReminderType = 'TaskUpcomingReminder' | 'TaskDueReminder' | 'TaskOverdueReminder'

function formatDateTimeInShanghai(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date).replaceAll('/', '-')
}

function dateKeyInShanghai(date: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function sendTaskReminders(env: Env, now = new Date()) {
  const db = createDb(env.DB)
  const dayStart = todayInShanghai(now)
  const nextDayStart = new Date(dayStart.getTime() + 86_400_000)
  const dayAfterNextStart = new Date(nextDayStart.getTime() + 86_400_000)
  const [upcomingHighPriorityTasks, dueTodayTasks, overdueTasks] = await Promise.all([
    db.select({
      id: tasks.id, customerName: customers.name, title: tasks.title, dueAt: tasks.dueAt,
      priority: tasks.priority, recipientUserId: users.id, wechatUserId: users.wechatUserId,
    }).from(tasks).innerJoin(customers, eq(tasks.customerId, customers.id)).innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(tasks.priority, 'High'), eq(customers.isDeleted, false), gte(tasks.dueAt, nextDayStart), lt(tasks.dueAt, dayAfterNextStart))),
    db.select({
      id: tasks.id, customerName: customers.name, title: tasks.title, dueAt: tasks.dueAt,
      priority: tasks.priority, recipientUserId: users.id, wechatUserId: users.wechatUserId,
    }).from(tasks).innerJoin(customers, eq(tasks.customerId, customers.id)).innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), gte(tasks.dueAt, dayStart), lt(tasks.dueAt, nextDayStart))),
    db.select({
      id: tasks.id, customerName: customers.name, title: tasks.title, dueAt: tasks.dueAt,
      priority: tasks.priority, recipientUserId: users.id, wechatUserId: users.wechatUserId,
    }).from(tasks).innerJoin(customers, eq(tasks.customerId, customers.id)).innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), lt(tasks.dueAt, dayStart))),
  ])

  const reminderDate = dateKeyInShanghai(now)
  const candidates = [
    ...upcomingHighPriorityTasks.map((task) => ({ task, type: 'TaskUpcomingReminder' as const })),
    ...dueTodayTasks.map((task) => ({ task, type: 'TaskDueReminder' as const })),
    ...overdueTasks.map((task) => ({ task, type: 'TaskOverdueReminder' as const })),
  ]
  const skippedRecipients = 0
  if (candidates.length === 0) {
    const summary = { upcomingHighPriority: upcomingHighPriorityTasks.length, dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: 0, failed: 0, skippedRecipients }
    console.info('Task reminder job completed', summary)
    return summary
  }

  const existingIds = new Set((await db.select({ id: notificationLogs.id }).from(notificationLogs)
    .where(inArray(notificationLogs.id, candidates.map(({ task, type }) => `task:${type}:${task.id}:${reminderDate}`))))
    .map((row) => row.id))
  const claimed = [] as Array<(typeof candidates)[number] & { logId: string }>
  for (const candidate of candidates) {
    const logId = `task:${candidate.type}:${candidate.task.id}:${reminderDate}`
    if (existingIds.has(logId)) continue
    const [inserted] = await db.insert(notificationLogs).values({
      id: logId,
      type: candidate.type,
      referenceId: candidate.task.id,
      recipientUserId: candidate.task.recipientUserId,
      reminderDate,
      status: 'Pending',
      attemptCount: 0,
      createdAt: now,
    }).onConflictDoNothing().returning({ id: notificationLogs.id })
    if (inserted) claimed.push({ ...candidate, logId })
  }
  if (claimed.length === 0) {
    const summary = { upcomingHighPriority: upcomingHighPriorityTasks.length, dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: 0, failed: 0, skippedRecipients, deduplicated: candidates.length }
    console.info('Task reminder job completed', summary)
    return summary
  }

  const content = claimed.map(({ task, type }) => {
    const overdueDays = Math.max(0, Math.floor((dayStart.getTime() - todayInShanghai(task.dueAt).getTime()) / 86_400_000))
    return [
      type === 'TaskUpcomingReminder' ? '⏰ **明日高优先级任务提醒**' : type === 'TaskDueReminder' ? '📌 **今日待办提醒**' : '🚨 **任务逾期提醒**',
      `客户：**${task.customerName}**`,
      `任务：${task.title}`,
      `截止：${formatDateTimeInShanghai(task.dueAt)}`,
      type === 'TaskOverdueReminder' ? `状态：已逾期 ${overdueDays} 天` : type === 'TaskUpcomingReminder' ? '状态：请提前安排处理' : '状态：请在今日完成',
      task.priority === 'High' ? '优先级：**高**' : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n---\n\n')
  try {
    const message = `📋 **CRM 任务提醒汇总（${claimed.length} 条）**\n\n${content}`
    if (isWeComBotGatewayConfigured(env)) await sendWeComBotGroupMarkdownMessage(env, message)
    else await sendWeChatGroupMarkdownMessage(env, message)
    await db.update(notificationLogs).set({ status: 'Sent', sentAt: new Date(), lastError: null, attemptCount: 1 }).where(inArray(notificationLogs.id, claimed.map(({ logId }) => logId)))
    const summary = { upcomingHighPriority: upcomingHighPriorityTasks.length, dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: claimed.length, failed: 0, skippedRecipients, deduplicated: candidates.length - claimed.length }
    console.info('Task reminder job completed', summary)
    return summary
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 1_000) : '企业微信群机器人发送失败'
    await db.update(notificationLogs).set({ status: 'Failed', lastError, attemptCount: 1 }).where(inArray(notificationLogs.id, claimed.map(({ logId }) => logId)))
    const summary = { upcomingHighPriority: upcomingHighPriorityTasks.length, dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: 0, failed: claimed.length, skippedRecipients, deduplicated: candidates.length - claimed.length }
    console.error('Task reminder delivery failed', error)
    console.info('Task reminder job completed', summary)
    return summary
  }
}
