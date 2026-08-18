// apps/api/src/scheduled/task-reminders.ts
import { createDb } from '@crm/db/client'
import { customers, notificationLogs, tasks, users } from '@crm/db/schema'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import type { Env } from '../env'
import { todayInShanghai } from '../lib/shanghai-date'
import { getWeChatAccessToken, sendWeChatMarkdownMessage } from '../services/wechat'

type TaskReminderType = 'TaskDueReminder' | 'TaskOverdueReminder'

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
  const [dueTodayTasks, overdueTasks] = await Promise.all([
    db.select({
      id: tasks.id, customerName: customers.name, title: tasks.title, dueAt: tasks.dueAt,
      priority: tasks.priority, recipientUserId: users.id, wechatUserId: users.wechatUserId,
    }).from(tasks).innerJoin(customers, eq(tasks.customerId, customers.id)).innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), gt(tasks.dueAt, now), lt(tasks.dueAt, nextDayStart))),
    db.select({
      id: tasks.id, customerName: customers.name, title: tasks.title, dueAt: tasks.dueAt,
      priority: tasks.priority, recipientUserId: users.id, wechatUserId: users.wechatUserId,
    }).from(tasks).innerJoin(customers, eq(tasks.customerId, customers.id)).innerJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.status, 'Open'), eq(customers.isDeleted, false), lt(tasks.dueAt, now))),
  ])

  const reminderDate = dateKeyInShanghai(now)
  const candidates = [
    ...dueTodayTasks.map((task) => ({ task, type: 'TaskDueReminder' as const })),
    ...overdueTasks.map((task) => ({ task, type: 'TaskOverdueReminder' as const })),
  ].filter((candidate) => Boolean(candidate.task.wechatUserId?.trim()))
  const skippedRecipients = dueTodayTasks.length + overdueTasks.length - candidates.length
  if (candidates.length === 0) {
    const summary = { dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: 0, failed: 0, skippedRecipients }
    console.info('Task reminder job completed', summary)
    return summary
  }

  const existingIds = new Set((await db.select({ id: notificationLogs.id }).from(notificationLogs)
    .where(inArray(notificationLogs.id, candidates.map(({ task, type }) => `task:${type}:${task.id}:${task.recipientUserId}:${reminderDate}`))))
    .map((row) => row.id))
  const claimed = [] as Array<(typeof candidates)[number] & { logId: string }>
  for (const candidate of candidates) {
    const logId = `task:${candidate.type}:${candidate.task.id}:${candidate.task.recipientUserId}:${reminderDate}`
    if (existingIds.has(logId)) continue
    const [inserted] = await db.insert(notificationLogs).values({
      id: logId,
      type: candidate.type,
      referenceId: candidate.task.id,
      recipientUserId: candidate.task.recipientUserId,
      reminderDate,
      createdAt: now,
    }).onConflictDoNothing().returning({ id: notificationLogs.id })
    if (inserted) claimed.push({ ...candidate, logId })
  }
  if (claimed.length === 0) {
    const summary = { dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: 0, failed: 0, skippedRecipients, deduplicated: candidates.length }
    console.info('Task reminder job completed', summary)
    return summary
  }

  const accessToken = await getWeChatAccessToken(env)
  const results = await Promise.allSettled(claimed.map(async ({ task, type, logId }) => {
    const overdueDays = Math.max(0, Math.floor((dayStart.getTime() - todayInShanghai(task.dueAt).getTime()) / 86_400_000))
    const content = [
      type === 'TaskDueReminder' ? '📌 **今日待办提醒**' : '🚨 **任务逾期提醒**',
      `客户：**${task.customerName}**`,
      `任务：${task.title}`,
      `截止：${formatDateTimeInShanghai(task.dueAt)}`,
      type === 'TaskOverdueReminder' ? `状态：已逾期 ${overdueDays} 天` : '状态：请在今日完成',
      task.priority === 'High' ? '优先级：**高**' : '',
    ].filter(Boolean).join('\n')
    try {
      await sendWeChatMarkdownMessage(env, accessToken, task.wechatUserId!.trim(), content)
      await db.update(notificationLogs).set({ sentAt: new Date() }).where(eq(notificationLogs.id, logId))
    } catch (error) {
      await db.delete(notificationLogs).where(eq(notificationLogs.id, logId))
      throw error
    }
  }))
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  for (const failure of failures) console.error('Task reminder delivery failed', failure.reason)
  const summary = { dueToday: dueTodayTasks.length, overdue: overdueTasks.length, sent: results.length - failures.length, failed: failures.length, skippedRecipients, deduplicated: candidates.length - claimed.length }
  console.info('Task reminder job completed', summary)
  return summary
}
